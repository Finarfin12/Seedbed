import { ProviderChain } from "../../domain/ai/chain";
import type { Attempt } from "../../domain/ai/chain";
import { QuestionService } from "../../domain/ai/questionService";
import type { AiProvider, AiSettings } from "../../domain/ai/types";
import type { StaticQuestionProvider } from "../../domain/questions/staticProvider";
import type { Settings } from "../../domain/types";
import { CLI_SPECS } from "./cliSpecs";
import type { HttpClient } from "./http";
import { ApiProvider, CliProvider, LocalHttpProvider } from "./providers";
import type { CliDeps } from "./providers";

export interface FactoryDeps extends CliDeps {
	http: HttpClient | null;
	/** false di mobile (tanpa Node) atau bila modul proses tidak tersedia. */
	canSpawn: boolean;
	staticProvider: StaticQuestionProvider;
}

/**
 * Susun penyedia AI sesuai pengaturan. AI mati / belum disetujui => daftar kosong
 * dan TIDAK ADA satu pun dependensi (HTTP, proses) yang disentuh (NF-1).
 */
export function buildProviders(ai: AiSettings, d: FactoryDeps): AiProvider[] {
	if (!ai.enabled) return [];
	const out: AiProvider[] = [];
	for (const id of ai.order) {
		if (id === "cli") {
			const c = ai.providers.cli;
			if (c.enabled && c.approved && d.canSpawn && CLI_SPECS[c.tool].supported) out.push(new CliProvider(c.tool, c.model, d));
		} else if (id === "local") {
			const l = ai.providers.local;
			if (l.enabled && l.approved && d.http) out.push(new LocalHttpProvider(l, d.http));
		} else if (id === "api") {
			const a = ai.providers.api;
			if (a.enabled && a.approved && a.baseUrl && a.model && d.http) out.push(new ApiProvider(a, d.http));
		}
	}
	return out;
}

export function createQuestionService(settings: Settings, d: FactoryDeps, onAttempt?: (a: Attempt) => void): QuestionService {
	const providers = buildProviders(settings.ai, d);
	const chain =
		providers.length > 0 ? new ProviderChain(providers, settings.ai.timeoutSec * 1000, [settings.ai.providers.api.apiKey], onAttempt) : null;
	return new QuestionService(d.staticProvider, chain, { maxContextChars: settings.ai.maxContextChars });
}
