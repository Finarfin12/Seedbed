// T-R2 + T-AI6: AI mati = 0 permintaan jaringan, 0 panggilan CLI; pengingat digest sekali seminggu. TANPA panggilan Claude.
import { session, evidence, sleep } from "./lib.mjs";
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const U = (n) => `Uji 0.8/${n}.md`;
const ai = await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.settings.ai.enabled)`);

// ---- T-R2: empat fitur dengan AI mati, pantau jaringan lewat CDP ----
await s.c.send("Network.enable");
s.c.events.length = 0;
const fill = (a) => s.fill(a);
// pre-mortem
await s.openFile(U("PM Matang")); await sleep(300); await s.cmd("premortem"); await sleep(700);
await fill(["answer one long enough here", "answer two long enough here", "answer three long enough here"]); await s.clickModal("Save"); await sleep(900);
// recall
await s.openFile(U("RT Jatuh tempo")); await sleep(300); await s.cmd("recall"); await sleep(700);
await fill(["from memory"]); await s.clickModal("Submit answer"); await sleep(300); await s.clickModal("Next question"); await sleep(300);
await fill(["from memory again"]); await s.clickModal("Submit answer"); await sleep(300); await s.clickModal("Finish"); await sleep(900);
// connect
await s.openFile(U("CN Kopi")); await sleep(300); await s.cmd("connect"); await sleep(900);
await fill(["It relates."]); await s.clickModal("Save"); await sleep(900);
// digest
await s.cmd("create-digest"); await sleep(1500);
// feynman check + follow-up button must not exist
await s.patchSettings(`s.feynman.jargon=['entropy']`);
await s.openFile(U("FY Konsep")); await sleep(300); await s.cmd("check-feynman"); await sleep(1500);
const followBtn = await s.c.ev(`!!document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"] button') && [...document.querySelectorAll('.workspace-leaf-content[data-type="bengkel-gaps"] button')].some(b=>/follow-up/i.test(b.textContent))`);
await s.shot("T-R2", "AI mati: empat fitur dipakai, tidak ada tombol Tanya lanjut");
const reqs = s.c.events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url).filter((u) => /^https?:/i.test(u));
const stats = await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.aiStats)`);
rec("T-R2", ai === "false" && reqs.length === 0 && stats === JSON.stringify({ cli: 0, local: 0, api: 0 }) && !followBtn,
  `ai.enabled=${ai}; http(s) requests during pre-mortem, recall, connect, digest, Feynman = ${reqs.length} ${JSON.stringify(reqs)}; aiStats=${stats}; follow-up button present=${followBtn}`);

// ---- T-AI6: pengingat digest ----
const wd = new Date().getDay();
await s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.digest.reminder={enabled:true, day:${wd}}; p.settings.digest.lastReminded=''; await p.saveSettings(); })()`);
await s.reloadPlugin(); await sleep(4500);
const n1 = await s.notices();
await s.shot("T-AI6", "pengingat digest muncul sekali saat Obsidian dibuka");
const last1 = await s.c.ev(`app.plugins.plugins.seedbed.settings.digest.lastReminded`);
// tutup notice lama, muat ulang plugin (mirip buka Obsidian lagi)
await s.c.ev(`document.querySelectorAll('.notice').forEach(n=>n.remove())`);
await s.reloadPlugin(); await sleep(4500);
const n2 = await s.notices();
const shown = (n) => n.filter((x) => /weekly digest/i.test(x)).length;
rec("T-AI6", shown(n1) === 1 && shown(n2) === 0 && last1.length === 10, `first open notices=${JSON.stringify(n1)}; second open notices=${JSON.stringify(n2)}; lastReminded=${last1}`);
// kembalikan
await s.c.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.digest.reminder={enabled:false, day:1}; await p.saveSettings(); })()`);
console.log(JSON.stringify(results));
s.c.close();
