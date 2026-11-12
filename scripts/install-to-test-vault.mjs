// Menyalin build (main.js, manifest.json, styles.css) ke vault uji dan mengaktifkan plugin di sana.
// Pakai: npm run build && npm run install-test-vault
// HANYA menulis di dalam test-vault/ milik proyek ini.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vault = join(base, "test-vault");
const dest = join(vault, ".obsidian", "plugins", "seedbed");

for (const f of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(join(base, f))) {
		console.error(`Tidak ada ${f}. Jalankan "npm run build" dulu.`);
		process.exit(1);
	}
}
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(base, f), join(dest, f));

const cfg = join(vault, ".obsidian");
writeFileSync(join(cfg, "community-plugins.json"), JSON.stringify(["seedbed"], null, 2) + "\n");
if (!existsSync(join(cfg, "app.json"))) writeFileSync(join(cfg, "app.json"), "{}\n");
console.log(`Plugin dipasang ke ${dest}`);
