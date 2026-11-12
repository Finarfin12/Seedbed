import type { Gap } from "../feynman/analyzer";
import type { GateId, Idea, Settings, Status } from "../types";

export interface GateInput {
	settings: Settings;
	/** Socratic: satu jawaban per kategori. Devil: satu per pertanyaan (boleh kosong). */
	answers?: string[];
	/** Feynman: hasil analisis. */
	gaps?: Gap[];
}

export interface GateOutcome {
	passed: boolean;
	done: number;
	needed: number;
	reason?: string;
}

export interface Gate {
	id: GateId;
	/** Apakah gerbang ini relevan (dan aktif) untuk transisi from -> to. */
	appliesTo(idea: Idea, from: Status, to: Status, settings: Settings): boolean;
	/** Sudah pernah dilewati? (frontmatter seedbed-gates) */
	isPassed(idea: Idea): boolean;
	evaluate(input: GateInput): GateOutcome;
}
