/**
 * Validator keluaran AI (aturan R-1): hanya pertanyaan, maks. 2 kalimat, bukan penjelasan.
 * Semua fungsi murni; mengembalikan null bila ditolak (pemanggil lalu jatuh ke penyedia berikut / bank statis).
 */

const MAX_LEN = 320;

/** Pola yang menandakan penjelasan/jawaban, bukan pertanyaan. */
const EXPLANATION_PATTERNS: RegExp[] = [
	/\bjawab(an)?(nya)?\s+(adalah|yaitu|ialah)\b/i,
	/\bjawaban\s+yang\s+benar\b/i,
	/\b(kesimpulannya|ringkasnya|singkatnya|intinya|definisinya|dengan kata lain)\b/i,
	/\bdidefinisikan\s+sebagai\b/i,
	/\bthe\s+(correct\s+)?answer\s+is\b/i,
	/\b(in\s+summary|to\s+summari[sz]e|in\s+short|in\s+other\s+words|simply\s+put|is\s+defined\s+as)\b/i,
	/\bdefined\s+as\b/i,
	/\bhere\s+is\s+(the|an)\s+(explanation|answer)\b/i,
];

const FORBIDDEN_CONTENT: RegExp[] = [/```/, /`/, /https?:\/\//i, /<\s*\/?\s*[a-z][^>]*>/i, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/];

/** Pecah menjadi kalimat berdasarkan . ! ? (tanda baca dipertahankan). */
export function splitSentences(text: string): string[] {
	const out: string[] = [];
	const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
	for (const m of text.matchAll(re)) {
		const s = m[0].trim();
		if (s) out.push(s);
	}
	return out;
}

function basicChecks(text: string): boolean {
	if (text.length < 8 || text.length > MAX_LEN) return false;
	if (/\n/.test(text.trim())) return false;
	if (FORBIDDEN_CONTENT.some((r) => r.test(text))) return false;
	if (EXPLANATION_PATTERNS.some((r) => r.test(text))) return false;
	if (/^(jawaban|answer|hint|petunjuk)\s*:/i.test(text.trim())) return false;
	return true;
}

/** Pertanyaan sah: 1-2 kalimat, SETIAP kalimat berakhir "?". */
export function validateQuestion(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const text = raw.trim().replace(/\s+/g, " ");
	if (!basicChecks(text)) return null;
	const sentences = splitSentences(text);
	if (sentences.length < 1 || sentences.length > 2) return null;
	if (!sentences.every((s) => s.endsWith("?"))) return null;
	return text;
}

/** Petunjuk sah: 1-2 kalimat, tanpa pola penjelasan/jawaban. Boleh berupa dorongan ("pikirkan apa yang..."). */
export function validateHint(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const text = raw.trim().replace(/\s+/g, " ");
	if (!basicChecks(text)) return null;
	const sentences = splitSentences(text);
	if (sentences.length < 1 || sentences.length > 2) return null;
	return text;
}

/** Ambil objek JSON dari teks mentah (toleran terhadap code fence / teks di sekitarnya). */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
	if (typeof raw !== "string") return null;
	let s = raw.trim();
	const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
	if (fence) s = (fence[1] as string).trim();
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end <= start) return null;
	try {
		const v: unknown = JSON.parse(s.slice(start, end + 1));
		return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** {"question": "...", "category": "..."} -> pertanyaan valid (kategori selalu = yang diminta). */
export function parseSingleQuestion(raw: string): string | null {
	const obj = parseJsonObject(raw);
	return obj ? validateQuestion(obj.question) : null;
}

/** {"questions": [{category, question}, ...]} -> peta kategori -> pertanyaan valid (yang gagal = null). */
export function parseBatchQuestions(raw: string, categories: readonly string[]): Array<string | null> | null {
	const obj = parseJsonObject(raw);
	if (!obj || !Array.isArray(obj.questions)) return null;
	const byCat = new Map<string, unknown>();
	for (const item of obj.questions) {
		if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			if (typeof o.category === "string" && !byCat.has(o.category)) byCat.set(o.category, o.question);
		}
	}
	// Bila kategori tidak dikenali tetapi jumlahnya pas, pakai urutan.
	const arr = obj.questions as unknown[];
	return categories.map((c, i) => {
		const direct = byCat.get(c);
		if (direct !== undefined) return validateQuestion(direct);
		if (byCat.size === 0 && arr.length === categories.length) {
			const it = arr[i];
			return it && typeof it === "object" ? validateQuestion((it as Record<string, unknown>).question) : null;
		}
		return null;
	});
}

export function parseHint(raw: string): string | null {
	const obj = parseJsonObject(raw);
	return obj ? validateHint(obj.hint) : null;
}
