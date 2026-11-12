import { DEVIL_CATEGORIES } from "../questions/provider";
import type { Gate, GateInput, GateOutcome } from "./gate";

export const devilGate: Gate = {
	id: "devil",
	appliesTo: (idea, from, to, s) =>
		s.gates.devil && from === "tumbuh" && to === "matang" && (idea.tipe === "ide" || s.devilForKonsep),
	isPassed: (idea) => idea.gerbang.includes("devil"),
	/** Lolos jika minimal `devilMinAnswered` dari 5 pertanyaan terjawab (tidak kosong). */
	evaluate({ answers = [], settings }: GateInput): GateOutcome {
		const total = DEVIL_CATEGORIES.length;
		const needed = Math.min(total, Math.max(1, settings.devilMinAnswered));
		const done = answers.slice(0, total).filter((a) => a.trim().length > 0).length;
		const passed = done >= needed;
		return { passed, done, needed, reason: passed ? undefined : "too-few-answers" };
	},
};
