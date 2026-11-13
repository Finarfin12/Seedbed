import type { Settings } from "../types";

export interface Gap {
	kind: "term" | "sentence";
	/** Istilah sebagaimana tertulis di teks (kemunculan pertama). Kosong untuk kalimat. */
	term: string;
	/** Kunci abaikan: istilah huruf kecil. Kosong untuk kalimat. */
	key: string;
	/** Posisi karakter di teks asli. */
	offset: number;
	length: number;
	/** Nomor baris (mulai 0). */
	line: number;
	/** Jumlah kemunculan istilah. */
	count: number;
	/** Jumlah kata (kalimat). */
	words: number;
	snippet: string;
	ignored: boolean;
	/** FY-1: definisi ada tetapi lemah. "circular" = dijelaskan dengan dirinya sendiri; "empty" = hanya kata pengisi. */
	weak?: "circular" | "empty";
}

/** Jenis callout milik plugin yang tidak dianalisis (jawaban sesi & petunjuk). */
const SKIP_CALLOUTS = ["socratic", "devil", "feynman-hint", "premortem", "retrieval", "connect", "evidence", "trigger", "pemicu", "quote"];

const DEFINITION_VERBS = "adalah|yaitu|ialah|artinya|berarti|merupakan|is|means|refers\\s+to";

function blank(s: string): string {
	return s.replace(/[^\r\n]/g, " ");
}

/**
 * Ganti bagian yang tidak boleh dianalisis dengan spasi (panjang sama, jadi posisi tetap):
 * frontmatter, blok kode, callout plugin, kode inline, komentar HTML, tujuan tautan.
 */
export function maskText(text: string): string {
	const lines = text.split("\n");
	let inFence = false;
	let inFrontmatter = false;
	let inCallout = false;
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i] as string;
		const bare = line.replace(/\r$/, "");
		if (i === 0 && bare === "---") {
			inFrontmatter = true;
			out.push(blank(line));
			continue;
		}
		if (inFrontmatter) {
			if (bare === "---" || bare === "...") inFrontmatter = false;
			out.push(blank(line));
			continue;
		}
		if (/^\s*(```|~~~)/.test(bare)) {
			inFence = !inFence;
			out.push(blank(line));
			continue;
		}
		if (inFence) {
			out.push(blank(line));
			continue;
		}
		const callout = /^>\s*\[!([\w-]+)\]/.exec(bare);
		if (callout) {
			inCallout = SKIP_CALLOUTS.includes((callout[1] as string).toLowerCase());
		} else if (!bare.startsWith(">")) {
			inCallout = false;
		}
		if (inCallout) {
			out.push(blank(line));
			continue;
		}
		line = line.replace(/`[^`\n]*`/g, (m) => blank(m));
		line = line.replace(/\]\([^)\n]*\)/g, (m) => blank(m));
		line = line.replace(/https?:\/\/\S+/g, (m) => blank(m));
		out.push(line);
	}
	// Komentar HTML bisa lintas baris.
	return out.join("\n").replace(/<!--[\s\S]*?-->/g, (m) => blank(m));
}

/** Kata pengisi (EN/ID) yang tidak menjelaskan apa pun. */
const FILLER = new Set(
	"a an the of to in on for with and or but that which who thing things stuff something important very really quite so just also can may will is are was be been being kind sort lot lots many much some any one hal penting sesuatu yang sangat sekali dan atau tetapi untuk dengan dari ke di pada itu ini suatu banyak beberapa dalam bisa dapat akan adalah yaitu ialah merupakan juga saja hanya cukup".split(" "),
);

/** FY-1: periksa klausa setelah "X is/adalah ...". Hanya pola dan kata pengisi; tidak menilai benar/salah. */
export function weakDefinition(term: string, clause: string): "circular" | "empty" | undefined {
	const head = clause.split(/[.!?\n]/)[0] ?? "";
	const words = [...head.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map((m) => m[0]);
	if (words.length === 0) return "empty";
	const termWords = term.toLowerCase().split(/\s+/).filter(Boolean);
	const stem = (w: string) => w.replace(/(ing|ed|es|s|nya|kan|an)$/u, "");
	const termStems = new Set(termWords.map(stem));
	const content = words.filter((w) => !FILLER.has(w));
	// Melingkar hanya jika SELURUH istilah (semua katanya) muncul lagi di definisinya.
	const contentStems = new Set(content.map(stem));
	if ([...termStems].every((w) => w.length >= 3 && contentStems.has(w))) return "circular";
	if (content.length === 0) return "empty";
	return undefined;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termCore(term: string): string {
	return escapeRegex(term.trim()).replace(/\s+/g, "\\s+");
}

function lineOf(text: string, offset: number): number {
	let n = 0;
	for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
	return n;
}

function snippetAround(text: string, offset: number, max = 80): string {
	const start = text.lastIndexOf("\n", offset - 1) + 1;
	let end = text.indexOf("\n", offset);
	if (end === -1) end = text.length;
	const line = text.slice(start, end).trim();
	return line.length > max ? `${line.slice(0, max)}…` : line;
}

function countWords(s: string): number {
	return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

/** Pecah teks (yang sudah di-mask) menjadi kalimat; kembalikan [mulai, akhir). */
function sentences(masked: string): Array<[number, number]> {
	const result: Array<[number, number]> = [];
	let pos = 0;
	for (const line of masked.split("\n")) {
		let start = -1;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i] as string;
			if (start === -1 && !/\s/.test(ch)) start = i;
			if (start !== -1 && (ch === "." || ch === "!" || ch === "?")) {
				const next = line[i + 1];
				if (next === undefined || /\s/.test(next)) {
					result.push([pos + start, pos + i + 1]);
					start = -1;
				}
			}
		}
		if (start !== -1) result.push([pos + start, pos + line.length]);
		pos += line.length + 1;
	}
	return result;
}

/**
 * Analisis penjelasan Feynman.
 *  - Istilah (judul/alias vault + jargon pengguna) yang muncul tetapi tidak punya pola definisi => celah "term".
 *  - Kalimat lebih panjang dari ambang kata => celah "sentence" (saran).
 * `ignored` = istilah (huruf kecil) yang diabaikan untuk catatan ini.
 */
export function analyze(
	text: string,
	terms: string[],
	settings: Settings,
	ignored: string[] = [],
): Gap[] {
	const masked = maskText(text);
	const ignoredSet = new Set(ignored.map((x) => x.toLowerCase()));
	const seen = new Set<string>();
	const all: string[] = [];
	for (const t of [...terms, ...settings.feynman.jargon]) {
		const trimmed = t.trim();
		const key = trimmed.toLowerCase();
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		all.push(trimmed);
	}

	const gaps: Gap[] = [];
	for (const term of all) {
		const core = termCore(term);
		const find = new RegExp(`(?<![\\p{L}\\p{N}_])${core}(?![\\p{L}\\p{N}_])`, "giu");
		const matches = [...masked.matchAll(find)];
		if (matches.length === 0) continue;
		const defined = new RegExp(
			`(?<![\\p{L}\\p{N}_])${core}(?:\\]\\]|\\*\\*|__|\\*|_|["'”])*,?\\s+(?:${DEFINITION_VERBS})(?![\\p{L}\\p{N}_])`,
			"iu",
		);
		const dm = defined.exec(masked);
		let weak: "circular" | "empty" | undefined;
		if (dm) {
			weak = weakDefinition(term, masked.slice(dm.index + dm[0].length, dm.index + dm[0].length + 160));
			if (!weak) continue;
		}
		const first = matches[0] as RegExpMatchArray;
		const offset = first.index ?? 0;
		gaps.push({
			kind: "term",
			term: first[0],
			key: term.toLowerCase(),
			offset,
			length: first[0].length,
			line: lineOf(text, offset),
			count: matches.length,
			words: 0,
			snippet: snippetAround(text, offset),
			ignored: ignoredSet.has(term.toLowerCase()),
			...(weak ? { weak } : {}),
		});
	}

	const max = settings.feynman.maxSentenceWords;
	for (const [start, end] of sentences(masked)) {
		const words = countWords(masked.slice(start, end));
		if (words > max) {
			const raw = text.slice(start, end).trim();
			gaps.push({
				kind: "sentence",
				term: "",
				key: "",
				offset: start,
				length: end - start,
				line: lineOf(text, start),
				count: 1,
				words,
				snippet: raw.length > 80 ? `${raw.slice(0, 80)}…` : raw,
				ignored: false,
			});
		}
	}
	return gaps.sort((a, b) => a.offset - b.offset);
}
