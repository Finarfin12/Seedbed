import { KEY } from "./frontmatter";
import { nextReview } from "./scheduler";
import type { Language, Settings, Tipe } from "./types";

const BODY = {
	id: {
		ide: "Tulis idemu di sini. Tak perlu rapi: yang penting tertangkap dulu.\n",
		feynman: [
			"> [!feynman-hint]- Petunjuk Feynman",
			"> 1. Konsep sudah dipilih (judul catatan ini).",
			"> 2. Jelaskan di bawah dengan bahasa sederhana, seolah kepada anak 12 tahun.",
			"> 3. Jalankan perintah **Periksa penjelasan** untuk menemukan istilah yang belum kamu jelaskan.",
			"> 4. Sederhanakan, tulis ulang, dan periksa lagi sampai tidak ada celah.",
			"",
			"## Penjelasanku",
			"",
			"",
		].join("\n"),
	},
	en: {
		ide: "Write your idea here. It does not need to be tidy: capturing it comes first.\n",
		feynman: [
			"> [!feynman-hint]- Feynman hints",
			"> 1. The concept is chosen (the title of this note).",
			"> 2. Explain it below in plain words, as if to a 12-year-old.",
			"> 3. Run the **Check explanation** command to find terms you have not explained yet.",
			"> 4. Simplify, rewrite, and check again until no gaps remain.",
			"",
			"## My explanation",
			"",
			"",
		].join("\n"),
	},
} as const;

/** Isi lengkap catatan baru (frontmatter + badan). */
export function newNoteContent(
	tipe: Tipe,
	today: string,
	settings: Settings,
	language: Language,
	feynman = false,
): string {
	const tinjau = nextReview("benih", today, settings);
	const fm = [
		"---",
		`${KEY.tipe}: ${tipe}`,
		`${KEY.status}: benih`,
		`${KEY.dibuat}: ${today}`,
		`${KEY.tinjau}: ${tinjau}`,
		`${KEY.gerbang}: []`,
		"---",
		"",
	].join("\n");
	const body = feynman ? BODY[language].feynman : BODY[language].ide;
	return `${fm}\n${body}`;
}

/** Bersihkan judul menjadi nama file yang aman di semua OS dan tidak merusak tautan wiki. */
export function safeFileName(title: string): string {
	const cleaned = title
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, 120)
		.trim();
	return cleaned;
}
