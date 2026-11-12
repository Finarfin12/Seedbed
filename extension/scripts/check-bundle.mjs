// NF-C2: bundel tidak boleh punya akses jaringan. Juga memeriksa izin manifest (NF-C1). Gagal = exit 1.
import { readFileSync } from "node:fs";

const FORBIDDEN = [
	["fetch(", /\bfetch\s*\(/],
	["XMLHttpRequest", /XMLHttpRequest/],
	["WebSocket", /WebSocket/],
	["EventSource", /EventSource/],
	["sendBeacon", /sendBeacon/],
	["importScripts", /importScripts/],
	["eval(", /\beval\s*\(/],
	["new Function", /new\s+Function\s*\(/],
	["innerHTML", /\.innerHTML\s*=/],
	["http(s) URL tertanam", /https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}/i],
];
let bad = 0;
for (const f of ["background.js", "capture.js", "options.js"]) {
	const src = readFileSync(`dist/${f}`, "utf8");
	const hits = FORBIDDEN.filter(([, re]) => re.test(src)).map(([n]) => n);
	console.log(`${f}: ${src.length} B ${hits.length ? "DILARANG: " + hits.join(", ") : "bersih"}`);
	if (hits.length) bad++;
}
const m = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const allowed = new Set(["contextMenus", "storage", "activeTab", "scripting"]);
const extra = (m.permissions ?? []).filter((p) => !allowed.has(p));
console.log("permissions:", JSON.stringify(m.permissions), "host_permissions:", JSON.stringify(m.host_permissions ?? null), "content_scripts:", JSON.stringify(m.content_scripts ?? null));
if (extra.length || m.host_permissions || m.optional_host_permissions || m.content_scripts || (m.permissions ?? []).includes("<all_urls>")) {
	console.log("IZIN BERLEBIH:", extra);
	bad++;
}
process.exit(bad ? 1 : 0);
