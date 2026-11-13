import type { Question, QuestionKind } from "../questions/provider";
import type { StaticQuestionProvider } from "../questions/staticProvider";
import type { Language } from "../types";
import type { Attempt, ProviderChain } from "./chain";
import { parseBatchQuestions, parseHint, parseSingleQuestion } from "./outputValidator";
import {
	buildConnectPrompt,
	buildDigestPrompt,
	buildFollowUpPrompt,
	buildPremortemPrompt,
	parseConnectBatch,
	parseDigestQuestion,
	parseFollowUp,
	parsePremortemBatch,
} from "./extras";
import type { CandidateSnippet, WeakKind } from "./extras";
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

	// ---- 0.8.0: semua jalur AI mengembalikan null bila AI mati (tanpa panggilan apa pun) atau gagal (pemanggil memakai bank/aturan). ----

	/** Pre-mortem: 5 pertanyaan spesifik isi catatan. Slot yang ditolak validator = null (diisi bank oleh pemanggil). */
	async premortemBatch(ctx: ServiceCtx): Promise<{ texts: Array<string | null>; source: SourceLabel } | null> {
		if (!this.chain || this.chain.size === 0) return null;
		const prompt = buildPremortemPrompt({ language: ctx.language, noteText: ctx.noteText, maxContextChars: this.cfg.maxContextChars });
		const res = await this.chain.run(prompt, parsePremortemBatch);
		this.lastAttempts = res.attempts;
		return res.value && res.source ? { texts: res.value, source: res.source } : null;
	}

	/** Connect: satu pertanyaan per kandidat. Hanya catatan aktif + judul/300 karakter kandidat yang dikirim. */
	async connectBatch(ctx: ServiceCtx, candidates: CandidateSnippet[]): Promise<{ texts: Array<string | null>; source: SourceLabel } | null> {
		if (!this.chain || this.chain.size === 0 || candidates.length === 0) return null;
		const prompt = buildConnectPrompt({ language: ctx.language, noteText: ctx.noteText, candidates, maxContextChars: this.cfg.maxContextChars });
		const n = Math.min(candidates.length, 10);
		const res = await this.chain.run(prompt, (raw) => parseConnectBatch(raw, n));
		this.lastAttempts = res.attempts;
		return res.value && res.source ? { texts: res.value, source: res.source } : null;
	}

	/** Digest: satu kalimat tanya untuk ide yang disarankan (hanya judul + fakta aturan, tanpa isi catatan). */
	async digestQuestion(language: ServiceCtx["language"], title: string, reason: string): Promise<{ text: string; source: SourceLabel } | null> {
		if (!this.chain || this.chain.size === 0) return null;
		const res = await this.chain.run(buildDigestPrompt({ language, title, reason }), parseDigestQuestion);
		this.lastAttempts = res.attempts;
		return res.value && res.source ? { text: res.value, source: res.source } : null;
	}

	/** Feynman: pertanyaan lanjutan untuk satu celah (tidak boleh mendefinisikan istilah). */
	async followUp(language: ServiceCtx["language"], term: string, kind: WeakKind, snippet: string): Promise<{ text: string; source: SourceLabel } | null> {
		if (!this.chain || this.chain.size === 0) return null;
		const res = await this.chain.run(buildFollowUpPrompt({ language, term, kind, snippet }), parseFollowUp(term));
		this.lastAttempts = res.attempts;
		return res.value && res.source ? { text: res.value, source: res.source } : null;
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
