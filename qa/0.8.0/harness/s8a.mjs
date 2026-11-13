import { session, evidence, fm, sleep } from "./lib.mjs";
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const U = (n) => `Uji 0.8/${n}.md`;
const gatesOf = async (p) => (fm(await s.read(p)).match(/gates:[^\n]*(?:\n  - .*)*/) ?? [""])[0];
const ESC = String.raw`> Answer: \[!note] the habit`;

// T-G1: Reopen then Promote
{
  const p = U("PM Skill"); const before = await s.read(p);
  await s.openIncubator();
  const a = await s.clickBtn("PM Skill", "Reopen"); await sleep(900);
  const mid = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-G1", "premortem tetap ada setelah Buka ulang (status growing)");
  await s.openIncubator();
  const b = await s.clickBtn("PM Skill", "Promote"); await sleep(1200);
  const mAfter = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-G1", "premortem tetap ada setelah Naikkan (status mature)");
  rec("T-G1", a && b && /premortem/.test(fm(mid)) && /status: growing/.test(fm(mid)) && /premortem/.test(fm(mAfter)) && /status: mature/.test(fm(mAfter)),
    `Reopen clicked=${a}, Promote clicked=${b}`, `## before\n\`\`\`\n${fm(before)}\n\`\`\`\n## after Reopen\n\`\`\`\n${fm(mid)}\n\`\`\`\n## after Promote\n\`\`\`\n${fm(mAfter)}\n\`\`\``);
}
// T-G2: Discard then Restore
{
  const p = U("PM Skill");
  await s.openIncubator();
  const a = await s.clickBtn("PM Skill", "Discard"); await sleep(900);
  const mid = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-G2", "premortem tetap ada setelah Buang (status discarded)");
  await s.openIncubator();
  const b = await s.clickBtn("PM Skill", "Restore"); await sleep(900);
  const after = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-G2", "premortem tetap ada setelah Pulihkan (status seed)");
  rec("T-G2", a && b && /premortem/.test(fm(mid)) && /status: discarded/.test(fm(mid)) && /premortem/.test(fm(after)) && /status: seed/.test(fm(after)),
    `Discard=${a}, Restore=${b}`, `## after Discard\n\`\`\`\n${fm(mid)}\n\`\`\`\n## after Restore\n\`\`\`\n${fm(after)}\n\`\`\``);
}
// T-PM1: growing idea
{
  const p = U("PM Growing"); const before = await s.read(p);
  await s.openFile(p); await sleep(400);
  await s.cmd("premortem"); await sleep(500);
  const notices = await s.notices(); const modal = await s.modalText();
  await s.openIncubator(); await s.shot("T-PM1", "ide growing: hanya Notice, tanpa modal dan tanpa tombol Pre-mortem");
  const items = await s.items();
  const it = items.find((i) => i.title === "PM Growing");
  const after = await s.read(p);
  rec("T-PM1", modal === null && notices.some((n) => /mature/i.test(n)) && !it.buttons.includes("Pre-mortem") && before === after,
    `notices=${JSON.stringify(notices)}; modal=${modal === null ? "none" : "OPEN"}; buttons=${JSON.stringify(it.buttons)}; file unchanged=${before === after}`);
}
// T-PM2 + T-G3: 2 answers (first starts with [!note])
{
  const p = U("PM Matang"); const before = await s.read(p);
  await s.openFile(p); await sleep(400);
  await s.cmd("premortem"); await sleep(700);
  const modal = await s.modalText();
  await s.shot("T-PM2", "modal Pre-mortem terbuka (5 pertanyaan)");
  await s.fill(["[!note] the habit never forms because nobody opens it", "people forget it exists after two weeks of use"]);
  await s.shot("T-PM2", "dua jawaban diisi, tombol Save aktif");
  const saved = await s.clickModal("Save"); await sleep(1000);
  const after = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-PM2", "callout premortem tertulis, gates tidak berubah");
  const calloutLines = after.split("\n").filter((l) => /^> \[!/.test(l));
  const unchanged = fm(before) === fm(after);
  rec("T-PM2", saved && /Pre-mortem/.test(modal ?? "") && unchanged && calloutLines.length === 1 && calloutLines[0].startsWith("> [!premortem]"),
    `saved=${saved}; frontmatter unchanged=${unchanged}; callout headers=${JSON.stringify(calloutLines)}; notices=${JSON.stringify(await s.notices())}`, `## modal text\n${modal}\n\n## file after\n\`\`\`\n${after}\n\`\`\``);
  await s.shot("T-G3", "jawaban berawalan [!note] ditulis dengan backslash, bukan callout baru");
  rec("T-G3", after.includes(ESC) && calloutLines.length === 1, `escaped line present=${after.includes(ESC)}; callout header count=${calloutLines.length}`, `\`\`\`\n${after}\n\`\`\``);
}
// T-PM3: 3 answers -> gate added once; repeat -> no duplicate; button hidden
{
  const p = U("PM Matang"); const a3 = ["first answer long enough here", "second answer long enough here", "third answer long enough here"];
  await s.openIncubator();
  const btnBefore = (await s.items()).find((i) => i.title === "PM Matang").buttons.includes("Pre-mortem");
  await s.shot("T-PM3", "sebelum: tombol Pre-mortem ada pada PM Matang");
  await s.openFile(p); await sleep(300);
  await s.cmd("premortem"); await sleep(600);
  await s.fill(a3); await s.clickModal("Save"); await sleep(1000);
  const g1 = await gatesOf(p); const st1 = fm(await s.read(p));
  await s.openFile(p); await sleep(300);
  await s.cmd("premortem"); await sleep(600);
  await s.fill(a3); await s.clickModal("Save"); await sleep(1000);
  const g2 = await gatesOf(p); const body = await s.read(p);
  await s.sourceView(p); await sleep(500); await s.shot("T-PM3", "gates berisi premortem satu kali setelah dua sesi lolos");
  await s.openIncubator(); await s.shot("T-PM3", "sesudah: tombol Pre-mortem hilang");
  const btnAfter = (await s.items()).find((i) => i.title === "PM Matang").buttons.includes("Pre-mortem");
  const count = (g2.match(/premortem/g) ?? []).length;
  rec("T-PM3", btnBefore && !btnAfter && /premortem/.test(g1) && count === 1 && /status: mature/.test(st1) && /review: /.test(st1),
    `button before=${btnBefore}, after=${btnAfter}; gates after 1st pass=${JSON.stringify(g1)}; after 2nd pass=${JSON.stringify(g2)}; callouts=${(body.match(/\[!premortem\]/g) ?? []).length}`, `\`\`\`\n${fm(body)}\n\`\`\``);
}
// T-PM4: language
{
  await s.setSettings({ language: "id" });
  await s.openFile(U("PM Matang")); await sleep(300);
  await s.cmd("premortem"); await sleep(600);
  const id = await s.modalText(); await s.shot("T-PM4", "modal Pre-mortem berbahasa Indonesia");
  await s.clickModal("Batal"); await sleep(300);
  await s.setSettings({ language: "en" });
  await s.cmd("premortem"); await sleep(600);
  const en = await s.modalText(); await s.shot("T-PM4", "modal Pre-mortem berbahasa Inggris");
  await s.clickModal("Cancel"); await sleep(300);
  rec("T-PM4", /Penyebab|Terdampak|Sinyal awal/.test(id ?? "") && /Cause|Affected|Early signal/.test(en ?? ""), "ID and EN modal text differ as expected", `## ID\n${id}\n\n## EN\n${en}`);
}
// T-PM5: disabled
{
  await s.patchSettings("s.premortem.enabled=false");
  await s.openIncubator(); await s.shot("T-PM5", "Pre-mortem dimatikan: tombol hilang dari Inkubator");
  const items = await s.items();
  const anyBtn = items.some((i) => i.buttons.includes("Pre-mortem"));
  const cmdVisible = await s.c.ev(`app.commands.listCommands().some(x=>x.id==='seedbed:premortem')`);
  await s.patchSettings("s.premortem.enabled=true");
  const cmdBack = await s.c.ev(`app.commands.listCommands().some(x=>x.id==='seedbed:premortem')`);
  rec("T-PM5", !anyBtn && !cmdVisible && cmdBack, `disabled: any button=${anyBtn}, command listed=${cmdVisible}; re-enabled: command listed=${cmdBack}`);
}
console.log(JSON.stringify(results));
s.c.close();
