import type { CliTool } from "../../domain/ai/types";
import { CLI_SPECS } from "./cliSpecs";
import type { CliDeps } from "./providers";
import { LOCAL_DEFAULT_URL } from "./providers";
import { joinUrl } from "./http";
import type { HttpClient } from "./http";

export type DetectStatus = "available" | "missing" | "unsupported" | "error";

export interface CliDetection {
	tool: CliTool;
	status: DetectStatus;
	path?: string;
	version?: string;
	detail: string;
}

export interface LocalDetection {
	kind: "ollama" | "lmstudio";
	status: "available" | "missing" | "error";
	models: string[];
	detail: string;
}

export interface Detection {
	cli: CliDetection[];
	local: LocalDetection[];
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
		p.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

/**
 * Deteksi penyedia (Addendum §7.2). HANYA dipanggil setelah pengguna menyalakan AI / menekan "Deteksi ulang".
 * CLI: cari di PATH + `--version` (tidak ada pembacaan file token, NF-9). Lokal: GET model.
 */
export async function detectProviders(deps: CliDeps, http: HttpClient | null, opts: { canSpawn: boolean; timeoutMs?: number; localBase?: Partial<Record<"ollama" | "lmstudio", string>> }): Promise<Detection> {
	const timeoutMs = opts.timeoutMs ?? 4000;
	const cli: CliDetection[] = [];
	for (const tool of ["claude", "codex", "gemini"] as const) {
		const spec = CLI_SPECS[tool];
		if (!opts.canSpawn) {
			cli.push({ tool, status: "unsupported", detail: "CLI hanya di desktop" });
			continue;
		}
		const exe = await deps.findExe(spec.exe);
		if (!exe) {
			cli.push({ tool, status: "missing", detail: `${spec.exe} tidak ada di PATH` });
			continue;
		}
		if (!spec.supported) {
			cli.push({ tool, status: "unsupported", path: exe, detail: spec.reason ?? "tidak didukung" });
			continue;
		}
		const sandbox = await deps.makeSandbox();
		const ac = new AbortController();
		try {
			const res = await withTimeout(deps.runner.run(exe, spec.versionArgs, { stdin: "", cwd: sandbox.dir, signal: ac.signal }), timeoutMs, "version");
			if (res.code === 0) cli.push({ tool, status: "available", path: exe, version: res.stdout.trim().split(/\r?\n/)[0], detail: "siap" });
			else cli.push({ tool, status: "error", path: exe, detail: `exit ${res.code}: ${res.stderr.trim().slice(0, 160)}` });
		} catch (e) {
			ac.abort();
			cli.push({ tool, status: "error", path: exe, detail: e instanceof Error ? e.message : String(e) });
		} finally {
			await sandbox.cleanup();
		}
	}

	const local: LocalDetection[] = [];
	for (const kind of ["ollama", "lmstudio"] as const) {
		if (!http) {
			local.push({ kind, status: "error", models: [], detail: "HTTP tidak tersedia" });
			continue;
		}
		const url = joinUrl(opts.localBase?.[kind] ?? LOCAL_DEFAULT_URL[kind], kind === "ollama" ? "/api/tags" : "/v1/models");
		try {
			const r = await withTimeout(http.get(url), timeoutMs, kind);
			if (r.status < 200 || r.status >= 300) {
				local.push({ kind, status: "error", models: [], detail: `HTTP ${r.status}` });
				continue;
			}
			const obj = JSON.parse(r.text) as any;
			const list: unknown[] = kind === "ollama" ? obj?.models ?? [] : obj?.data ?? [];
			const models = list.map((m: any) => (kind === "ollama" ? m?.name : m?.id)).filter((x: unknown): x is string => typeof x === "string");
			local.push({ kind, status: "available", models, detail: `${models.length} model` });
		} catch (e) {
			local.push({ kind, status: "missing", models: [], detail: e instanceof Error ? e.message.slice(0, 120) : "tidak merespons" });
		}
	}
	return { cli, local };
}
