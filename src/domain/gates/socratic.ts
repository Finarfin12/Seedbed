import { SOCRATIC_CATEGORIES } from "../questions/provider";
import type { Gate, GateInput, GateOutcome } from "./gate";

export const socraticGate: Gate = {
	id: "socratic",
	appliesTo: (idea, from, to, s) => s.gates.socratic && idea.tipe === "ide" && from === "benih" && to === "tumbuh",
	isPassed: (idea) => idea.gerbang.includes("socratic"),
	/** Lolos jika SEMUA kategori dijawab dengan minimal `socraticMinChars` karakter (dan tidak kosong). */
	evaluate({ answers = [], settings }: GateInput): GateOutcome {
		const needed = SOCRATIC_CATEGORIES.length;
		let done = 0;
		for (let i = 0; i < needed; i++) {
			const len = (answers[i] ?? "").trim().length;
			if (len > 0 && len >= settings.socraticMinChars) done++;
		}
		const passed = done === needed;
		return { passed, done, needed, reason: passed ? undefined : "answers-too-short" };
	},
};
