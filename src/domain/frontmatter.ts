import { isValidISODate } from "./dates";
import { GATE_IDS, STATUSES, TIPES } from "./types";
import type { GateId, Idea, ParsedNote, Status, Tipe } from "./types";

/** Semua properti milik plugin berawalan ini (NF-6: hanya ini yang boleh diubah). */
export const PREFIX = "bengkel-";
export const KEY = {
	tipe: `${PREFIX}tipe`,
	status: `${PREFIX}status`,
	dibuat: `${PREFIX}dibuat`,
	tinjau: `${PREFIX}tinjau`,
	gerbang: `${PREFIX}gerbang`,
} as const;

type FM = Record<string, unknown>;

function asDate(v: unknown): string | undefined {
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
	if (typeof v === "string") {
		const s = v.trim().slice(0, 10);
		return isValidISODate(s) ? s : undefined;
	}
	return undefined;
}

function asGates(v: unknown): GateId[] {
	const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
	const out: GateId[] = [];
	for (const g of list) {
		if ((GATE_IDS as readonly unknown[]).includes(g) && !out.includes(g as GateId)) out.push(g as GateId);
	}
	return out;
}

/** Baca frontmatter menjadi Idea. Tidak pernah melempar error (input = data pengguna). */
export function parseIdeaNote(path: string, title: string, fm: FM | null | undefined): ParsedNote {
	if (!fm) return { kind: "none" };
	const hasTipe = KEY.tipe in fm;
	const hasStatus = KEY.status in fm;
	if (!hasTipe && !hasStatus) return { kind: "none" };

	const tipe = typeof fm[KEY.tipe] === "string" ? (fm[KEY.tipe] as string).trim().toLowerCase() : undefined;
	const status = typeof fm[KEY.status] === "string" ? (fm[KEY.status] as string).trim().toLowerCase() : undefined;
	if (!tipe || !(TIPES as readonly string[]).includes(tipe)) {
		return { kind: "invalid", invalid: { path, title, reason: `${KEY.tipe}: ${String(fm[KEY.tipe])}` } };
	}
	if (!status || !(STATUSES as readonly string[]).includes(status)) {
		return { kind: "invalid", invalid: { path, title, reason: `${KEY.status}: ${String(fm[KEY.status])}` } };
	}
	const idea: Idea = {
		path,
		title,
		tipe: tipe as Tipe,
		status: status as Status,
		dibuat: asDate(fm[KEY.dibuat]),
		tinjau: asDate(fm[KEY.tinjau]),
		gerbang: asGates(fm[KEY.gerbang]),
	};
	return { kind: "idea", idea };
}

/** Perubahan yang boleh dilakukan plugin. undefined = biarkan; null = hapus properti. */
export interface IdeaPatch {
	tipe?: Tipe;
	status?: Status;
	dibuat?: string;
	tinjau?: string | null;
	gerbang?: GateId[];
}

/** Terapkan patch ke objek frontmatter (dimutasi). Hanya menyentuh kunci bengkel-*. */
export function applyPatch(fm: FM, patch: IdeaPatch): void {
	if (patch.tipe !== undefined) fm[KEY.tipe] = patch.tipe;
	if (patch.status !== undefined) fm[KEY.status] = patch.status;
	if (patch.dibuat !== undefined) fm[KEY.dibuat] = patch.dibuat;
	if (patch.tinjau === null) delete fm[KEY.tinjau];
	else if (patch.tinjau !== undefined) fm[KEY.tinjau] = patch.tinjau;
	if (patch.gerbang !== undefined) fm[KEY.gerbang] = [...patch.gerbang];
}
