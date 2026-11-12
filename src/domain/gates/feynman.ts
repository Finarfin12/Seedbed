import type { Gate, GateInput, GateOutcome } from "./gate";

export const feynmanGate: Gate = {
	id: "feynman",
	appliesTo: (idea, from, to, s) => s.gates.feynman && idea.tipe === "konsep" && from === "benih" && to === "tumbuh",
	isPassed: (idea) => idea.gerbang.includes("feynman"),
	/** Hanya celah ISTILAH yang belum diabaikan yang dihitung (kalimat panjang = saran saja). */
	evaluate({ gaps = [], settings }: GateInput): GateOutcome {
		const open = gaps.filter((g) => g.kind === "term" && !g.ignored).length;
		const passed = open <= settings.feynman.maxGaps;
		return { passed, done: open, needed: settings.feynman.maxGaps, reason: passed ? undefined : "open-gaps" };
	},
};
