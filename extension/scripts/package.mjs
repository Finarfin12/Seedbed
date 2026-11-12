// Membuat ZIP siap upload ke Chrome Web Store dari dist/ (manifest.json di akar ZIP). Tanpa dependensi.
// Jalankan lewat: npm run package   (build + check-bundle + zip)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateRawSync, crc32 } from "node:zlib";
import { join, posix } from "node:path";

const DIST = "dist";
const FORBIDDEN = [/\.map$/i, /\.test\./i, /(^|\/)node_modules\//, /(^|\/)\.chrome-test-profile\//, /(^|\/)\.test-harness\//, /(^|\/)tests?\//, /\.ts$/i, /\.md$/i];
const ALLOWED_TOP = new Set(["manifest.json", "background.js", "capture.html", "capture.css", "capture.js", "options.html", "options.css", "options.js", "_locales", "icons"]);

function walk(dir, rel = "") {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const r = rel ? `${rel}/${e.name}` : e.name;
		return e.isDirectory() ? walk(join(dir, e.name), r) : [r];
	});
}

const files = walk(DIST).sort();
if (!files.includes("manifest.json")) throw new Error("dist/manifest.json tidak ada; jalankan build dulu");
for (const f of files) {
	if (FORBIDDEN.some((re) => re.test(f))) throw new Error(`Berkas terlarang di dist: ${f}`);
	if (!ALLOWED_TOP.has(f.split("/")[0])) throw new Error(`Berkas tak dikenal di akar dist: ${f} (perbarui ALLOWED_TOP bila memang sengaja)`);
}
const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
const out = `store/seedbed-capture-${manifest.version}.zip`;

// Cap waktu tetap (2026-01-01 00:00) supaya ZIP dapat direproduksi.
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const locals = [], central = [];
let offset = 0;
for (const f of files) {
	const data = readFileSync(join(DIST, f));
	const comp = deflateRawSync(data, { level: 9 });
	const useDeflate = comp.length < data.length;
	const body = useDeflate ? comp : data;
	const name = Buffer.from(posix.normalize(f), "utf8");
	const crc = crc32(data);
	const lh = Buffer.alloc(30);
	lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
	lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
	locals.push(lh, name, body);
	const ch = Buffer.alloc(46);
	ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
	ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
	central.push(ch, name);
	offset += lh.length + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync("store", { recursive: true });
const zip = Buffer.concat([...locals, cd, end]);
writeFileSync(out, zip);
console.log(`${out}  ${zip.length} B  sha256=${createHash("sha256").update(zip).digest("hex")}`);
for (const f of files) console.log(`  ${String(statSync(join(DIST, f)).size).padStart(7)}  ${f}`);
