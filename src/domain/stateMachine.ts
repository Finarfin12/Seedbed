import { defaultRegistry } from "./gates/registry";
import type { GateRegistry } from "./gates/registry";
import type { GateId, Idea, Settings, Status } from "./types";

export interface TransitionResult {
	ok: boolean;
	/** Gerbang yang harus dilewati dulu. */
	requiredGate?: GateId;
	/** Kode alasan jika tidak sah (diterjemahkan oleh UI). */
	reason?: "same-status" | "skip-not-allowed" | "restore-first";
}

export function nextStatus(status: Status): Status | null {
	if (status === "benih") return "tumbuh";
	if (status === "tumbuh") return "matang";
	return null;
}

/**
 * Tabel transisi:
 *  benih -> tumbuh    (gerbang Socratic untuk ide / Feynman untuk konsep)
 *  tumbuh -> matang   (gerbang Devil's Advocate)
 *  matang -> tumbuh   (selalu boleh)
 *  apa pun -> dibuang (selalu boleh)
 *  dibuang -> benih   (selalu boleh)
 */
export function canTransition(
	idea: Idea,
	to: Status,
	settings: Settings,
	registry: GateRegistry = defaultRegistry,
): TransitionResult {
	const from = idea.status;
	if (from === to) return { ok: false, reason: "same-status" };
	if (to === "dibuang") return { ok: true };
	if (from === "dibuang") return to === "benih" ? { ok: true } : { ok: false, reason: "restore-first" };
	if (from === "matang" && to === "tumbuh") return { ok: true };
	if ((from === "benih" && to === "tumbuh") || (from === "tumbuh" && to === "matang")) {
		const gate = registry.findRequired(idea, from, to, settings);
		return gate ? { ok: false, requiredGate: gate.id } : { ok: true };
	}
	return { ok: false, reason: "skip-not-allowed" };
}
