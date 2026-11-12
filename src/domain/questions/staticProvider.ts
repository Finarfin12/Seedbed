import { DEVIL_CATEGORIES, SOCRATIC_CATEGORIES } from "./provider";
import type { Question, QuestionBank, QuestionContext, QuestionKind, QuestionProvider } from "./provider";
import type { Language } from "../types";

export type Banks = Record<Language, QuestionBank>;

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanList(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/**
 * Gabungkan bank kustom milik pengguna (F-13) ke bank bawaan.
 * Bentuk: { "id": { "socratic": { "klarifikasi": ["..."] }, "devil": { ... } }, "en": { ... } }.
 * Kategori yang tidak valid/kosong diabaikan (bank bawaan tetap dipakai).
 */
export function mergeBanks(base: Banks, custom: unknown): Banks {
	const out: Banks = structuredClone(base);
	if (!isRecord(custom)) return out;
	for (const lang of ["id", "en"] as const) {
		const cl = custom[lang];
		if (!isRecord(cl)) continue;
		const s = cl.socratic;
		if (isRecord(s)) {
			for (const cat of SOCRATIC_CATEGORIES) {
				const list = cleanList(s[cat]);
				if (list.length > 0) out[lang].socratic[cat] = list;
			}
		}
		const d = cl.devil;
		if (isRecord(d)) {
			for (const cat of DEVIL_CATEGORIES) {
				const list = cleanList(d[cat]);
				if (list.length > 0) out[lang].devil[cat] = list;
			}
		}
	}
	return out;
}

/** Penyedia statis: ambil acak satu pertanyaan per kategori dari bank (F-23). */
export class StaticQuestionProvider implements QuestionProvider {
	constructor(
		private banks: Banks,
		private rng: () => number = Math.random,
	) {}

	setBanks(banks: Banks): void {
		this.banks = banks;
	}

	getQuestions(kind: QuestionKind, ctx: QuestionContext): Promise<Question[]> {
		const bank = this.banks[ctx.language] ?? this.banks.id;
		const cats = kind === "socratic" ? SOCRATIC_CATEGORIES : DEVIL_CATEGORIES;
		const out: Question[] = [];
		for (const cat of cats) {
			const list =
				kind === "socratic"
					? bank.socratic[cat as keyof QuestionBank["socratic"]]
					: bank.devil[cat as keyof QuestionBank["devil"]];
			const pool = list && list.length > 0 ? list : [];
			if (pool.length === 0) continue;
			const idx = Math.min(pool.length - 1, Math.floor(this.rng() * pool.length));
			out.push({ kind, category: cat, text: pool[idx] as string });
		}
		return Promise.resolve(out);
	}
}
