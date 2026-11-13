// T-EV11 (plugin 0.8.2): konsep berisi [!evidence] -> panel Feynman tanpa celah dari isi callout; gates utuh setelah Buka ulang / Naikkan. Tanpa AI.
import { session, evidence, fm, sleep } from "./lib.mjs";
const s = await session();
await s.reloadPlugin();
await s.setSettings({ language: "en" });
await s.patchSettings("s.feynman.jargon=['latency','entropy']");
const p = "Uji 0.8/EV Konsep.md";
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const body = ["---", "type: concept", "status: mature", `created: ${iso(new Date())}`, `review: ${iso(new Date(Date.now() + 864e5 * 30))}`, "gates: [feynman, premortem]", "---", "", "A database is a system that stores structured records so they can be queried.", "",
  "> [!evidence]- Evidence — 2026-11-13", "> **Claim** · AI · skill (Claude Code)", "> Latency is whatever the user feels.", ">", "> **Source 1** · A · official", "> Latency — Example Org, Ada, 2025-01-01", "> <https://example.org/latency> (accessed 2026-11-13)", '> Quote: "Latency is the delay between a request and its response; entropy is disorder."', "> Does this support, contradict, or not relate to your claim? Which part?", "> Answer: Latency is a thing and entropy is a thing too.", ""].join("\n");
await s.c.ev(`(async()=>{ await app.vault.create(${JSON.stringify(p)}, ${JSON.stringify(body)}); })()`);
await sleep(1500);
await s.openFile(p); await sleep(300);
await s.cmd("check-feynman"); await sleep(1500);
const gaps = await s.c.ev(`(()=>{ const leaf=document.querySelector('.workspace-leaf-content[data-type="bengkel-gaps"]'); return JSON.stringify({ open: leaf?.querySelector('.bengkel-gate-status')?.textContent, items:[...(leaf?.querySelectorAll('li.bengkel-item')??[])].map(li=>li.querySelector('.bengkel-title')?.textContent) }) })()`).then(JSON.parse);
await s.shot("T-EV11", "panel Feynman: isi callout evidence tidak membuat celah");
await s.openIncubator(); await sleep(500);
const a = await s.clickBtn("EV Konsep", "Reopen"); await sleep(900);
await s.openIncubator();
const b = await s.clickBtn("EV Konsep", "Promote"); await sleep(1200);
const after = await s.read(p);
await s.sourceView(p); await sleep(500); await s.shot("T-EV11", "gates feynman dan premortem utuh setelah Buka ulang lalu Naikkan");
const ok = gaps.items.length === 0 && a && b && /feynman/.test(fm(after)) && /premortem/.test(fm(after)) && /status: mature/.test(fm(after)) && /\[!evidence\]/.test(after);
evidence("T-EV11", `# T-EV11: ${ok ? "PASS" : "FAIL"}\n\nFeynman gaps panel = ${JSON.stringify(gaps)}; Reopen=${a}, Promote=${b}\n\n\`\`\`\n${fm(after)}\n\`\`\`\n`);
console.log("T-EV11", ok ? "PASS" : "FAIL", JSON.stringify(gaps));
s.c.close();
