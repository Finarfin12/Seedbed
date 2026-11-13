// Uji AI SUNGGUHAN (Claude Code CLI, model haiku). Anggaran total 10 panggilan; tiap panggilan dicatat di qa/0.8.0/_calls.log.
import { appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { session, evidence, fm, sleep } from "./lib.mjs";
import { base } from "./obs.mjs";
const LOG = join(base, "qa/0.8.0/_calls.log");
if (!existsSync(LOG)) writeFileSync(LOG, "# Panggilan Claude (CLI) selama uji 0.8.0. Anggaran maksimal 10.\n");
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
const stats = async () => JSON.parse(await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.aiStats)`));
const logCalls = async (label, note = "") => { const st = await stats(); appendFileSync(LOG, `${new Date().toISOString()} ${label} cumulative cli attempts since plugin load=${st.cli} ${note}\n`); return st.cli; };
const U = (n) => `Uji 0.8/${n}.md`;
const waitFor = async (fn, ms = 120000, step = 1000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
await s.reloadPlugin();
await s.setSettings({ language: "en" });

const configure = (model) => s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; const a=p.settings.ai; a.enabled=true; a.order=['cli']; a.timeoutSec=90; a.hintsPerQuestion=0; a.providers.cli={enabled:true, tool:'claude', model:${JSON.stringify(model)}, approved:true}; await p.saveSettings(); p.rebuildQuestionService(); window.__prompts=[]; const prov=p.questionService.chain.providers[0]; const orig=prov.complete.bind(prov); prov.complete=async(pr,o)=>{ window.__prompts.push(pr); return orig(pr,o) }; return p.questionService.aiAvailable })()`);
const disableAi = () => s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.enabled=false; await p.saveSettings(); p.rebuildQuestionService(); return p.questionService.aiAvailable })()`);
const modalQs = () => s.c.ev(`JSON.stringify([...document.querySelectorAll('.modal .bengkel-devil-block')].map(b=>({head:b.querySelector('strong')?.textContent, src:b.querySelector('.bengkel-source')?.textContent, q:b.querySelector('.bengkel-question')?.textContent})))`).then(JSON.parse);
const hasModal = () => s.c.ev(`!!document.querySelector('.modal .bengkel-devil-block')`);

// ---------- T-AI5: provider gagal (model salah) -> fallback bank ----------
await configure("no-such-model-xyz");
await s.openFile(U("PM Matang")); await sleep(300);
await s.cmd("premortem");
const opened5 = await waitFor(hasModal, 120000);
const n5 = await s.notices();
const qs5 = opened5 ? await modalQs() : [];
await s.shot("T-AI5", "provider gagal (model salah): Notice fallback, modal tetap jalan dengan pertanyaan Bank");
const c5 = await logCalls("T-AI5 (model salah, gagal sesuai desain)");
await s.clickModal("Cancel"); await sleep(400);
rec("T-AI5", !!opened5 && n5.some((x) => /AI did not answer/i.test(x)) && qs5.length === 5 && qs5.every((x) => /Bank/.test(x.src ?? "")), `notices=${JSON.stringify(n5)}; sources=${JSON.stringify(qs5.map((x) => x.src))}; cli attempts=${c5}`);

// ---------- T-AI1: pre-mortem dengan AI ----------
await configure("haiku");
const before1 = await stats();
await s.openFile(U("PM Matang")); await sleep(300);
await s.cmd("premortem");
const opened1 = await waitFor(hasModal, 150000);
const qs1 = opened1 ? await modalQs() : [];
await s.shot("T-AI1", "pre-mortem dengan AI (Claude): pertanyaan spesifik isi catatan, berlabel AI");
const c1 = await logCalls("T-AI1 pre-mortem");
const aiLabeled = qs1.length === 5 && qs1.some((x) => /^AI/.test(x.src ?? ""));
await s.fill(["first answer long enough here", "second answer long enough here", "third answer long enough here"]);
await s.clickModal("Save"); await sleep(1200);
const after1 = await s.read(U("PM Matang"));
const gates1 = /premortem/.test(fm(after1));
const calloutAi = /> \*\*[^*]+\*\* · AI/.test(after1);
await s.openFile(U("PM Matang")); await sleep(300);
rec("T-AI1", aiLabeled && qs1.every((x) => (x.q ?? "").trim().endsWith("?")) && gates1 && calloutAi, `question sources=${JSON.stringify(qs1.map((x) => x.src))}; questions=${JSON.stringify(qs1.map((x) => x.q))}; gate added by code after 3 answers=${gates1}; callout carries AI label=${calloutAi}; calls this scenario=${c1 - before1.cli}`, `\`\`\`\n${after1}\n\`\`\``);

// ---------- T-AI2: connect dengan AI ----------
const before2 = await stats();
await s.c.ev(`window.__prompts=[]`);
await s.openFile(U("CN Kopi")); await sleep(300);
await s.cmd("connect");
const opened2 = await waitFor(hasModal, 150000);
const qs2 = opened2 ? await modalQs() : [];
await s.shot("T-AI2", "connect dengan AI: satu pertanyaan per kandidat Seedbed, berlabel AI");
const prompts2 = JSON.parse(await s.c.ev(`JSON.stringify(window.__prompts)`));
const c2 = await logCalls("T-AI2 connect");
await s.clickModal("Cancel"); await sleep(400);
const user2 = prompts2.map((p) => p.user).join("\n");
const sysUser = prompts2.map((p) => p.system + p.user).join("\n");
const cand = (user2.match(/\[c\d+\][^\n]*/g) ?? []);
rec("T-AI2", opened2 && qs2.some((x) => /^AI/.test(x.src ?? "")) && prompts2.length === 1 && /CN Kopi|komunitas kopi/i.test(user2) && cand.length >= 1 && cand.every((l) => l.length <= 400) && !/JANGAN-DIBACA|bukan Seedbed/.test(sysUser) && !/\.md\b/.test(user2) && !/type: idea|status: seed/.test(user2),
  `prompts sent=${prompts2.length}; candidate lines=${JSON.stringify(cand)}; modal sources=${JSON.stringify(qs2.map((x) => x.src))}; calls this scenario=${c2 - before2.cli}`, `## full user prompt\n\n\`\`\`\n${user2}\n\`\`\``);

// ---------- T-AI3: digest dengan AI ----------
const before3 = await stats();
await s.cmd("create-digest");
const dFile = await waitFor(async () => { const l = await s.c.ev(`JSON.stringify(app.vault.getMarkdownFiles().map(f=>f.path).filter(p=>p.startsWith('Digests/')))`); const arr = JSON.parse(l); return arr.length ? arr.sort() : null; }, 150000);
await sleep(800);
const dAi = await s.read(dFile[dFile.length - 1]);
await s.shot("T-AI3", "digest dengan AI: alasan saran + satu kalimat tanya berlabel AI");
const c3 = await logCalls("T-AI3 digest");
const qLine = (dAi.match(/^- Question: .*$/m) ?? [])[0];
await disableAi();
await s.cmd("create-digest"); await sleep(1800);
const files3 = JSON.parse(await s.c.ev(`JSON.stringify(app.vault.getMarkdownFiles().map(f=>f.path).filter(p=>p.startsWith('Digests/')).sort())`));
const dOff = await s.read(files3[files3.length - 1]);
rec("T-AI3", !!qLine && /\?\s*\(AI/.test(qLine) && /Suggested to test/.test(dAi) && !/- Question:/.test(dOff) && /not edited for|review was due|review is due/.test(dOff), `AI digest line: ${JSON.stringify(qLine)}; AI off digest has Question line=${/- Question:/.test(dOff)}; calls this scenario=${c3 - before3.cli}`, `## with AI\n\`\`\`\n${dAi}\n\`\`\`\n## AI off\n\`\`\`\n${dOff}\n\`\`\``);

// ---------- T-AI4: Feynman tanya lanjut ----------
await configure("haiku");
const before4 = await stats();
await s.patchSettings(`s.feynman.jargon=['entropy','latency']`);
await s.openFile(U("FY Konsep")); await sleep(300);
await s.cmd("check-feynman"); await sleep(1800);
const gapsDom = () => s.c.ev(`(()=>{ const leaf=document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"]'); const li=[...leaf.querySelectorAll('li.bengkel-item')].find(l=>l.querySelector('.bengkel-title')?.textContent.toLowerCase()==='entropy'); return JSON.stringify({ hints:[...li.querySelectorAll('.bengkel-hint p')].map(p=>p.textContent), btn:[...li.querySelectorAll('button')].map(b=>({t:b.textContent,d:b.disabled})) }) })()`).then(JSON.parse);
const clickFollow = () => s.c.ev(`(()=>{ const leaf=document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"]'); const li=[...leaf.querySelectorAll('li.bengkel-item')].find(l=>l.querySelector('.bengkel-title')?.textContent.toLowerCase()==='entropy'); const b=[...li.querySelectorAll('button')].find(b=>/follow-up/i.test(b.textContent)); if(!b||b.disabled) return false; b.click(); return true })()`);
const k1 = await clickFollow();
await waitFor(async () => (await gapsDom()).hints.length >= 1, 150000);
const k2 = await clickFollow();
await waitFor(async () => (await gapsDom()).hints.length >= 2, 150000);
const g4 = await gapsDom();
const k3 = await clickFollow();
await s.shot("T-AI4", "tanya lanjut Feynman: dua pertanyaan untuk satu celah, tombol habis");
const c4 = await logCalls("T-AI4 feynman follow-up x2");
const noDefine = g4.hints.every((h) => h.trim().endsWith("?") && !/entropy\s+(is|means|refers)/i.test(h));
rec("T-AI4", k1 && k2 && !k3 && g4.hints.length === 2 && noDefine && g4.btn.some((b) => /0 left/.test(b.t) && b.d), `clicks: 1st=${k1}, 2nd=${k2}, 3rd=${k3}; hints=${JSON.stringify(g4.hints)}; buttons=${JSON.stringify(g4.btn)}; calls this scenario=${c4 - before4.cli}`);
const gateStill = await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.settings.feynman.ignored)`);

await disableAi();
const final = await logCalls("TOTAL (counter resets on plugin reload; see per-scenario lines)");
console.log(JSON.stringify(results));
s.c.close();
