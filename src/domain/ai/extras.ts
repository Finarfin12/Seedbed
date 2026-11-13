// Prompt dan validator untuk jalur AI 0.8.0 (pre-mortem, connect, digest, tanya lanjut Feynman).
// Semua keluaran wajib PERTANYAAN (pemeriksaan sama dengan validateQuestion). Isi catatan = data.
import { bodyOf } from "../v08";
import type { Language } from "../types";
import { parseBatchQuestions, parseJsonObject, validateQuestion } from "./outputValidator";
import { SYSTEM_RULES, clipContext, neutralize } from "./promptBuilder";
import type { Prompt } from "./types";

const LANG_NAME: Record<Language, string> = { id: "Indonesian", en: "English" };

export const PREMORTEM_HELP: Record<string, string> = {
	pmCause: "cause: ask what most likely killed the idea a year from now",
	pmSignal: "early signal: ask which warning sign would show up in the first month",
	pmAssumption: "fragile assumption: ask which belief, if wrong, breaks the idea",
	pmAffected: "affected party: ask who or what was not taken into account",
	pmPrevent: "prevention: ask what cheap step now would reduce the biggest risk",
};
export const PREMORTEM_IDS = Object.keys(PREMORTEM_HELP);

export function buildPremortemPrompt(args: { language: Language; noteText: string; maxContextChars: number }): Prompt {
	const list = PREMORTEM_IDS.map((c) => `- ${c}: ${PREMORTEM_HELP[c]}`).join("\n");
	const user = [
		`Output language: ${LANG_NAME[args.language]}.`,
		`Task: write exactly ${PREMORTEM_IDS.length} pre-mortem questions about THIS specific idea. Imagine it has already failed a year from now. One question per category, in this order:`,
		list,
		`Return exactly: {"questions": [{"category": "<category>", "question": "..."}, ...]} with ${PREMORTEM_IDS.length} items.`,
		"",
		`<note>\n${clipContext(args.noteText, args.maxContextChars)}\n</note>`,
	].join("\n");
	return { system: SYSTEM_RULES, user };
}

export const SNIPPET_CHARS = 300;
export const MAX_CANDIDATES = 10;

export interface CandidateSnippet {
	title: string;
	/** Isi catatan kandidat (boleh panjang; akan dibuang frontmatter-nya dan dipotong 300 karakter). */
	text: string;
}

/** Hanya judul + 300 karakter pertama isi. Tanpa path, tanpa frontmatter. */
export function candidateSnippet(c: CandidateSnippet): { title: string; snippet: string } {
	const body = bodyOf(c.text).replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS);
	return { title: neutralize(c.title).replace(/\s+/g, " ").trim().slice(0, 120), snippet: neutralize(body) };
}

export function connectIds(n: number): string[] {
	return Array.from({ length: Math.min(n, MAX_CANDIDATES) }, (_, i) => `c${i}`);
}

export function buildConnectPrompt(args: { language: Language; noteText: string; candidates: CandidateSnippet[]; maxContextChars: number }): Prompt {
	const cands = args.candidates.slice(0, MAX_CANDIDATES).map(candidateSnippet);
	const ids = connectIds(cands.length);
	const list = cands.map((c, i) => `[${ids[i]}] ${c.title}: ${c.snippet}`).join("\n");
	const user = [
		`Output language: ${LANG_NAME[args.language]}.`,
		"Task: for EACH candidate idea below, write ONE question asking whether and how the ACTIVE idea supports, contradicts, or relates to THAT candidate. Mention the candidate by its title. Only ask; never say how they relate.",
		`Return exactly: {"questions": [{"category": "<id>", "question": "..."}, ...]} with ${ids.length} items, ids ${ids.join(", ")}.`,
		"",
		`<note>\n${clipContext(args.noteText, Math.floor(args.maxContextChars * 0.6))}\n</note>`,
		`<candidates>\n${list}\n</candidates>`,
	].join("\n");
	return { system: SYSTEM_RULES, user };
}

export function parseConnectBatch(raw: string, n: number): Array<string | null> | null {
	const out = parseBatchQuestions(raw, connectIds(n));
	if (!out) return null;
	return out.filter((x) => x !== null).length >= Math.ceil(n / 2) ? out : null;
}

export function parsePremortemBatch(raw: string): Array<string | null> | null {
	const out = parseBatchQuestions(raw, PREMORTEM_IDS);
	if (!out) return null;
	return out.filter((x) => x !== null).length >= Math.ceil(PREMORTEM_IDS.length / 2) ? out : null;
}

export function buildDigestPrompt(args: { language: Language; title: string; reason: string }): Prompt {
	const user = [
		`Output language: ${LANG_NAME[args.language]}.`,
		"Task: write ONE short question that asks the user what is holding them back from testing this idea.",
		`Return exactly: {"question": "..."}`,
		"",
		`<note>\nIdea title: ${neutralize(args.title).slice(0, 120)}\nFact: ${neutralize(args.reason).slice(0, 200)}\n</note>`,
	].join("\n");
	return { system: SYSTEM_RULES, user };
}

export function parseDigestQuestion(raw: string): string | null {
	const obj = parseJsonObject(raw);
	return obj ? validateQuestion(obj.question) : null;
}

export type WeakKind = "missing" | "circular" | "empty";

export function buildFollowUpPrompt(args: { language: Language; term: string; kind: WeakKind; snippet: string }): Prompt {
	const why =
		args.kind === "circular"
			? "the user explained it using the term itself"
			: args.kind === "empty"
				? "the user's explanation only uses vague filler words"
				: "the user used it without explaining it";
	const user = [
		`Output language: ${LANG_NAME[args.language]}.`,
		`The user is explaining a concept in their own words. The term "${neutralize(args.term).slice(0, 80)}" is not explained well: ${why}.`,
		"Task: write ONE short question that makes the user explain that term in their own words. Do NOT define it, do NOT hint at its meaning, do NOT use it in a definition.",
		`Return exactly: {"question": "..."}`,
		"",
		`<note>\n${neutralize(args.snippet).slice(0, 400)}\n</note>`,
	].join("\n");
	return { system: SYSTEM_RULES, user };
}

/** Pertanyaan lanjutan Feynman: sah hanya bila pertanyaan DAN tidak mendefinisikan istilahnya. */
export function parseFollowUp(term: string): (raw: string) => string | null {
	const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const defines = new RegExp(`${esc}\\s+(is|are|means|refers\\s+to|adalah|yaitu|ialah|merupakan|berarti|artinya)\\b`, "i");
	return (raw) => {
		const obj = parseJsonObject(raw);
		const q = obj ? validateQuestion(obj.question) : null;
		return q && !defines.test(q) ? q : null;
	};
}
