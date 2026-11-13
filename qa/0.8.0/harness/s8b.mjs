import { createHash } from "node:crypto";
import { session, evidence, fm, sleep } from "./lib.mjs";
const s = await session();
const results = [];
const rec = (id, ok, detail, extra = "") => { results.push({ id, ok }); evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`); console.log(id, ok ? "PASS" : "FAIL"); };
const hash = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);
await s.reloadPlugin();
await s.setSettings({ language: "en" });
const U = (n) => `Uji 0.8/${n}.md`;
const today = new Date(); const addD = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const OLD = ["small weekly habit tracker", "enough time to read", "friends said they would use it", "Publishers might prefer", "streaks matter more", "why people stop reading"];
const domHasOld = () => s.c.ev(`(()=>{ const h=document.body.innerHTML; return ${JSON.stringify(OLD)}.filter(x=>h.includes(x)) })()`);
const modalHasOld = () => s.c.ev(`(()=>{ const h=document.querySelector('.modal')?.innerHTML ?? ''; return ${JSON.stringify(OLD)}.filter(x=>h.includes(x)) })()`);

// T-RT1
{
  await s.openIncubator(); await sleep(1200); await s.openIncubator(); await sleep(500);
  const items = await s.items();
  const a = items.find((i) => i.title === "RT Jatuh tempo"); const b = items.find((i) => i.title === "RT Tanpa jejak"); const c = items.find((i) => i.title === "RT Skill");
  await s.shot("T-RT1", "tombol Recall hanya pada catatan dengan jejak (RT Jatuh tempo, RT Skill)");
  rec("T-RT1", a.buttons.includes("Recall") && !b.buttons.includes("Recall") && c.buttons.includes("Recall"),
    `RT Jatuh tempo: ${JSON.stringify(a.buttons)}; RT Tanpa jejak: ${JSON.stringify(b.buttons)}; RT Skill: ${JSON.stringify(c.buttons)}`);
  // no-trail via command
  await s.openFile(U("RT Tanpa jejak")); await sleep(300);
  const before = hash(await s.read(U("RT Tanpa jejak")));
  await s.cmd("recall"); await sleep(500);
  const n = await s.notices(); const m = await s.modalText();
  rec("T-RT1b", m === null && n.some((x) => /no earlier answers/i.test(x)) && before === hash(await s.read(U("RT Tanpa jejak"))), `notices=${JSON.stringify(n)}, modal=${m === null ? "none" : "OPEN"}`);
}
// T-RT2: open modal, old answers must not be anywhere in DOM
const p = U("RT Jatuh tempo");
const beforeText = await s.read(p);
await s.openIncubator(); await sleep(300);
const clicked = await s.clickBtn("RT Jatuh tempo", "Recall"); await sleep(800);
const qText = await s.modalText();
const leak1 = await domHasOld();
await s.shot("T-RT2", "modal Recall terbuka: hanya pertanyaan, tanpa jawaban lama");
rec("T-RT2", clicked && /Recall/.test(qText ?? "") && leak1.length === 0, `clicked=${clicked}; old-answer fragments found in whole DOM before submit: ${JSON.stringify(leak1)}`, `## modal text\n${qText}`);
// T-RT3: submit
const q1 = (qText.match(/\n\n([^\n]+\?)\n/) ?? [])[1];
await s.fill(["I think people will not keep up the habit after the first weeks"]);
const sub1 = await s.clickModal("Submit answer"); await sleep(500);
const cmp = await s.modalText(); const leakAfter = await modalHasOld();
await s.shot("T-RT3", "setelah kirim: jawaban sekarang dan sebelumnya berdampingan");
rec("T-RT3", sub1 && /Your answer now/.test(cmp) && /Your earlier answer/.test(cmp) && /What do you notice/.test(cmp) && leakAfter.length >= 1 && !/\b(score|correct|wrong|right|good|better|worse)\b/i.test(cmp.replace(/What do you notice when you compare them\?/, "")),
  `submitted=${sub1}; earlier answer fragments now visible=${JSON.stringify(leakAfter)}`, `## modal after submit\n${cmp}`);
// T-RT4: second question, rating Forgot
await s.clickModal("Next question"); await sleep(400);
await s.fill(["not sure at all about this one"]);
await s.clickModal("Submit answer"); await sleep(400);
await s.shot("T-RT4", "pertanyaan terakhir selesai: pilihan penilaian diri Ingat / Sebagian / Lupa");
await s.clickModal("Forgot"); await sleep(200);
await s.shot("T-RT4", "Lupa dipilih lalu Finish");
await s.clickModal("Finish"); await sleep(1200);
const afterText = await s.read(p);
const calloutHeads = afterText.split("\n").filter((l) => /^> \[!/.test(l));
await s.sourceView(p); await sleep(500); await s.shot("T-RT4", "callout retrieval tertulis dengan meta forgot; review hari ini + 7");
rec("T-RT4", /> \*\*Recall\*\* · Bank · forgot/.test(afterText) && /Earlier answer: /.test(afterText) && fm(afterText).includes(`review: ${addD(7)}`) && /status: growing/.test(fm(afterText)) && /gates: \[socratic\]|gates:\n  - socratic/.test(fm(afterText)) && calloutHeads.filter((l) => l.startsWith("> [!retrieval]")).length === 1,
  `review expected ${addD(7)}; callout headers=${JSON.stringify(calloutHeads)}`, `## before\n\`\`\`\n${beforeText}\n\`\`\`\n## after\n\`\`\`\n${afterText}\n\`\`\``);
// T-RT6: close before submit -> unchanged
{
  await s.openFile(p); await sleep(300);
  const h0 = hash(await s.read(p));
  await s.cmd("recall"); await sleep(600);
  await s.fill(["typed but never submitted"]);
  await s.shot("T-RT6", "jawaban diketik tetapi modal ditutup sebelum dikirim");
  await s.clickModal("Cancel"); await sleep(800);
  const h1 = hash(await s.read(p));
  rec("T-RT6", h0 === h1, `sha256(before)=${h0}, sha256(after)=${h1}`);
}
// T-RT5 + T-RT7 on RT Skill: question from [!devil], not [!retrieval]; Remembered => +21
{
  const q = U("RT Skill");
  await s.openFile(q); await sleep(300);
  await s.cmd("recall"); await sleep(700);
  const text = await s.modalText();
  const fromDevil = /Who would oppose this, and why\?/.test(text) && !/What was it\?/.test(text);
  await s.shot("T-RT7", "pertanyaan diambil dari callout devil, bukan dari retrieval");
  rec("T-RT7", fromDevil, `modal question text: ${JSON.stringify(text.split("\n").filter((l) => l.includes("?")))}`);
  await s.fill(["the bookshops mostly"]);
  await s.clickModal("Submit answer"); await sleep(400);
  await s.clickModal("Remembered"); await sleep(200);
  await s.shot("T-RT5", "Ingat dipilih (review hari ini + 21)");
  await s.clickModal("Finish"); await sleep(1200);
  const after = await s.read(q);
  rec("T-RT5", fm(after).includes(`review: ${addD(21)}`) && /Bank · remembered/.test(after) && (after.match(/\[!retrieval\]/g) ?? []).length === 2,
    `review expected ${addD(21)}; retrieval callouts=${(after.match(/\[!retrieval\]/g) ?? []).length}`, `\`\`\`\n${after}\n\`\`\``);
}
console.log(JSON.stringify(results));
s.c.close();
