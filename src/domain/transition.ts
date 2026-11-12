import type { IdeaPatch } from "./frontmatter";
import { nextReview } from "./scheduler";
import type { GateId, Idea, Settings, Status } from "./types";

/**
 * Hitung patch frontmatter untuk berpindah ke status `to`.
 * `passedGate` dicatat ke seedbed-gates (tanpa duplikat).
 * Tanggal tinjau dihitung ulang; `dibuang` menghapus tanggal tinjau.
 */
export function applyPatchFor(
	idea: Idea,
	to: Status,
	today: string,
	settings: Settings,
	passedGate?: GateId,
): IdeaPatch {
	const gerbang = [...idea.gerbang];
	if (passedGate && !gerbang.includes(passedGate)) gerbang.push(passedGate);
	return { status: to, tinjau: nextReview(to, today, settings), gerbang };
}
