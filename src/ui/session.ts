import type { Question } from "../domain/questions/provider";
import type { SourceLabel } from "../domain/ai/types";

/** Satu pertanyaan + jawaban + jejaknya dalam satu sesi (dipakai untuk menulis callout). */
export interface SessionEntry {
	question: Question;
	answer: string;
	/** R-5: pengguna menandai pertanyaan keliru. */
	flagged: boolean;
	/** R-3: jumlah petunjuk yang dipakai. */
	hints: number;
}

export interface HintResult {
	text: string;
	source: SourceLabel;
}

/** level mulai dari 1. Mengembalikan null bila tidak ada petunjuk (AI mati/gagal). */
export type HintFn = (question: Question, level: number, currentAnswer: string) => Promise<HintResult | null>;
