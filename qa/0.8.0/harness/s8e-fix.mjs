// Ulang T-AI2 (1 panggilan Claude, kode kemiripan berubah) dan lengkapi T-AI1/T-AI3 yang gagal karena cek uji yang salah (bukan perilaku plugin).
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { session, evidence, fm, sleep } from "./lib.mjs";
import { base } from "./obs.mjs";
const LOG = join(base, "qa/0.8.0/_calls.log");
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
const waitFor = async (fn, ms = 120000, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const U = (n) => `Uji 0.8/${n}.md`;
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const configure = () => s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; const a=p.settings.ai; a.enabled=true; a.order=['cli']; a.timeoutSec=90; a.hintsPerQuestion=0; a.providers.cli={enabled:true, tool:'claude', model:'haiku', approved:true}; await p.saveSettings(); p.rebuildQuestionService(); window.__prompts=[]; const prov=p.questionService.chain.providers[0]; const orig=prov.complete.bind(prov); prov.complete=async(pr,o)=>{ window.__prompts.push(pr); return orig(pr,o) }; return p.questionService.aiAvailable })()`);
const disableAi = () => s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.enabled=false; await p.saveSettings(); p.rebuildQuestionService(); return p.questionService.aiAvailable })()`);
const modalQs = () => s.c.ev(`JSON.stringify([...document.querySelectorAll('.modal .bengkel-devil-block')].map(b=>({head:b.querySelector('strong')?.textContent, src:b.querySelector('.bengkel-source')?.textContent, q:b.querySelector('.bengkel-question')?.textContent})))`).then(JSON.parse);
const hasModal = () => s.c.ev(`!!document.querySelector('.modal .bengkel-devil-block')`);
const isAi = (x) => /AI ·/.test(x ?? "");

// ---- T-AI2 ulang (1 panggilan) ----
await configure();
await s.openFile(U("CN Kopi")); await sleep(300);
await s.cmd("connect");
const opened = await waitFor(hasModal, 150000);
const qs = opened ? await modalQs() : [];
await s.shot("T-AI2", "connect dengan AI: satu pertanyaan per kandidat Seedbed, berlabel AI");
const prompts = JSON.parse(await s.c.ev(`JSON.stringify(window.__prompts)`));
appendFileSync(LOG, `${new Date().toISOString()} T-AI2 (ulang setelah STOP words) connect: 1 panggilan cli\n`);
await s.clickModal("Cancel"); await sleep(400);
const user = prompts.map((p) => p.user).join("\n");
const candBlock = (user.match(/<candidates>([\s\S]*?)<\/candidates>/) ?? [, ""])[1];
const cand = candBlock.split("\n").filter((l) => /^\[c\d+\]/.test(l));
const everyAi = qs.length >= 1 && qs.every((x) => isAi(x.src));
const mixedOk = qs.some((x) => isAi(x.src));
rec("T-AI2", !!opened && mixedOk && prompts.length === 1 && cand.length >= 1 && cand.length <= 10 && cand.every((l) => l.length <= 400) && /CN Kafe/.test(candBlock) && !/JANGAN-DIBACA|bukan Seedbed/.test(prompts.map((p) => p.system + p.user).join("")) && !/\.md\b/.test(candBlock) && !/type: idea|status: |review: /.test(candBlock),
  `prompts sent=${prompts.length}; candidates sent=${cand.length}; candidate lines=${JSON.stringify(cand)}; modal sources=${JSON.stringify(qs.map((x) => x.src))}; all questions AI=${everyAi}; non-Seedbed marker present in prompt=${/JANGAN-DIBACA|bukan Seedbed/.test(user)}`, `## full user prompt\n\n\`\`\`\n${user}\n\`\`\``);

// ---- T-AI3: bagian AI mati (tanpa panggilan); bagian AI dinilai ulang dari file digest yang sudah ada ----
await disableAi();
const before = JSON.parse(await s.c.ev(`JSON.stringify(app.vault.getMarkdownFiles().map(f=>f.path).filter(p=>p.startsWith('Digests/')))`));
await s.cmd("create-digest"); await sleep(2000);
const after = JSON.parse(await s.c.ev(`JSON.stringify(app.vault.getMarkdownFiles().map(f=>f.path).filter(p=>p.startsWith('Digests/')))`));
const created = after.filter((p) => !before.includes(p));
const offDigest = created.length === 1 ? await s.read(created[0]) : "";
let aiDigest = "";
for (const p of before) { const t = await s.read(p); if (/- Question:/.test(t)) aiDigest = t; }
const qLine = (aiDigest.match(/^- Question: .*$/m) ?? [])[0] ?? "";
await s.shot("T-AI3", "digest dengan AI: alasan saran + satu kalimat tanya berlabel AI");
rec("T-AI3", /\?\s*\(AI ·/.test(qLine) && qLine.split("?").length >= 2 && /Suggested to test/.test(aiDigest) && created.length === 1 && !/- Question:/.test(offDigest) && /not edited for|review was due|review is due/.test(offDigest),
  `AI digest line=${JSON.stringify(qLine)}; AI-off digest file=${created[0]}, has Question line=${/- Question:/.test(offDigest)}. Catatan: pada run pertama cek saya memilih file yang salah (urutan nama "13 2.md" < "13.md"); panggilan AI untuk digest dihitung di run pertama (1 panggilan).`, `## with AI\n\`\`\`\n${aiDigest}\n\`\`\`\n## AI off\n\`\`\`\n${offDigest}\n\`\`\``);

// ---- T-AI1: dinilai ulang dari bukti run pertama (regex label saya salah: label sumber diawali " · ") ----
const e1 = readFileSync(join(base, "qa/0.8.0/T-AI1.md"), "utf8");
const srcs = [...e1.matchAll(/"( · AI · cloud \(claude cli\))"/g)].length;
const qsOk = /If PM Matang failed/.test(e1) && /gate added by code after 3 answers=true/.test(e1) && /callout carries AI label=true/.test(e1);
evidence("T-AI1", `# T-AI1: ${srcs === 5 && qsOk ? "PASS" : "FAIL"}\n\n(Dinilai ulang dari bukti run pertama; cek awal saya salah mengira label diawali "AI", padahal teksnya " · AI · cloud (claude cli)".)\n\n` + e1.split("\n").slice(2).join("\n"));
results.push({ id: "T-AI1", ok: srcs === 5 && qsOk });
console.log("T-AI1", srcs === 5 && qsOk ? "PASS" : "FAIL", "(re-graded from evidence)");
console.log(JSON.stringify(results));
s.c.close();
