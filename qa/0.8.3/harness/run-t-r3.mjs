import { launch, sleep } from "./obs.mjs";
import { session, evidence, fm } from "./lib.mjs";

console.log("Launching Obsidian QA instance with CDP port 9445...");
const pid = launch();
console.log("Launched PID:", pid);

await sleep(3000);
const s = await session();
console.log("Connected to Obsidian via CDP!");

const results = [];
const rec = (id, ok, detail, extra = "") => {
  results.push({ id, ok });
  evidence(id, `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n\n${extra}`);
  console.log(id, ok ? "PASS" : "FAIL", detail);
};

await s.reloadPlugin();
await s.setSettings({ language: "en" });
await s.c.ev(`(async()=>{
  const p = app.plugins.plugins.seedbed;
  p.settings.ai.enabled = false;
  await p.saveSettings();
  p.rebuildQuestionService();
})()`);

// Enable Network monitoring for AI-disabled verification
await s.c.send("Network.enable");
s.c.events.length = 0;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const findFile = (name) => s.c.ev(`(app.vault.getMarkdownFiles().find(f=>f.basename===${JSON.stringify(name)})||{}).path ?? null`);
const long = (i) => `Jawaban ke-${i} cukup panjang untuk memenuhi batas minimal karakter gerbang berpikir.`;

// -------------------------------------------------------------
// 1. Capture via obsidian://seedbed-capture
// -------------------------------------------------------------
console.log("\n--- Testing 1: Capture URI ---");
// Trigger capture handler via window.OBS_ACT
await s.c.ev(`(()=>{
  if (typeof window.OBS_ACT === 'function') {
    window.OBS_ACT({ action: "seedbed-capture", vault: "vault", v: "1", title: "Capture 083", text: "Ide hasil capture ekstensi 0.8.3.", url: "https://example.com" });
  } else {
    throw new Error("window.OBS_ACT is not a function: " + typeof window.OBS_ACT);
  }
})()`);
await sleep(1000);
await s.shot("T-R3-Capture", "Modal konfirmasi tangkapan ide baru");
const hasConfirmModal = await s.c.ev(`!!document.querySelector('.modal .bengkel-capture-confirm, .modal') && document.querySelector('.modal')?.innerText.includes('Capture 083')`);
await s.clickModal("Save");
await sleep(1500);

const pCap = await findFile("Capture 083");
const capContent = pCap ? await s.read(pCap) : "";
await s.shot("T-R3-Capture", "Ide baru dibuat dari capture");
rec("T-R3-Capture", !!pCap && /type: idea/.test(fm(capContent)) && /status: seed/.test(fm(capContent)),
  `path=${pCap}`, `\`\`\`\n${capContent}\n\`\`\``);

// -------------------------------------------------------------
// 2. Socratic Thinking Gate (seed -> growing)
// -------------------------------------------------------------
console.log("\n--- Testing 2: Socratic Gate ---");
await s.openIncubator();
await sleep(800);
const clickedPromote = await s.clickBtn("Capture 083", "Promote");
await sleep(1000);
await s.shot("T-R3-Socratic", "Modal Socratic terbuka");

for (let i = 1; i <= 6; i++) {
  await s.fill([long(i)]);
  await sleep(150);
  await s.clickModal(i < 6 ? "Next" : "Finish");
  await sleep(400);
}
await sleep(1500);

const socContent = await s.read(pCap);
await s.sourceView(pCap);
await sleep(600);
await s.shot("T-R3-Socratic", "Setelah Socratic - status growing dengan callout socratic");
rec("T-R3-Socratic", clickedPromote && /status: growing/.test(fm(socContent)) && /socratic/.test(fm(socContent)) && /> \[!socratic\]/.test(socContent),
  `promote clicked=${clickedPromote}`, `\`\`\`\n${socContent}\n\`\`\``);

// -------------------------------------------------------------
// 3. Recall Review (RT Jatuh tempo)
// -------------------------------------------------------------
console.log("\n--- Testing 3: Recall Review ---");
const rtPath = "Uji 0.8/RT Jatuh tempo.md";
await s.openFile(rtPath);
await sleep(500);
await s.cmd("recall");
await sleep(1000);
await s.shot("T-R3-Recall", "Modal Recall terbuka");

await s.fill(["Saya masih mengingat ide ini dari catatan masa lalu."]);
await sleep(200);
await s.clickModal("Submit answer");
await sleep(400);
await s.clickModal("Next question");
await sleep(400);
await s.fill(["Detail implementasinya terkait pelacak kebiasaan mingguan."]);
await sleep(200);
await s.clickModal("Submit answer");
await sleep(400);
await s.clickModal("Finish");
await sleep(1000);

const rtContent = await s.read(rtPath);
await s.shot("T-R3-Recall", "Setelah Recall - tercatat sesi retrieval");
rec("T-R3-Recall", /> \[!retrieval\]/.test(rtContent) || /review:/.test(rtContent),
  `file=${rtPath}`, `\`\`\`\n${rtContent}\n\`\`\``);

// -------------------------------------------------------------
// 4. Digest Mingguan
// -------------------------------------------------------------
console.log("\n--- Testing 4: Digest ---");
await s.cmd("create-digest");
await sleep(2000);
const digestFiles = await s.c.ev(`app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Digests/')).map(f=>f.path)`);
await s.shot("T-R3-Digest", "Digest mingguan dibuat di folder Digests");
rec("T-R3-Digest", digestFiles.length > 0, `digest files: ${JSON.stringify(digestFiles)}`);

// -------------------------------------------------------------
// 5. Verifikasi Mode AI Mati
// -------------------------------------------------------------
console.log("\n--- Testing 5: Mode AI Mati ---");
const reqs = s.c.events.filter((e) => e.method === "Network.requestWillBeSent")
  .map((e) => e.params.request.url)
  .filter((u) => /^https?:/i.test(u) && !u.includes("127.0.0.1") && !u.includes("localhost"));
const aiSetting = await s.c.ev(`app.plugins.plugins.seedbed.settings.ai.enabled`);
const stats = await s.c.ev(`JSON.stringify(app.plugins.plugins.seedbed.aiStats)`);
await s.shot("T-R3-AI-Mati", "Mode AI mati - tidak ada panggilan jaringan eksternal");
rec("T-R3-AI-Disabled", aiSetting === false && reqs.length === 0,
  `ai.enabled=${aiSetting}, external requests=${reqs.length} (${JSON.stringify(reqs)}), stats=${stats}`);

console.log("\n=== SUMMARY RESULTS ===");
console.log(JSON.stringify(results, null, 2));

s.c.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
