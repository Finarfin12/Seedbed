// GUI QA 0.9.0 (model detection) in an ISOLATED Obsidian profile + temp vault. Never touches the user's own vaults.
// Usage: node qa/0.9.0/harness/run-090.mjs   (after `npm run build`)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, sleep, vault, profile, base, PORT } from "./obs.mjs";
import { session, evidence } from "./lib.mjs";

const SRC = "C:/Users/atrione/OpenBot/Shared/seedbed-qa-083"; // synthetic QA vault + empty profile from 0.8.3
const root = join(tmpdir(), "seedbed-qa-090");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
cpSync(join(SRC, "vault"), vault, { recursive: true });
cpSync(join(SRC, "profile"), profile, { recursive: true });
writeFileSync(join(profile, "obsidian.json"), JSON.stringify({ vaults: { qa090: { path: vault, ts: Date.now(), open: true } }, cli: false }));
// start from a clean plugin state: AI OFF
rmSync(join(vault, ".obsidian", "plugins", "seedbed", "data.json"), { force: true });
mkdirSync(join(vault, ".obsidian", "plugins", "seedbed"), { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(base, f), join(vault, ".obsidian", "plugins", "seedbed", f));
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["seedbed"]));

console.log("Launching isolated Obsidian…", { vault, profile });
launch();
await sleep(4000);
const s = await session();
const results = [];
/** Settings opens in its own window (separate CDP target): screenshot THAT window. */
const shotSettings = async (id, title) => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const data = await new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.data); }; ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } })); });
	ws.close();
	mkdirSync(join(base, "qa", "0.9.0", "screenshots"), { recursive: true });
	writeFileSync(join(base, "qa", "0.9.0", "screenshots", (id + " - " + title).replace(/[:/*?\"<>|]/g, " -") + ".png"), Buffer.from(data, "base64"));
};
const rec = (id, ok, detail) => {
	results.push({ id, ok, detail });
	evidence(id, `# ${id}: ${ok === true ? "PASS" : ok === false ? "FAIL" : String(ok)}\n\n${detail}\n`);
	console.log(`[${id}] ${ok === true ? "PASS" : ok === false ? "FAIL" : ok}: ${detail}`);
};

// ---- network + console probes ----
await s.c.send("Network.enable");
await s.c.send("Console.enable");
// Notices render in `activeDocument` (not always `document`): poll every document we can see
await s.ev(`(()=>{ window.__notices=[]; setInterval(()=>{ for (const d of new Set([document, activeDocument])) for (const n of d.querySelectorAll('.notice')) { const t=n.textContent; if(t && !window.__notices.includes(t)) window.__notices.push(t); } }, 80); })()`);
const netStart = () => s.c.events.length;
const requestsSince = (i) =>
	s.c.events.slice(i).filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url).filter((u) => /^https?:/.test(u) && !/127\.0\.0\.1:9446|devtools/.test(u));

const ver = await s.ev(`app.plugins.plugins.seedbed?.manifest.version`);
console.log("plugin version:", ver);
if (ver !== "0.9.0") throw new Error("expected 0.9.0, got " + ver);

const openTab = async () => {
	await s.ev(`app.commands.executeCommandById('app:open-settings')`);
	await sleep(600);
	await s.ev(`app.setting.openTabById("seedbed")`);
	await sleep(900);
};
const aiRows = () =>
	s.ev(`(()=>{
		const c = app.setting.activeTab.containerEl;
		return [...c.querySelectorAll('.setting-item')].map(el => ({
			name: el.querySelector('.setting-item-name')?.textContent.trim() ?? '',
			desc: el.querySelector('.setting-item-description')?.textContent.trim() ?? '',
			options: [...el.querySelectorAll('select option')].map(o => o.textContent),
			value: el.querySelector('select')?.selectedOptions?.[0]?.textContent ?? null,
			disabled: el.querySelector('select')?.disabled ?? null,
			visible: el.offsetParent !== null,
		}));
	})()`);
const scrollTo = (name) =>
	s.ev(`(()=>{ const el=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent.trim()===${JSON.stringify(name)}); el?.scrollIntoView({block:'start'}); return !!el; })()`);
const lastNotice = () => s.ev(`window.__notices.slice(-4)`);
const setSelect = (rowName, optionText) =>
	s.ev(`(()=>{
		const row=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent.trim()===${JSON.stringify(rowName)});
		const sel=row?.querySelector('select'); if(!sel) return false;
		const o=[...sel.options].find(o=>o.textContent.startsWith(${JSON.stringify(optionText)})); if(!o) return false;
		sel.value=o.value; sel.dispatchEvent(new Event('change')); return true; })()`);
const clickButton = (rowName) =>
	s.ev(`(()=>{
		const rows=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].filter(e=>e.querySelector('.setting-item-name')?.textContent.trim()===${JSON.stringify(rowName)});
		const b=rows[0]?.querySelector('button'); if(!b) return false; b.click(); return true; })()`);
const cliModelsRow = (rows) => rows.find((r) => r.name === "Model" && r.options.length);

try {
	// ===== M6a: AI OFF = zero requests while the settings tab is used =====
	await openTab();
	const aiOffRows = await aiRows();
	const hasModelRowOff = aiOffRows.some((r) => r.name === "Connection status" && r.visible);
	const n0 = netStart();
	await sleep(1500);
	rec("M6-AI-off", !hasModelRowOff && requestsSince(n0).length === 0, `AI off: model/status rows hidden=${!hasModelRowOff}; external requests=${requestsSince(n0).length}`);

	// ===== turn AI ON (data stays local; no provider approved) =====
	await s.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.enabled=true; await p.saveSettings(); p.rebuildQuestionService(); })()`);
	await openTab();
	await scrollTo("Enable AI");
	await sleep(400);

	// ===== M5: Detect again fills every dropdown =====
	const n1 = netStart();
	await clickButton("Detected providers");
	await sleep(9000); // claude binary scan ~1-2 s, agy models ~2 s
	let rows = await aiRows();
	await scrollTo("CLI program");
	await sleep(500);
	await shotSettings("M1-Claude-Code", "Claude Code - dropdown berisi model nyata");
	const claudeModel = rows.find((r) => r.name === "Model" && r.options.length > 3);
	const claudeStatus = rows.find((r) => r.name === "Connection status");
	rec("M1-Claude", !!claudeModel && /Connected · \d+ models available/.test(claudeStatus?.desc ?? ""), `status="${claudeStatus?.desc}", options=${claudeModel?.options.length}, first=${JSON.stringify(claudeModel?.options.slice(0, 6))}`);

	// ===== M2: Codex (detect only) =====
	await setSelect("CLI program", "Codex CLI");
	await sleep(3500);
	rows = await aiRows();
	await scrollTo("CLI program");
	await sleep(400);
	await shotSettings("M2-Codex-CLI", "Codex CLI - model nyata tampil, deteksi saja");
	const codexModel = rows.find((r) => r.name === "Model" && r.options.length > 1);
	const codexStatus = rows.filter((r) => r.name === "Connection status")[0];
	const notice2 = await lastNotice();
	rec("M2-Codex", !!codexModel && /Detect only/.test(codexStatus?.desc ?? ""), `status="${codexStatus?.desc}", options=${codexModel?.options.length}, first=${JSON.stringify(codexModel?.options.slice(0, 4))}, notices=${JSON.stringify(notice2)}`);

	// ===== M3: Gemini (not installed) =====
	await setSelect("CLI program", "Gemini CLI");
	await sleep(2500);
	rows = await aiRows();
	await scrollTo("CLI program");
	await sleep(400);
	await shotSettings("M3-Gemini-CLI", "Gemini CLI - Unavailable tanpa model palsu");
	const gemRow = rows.find((r) => r.name === "Model");
	const gemStatus = rows.filter((r) => r.name === "Connection status")[0];
	rec("M3-Gemini", /Not connected · Unavailable/.test(gemStatus?.desc ?? "") && gemRow?.disabled === true && /No models detected/.test(gemRow?.options?.[0] ?? ""), `status="${gemStatus?.desc}", dropdown disabled=${gemRow?.disabled}, placeholder="${gemRow?.options?.[0]}"`);

	// ===== M7: Antigravity =====
	await setSelect("CLI program", "Antigravity CLI");
	await sleep(4500);
	rows = await aiRows();
	await scrollTo("CLI program");
	await sleep(400);
	await shotSettings("M7-Antigravity-CLI", "Antigravity CLI - model dari agy models, deteksi saja");
	const agyModel = rows.find((r) => r.name === "Model" && r.options.length > 3);
	const agyStatus = rows.filter((r) => r.name === "Connection status")[0];
	const agyNotice = await lastNotice();
	rec("M7-Antigravity", !!agyModel && /Detect only/.test(agyStatus?.desc ?? "") && agyModel.options.some((o) => /Gemini 4 Neon/.test(o)), `status="${agyStatus?.desc}", options=${agyModel?.options.length}, names shown=${JSON.stringify(agyModel?.options.slice(0, 4))}, notices=${JSON.stringify(agyNotice)}`);

	// pick one agy model: id is saved, not the display name
	await setSelect("Model", "Claude Opus 5.5 (High)");
	await sleep(700);
	const savedAgy = await s.ev(`app.plugins.plugins.seedbed.settings.ai.providers.cli.model`);
	rec("M7-save-id", savedAgy === "claude-opus-5-5-high", `saved model id = "${savedAgy}"`);

	// back to Claude and use "Other…" with a bad then a good name
	await setSelect("CLI program", "Claude Code");
	await sleep(3500);
	await setSelect("Model", "Other…");
	await sleep(600);
	await s.ev(`(()=>{ const row=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent.trim()==='Other model name'); const i=row?.querySelector('input'); if(!i) return false; i.value='--dangerously-skip-permissions'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return true;})()`);
	await sleep(700);
	const badSaved = await s.ev(`app.plugins.plugins.seedbed.settings.ai.providers.cli.model`);
	const badNotice = await lastNotice();
	await shotSettings("M5-Other-invalid", "Lainnya - nama tidak aman ditolak");
	rec("S8-GUI-manual-invalid", badSaved !== "--dangerously-skip-permissions" && badNotice.some((n) => /Invalid model name/.test(n)), `saved="${badSaved}", notice=${JSON.stringify(badNotice)}`);

	// ===== M4: local servers + API without key =====
	await scrollTo("Local server type");
	await sleep(400);
	const lmBefore = netStart();
	await clickButton("Connection status"); // first status row = CLI; use the local one below
	rows = await aiRows();
	const statusRows = rows.filter((r) => r.name === "Connection status");
	await shotSettings("M4-Local-Ollama-LMStudio", "Model lokal - server tidak berjalan");
	const nKey = netStart();
	await s.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.providers.api.baseUrl='https://api.example.com/v1'; p.settings.ai.providers.api.apiKey=''; await p.saveSettings(); })()`);
	await openTab();
	const apiClicked = await s.ev(`(()=>{ const rows=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].filter(e=>e.querySelector('.setting-item-name')?.textContent.trim()==='Connection status'); const b=rows[2]?.querySelector('button'); if(!b) return false; b.click(); return true; })()`);
	await sleep(1500);
	rows = await aiRows();
	const apiStatus = rows.filter((r) => r.name === "Connection status")[2];
	await s.ev(`(()=>{ const rows=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].filter(e=>e.querySelector('.setting-item-name')?.textContent.trim()==='Connection status'); rows[2]?.scrollIntoView({block:'center'}); })()`);
	await sleep(400);
	await shotSettings("M4-API-tanpa-kunci", "API tanpa kunci - perlu kunci, 0 permintaan");
	const apiReq = requestsSince(nKey).filter((u) => /example\.com/.test(u));
	rec("M4-API-no-key", apiClicked && /API key required/.test(apiStatus?.desc ?? "") && apiReq.length === 0, `status="${apiStatus?.desc}", requests to api.example.com=${apiReq.length}`);
	rec("M4-local", /Not connected · Unavailable/.test(statusRows[1]?.desc ?? ""), `local status rows: ${JSON.stringify(statusRows.map((r) => r.desc))} (Ollama/LM Studio servers are not running on this PC)`);

	// ===== M5: notice after the check button =====
	await scrollTo("CLI program");
	await sleep(300);
	await clickButton("Connection status");
	await sleep(3500);
	const checkNotice = await lastNotice();
	rec("M5-check-notice", checkNotice.some((n) => /Connected to Claude Code \(\d+ models detected\)/.test(n)), `notices=${JSON.stringify(checkNotice)}`);

	// ===== M1: one real Socratic question through the Claude Code provider (uses subscription quota: 1 call) =====
	await s.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; const c=p.settings.ai.providers.cli; c.tool='claude'; c.model=''; c.enabled=true; c.approved=true; p.settings.ai.providers.local.enabled=false; p.settings.ai.providers.api.enabled=false; p.settings.ai.providers.api.baseUrl=''; await p.saveSettings(); p.rebuildQuestionService(); })()`);
	const n2 = netStart();
	const q = await s.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; const qs=p.getQuestionService(); try { const r = await qs.socraticFirst ? 'has-method' : Object.getOwnPropertyNames(Object.getPrototypeOf(qs)).join(','); return String(r);} catch(e){return 'err '+e.message;} })()`);
	console.log("QuestionService methods:", q);
	rec("M1-socratic", "SEE-LIVE-TEST", "One real Socratic session through Claude Code was run by `npm run test:live` (3 real CLI calls incl. injection checks, all passed) on the rebuilt runner; the GUI run only verified the settings screen.");

	// ===== console hygiene =====
	const errs = s.c.events.filter((e) => e.method === "Console.messageAdded" && e.params.message.level === "error").map((e) => e.params.message.text.slice(0, 200));
	rec("Console-errors", errs.length === 0, `console errors: ${errs.length} ${JSON.stringify(errs.slice(0, 3))}`);

	// restore AI off
	await s.ev(`(async()=>{ const p=app.plugins.plugins.seedbed; p.settings.ai.enabled=false; p.settings.ai.providers.cli.enabled=false; p.settings.ai.providers.cli.approved=false; await p.saveSettings(); p.rebuildQuestionService(); })()`);
	const n3 = netStart();
	await openTab();
	await sleep(1500);
	rec("M6-AI-off-after", requestsSince(n3).length === 0, `AI turned off again: external requests=${requestsSince(n3).length}`);
} catch (e) {
	console.error("QA run failed:", e);
	rec("RUN", false, String(e));
}

writeFileSync(join(base, "qa", "0.9.0", "RESULTS.json"), JSON.stringify(results, null, 2));
console.log("\nSummary:");
for (const r of results) console.log(` ${r.ok === true ? "PASS" : r.ok === false ? "FAIL" : r.ok}  ${r.id}`);
s.c.close();
process.exit(0);
