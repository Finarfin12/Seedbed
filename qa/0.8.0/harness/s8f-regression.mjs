// T-R3: alur 0.7.0 tetap sama (tangkap, Socratic, Devil, Feynman, Tunda, migrasi). AI mati. Tanpa panggilan Claude.
import { session, evidence, fm, sleep } from "./lib.mjs";
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
await s.reloadPlugin();
await s.setSettings({ language: "en" });
await s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.enabled=false; await p.saveSettings(); p.rebuildQuestionService(); })()`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const findFile = (name) => s.c.ev(`(app.vault.getMarkdownFiles().find(f=>f.basename===${JSON.stringify(name)})||{}).path ?? null`);
const long = (i) => `Answer number ${i} is long enough to pass the gate.`;

// a) Capture
await s.cmd("capture-idea"); await sleep(600);
await s.c.ev(`(()=>{ const i=document.querySelector('.modal input'); i.value='Regresi Ide'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await s.shot("T-R3a", "tangkap ide baru: modal judul");
await s.clickModal("Create"); await sleep(1200);
const pIde = await findFile("Regresi Ide");
const cap = pIde ? await s.read(pIde) : "";
await s.shot("T-R3a", "ide baru dibuat: type idea, status seed");
rec("T-R3a", !!pIde && /type: idea/.test(fm(cap)) && /status: seed/.test(fm(cap)), `path=${pIde}`, `\`\`\`\n${cap}\n\`\`\``);

// b) Socratic: seed -> growing
await s.openIncubator(); await sleep(500);
const clickedP = await s.clickBtn("Regresi Ide", "Promote"); await sleep(900);
await s.shot("T-R3b", "Naikkan benih membuka modal Socratic");
for (let i = 1; i <= 6; i++) { await s.fill([long(i)]); await sleep(150); await s.clickModal(i < 6 ? "Next" : "Finish"); await sleep(350); }
await sleep(1200);
const soc = await s.read(pIde);
await s.sourceView(pIde); await sleep(500); await s.shot("T-R3b", "setelah Socratic: growing, gates socratic, callout tertulis");
rec("T-R3b", clickedP && /status: growing/.test(fm(soc)) && /socratic/.test(fm(soc)) && /> \[!socratic\]/.test(soc), `promote clicked=${clickedP}`, `\`\`\`\n${soc}\n\`\`\``);

// c) Devil: growing -> mature
await s.openIncubator(); await sleep(500);
const clickedD = await s.clickBtn("Regresi Ide", "Promote"); await sleep(900);
await s.fill([long(1), long(2), long(3), long(4)]);
await s.shot("T-R3c", "Naikkan tumbuh membuka modal Devil's Advocate (4 dari 5 dijawab)");
await s.clickModal("Save"); await sleep(1200);
const dev = await s.read(pIde);
rec("T-R3c", clickedD && /status: mature/.test(fm(dev)) && /devil/.test(fm(dev)) && /> \[!devil\]/.test(dev), `promote clicked=${clickedD}`, `\`\`\`\n${fm(dev)}\n\`\`\``);

// d) Feynman: concept seed -> growing (no gaps)
await s.c.ev(`(async()=>{ await app.vault.create('Uji 0.8/Regresi Konsep.md', '---\\ntype: concept\\nstatus: seed\\ncreated: ${iso(new Date())}\\nreview: ${addD(7)}\\ngates: []\\n---\\n\\nLatency is the delay between a request and its response.\\n'); })()`);
await sleep(1500);
await s.openFile("Uji 0.8/Regresi Konsep.md"); await sleep(300);
await s.cmd("check-feynman"); await sleep(1500);
await s.shot("T-R3d", "panel Celah untuk konsep tanpa celah");
await s.openIncubator(); await sleep(500);
const clickedF = await s.clickBtn("Regresi Konsep", "Promote"); await sleep(1500);
const fy = await s.read("Uji 0.8/Regresi Konsep.md");
rec("T-R3d", clickedF && /status: growing/.test(fm(fy)) && /feynman/.test(fm(fy)), `promote clicked=${clickedF}`, `\`\`\`\n${fm(fy)}\n\`\`\``);

// e) Snooze
await s.openIncubator(); await sleep(500);
const clickedS = await s.clickBtn("RT Tanpa jejak", "Snooze +7 days"); await sleep(1200);
const sn = await s.read("Uji 0.8/RT Tanpa jejak.md");
await s.openIncubator(); await s.shot("T-R3e", "Tunda +7 hari: tanggal tinjau digeser");
rec("T-R3e", clickedS && fm(sn).includes(`review: ${addD(7)}`), `expected review ${addD(7)}`, `\`\`\`\n${fm(sn)}\n\`\`\``);

// f) Migrasi properti lama
await s.c.ev(`(async()=>{ await app.vault.create('Uji 0.8/Legacy.md', '---\\nbengkel-tipe: ide\\nbengkel-status: tumbuh\\nbengkel-dibuat: 2026-10-01\\nbengkel-tinjau: 2026-12-01\\nbengkel-gerbang:\\n  - socratic\\nauthor: Ada\\n---\\n\\nLegacy body.\\n'); })()`);
await sleep(1500);
await s.cmd("migrate-properties"); await sleep(800);
const mm = await s.modalText();
await s.shot("T-R3f", "migrasi: modal konfirmasi menyebut jumlah catatan");
await s.clickModal("Migrate"); await sleep(2000);
const mg = await s.read("Uji 0.8/Legacy.md");
rec("T-R3f", /type: idea/.test(fm(mg)) && /status: growing/.test(fm(mg)) && !/bengkel-/.test(fm(mg)) && /author: Ada/.test(fm(mg)) && /Legacy body\./.test(mg), `confirm modal: ${JSON.stringify((mm ?? "").slice(0, 120))}`, `\`\`\`\n${mg}\n\`\`\``);
console.log(JSON.stringify(results));
s.c.close();
