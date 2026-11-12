import type { Question, QuestionKind } from "../questions/provider";
import type { StaticQuestionProvider } from "../questions/staticProvider";
import type { Language } from "../types";
import type { Attempt, ProviderChain } from "./chain";
import { parseBatchQuestions, parseHint, parseSingleQuestion } from "./outputValidator";
import { buildBatchPrompt, buildHintPrompt, buildSingleQuestionPrompt, categoriesFor } from "./promptBuilder";
import type { PreviousAnswer, SourceLabel } from "./types";

export interface ServiceConfig {
	maxContextChars: number;
}

export interface ServiceCtx {
	language: Language;
	noteText: string;
}

const BANK: SourceLabel = { kind: "bank" };

/**
 * Titik masuk tunggal untuk modal. `chain` = null berarti AI mati: tidak ada permintaan jaringan,
 * tidak ada proses, hanya bank statis (NF-1).
 */
export class QuestionService {
	/** Percobaan terakhir (untuk diagnosis di UI; tanpa rahasia). */
	lastAttempts: Attempt[] = [];

	constructor(
		private staticProvider: StaticQuestionProvider,
		private chain: ProviderChain | null,
		private cfg: ServiceConfig,
	) {}

	get aiAvailable(): boolean {
		return this.chain !== null && this.chain.size > 0;
	}

	private async staticQuestion(kind: QuestionKind, category: string, ctx: ServiceCtx): Promise<Question> {
		const all = await this.staticProvider.getQuestions(kind, { language: ctx.language });
		const q = all.find((x) => x.category === category) ?? all[0];
		if (!q) throw new Error("question bank is empty");
		return { ...q, source: BANK };
	}

	/** Semua pertanyaan sekaligus (Devil's Advocate; Socratic mode "satu tarikan"). */
	async batch(kind: QuestionKind, ctx: ServiceCtx): Promise<Question[]> {
		const cats = categoriesFor(kind);
		if (this.chain && this.chain.size > 0) {
			const prompt = buildBatchPrompt({ kind, language: ctx.language, noteText: ctx.noteText, maxContextChars: this.cfg.maxContextChars });
			const res = await this.chain.run(prompt, (raw) => {
				const parsed = parseBatchQuestions(raw, cats);
				// Terima hanya bila minimal separuh kategori valid; sisanya diisi bank.
				return parsed && parsed.filter((x) => x !== null).length >= Math.ceil(cats.length / 2) ? parsed : null;
			});
			this.lastAttempts = res.attempts;
			if (res.value && res.source) {
				const out: Question[] = [];
				for (let i = 0; i < cats.length; i++) {
					const text = res.value[i];
					const cat = cats[i] as string;
					out.push(
						text
							? ({ kind, category: cat, text, source: res.source } as Question)
							: await this.staticQuestion(kind, cat, ctx),
					);
				}
				return out;
			}
		}
		const fallback: Question[] = [];
		for (const c of cats) fallback.push(await this.staticQuestion(kind, c, ctx));
		return fallback;
	}

	/** Satu pertanyaan adaptif (Socratic): memakai jawaban sebelumnya. */
	async next(kind: QuestionKind, category: string, ctx: ServiceCtx, previous: PreviousAnswer[]): Promise<Question> {
		if (this.chain && this.chain.size > 0) {
			const prompt = buildSingleQuestionPrompt({
				kind,
				category,
				language: ctx.language,
				noteText: ctx.noteText,
				previous,
				maxContextChars: this.cfg.maxContextChars,
			});
			const res = await this.chain.run(prompt, parseSingleQuestion);
			this.lastAttempts = res.attempts;
			if (res.value && res.source) return { kind, category, text: res.value, source: res.source } as Question;
		}
		return this.staticQuestion(kind, category, ctx);
	}

	/** Petunjuk bertingkat (R-3). null bila AI tidak tersedia/gagal (tombol disembunyikan/dinonaktifkan). */
	async hint(question: string, level: number, ctx: ServiceCtx, currentAnswer?: string): Promise<{ text: string; source: SourceLabel } | null> {
		if (!this.chain || this.chain.size === 0) return null;
		const prompt = buildHintPrompt({
			question,
			level,
			language: ctx.language,
			noteText: ctx.noteText,
			maxContextChars: this.cfg.maxContextChars,
			currentAnswer,
		});
		const res = await this.chain.run(prompt, parseHint);
		this.lastAttempts = res.attempts;
		return res.value && res.source ? { text: res.value, source: res.source } : null;
	}
}
