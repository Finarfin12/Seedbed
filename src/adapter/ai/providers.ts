import type { AiProvider, AiSettings, Prompt, SourceLabel } from "../../domain/ai/types";
import { redact } from "../../domain/ai/chain";
import { assertGuards, CLI_SPECS, isSafeModelName } from "./cliSpecs";
import { isLocalUrl, joinUrl } from "./http";
import type { HttpClient } from "./http";
import type { ProcessRunner } from "./runner";

// ---------------- CLI langganan ----------------

export interface CliDeps {
	runner: ProcessRunner;
	findExe: (name: string) => Promise<string | null>;
	makeSandbox: () => Promise<{ dir: string; cleanup: () => Promise<void> }>;
}

export class CliProvider implements AiProvider {
	readonly id = "cli" as const;
	readonly label: SourceLabel;

	constructor(
		private tool: AiSettings["providers"]["cli"]["tool"],
		private model: string,
		private deps: CliDeps,
	) {
		this.label = { kind: "ai-cloud", name: `${tool} cli` };
	}

	async complete(prompt: Prompt, opts: { signal: AbortSignal }): Promise<string> {
		const spec = CLI_SPECS[this.tool];
		if (!spec.supported) throw new Error(spec.reason ?? "CLI not supported");
		if (!isSafeModelName(this.model)) throw new Error("invalid model name");
		const exe = await this.deps.findExe(spec.exe);
		if (!exe) throw new Error(`${spec.exe} not found in PATH`);
		const args = spec.buildArgs({ system: prompt.system, model: this.model });
		assertGuards(spec, args);
		const sandbox = await this.deps.makeSandbox();
		try {
			// Isi catatan HANYA lewat stdin; cwd = folder sementara kosong; tanpa shell (runner).
			const res = await this.deps.runner.run(exe, args, { stdin: prompt.user, cwd: sandbox.dir, signal: opts.signal });
			if (res.code !== 0) {
				throw new Error(`${spec.exe} exit ${res.code}: ${(res.stderr || res.stdout).trim().slice(0, 240)}`);
			}
			return spec.parseOutput(res.stdout);
		} finally {
			await sandbox.cleanup();
		}
	}
}

// ---------------- Model lokal (Ollama / LM Studio) ----------------

export const LOCAL_DEFAULT_URL = { ollama: "http://localhost:11434", lmstudio: "http://localhost:1234" } as const;

function parseChatContent(text: string, kind: "ollama" | "openai"): string {
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		throw new Error("response is not JSON");
	}
	const o = obj && typeof obj === "object" ? obj as Record<string, unknown> : {};
	const choices = Array.isArray(o.choices) ? o.choices as unknown[] : [];
	const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
	const message = kind === "ollama" ? o.message : choice.message;
	const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;
	if (typeof content !== "string") throw new Error("no message content in response");
	return content;
}

export class LocalHttpProvider implements AiProvider {
	readonly id = "local" as const;
	readonly label: SourceLabel;

	constructor(
		private cfg: AiSettings["providers"]["local"],
		private http: HttpClient,
		/** Batas probe jangkauan server (ms). Server lokal yang mati harus gagal cepat, bukan menunggu timeout penuh. */
		private probeMs = 2500,
	) {
		this.label = { kind: "ai-local", name: cfg.kind };
	}

	/** GET ringan ke daftar model: memastikan server lokal hidup sebelum mengirim isi catatan. */
	private async probe(base: string): Promise<void> {
		const kind = this.cfg.kind;
		const url = joinUrl(base, kind === "ollama" ? "/api/tags" : "/v1/models");
		let timer: number | undefined;
		const timeout = new Promise<null>((resolve) => {
			timer = window.setTimeout(() => resolve(null), this.probeMs);
		});
		let response: Awaited<ReturnType<HttpClient["get"]>> | null;
		try {
			response = await Promise.race([this.http.get(url), timeout]);
		} catch (e) {
			void e;
			// Original transport errors may contain credentials; intentionally emit a sanitized error without the original cause.
			// eslint-disable-next-line preserve-caught-error -- Original transport errors may contain credentials; intentionally emit a sanitized error without the original cause.
			throw new Error(`${kind} not reachable`);
		} finally {
			if (timer !== undefined) window.clearTimeout(timer);
		}
		if (response === null) throw new Error(`${kind} not reachable (no answer in ${this.probeMs}ms)`);
		if (response.status < 200 || response.status >= 300) throw new Error(`${kind} HTTP ${response.status}`);
	}

	async complete(prompt: Prompt): Promise<string> {
		const base = this.cfg.baseUrl || LOCAL_DEFAULT_URL[this.cfg.kind];
		if (this.cfg.kind === "ollama" && !this.cfg.model) throw new Error("ollama: model not set");
		await this.probe(base);
		const messages = [
			{ role: "system", content: prompt.system },
			{ role: "user", content: prompt.user },
		];
		if (this.cfg.kind === "ollama") {
			if (!this.cfg.model) throw new Error("ollama: model not set");
			const r = await this.http.post(
				joinUrl(base, "/api/chat"),
				JSON.stringify({ model: this.cfg.model, messages, stream: false, format: "json" }),
			);
			if (r.status < 200 || r.status >= 300) throw new Error(`ollama HTTP ${r.status}`);
			return parseChatContent(r.text, "ollama");
		}
		const r = await this.http.post(
			joinUrl(base, "/v1/chat/completions"),
			JSON.stringify({ model: this.cfg.model || "local-model", messages, stream: false, temperature: 0.7 }),
		);
		if (r.status < 200 || r.status >= 300) throw new Error(`lmstudio HTTP ${r.status}`);
		return parseChatContent(r.text, "openai");
	}
}

// ---------------- API (format kompatibel OpenAI) ----------------

export class ApiProvider implements AiProvider {
	readonly id = "api" as const;
	readonly label: SourceLabel;

	constructor(
		private cfg: AiSettings["providers"]["api"],
		private http: HttpClient,
	) {
		let host = "api";
		try {
			host = new URL(cfg.baseUrl).hostname;
		} catch {
			/* base URL tidak valid: complete() akan gagal */
		}
		this.label = isLocalUrl(cfg.baseUrl) ? { kind: "ai-local", name: host } : { kind: "ai-cloud", name: host };
	}

	async complete(prompt: Prompt): Promise<string> {
		if (!this.cfg.baseUrl) throw new Error("api: base URL not set");
		if (!this.cfg.model) throw new Error("api: model not set");
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;
		try {
			const r = await this.http.post(
				joinUrl(this.cfg.baseUrl, "/chat/completions"),
				JSON.stringify({
					model: this.cfg.model,
					messages: [
						{ role: "system", content: prompt.system },
						{ role: "user", content: prompt.user },
					],
					stream: false,
					temperature: 0.7,
				}),
				{ headers },
			);
			if (r.status < 200 || r.status >= 300) throw new Error(`api HTTP ${r.status}`);
			return parseChatContent(r.text, "openai");
		} catch (e) {
			// Key tidak boleh muncul di pesan error/log.
			// eslint-disable-next-line preserve-caught-error -- Original transport errors may contain credentials; intentionally emit a sanitized error without the original cause.
			throw new Error(redact(e instanceof Error ? e.message : typeof e === "string" ? e : "api request failed", [this.cfg.apiKey]));
		}
	}
}
