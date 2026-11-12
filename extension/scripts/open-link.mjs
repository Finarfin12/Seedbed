// Alat uji manual: membuat link obsidian://seedbed-capture dari JSON dan membukanya lewat OS (sama seperti ekstensi).
// Pakai: node scripts/open-link.mjs '{"text":"...","url":"https://..."}'   (tambah --print untuk hanya mencetak)
// SELALU menuju vault "test-vault".
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const print = args.includes("--print");
const json = args.find((a) => !a.startsWith("--")) ?? "{}";
const p = { v: "1", lang: "id", ...JSON.parse(json) };
const qs = Object.entries(p)
	.filter(([, v]) => v !== undefined && v !== null)
	.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
	.join("&");
const link = `obsidian://seedbed-capture?vault=test-vault&${qs}`;
console.log(`panjang link: ${link.length}`);
if (print) {
	console.log(link);
	process.exit(0);
}
// cmd /c start "" "<link>" : rute yang sama dengan Run/Chrome ke handler protokol terdaftar.
const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Start-Process -FilePath $env:LINK"], { env: { ...process.env, LINK: link }, encoding: "utf8" });
console.log("exit", r.status, r.stderr.trim());
