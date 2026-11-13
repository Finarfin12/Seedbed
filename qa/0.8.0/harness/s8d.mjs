import { session, evidence, fm, sleep } from "./lib.mjs";
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const U = (n) => `Uji 0.8/${n}.md`;
const count = (t, sub) => t.split(sub).length - 1;

// ---- Connect ----
await s.openFile(U("CN Kopi")); await sleep(400);
await s.cmd("connect"); await sleep(900);
const m1 = await s.modalText();
await s.shot("T-CN1", "modal Connect: CN Kafe muncul, catatan non-Seedbed tidak");
rec("T-CN1", /CN Kafe/.test(m1 ?? "") && !/bukan Seedbed/.test(m1 ?? "") && !/JANGAN-DIBACA/.test(m1 ?? ""), `candidates in modal: ${JSON.stringify((m1 ?? "").split("\n").filter((l) => /^CN /.test(l)))}`, `## modal text\n${m1}`);

// T-CN2: answer, no link
const before2 = await s.read(U("CN Kopi"));
await s.fill(["It supports it: both are about reading in cafes."]);
await s.shot("T-CN2", "satu kandidat dijawab, tidak menekan Tambah tautan");
await s.clickModal("Save"); await sleep(1000);
const a2 = await s.read(U("CN Kopi"));
rec("T-CN2", /> \[!connect\]- Connect/.test(a2) && /> \*\*CN Kafe\*\* · Bank/.test(a2) && !/^Related:/m.test(a2) && fm(before2) === fm(a2), `connect callout present, no Related line, frontmatter unchanged`, `\`\`\`\n${a2}\n\`\`\``);
await s.sourceView(U("CN Kopi")); await sleep(500); await s.shot("T-CN2", "callout connect tertulis, tanpa baris Related");

// T-CN3: click Add link
await s.openFile(U("CN Kopi")); await sleep(300);
await s.cmd("connect"); await sleep(900);
const clicked = await s.clickModal('Add link to "CN Kafe"'); await sleep(900);
await s.shot("T-CN3", "setelah klik Tambah tautan: tombol berubah Link added");
const modalNow = await s.modalText();
await s.clickModal("Cancel"); await sleep(500);
const a3 = await s.read(U("CN Kopi"));
// klik lagi pada sesi baru -> tidak dobel
await s.openFile(U("CN Kopi")); await sleep(300);
await s.cmd("connect"); await sleep(900);
await s.clickModal('Add link to "CN Kafe"'); await sleep(900);
const modalAgain = await s.modalText();
await s.clickModal("Cancel"); await sleep(500);
const a3b = await s.read(U("CN Kopi"));
const tail = a3b.trimEnd().split("\n").pop();
rec("T-CN3", clicked && /Link added/.test(modalNow) && count(a3, "Related: [[CN Kafe]]") === 1 && count(a3b, "Related: [[CN Kafe]]") === 1 && tail === "Related: [[CN Kafe]]" && /Link already there/.test(modalAgain),
  `after 1st click: Related lines=${count(a3, "Related: [[CN Kafe]]")}; after 2nd session click: ${count(a3b, "Related: [[CN Kafe]]")}; last line=${JSON.stringify(tail)}; second modal button text has 'Link already there'=${/Link already there/.test(modalAgain)}`, `\`\`\`\n${a3b}\n\`\`\``);
await s.sourceView(U("CN Kopi")); await sleep(500); await s.shot("T-CN3", "satu baris Related di akhir catatan");

// T-CN4: no similar notes
await s.c.ev(`(async()=>{ await app.vault.create('Uji 0.8/ZZ Unik.md', '---\\ntype: idea\\nstatus: seed\\ncreated: 2026-11-13\\nreview: 2026-12-30\\ngates: []\\n---\\n\\nQuasar zebra xylophone nebula.\\n'); })()`);
await sleep(1200);
const before4 = await s.read(U("ZZ Unik"));
await s.openFile(U("ZZ Unik")); await sleep(400);
await s.cmd("connect"); await sleep(900);
const n4 = await s.notices(); const m4 = await s.modalText();
await s.shot("T-CN4", "tidak ada kandidat: hanya Notice, tidak ada penulisan");
rec("T-CN4", m4 === null && n4.some((x) => /No similar ideas/.test(x)) && before4 === (await s.read(U("ZZ Unik"))), `notices=${JSON.stringify(n4)}; modal=${m4 === null ? "none" : "OPEN"}; file unchanged=${before4 === (await s.read(U("ZZ Unik")))}`);

// ---- Feynman ----
await s.patchSettings(`s.feynman.jargon=['entropy','latency','database','algorithm']`);
const gapsDom = () => s.c.ev(`(()=>{ const leaf=document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"]'); if(!leaf) return null; return JSON.stringify({ open: leaf.querySelector('.bengkel-gate-status')?.textContent, items:[...leaf.querySelectorAll('li.bengkel-item')].map(li=>({t:li.querySelector('.bengkel-title')?.textContent, tags:[...li.querySelectorAll('.bengkel-tag')].map(x=>x.textContent), ignored:li.classList.contains('is-ignored')})) }) })()`).then((x) => (x ? JSON.parse(x) : null));
await s.openFile(U("FY Konsep")); await sleep(400);
await s.cmd("check-feynman"); await sleep(1500);
const g1 = await gapsDom();
await s.shot("T-FY1", "panel Celah: entropy berlabel circular, latency berlabel empty, database tidak ditandai");
const byT = (g, name) => g.items.find((i) => i.t?.toLowerCase() === name);
rec("T-FY1", byT(g1, "entropy")?.tags.includes("circular") && byT(g1, "latency")?.tags.includes("empty") && !byT(g1, "database") && !byT(g1, "algorithm"), `gaps panel = ${JSON.stringify(g1)}`);

// T-FY2: callouts hide terms
await s.c.ev(`(async()=>{ const f=app.vault.getFileByPath(${JSON.stringify(U("FY Konsep"))}); await app.vault.process(f, d=>d+'\\n> [!premortem]- Pre-mortem — 2026-11-13\\n> **Cause** · Bank\\n> q?\\n> Answer: the algorithm failed\\n\\n> [!retrieval]- Retrieval — 2026-11-13\\n> **Recall** · Bank\\n> q?\\n> Answer: the algorithm again\\n> Earlier answer: algorithm\\n\\n> [!connect]- Connect — 2026-11-13\\n> **X** · Bank\\n> q?\\n> Answer: algorithm is related\\n'); })()`);
await sleep(800);
await s.cmd("check-feynman"); await sleep(1500);
const g2 = await gapsDom();
await s.shot("T-FY2", "callout premortem/retrieval/connect tidak menghasilkan celah (algorithm)");
rec("T-FY2", !byT(g2, "algorithm"), `gaps after adding callouts with 'algorithm' = ${JSON.stringify(g2)}`);

// T-FY3: ignore weak gap
const clickedIgnore = await s.c.ev(`(()=>{ const leaf=document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"]'); const li=[...leaf.querySelectorAll('li.bengkel-item')].find(l=>l.querySelector('.bengkel-title')?.textContent.toLowerCase()==='entropy'); const b=[...li.querySelectorAll('button')].find(b=>b.textContent==='Ignore'); if(!b) return false; b.click(); return true })()`);
await sleep(1500);
const g3 = await gapsDom();
const ig = await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.settings.feynman.ignored)`);
await s.shot("T-FY3", "celah circular diabaikan seperti celah biasa");
rec("T-FY3", clickedIgnore && byT(g3, "entropy")?.ignored === true && /entropy/.test(ig) && Number(/Open gaps: (\d+)/.exec(g3.open)?.[1]) === Number(/Open gaps: (\d+)/.exec(g2.open)?.[1]) - 1, `before open=${g2.open}; after=${g3.open}; ignored=${ig}`);

console.log(JSON.stringify(results));
s.c.close();
