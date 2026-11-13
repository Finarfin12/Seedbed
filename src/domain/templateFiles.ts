import { storedStatus, storedTipe } from "./frontmatter";
import type { IdeaPatch, PropNames } from "./frontmatter";
import { parseIdeaNote } from "./frontmatter";
import { nextReview } from "./scheduler";
import { BODY } from "./templates";
import type { Language, Settings, Tipe } from "./types";

/** Nama berkas templat yang dibuat plugin. */
export const TEMPLATE_FILES: Record<Tipe, string> = { ide: "Seedbed Idea.md", konsep: "Seedbed Concept.md" };
export const DEFAULT_TEMPLATE_FOLDER = "Templates";

/**
 * Isi templat Obsidian (plugin inti Templates / Templater). `created` memakai variabel templat `{{date:YYYY-MM-DD}}`;
 * `review` sengaja kosong: plugin mengisinya otomatis (sesuai interval status) saat catatan dibuat dari templat.
 * Nama properti mengikuti pemetaan di pengaturan; bahasa isi mengikuti bahasa plugin.
 */
export function templateContent(tipe: Tipe, names: PropNames, language: Language): string {
	const fm = [
		"---",
		`${names.type}: ${storedTipe(tipe)}`,
		`${names.status}: ${storedStatus("benih")}`,
		`${names.created}: {{date:YYYY-MM-DD}}`,
		`${names.review}:`,
		`${names.gates}: []`,
		"---",
		"",
	].join("\n");
	const body = tipe === "konsep" ? BODY[language].feynman : BODY[language].ide;
	return `${fm}\n${body}`;
}

/** Normalisasi path folder dari pengaturan/berkas konfigurasi (tidak tepercaya): tanpa `..`, tanpa garis miring di ujung. */
export function cleanFolder(raw: unknown): string {
	if (typeof raw !== "string") return "";
	const parts = raw
		.replace(/\\/g, "/")
		.split("/")
		.map((p) => p.trim())
		.filter((p) => p.length > 0 && p !== ".");
	if (parts.some((p) => p === ".." || /[<>:"|?*]/.test(p) || Array.from(p).some(ch => ch.charCodeAt(0) <= 31))) return "";
	return parts.join("/");
}

/** Folder templat: pengaturan plugin > folder plugin inti Templates (templates.json) > `Templates`. */
export function resolveTemplateFolder(configured: unknown, coreFolder: unknown): string {
	return cleanFolder(configured) || cleanFolder(coreFolder) || DEFAULT_TEMPLATE_FOLDER;
}

/** Ambil `folder` dari isi `.obsidian/templates.json` (plugin inti Templates). Tidak pernah melempar. */
export function coreTemplatesFolder(json: string | null | undefined): string {
	if (!json) return "";
	try {
		const o = JSON.parse(json) as unknown;
		return o && typeof o === "object" ? cleanFolder((o as Record<string, unknown>).folder) : "";
	} catch {
		return "";
	}
}

export interface TemplatePlan {
	create: Array<{ tipe: Tipe; path: string }>;
	/** Sudah ada: tidak pernah ditimpa. */
	skip: string[];
}

/** Rencana pembuatan: berkas yang sudah ada (tanpa beda huruf besar/kecil) dilewati. */
export function planTemplateFiles(folder: string, existing: Iterable<string>): TemplatePlan {
	const have = new Set<string>();
	for (const e of existing) have.add(e.toLowerCase());
	const plan: TemplatePlan = { create: [], skip: [] };
	for (const tipe of ["ide", "konsep"] as const) {
		const path = folder ? `${folder}/${TEMPLATE_FILES[tipe]}` : TEMPLATE_FILES[tipe];
		if (have.has(path.toLowerCase())) plan.skip.push(path);
		else plan.create.push({ tipe, path });
	}
	return plan;
}

/**
 * Path berada di dalam folder templat? Berkas templat (mis. dengan `created: {{date}}`) bukan catatan: tidak masuk
 * Inkubator dan tidak diisi otomatis. Tanpa beda huruf besar/kecil. Folder kosong = tidak ada yang dikecualikan.
 */
export function isInTemplateFolder(path: string, folder: string): boolean {
	const f = cleanFolder(folder).toLowerCase();
	return f.length > 0 && path.toLowerCase().startsWith(`${f}/`);
}

/** Nilai properti "kosong": kunci ada tetapi null/undefined/teks kosong (mis. `review:` dari templat). */
export function isEmptyValue(v: unknown): boolean {
	return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Isi otomatis catatan Seedbed (type idea/concept, status sah) yang `created` atau `review`-nya KOSONG, misalnya baru
 * dibuat dari templat. Hanya properti kosong milik Seedbed (nama dari pemetaan) yang diisi; yang sudah terisi tidak
 * disentuh; catatan lain, format lama, dan properti yang tidak ada sama sekali dibiarkan. Setelah ditulis, hasilnya tidak
 * kosong lagi, sehingga pemanggilan berikutnya mengembalikan null (tidak ada loop tulis).
 */
export function planAutofill(
	fm: Record<string, unknown> | null | undefined,
	names: PropNames,
	today: string,
	settings: Settings,
): IdeaPatch | null {
	if (!fm) return null;
	const r = parseIdeaNote("", "", fm, names);
	if (r.kind !== "idea") return null;
	const patch: IdeaPatch = {};
	if (names.created in fm && isEmptyValue(fm[names.created])) patch.dibuat = today;
	if (names.review in fm && isEmptyValue(fm[names.review])) {
		const t = nextReview(r.idea.status, today, settings);
		if (t) patch.tinjau = t;
	}
	return Object.keys(patch).length > 0 ? patch : null;
}
