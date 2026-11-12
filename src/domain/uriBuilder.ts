import { buildCaptureBody, captureFileBase, cut, LIMITS, normalizeBlock, normalizeLine, sanitizeUrl, TRUNC_MARK } from "./markdown";
import type { CaptureData, Lang } from "./markdown";
import type { Settings } from "./settings";

export const FORMAT_VERSION = "1";
/** Folder catatan di mode cadangan (sama dengan folder Ide bawaan plugin Seedbed). */
export const FALLBACK_FOLDER = "Ide";
/** Tinjau pertama di mode cadangan = hari ini + 7 (sama dengan interval benih bawaan plugin). */
export const FALLBACK_REVIEW_DAYS = 7;

/**
 * Batas panjang link (karakter, setelah encode). TERUKUR di Windows 11 (Chrome -> Obsidian, 2026-11-12):
 * 31.800 karakter sampai; 32.000 gagal diam-diam (tidak ada catatan). Batas keras ada di sekitar 32 ribu
 * (batas command line Windows). Dipakai 24.000: sisa >7.000 untuk path Obsidian yang lebih panjang di PC lain.
 * Rincian uji: docs/capture/C6-Catatan-Build.md.
 */
export const MAX_LINK_LENGTH = 24000;

export interface CaptureInput {
	text: string;
	url?: string;
	title?: string;
	q?: string;
	a?: string;
}

export interface Built {
	uri: string;
	/** Panjang link (karakter). */
	length: number;
	/** True bila kutipan dipotong (batas pengaturan ATAU batas panjang link). */
	truncated: boolean;
	/** Data yang benar-benar dikirim (setelah normalisasi/pemotongan). */
	data: CaptureData;
}

export type BuildError = "no-text" | "no-vault" | "too-long";

const enc = encodeURIComponent;

function addDays(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
	const dt = new Date(Date.UTC(y, m - 1, d + days));
	return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Normalisasi masukan menjadi CaptureData; teks dipotong ke `maxQuote` dengan tanda. */
export function prepare(input: CaptureInput, maxQuote: number, lang: Lang): CaptureData | null {
	const raw = normalizeBlock(input.text ?? "");
	if (raw.length === 0) return null;
	const t = cut(raw, maxQuote);
	return {
		text: t.truncated ? `${t.value}${TRUNC_MARK}` : t.value,
		truncated: t.truncated,
		url: sanitizeUrl(input.url),
		title: cut(normalizeLine(input.title ?? ""), LIMITS.title).value,
		q: cut(normalizeLine(input.q ?? ""), LIMITS.q).value,
		a: cut(normalizeBlock(input.a ?? ""), LIMITS.a).value,
		lang,
	};
}

function seedbedUri(vault: string, d: CaptureData): string {
	const parts = [`vault=${enc(vault)}`, `v=${FORMAT_VERSION}`, `text=${enc(d.text)}`];
	if (d.url) parts.push(`url=${enc(d.url)}`);
	if (d.title) parts.push(`title=${enc(d.title)}`);
	if (d.q) parts.push(`q=${enc(d.q)}`);
	if (d.a) parts.push(`a=${enc(d.a)}`);
	parts.push(`lang=${d.lang}`);
	return `obsidian://seedbed-capture?${parts.join("&")}`;
}

/** Frontmatter mode cadangan (properti Seedbed 0.7+: nama polos type/status/created/review/gates/source/origin, nilai English; nama kustom di pengaturan plugin tidak diketahui ekstensi): nilai teks lewat JSON.stringify (YAML valid, tanpa baris baru). */
function fallbackContent(d: CaptureData, today: string): string {
	const fm = [
		"---",
		"type: idea",
		"status: seed",
		`created: ${today}`,
		`review: ${addDays(today, FALLBACK_REVIEW_DAYS)}`,
		"gates: []",
		...(d.url ? [`source: ${JSON.stringify(d.url)}`] : []),
		"origin: capture",
		"---",
		"",
	];
	return `${fm.join("\n")}${buildCaptureBody(d)}`;
}

/**
 * obsidian://new MENIMPA catatan yang namanya sama (terbukti saat uji manual 2026-11-12), jadi nama file
 * mode cadangan selalu diberi cap waktu lokal HHmmss agar dua tangkapan berjudul sama tidak saling menimpa.
 */
function fallbackUri(vault: string, d: CaptureData, today: string, stamp: string): string {
	const base = captureFileBase(d, today);
	const file = `${FALLBACK_FOLDER}/${stamp ? `${base} ${stamp}` : base}`;
	return `obsidian://new?vault=${enc(vault)}&file=${enc(file)}&content=${enc(fallbackContent(d, today))}`;
}

function compose(s: Settings, d: CaptureData, today: string, stamp: string): string {
	return s.mode === "fallback" ? fallbackUri(s.vault, d, today, stamp) : seedbedUri(s.vault, d);
}

/**
 * Bangun link. Urutan pemotongan bila melebihi `maxLink`: kutipan (berulang), jawaban, judul, lalu URL dibuang.
 * Gagal hanya jika masih terlalu panjang setelah semuanya (praktis tidak terjadi).
 */
export function buildUri(
	input: CaptureInput,
	s: Settings,
	today: string,
	maxLink: number = MAX_LINK_LENGTH,
	stamp: string = "",
): { ok: true; built: Built } | { ok: false; error: BuildError } {
	if (!s.vault.trim()) return { ok: false, error: "no-vault" };
	let limit = s.maxQuote;
	let d = prepare(input, limit, s.language);
	if (!d) return { ok: false, error: "no-text" };
	let uri = compose(s, d, today, stamp);
	let guard = 0;
	// 1) kutipan: susutkan bertahap sampai muat
	while (uri.length > maxLink && limit > 20 && guard++ < 60) {
		limit = Math.max(20, Math.floor(limit * 0.85));
		d = prepare({ ...input, text: input.text }, limit, s.language) as CaptureData;
		uri = compose(s, d, today, stamp);
	}
	// 2) jawaban, judul, URL
	if (uri.length > maxLink && d.a) {
		d = { ...d, a: cut(d.a, 200).value };
		uri = compose(s, d, today, stamp);
	}
	if (uri.length > maxLink && d.title) {
		d = { ...d, title: cut(d.title, 60).value };
		uri = compose(s, d, today, stamp);
	}
	if (uri.length > maxLink && d.url) {
		d = { ...d, url: undefined };
		uri = compose(s, d, today, stamp);
	}
	if (uri.length > maxLink) return { ok: false, error: "too-long" };
	const truncated = d.truncated || cutText(input.text, d.text);
	return { ok: true, built: { uri, length: uri.length, truncated, data: d } };
}

function cutText(original: string, used: string): boolean {
	return used.endsWith(TRUNC_MARK) || normalizeBlock(original).length > used.length;
}
