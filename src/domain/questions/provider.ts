import type { SourceLabel } from "../ai/types";
import type { Language } from "../types";

/** 6 kategori Socratic (urutan = urutan di modal). */
export const SOCRATIC_CATEGORIES = ["klarifikasi", "asumsi", "bukti", "sudutPandang", "implikasi", "pertanyaan"] as const;
/** 5 kategori Devil's Advocate. */
export const DEVIL_CATEGORIES = ["asumsi", "kebalikan", "bukti", "lawan", "kegagalan"] as const;

export type SocraticCategory = (typeof SOCRATIC_CATEGORIES)[number];
export type DevilCategory = (typeof DEVIL_CATEGORIES)[number];
export type QuestionKind = "socratic" | "devil";

export interface Question {
	kind: QuestionKind;
	category: SocraticCategory | DevilCategory;
	text: string;
	/** Asal pertanyaan (R-6). Bank statis = { kind: "bank" }. */
	source?: SourceLabel;
}

export interface QuestionBank {
	socratic: Record<SocraticCategory, string[]>;
	devil: Record<DevilCategory, string[]>;
}

export interface QuestionContext {
	language: Language;
	/** Dipakai penyedia AI (v5, belum ada); penyedia statis mengabaikannya. */
	noteText?: string;
	previousAnswers?: string[];
}

export interface QuestionProvider {
	getQuestions(kind: QuestionKind, ctx: QuestionContext): Promise<Question[]>;
}
