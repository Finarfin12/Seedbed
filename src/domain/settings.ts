import { DEFAULT_AI, PROVIDER_IDS } from "./ai/types";
import type { AiSettings, CliTool, LocalKind, ProviderId, SocraticMode } from "./ai/types";
import type { Language, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
	language: "id",
	folderIde: "Ide",
	folderKonsep: "Konsep",
	intervals: { benih: 7, tumbuh: 14, matang: 30 },
	snoozeDays: 7,
	gates: { socratic: true, devil: true, feynman: true },
	devilForKonsep: false,
	socraticMinChars: 20,
	devilMinAnswered: 4,
	feynman: { jargon: [], maxSentenceWords: 25, maxGaps: 0, ignored: {} },
	notifyOnStartup: true,
	customBankPath: "",
	ai: structuredClone(DEFAULT_AI),
};

function num(v: unknown, fallback: number, min: number, max: number): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
	return Math.min(max, Math.max(min, Math.round(v)));
}

function str(v: unknown, fallback: string): string {
	return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
	return typeof v === "boolean" ? v : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
	return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Sanitasi pengaturan AI dari data.json (tidak tepercaya). AI tetap MATI kecuali eksplisit true. */
export function mergeAi(loaded: unknown, d: AiSettings = DEFAULT_AI): AiSettings {
	if (!isRecord(loaded)) return structuredClone(d);
	const pr = isRecord(loaded.providers) ? loaded.providers : {};
	const cli = isRecord(pr.cli) ? pr.cli : {};
	const local = isRecord(pr.local) ? pr.local : {};
	const api = isRecord(pr.api) ? pr.api : {};
	const order: ProviderId[] = [];
	if (Array.isArray(loaded.order)) {
		for (const x of loaded.order) if ((PROVIDER_IDS as readonly unknown[]).includes(x) && !order.includes(x as ProviderId)) order.push(x as ProviderId);
	}
	for (const id of PROVIDER_IDS) if (!order.includes(id)) order.push(id);
	return {
		enabled: loaded.enabled === true,
		order,
		providers: {
			cli: {
				enabled: cli.enabled === true,
				tool: oneOf<CliTool>(cli.tool, ["claude", "codex", "gemini"], d.providers.cli.tool),
				model: str(cli.model, d.providers.cli.model).trim(),
				approved: cli.approved === true,
			},
			local: {
				enabled: local.enabled === true,
				kind: oneOf<LocalKind>(local.kind, ["ollama", "lmstudio"], d.providers.local.kind),
				model: str(local.model, d.providers.local.model).trim(),
				baseUrl: str(local.baseUrl, d.providers.local.baseUrl).trim(),
				approved: local.approved === true,
			},
			api: {
				enabled: api.enabled === true,
				baseUrl: str(api.baseUrl, d.providers.api.baseUrl).trim(),
				model: str(api.model, d.providers.api.model).trim(),
				apiKey: str(api.apiKey, d.providers.api.apiKey),
				approved: api.approved === true,
			},
		},
		socraticMode: oneOf<SocraticMode>(loaded.socraticMode, ["adaptif", "satu-tarikan"], d.socraticMode),
		timeoutSec: num(loaded.timeoutSec, d.timeoutSec, 3, 300),
		maxContextChars: num(loaded.maxContextChars, d.maxContextChars, 500, 20000),
		hintsPerQuestion: num(loaded.hintsPerQuestion, d.hintsPerQuestion, 0, 5),
	};
}

/** Gabungkan data.json (tidak tepercaya) dengan default; nilai buruk diganti default. */
export function mergeSettings(loaded: unknown, defaults: Settings = DEFAULT_SETTINGS): Settings {
	const d = defaults;
	if (!isRecord(loaded)) return structuredClone(d);
	const iv = isRecord(loaded.intervals) ? loaded.intervals : {};
	const gt = isRecord(loaded.gates) ? loaded.gates : {};
	const fy = isRecord(loaded.feynman) ? loaded.feynman : {};
	const ignoredRaw = isRecord(fy.ignored) ? fy.ignored : {};
	const ignored: Record<string, string[]> = {};
	for (const [path, list] of Object.entries(ignoredRaw)) {
		if (Array.isArray(list)) ignored[path] = list.filter((x): x is string => typeof x === "string");
	}
	const lang: Language = loaded.language === "en" ? "en" : loaded.language === "id" ? "id" : d.language;
	return {
		language: lang,
		folderIde: str(loaded.folderIde, d.folderIde),
		folderKonsep: str(loaded.folderKonsep, d.folderKonsep),
		intervals: {
			benih: num(iv.benih, d.intervals.benih, 1, 3650),
			tumbuh: num(iv.tumbuh, d.intervals.tumbuh, 1, 3650),
			matang: num(iv.matang, d.intervals.matang, 1, 3650),
		},
		snoozeDays: num(loaded.snoozeDays, d.snoozeDays, 1, 3650),
		gates: {
			socratic: bool(gt.socratic, d.gates.socratic),
			devil: bool(gt.devil, d.gates.devil),
			feynman: bool(gt.feynman, d.gates.feynman),
		},
		devilForKonsep: bool(loaded.devilForKonsep, d.devilForKonsep),
		socraticMinChars: num(loaded.socraticMinChars, d.socraticMinChars, 0, 1000),
		devilMinAnswered: num(loaded.devilMinAnswered, d.devilMinAnswered, 1, 5),
		feynman: {
			jargon: Array.isArray(fy.jargon) ? fy.jargon.filter((x): x is string => typeof x === "string") : [...d.feynman.jargon],
			maxSentenceWords: num(fy.maxSentenceWords, d.feynman.maxSentenceWords, 5, 500),
			maxGaps: num(fy.maxGaps, d.feynman.maxGaps, 0, 1000),
			ignored,
		},
		notifyOnStartup: bool(loaded.notifyOnStartup, d.notifyOnStartup),
		customBankPath: str(loaded.customBankPath, d.customBankPath),
		ai: mergeAi(loaded.ai, d.ai),
	};
}
