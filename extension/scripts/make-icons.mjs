// Membuat ikon PNG sederhana (benih/tunas hijau di lingkaran) tanpa dependensi. Jalankan: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
	let c;
	const table = [];
	for (let n = 0; n < 256; n++) {
		c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	let crc = 0xffffffff;
	for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
			const o = y * (size * 4 + 1) + 1 + x * 4;
			raw[o] = r;
			raw[o + 1] = g;
			raw[o + 2] = b;
			raw[o + 3] = a;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// Lingkaran hijau + tunas putih (dua daun)
function pixel(x, y, s) {
	const cx = s / 2, cy = s / 2, R = s * 0.47;
	const d = Math.hypot(x - cx, y - cy);
	if (d > R) return [0, 0, 0, 0];
	const u = (x - cx) / s, v = (y - cy) / s;
	const stem = Math.abs(u) < 0.035 && v > -0.02 && v < 0.28;
	const leafL = Math.hypot(u + 0.13, v + 0.1) < 0.14 && u < 0.0;
	const leafR = Math.hypot(u - 0.13, v + 0.1) < 0.14 && u > 0.0;
	if (stem || leafL || leafR) return [255, 255, 255, 255];
	return [46, 125, 50, 255];
}
mkdirSync("icons", { recursive: true });
// Ikon 128 untuk Chrome Web Store: gambar 96x96 di tengah + 16 px transparan tiap sisi (panduan resmi CWS).
const store128 = (x, y, s) => pixel((x - s / 2) * (0.47 / 0.375) + s / 2, (y - s / 2) * (0.47 / 0.375) + s / 2, s);
for (const s of [16, 48]) writeFileSync(`icons/icon${s}.png`, png(s, pixel));
writeFileSync("icons/icon128.png", png(128, store128));
console.log("icons dibuat");
