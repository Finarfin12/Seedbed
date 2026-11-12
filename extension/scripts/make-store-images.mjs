// Menyusun gambar CWS (1280x800 x5 + promo 440x280) dari tangkapan layar asli di store/images/_raw/.
// Perlu Chrome PROFIL UJI yang berjalan dengan --remote-debugging-port=9333 (lihat .test-harness/). Jalankan: node scripts/make-store-images.mjs
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve("store/images");
mkdirSync(`${ROOT}/_src`, { recursive: true });
mkdirSync(`${ROOT}/en`, { recursive: true });
const raw = (f) => pathToFileURL(`${ROOT}/_raw/${f}`).href;
const icon = pathToFileURL(resolve("icons/icon128.png")).href;

const css = `*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;overflow:hidden}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#14301a 0%,#1f4d28 55%,#2e7d32 100%);position:relative}
.cap{position:absolute;left:56px;top:0;bottom:0;width:430px;display:flex;flex-direction:column;justify-content:center}
.cap h1{font-size:44px;line-height:1.15;font-weight:700;letter-spacing:-.5px}
.cap p{margin-top:18px;font-size:21px;line-height:1.45;color:#d6ead8}
.cap .k{display:inline-block;background:rgba(255,255,255,.16);border-radius:6px;padding:1px 8px;font-size:.9em}
.shot{position:absolute;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;background:#000}
.shot img{display:block}
.brand{position:absolute;left:56px;bottom:36px;display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600;color:#d6ead8}
.brand img{width:40px;height:40px}`;
const page = (body, w = 1280, h = 800) => `<!doctype html><meta charset="utf-8"><style>${css}</style><body style="width:${w}px;height:${h}px">${body}</body>`;
const brand = `<div class="brand"><img src="${icon}">Seedbed Capture</div>`;
const caption = (h, p) => `<div class="cap"><h1>${h}</h1><p>${p}</p></div>${brand}`;
// potongan gambar: tampilkan wilayah (x,y,w,h) dari berkas mentah pada skala s
const crop = (file, x, y, w, h, s, left, top) =>
	`<div class="shot" style="left:${left}px;top:${top}px;width:${w * s}px;height:${h * s}px"><img src="${raw(file)}" style="margin:${-y * s}px 0 0 ${-x * s}px;width:${{ "3-confirm.png": 1278, "4-seed.png": 1278 }[file] * s}px"></div>`;

const shots = {
	"screenshot-1": page(`<img src="${raw("1-page.png")}" style="position:absolute;inset:0;width:1280px;height:800px"><div style="position:absolute;left:0;right:0;bottom:0;padding:22px 40px;background:linear-gradient(0deg,rgba(15,40,20,.96),rgba(15,40,20,.82));display:flex;align-items:center;gap:18px"><img src="${icon}" width="54" height="54"><div><div style="font-size:30px;font-weight:700">Select text anywhere, then right-click “Save as seed”</div><div style="font-size:19px;color:#d6ead8;margin-top:4px">Or press <span class="k">Alt+Shift+S</span>. No account, no server.</div></div></div>`),
	"screenshot-2": page(`${caption("A trigger question, not a clipping", "Seedbed Capture shows the quote with one question to think about. Swap the question and add one sentence of your own. <span class='k'>Ctrl+Enter</span> saves.")}<div class="shot" style="left:560px;top:96px;width:540px;height:588px"><img src="${raw("2-popup.png")}" style="width:540px"></div>`),
	"screenshot-3": page(`${caption("Confirmed before it lands in Obsidian", "Seedbed asks you to check every capture. Nothing is saved without your OK, and the link only creates a new note.")}${crop("3-confirm.png", 292, 282, 694, 436, 1.05, 520, 180)}`),
	"screenshot-4": page(`${caption("Straight into your Incubator", "The seed arrives as a note with its source link, your answer, and a review date, ready for the Seedbed Incubator.")}${crop("4-seed.png", 432, 50, 846, 948, 0.78, 560, 30)}`),
	"screenshot-5": page(`${caption("A gentle limit on piling up ideas", "After 5 seeds in a day (adjustable), the window asks “Are you sure?”. Review what you planted before planting more.")}<div class="shot" style="left:560px;top:68px;width:540px;height:636px"><img src="${raw("5-limit.png")}" style="width:540px"></div>`),
	"promo-small-440x280": page(`<div style="position:absolute;left:0;right:0;top:46px;text-align:center"><img src="${icon}" width="96" height="96"></div><div style="position:absolute;left:0;right:0;top:158px;text-align:center;font-size:36px;font-weight:700;letter-spacing:-.3px">Seedbed Capture</div><div style="position:absolute;left:0;right:0;top:208px;text-align:center;font-size:17px;color:#d6ead8">Save a quote as a seed, with a question</div>`, 440, 280),
};
for (const [name, html] of Object.entries(shots)) writeFileSync(`${ROOT}/_src/${name}.html`, html);

// Render lewat CDP di Chrome profil uji.
const { targets, connect } = await import(pathToFileURL(resolve(".test-harness/cdp.mjs")).href);
const t = await (await fetch(`http://127.0.0.1:9333/json/new?about:blank`, { method: "PUT" })).json();
const c = await connect(t.webSocketDebuggerUrl);
await c.send("Page.enable");
for (const name of Object.keys(shots)) {
	const [w, h] = name.startsWith("promo") ? [440, 280] : [1280, 800];
	await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
	await c.send("Page.navigate", { url: pathToFileURL(`${ROOT}/_src/${name}.html`).href });
	await new Promise((r) => setTimeout(r, 1200));
	const shot = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
	const out = name.startsWith("promo") ? `${ROOT}/${name}.png` : `${ROOT}/en/${name}.png`;
	writeFileSync(out, Buffer.from(shot.data, "base64"));
	console.log(out);
}
c.close();
await fetch(`http://127.0.0.1:9333/json/close/${t.id}`);
