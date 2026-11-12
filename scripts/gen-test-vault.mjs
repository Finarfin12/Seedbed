// CATATAN: fixture ini SENGAJA memakai format properti lama 0.6 (bengkel-*, nilai Indonesia) supaya kompatibilitas baca teruji; jalankan perintah "Migrate Seedbed properties to English" di Obsidian untuk mengonversinya.
// Membuat vault uji (±22 catatan contoh) di test-vault/. Tanggal tinjau relatif terhadap hari ini.
// Pakai: npm run gen-test-vault
// HANYA menulis di dalam test-vault/ milik proyek ini. Tidak menyentuh vault lain.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "test-vault");

const pad = (n) => String(n).padStart(2, "0");
const iso = (offsetDays) => {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fm = ({ tipe, status, dibuat = -14, tinjau, gerbang = [] }) =>
	[
		"---",
		`bengkel-tipe: ${tipe}`,
		`bengkel-status: ${status}`,
		`bengkel-dibuat: ${iso(dibuat)}`,
		...(tinjau === undefined ? [] : [`bengkel-tinjau: ${tinjau}`]),
		`bengkel-gerbang: ${gerbang.length ? "\n" + gerbang.map((g) => `  - ${g}`).join("\n") : "[]"}`,
		"---",
		"",
	].join("\n");

const socraticCallout = [
	"> [!socratic]- Sesi Socratic — " + iso(-20),
	"> **Klarifikasi:** Apa persisnya yang kamu maksud dengan ide ini?",
	"> Jawaban: Aplikasi kecil untuk mencatat satu kebiasaan per hari tanpa gamifikasi berlebihan.",
].join("\n");

const devilCallout = [
	"> [!devil]- Devil's Advocate — " + iso(-12),
	"> **Kegagalan:** Setahun lagi ide ini gagal. Apa penyebabnya?",
	"> Jawaban: Orang berhenti memakainya setelah dua minggu karena tidak ada pengingat.",
].join("\n");

/** @type {Array<[string, string]>} */
const notes = [
	// ---- Ide ----
	["Ide/Aplikasi jurnal kebiasaan.md", fm({ tipe: "ide", status: "benih", tinjau: iso(-3) }) + "\nCatat satu kebiasaan per hari.\n"],
	["Ide/Newsletter mingguan.md", fm({ tipe: "ide", status: "benih", tinjau: iso(4) }) + "\nRangkuman bacaan tiap Jumat.\n"],
	["Ide/Komunitas baca buku.md", fm({ tipe: "ide", status: "tumbuh", tinjau: iso(-1), gerbang: ["socratic"] }) + "\nKlub baca bulanan.\n\n" + socraticCallout + "\n"],
	["Ide/Alat catat rapat.md", fm({ tipe: "ide", status: "tumbuh", tinjau: iso(10), gerbang: ["socratic"] }) + "\nRingkas rapat otomatis.\n"],
	["Ide/Podcast pemula.md", fm({ tipe: "ide", status: "matang", tinjau: iso(-10), gerbang: ["socratic", "devil"] }) + "\nPodcast untuk pemula.\n\n" + socraticCallout + "\n\n" + devilCallout + "\n"],
	["Ide/Kursus mini SQL.md", fm({ tipe: "ide", status: "matang", tinjau: iso(20), gerbang: ["socratic", "devil"] }) + "\nKursus 5 hari.\n"],
	["Ide/Plugin kalender.md", fm({ tipe: "ide", status: "dibuang", dibuat: -40 }) + "\nDibuang: sudah ada yang serupa.\n"],
	["Ide/Jatuh tempo hari ini.md", fm({ tipe: "ide", status: "tumbuh", tinjau: iso(0), gerbang: ["socratic"] }) + "\nTinjau hari ini.\n"],
	["Ide/Status salah.md", "---\nbengkel-tipe: ide\nbengkel-status: abc\n---\n\nStatus tidak valid, tidak boleh membuat plugin crash.\n"],
	["Ide/Tipe salah.md", "---\nbengkel-tipe: xyz\nbengkel-status: benih\n---\n\nTipe tidak valid.\n"],
	["Ide/Tanggal rusak.md", "---\nbengkel-tipe: ide\nbengkel-status: benih\nbengkel-tinjau: besok\n---\n\nTanggal tinjau rusak: dianggap jatuh tempo.\n"],

	// ---- Konsep (Feynman) ----
	[
		"Konsep/Feynman - Entropi.md",
		fm({ tipe: "konsep", status: "benih", tinjau: iso(2) }) +
			[
				"",
				"> [!feynman-hint]- Petunjuk Feynman",
				"> 1. Konsep sudah dipilih (judul catatan ini).",
				"> 2. Jelaskan di bawah dengan bahasa sederhana.",
				"> 3. Jalankan perintah **Periksa penjelasan**.",
				"> 4. Sederhanakan dan ulangi.",
				"",
				"## Penjelasanku",
				"",
				"Entropi selalu naik, jadi setiap algoritma yang baik harus punya kompleksitas rendah supaya tidak membuang energi sedikit pun ketika kita memprosesnya di dalam basis data yang besar sekali.",
				"",
			].join("\n"),
	],
	[
		"Konsep/Feynman - Rekursi.md",
		fm({ tipe: "konsep", status: "benih", tinjau: iso(2) }) +
			[
				"",
				"## Penjelasanku",
				"",
				"Rekursi adalah cara sebuah fungsi memanggil dirinya sendiri untuk menyelesaikan masalah yang lebih kecil.",
				"Algoritma yaitu langkah-langkah terurut untuk menyelesaikan sesuatu.",
				"Contohnya menghitung faktorial.",
				"",
			].join("\n"),
	],
	["Konsep/Basis data (konsep).md", fm({ tipe: "konsep", status: "tumbuh", tinjau: iso(5), gerbang: ["feynman"] }) + "\nBasis data merupakan tempat menyimpan data terstruktur.\n"],

	// ---- Catatan biasa (sumber istilah Feynman) ----
	["Referensi/Entropi.md", "---\naliases:\n  - Entropy\n---\n\nUkuran ketidakteraturan.\n"],
	["Referensi/Algoritma.md", "---\naliases: [Algorithm]\n---\n\nLangkah penyelesaian masalah.\n"],
	["Referensi/Basis data.md", "Tempat data terstruktur.\n"],
	["Referensi/Kompleksitas.md", "Seberapa mahal sebuah proses.\n"],
	["Referensi/Rekursi.md", "Fungsi yang memanggil dirinya.\n"],
	["Catatan harian.md", "Hari ini belajar banyak. Tidak ada frontmatter di catatan ini.\n"],
	["Referensi/Catatan dengan kode.md", "Contoh kode:\n\n```python\n# entropi dan algoritma di dalam kode tidak boleh dihitung\nentropi = 1\n```\n\nPakai `kompleksitas` inline juga diabaikan.\n"],
	["Referensi/Catatan siap dijadikan ide.md", "---\ntitle: Judul Asli\ntags:\n  - riset\naliases:\n  - Siap Ide\n---\n\nIsi penting yang tidak boleh hilang.\n\n## Bagian dua\n\nLebih banyak isi.\n"],
];

/** Tulis semua catatan contoh ke `root`. Mengembalikan jumlah catatan. */
export function generate(root = defaultRoot) {
	for (const [rel, content] of notes) {
		const file = join(root, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content, "utf8");
	}
	return notes.length;
}

// Jalankan hanya bila dipanggil langsung (npm run gen-test-vault), bukan saat diimpor oleh tes.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	console.log(`Menulis ${generate()} catatan ke ${defaultRoot}`);
}
