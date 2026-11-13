import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { session, evidence, fm, sleep } from "./lib.mjs";
let s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
const hash = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const T = iso(new Date());
const stuckList = async () => (await s.items()).filter((i) => /^Stuck/.test(i.section ?? "")).map((i) => `${i.title}: ${i.meta}`);

// T-DG1
await s.openIncubator(); await sleep(600);
const st1 = await stuckList();
await s.shot("T-DG1", "bagian Macet: DG Macet 31 tampil (31 hari), DG Macet 29 tidak");
rec("T-DG1", st1.includes("DG Macet 31: not edited for 31 days") && !st1.some((x) => x.startsWith("DG Macet 29")), `Stuck section = ${JSON.stringify(st1)}`);

// T-DG4: create digest
await s.cmd("create-digest"); await sleep(1500);
const dPath = `Digests/Seedbed digest ${T}.md`;
const d1 = await s.read(dPath);
await s.shot("T-DG4", "digest dibuat dan dibuka (5 bagian)");
await s.openIncubator(); await sleep(500);
const inIncubator = (await s.items()).some((i) => /Seedbed digest/.test(i.title));
const sections = ["# Seedbed digest " + T, "## Due now", "## Stuck", "## Per status", "## This week", "## Suggested to test"];
rec("T-DG4", sections.every((x) => d1.includes(x)) && !/^---/.test(d1) && !/^type:/m.test(d1) && !inIncubator, `path=${dPath}; sections present=${sections.every((x) => d1.includes(x))}; has frontmatter=${/^---/.test(d1)}; listed in Incubator=${inIncubator}`, `\`\`\`\n${d1}\n\`\`\``);

// T-DG5: second digest same day
const h1 = hash(d1);
await s.cmd("create-digest"); await sleep(1500);
const d2 = await s.read(`Digests/Seedbed digest ${T} 2.md`);
const h1b = hash(await s.read(dPath));
await s.c.ev(`app.workspace.getLeaf(false)`);
await s.shot("T-DG5", "digest kedua di hari yang sama bernomor 2");
rec("T-DG5", d2.length > 0 && h1 === h1b, `second file exists (len ${d2.length}); first file hash before=${h1} after=${h1b}`);

// T-DG6: content check
const banned = /\b(best|top|ranking|rank|better|worse|promising)\b/i;
const sug = (d1.split("## Suggested to test")[1] ?? "").trim();
await s.sourceView(dPath); await sleep(500); await s.shot("T-DG6", "isi digest: saran berisi alasan berbasis fakta, tanpa peringkat");
rec("T-DG6", !banned.test(d1) && /\[\[DG Macet 31\]\]: not edited for 31 days/.test(sug), `suggestion section: ${JSON.stringify(sug)}; ranking words found=${banned.test(d1)}`);

// T-DG3: restart keeps Stuck the same
await s.openIncubator(); await sleep(500);
const beforeRestart = await stuckList();
s.c.close();
execSync("node relaunch.mjs", { stdio: "ignore" });
s = await session();
await s.openIncubator(); await sleep(1500);
const afterRestart = await stuckList();
await s.shot("T-DG3", "setelah restart Obsidian: bagian Macet sama");
rec("T-DG3", JSON.stringify(beforeRestart) === JSON.stringify(afterRestart) && afterRestart.length > 0, `before=${JSON.stringify(beforeRestart)}; after=${JSON.stringify(afterRestart)}`);

// T-DG2: snooze removes it from Stuck (mtime = today, Q1)
const p = "Uji 0.8/DG Macet 31.md";
const ok = await s.clickBtn("DG Macet 31", "Snooze +7 days"); await sleep(1200);
await s.openIncubator(); await sleep(500);
const st2 = await stuckList();
await s.shot("T-DG2", "setelah Tunda: DG Macet 31 keluar dari Macet (waktu ubah = hari ini)");
const mt = await s.c.ev(`app.vault.getFileByPath(${JSON.stringify(p)}).stat.mtime`);
rec("T-DG2", ok && !st2.some((x) => x.startsWith("DG Macet 31")) && iso(new Date(mt)) === T, `clicked=${ok}; Stuck now=${JSON.stringify(st2)}; mtime date=${iso(new Date(mt))}`);

console.log(JSON.stringify(results));
s.c.close();
