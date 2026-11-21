import type { AiSettings, CliTool, LocalKind, ProviderId } from "../../domain/ai/types";
import { CLI_SPECS, isSafeModelName } from "./cliSpecs";
import { isLocalUrl, joinUrl } from "./http";
import type { HttpClient } from "./http";
import type { DiscoveryIo, ProcessRunner } from "./runner";
import { withTimeout } from "./timeout";

/**
 * Deteksi model otomatis (0.9.0). TIDAK ada daftar model di kode: semuanya dibaca dari penyedia itu sendiri
 *  - CLI: `--help`, berkas konfigurasi model, executable (nama model yang tertanam), cache model milik CLI;
 *  - lokal / API: endpoint daftar model.
 * Yang dibaca dari berkas konfigurasi CLI hanya NAMA model; berkas login/token tidak pernah dibuka, dan isi lain
 * dari berkas konfigurasi tidak disimpan. Semua kegagalan menjadi `models: []` + status, tidak pernah melempar.
 */

export type DiscoveryStatus = "ok" | "unavailable" | "desktopOnly" | "needsKey" | "unauthorized" | "error";

export interface DiscoveryResult {
	/** Terhubung dan daftar model berhasil dibaca (daftar boleh kosong). */
	connected: boolean;
	status: DiscoveryStatus;
	models: string[];
	/** Model yang sedang dipakai/dikonfigurasi CLI itu sendiri (bila ada). */
	current?: string;
	/** Nama tampilan per id model (mis. dari `agy models`); id tetap yang disimpan dan dikirim ke CLI. */
	labels?: Record<string, string>;
	/** True bila penyedia hanya dideteksi (tidak boleh menjalankan pertanyaan): Codex/Gemini tanpa flag pengaman terverifikasi. */
	detectOnly?: boolean;
	/** Keterangan singkat untuk status error (tanpa rahasia). */
	detail?: string;
}

export type DiscoveryTarget =
	| { kind: "cli"; tool: CliTool }
	| { kind: "local"; local: LocalKind; baseUrl: string }
	| { kind: "api"; baseUrl: string; apiKey: string };

export interface DiscoveryDeps {
	runner: ProcessRunner;
	findExe: (name: string) => Promise<string | null>;
	makeSandbox: () => Promise<{ dir: string; cleanup: () => Promise<void> }>;
	http: HttpClient | null;
	/** false di mobile (tanpa Node): penyedia CLI = desktopOnly. */
	canSpawn: boolean;
	/** Akses berkas hanya-baca; null bila tidak ada Node. */
	io: DiscoveryIo | null;
	timeoutMs?: number;
}

export const LOCAL_DEFAULT_BASE: Record<LocalKind, string> = { ollama: "http://localhost:11434", lmstudio: "http://localhost:1234" };

const DEFAULT_TIMEOUT = 4500;
/** `agy models` bisa menghubungi server (~2 dtk di PC pengembang): beri waktu lebih. */
const AGY_TIMEOUT = 15000;
const MAX_MODELS = 60;
const MAX_BODY_CHARS = 262144;
const binaryCache = new Map<string, string[]>();

/** Kosongkan cache hasil pemindaian executable (untuk tes). */
export function clearDiscoveryCache(): void {
	binaryCache.clear();
}

// ---------------- Pembantu murni ----------------

function asRecord(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Buang yang tidak aman, hapus awalan `models/`, tanpa duplikat, urutan pertama dipertahankan. */
export function uniqueModels(...lists: string[][]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const list of lists) {
		for (const raw of list) {
			const name = raw.trim().replace(/^models\//, "");
			if (name !== "" && isSafeModelName(name) && !seen.has(name)) {
				seen.add(name);
				out.push(name);
			}
		}
	}
	return out;
}

function versionParts(name: string): number[] {
	const withoutDate = name.replace(/-20\d{6}/, "");
	const match = /-(\d+(?:[.-]\d+)*)/.exec(withoutDate);
	if (!match) return [];
	return (match[1] as string).split(/[.-]/).map((p) => Number(p));
}

/** Versi terbaru dulu; tanpa tanggal sebelum bertanggal; sisanya urut alfabet menurun. */
export function compareModelsDesc(a: string, b: string): number {
	const va = versionParts(a);
	const vb = versionParts(b);
	const len = Math.max(va.length, vb.length);
	for (let i = 0; i < len; i++) {
		const diff = (vb[i] ?? 0) - (va[i] ?? 0);
		if (diff !== 0) return diff;
	}
	const aDated = /-20\d{6}/.test(a) ? 1 : 0;
	const bDated = /-20\d{6}/.test(b) ? 1 : 0;
	if (aDated !== bDated) return aDated - bDated;
	return b.localeCompare(a, undefined, { numeric: true });
}

export function parseCodexConfigModel(toml: string): string | null {
	const match = /^[ \t]*model[ \t]*=[ \t]*["']([^"'\r\n]+)["']/m.exec(toml);
	const name = match ? (match[1] as string).trim() : "";
	return name !== "" && isSafeModelName(name) ? name : null;
}

/** `models_cache.json` milik Codex: ambil `slug` yang terlihat (visibility `list`), urutan asli. `hide`/`hidden`/`none` dibuang. */
export function parseCodexCacheModels(json: string): string[] {
	try {
		const root = asRecord(JSON.parse(json));
		if (!Array.isArray(root.models)) return [];
		const slugs: string[] = [];
		for (const item of root.models as unknown[]) {
			const o = asRecord(item);
			const vis = o.visibility;
			if (vis === "hide" || vis === "hidden" || vis === "none") continue;
			if (typeof o.slug === "string") slugs.push(o.slug);
		}
		return uniqueModels(slugs);
	} catch {
		return [];
	}
}

/** Alias model dari `claude --help` (bagian `--model ... (e.g. 'a', 'b' or 'c')`). */
export function parseClaudeHelpAliases(help: string): string[] {
	const section = /--model\b[\s\S]{0,400}?e\.g\.\s*([^)]+)\)/i.exec(help);
	if (!section) return [];
	const quoted: string[] = [];
	const re = /['"]([a-z][a-z0-9._-]*)['"]/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(section[1] as string)) !== null) quoted.push((m[1] as string).toLowerCase());
	return uniqueModels(quoted);
}

/** `~/.claude/settings.json`: `model` dan `env.ANTHROPIC_DEFAULT_*_MODEL`. Kunci lain (termasuk token di `env`) TIDAK diambil. */
export function parseClaudeSettingsModels(json: string): string[] {
	try {
		const root = asRecord(JSON.parse(json));
		const found: string[] = [];
		if (typeof root.model === "string") found.push(root.model);
		const env = asRecord(root.env);
		for (const key of Object.keys(env)) {
			const value = env[key];
			if (/^ANTHROPIC_DEFAULT_[A-Z0-9_]*_MODEL$/.test(key) && typeof value === "string") found.push(value);
		}
		return uniqueModels(found);
	} catch {
		return [];
	}
}

/** Pola pemindaian executable Claude: `claude-<famili>-<versi>[-tanggal]`. Bukan daftar model, hanya bentuk nama. */
export const CLAUDE_BINARY_PATTERN = /\bclaude-[a-z]+-\d{1,2}(?:[.-]\d{1,2})*(?:-20\d{6})?(?:-v\d+)?\b/;

/**
 * Pilih nama model asli dari hasil pemindaian. Tanpa daftar famili di kode: sebuah famili dianggap nyata bila
 * ia disebut di `claude --help` (alias) ATAU muncul dengan >= 2 versi berbeda di executable. Akhiran `-v1` dibuang.
 */
export function pickClaudeBinaryModels(matches: string[], aliases: string[]): string[] {
	const parsed = matches
		.filter((n) => !/-v\d+$/i.test(n))
		.map((n) => ({ name: n, family: (/^claude-([a-z]+)-/.exec(n)?.[1] ?? ""), version: (versionParts(n).join(".")) }));
	const versionsPerFamily = new Map<string, Set<string>>();
	for (const p of parsed) {
		const set = versionsPerFamily.get(p.family) ?? new Set<string>();
		set.add(p.version);
		versionsPerFamily.set(p.family, set);
	}
	const aliasSet = new Set(aliases);
	const kept = parsed.filter((p) => aliasSet.has(p.family) || (versionsPerFamily.get(p.family)?.size ?? 0) >= 2).map((p) => p.name);
	return uniqueModels(kept).sort(compareModelsDesc).slice(0, 40);
}

/**
 * Keluaran `agy models` (Antigravity CLI): baris `id<TAB>nama`. Baris tanpa TAB (mis. "Fetching available models...")
 * dan id yang tidak aman dibuang. Urutan dari agy dipertahankan.
 */
export function parseAgyModels(stdout: string): { ids: string[]; labels: Record<string, string> } {
	const ids: string[] = [];
	const labels: Record<string, string> = {};
	for (const line of stdout.split(/\r?\n/)) {
		const tab = line.indexOf("\t");
		if (tab <= 0) continue;
		const id = line.slice(0, tab).trim();
		const label = line.slice(tab + 1).trim();
		if (!isSafeModelName(id) || id in labels) continue;
		ids.push(id);
		labels[id] = label !== "" ? label.slice(0, 80) : id;
	}
	return { ids: ids.slice(0, MAX_MODELS), labels };
}

/** `~/.gemini/antigravity-cli/settings.json`: hanya `model`. Kunci lain (mis. folder tepercaya) tidak diambil. */
export function parseAgySettingsModel(json: string): string | null {
	try {
		const model = asRecord(JSON.parse(json)).model;
		return typeof model === "string" && isSafeModelName(model.trim()) && model.trim() !== "" ? model.trim() : null;
	} catch {
		return null;
	}
}

/** `~/.gemini/settings.json`: `model` (teks) atau `model.name`. */
export function parseGeminiSettingsModels(json: string): string[] {
	try {
		const root = asRecord(JSON.parse(json));
		if (typeof root.model === "string") return uniqueModels([root.model]);
		const nested = asRecord(root.model);
		return typeof nested.name === "string" ? uniqueModels([nested.name]) : [];
	} catch {
		return [];
	}
}

export const GEMINI_BINARY_PATTERN = /\bgemini-\d[a-z0-9.-]*[a-z0-9]\b/;

export function pickGeminiBinaryModels(matches: string[]): string[] {
	return uniqueModels(matches).sort(compareModelsDesc).slice(0, 40);
}

function joinPath(base: string, ...parts: string[]): string {
	const sep = base.includes("\\") ? "\\" : "/";
	return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

// ---------------- CLI ----------------

async function scanCached(io: DiscoveryIo, exe: string, pattern: RegExp): Promise<string[]> {
	const key = await io.fileKey(exe);
	if (!key) return [];
	const cacheKey = `${pattern.source}|${key}`;
	const cached = binaryCache.get(cacheKey);
	if (cached) return cached;
	const found = await io.scanFile(exe, pattern);
	if (found === null) return [];
	binaryCache.set(cacheKey, found);
	return found;
}

async function discoverCli(tool: CliTool, deps: DiscoveryDeps): Promise<DiscoveryResult> {
	const spec = CLI_SPECS[tool];
	const detectOnly = !spec.supported;
	const base = { detectOnly } as const;
	if (!deps.canSpawn || !deps.io) return { ...base, connected: false, status: "desktopOnly", models: [] };
	const io = deps.io;
	const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT;

	try {
		const exe = await deps.findExe(spec.exe);
		if (!exe) return { ...base, connected: false, status: "unavailable", models: [] };
		const home = io.homeDir();

		if (tool === "codex") {
			// Hanya membaca dua berkas: config.toml (model) dan models_cache.json (daftar model). auth.json TIDAK dibuka.
			const dir = io.env("CODEX_HOME") || (home ? joinPath(home, ".codex") : "");
			if (!dir) return { ...base, connected: true, status: "ok", models: [] };
			const [config, cache] = await Promise.all([io.readText(joinPath(dir, "config.toml")), io.readText(joinPath(dir, "models_cache.json"))]);
			const current = config ? parseCodexConfigModel(config) : null;
			const cached = cache ? parseCodexCacheModels(cache) : [];
			return { ...base, connected: true, status: "ok", models: uniqueModels(current ? [current] : [], cached), ...(current ? { current } : {}) };
		}

		if (tool === "agy") {
			// `agy models` = satu-satunya program yang dijalankan (tidak memanggil model). Bisa menghubungi penyedianya (login agy).
			const sandbox = await deps.makeSandbox();
			const ac = new AbortController();
			let listing = "";
			try {
				const res = await withTimeout(
					deps.runner.run(exe, ["models"], { stdin: "", cwd: sandbox.dir, signal: ac.signal }),
					deps.timeoutMs ?? AGY_TIMEOUT,
					"agy models",
				);
				if (res.code !== 0) return { ...base, connected: false, status: "error", models: [], detail: `exit ${res.code}` };
				listing = res.stdout;
			} catch (e) {
				ac.abort();
				return { ...base, connected: false, status: "error", models: [], detail: e instanceof Error ? e.message.slice(0, 120) : "models failed" };
			} finally {
				await sandbox.cleanup();
			}
			const parsed = parseAgyModels(listing);
			const dir = io.env("AGY_HOME") ? joinPath(io.env("AGY_HOME") as string, "antigravity-cli") : home ? joinPath(home, ".gemini", "antigravity-cli") : "";
			const settings = dir ? await io.readText(joinPath(dir, "settings.json")) : null;
			const current = settings ? parseAgySettingsModel(settings) : null;
			return { ...base, connected: true, status: "ok", models: parsed.ids, labels: parsed.labels, ...(current ? { current } : {}) };
		}

		if (tool === "gemini") {
			const dir = io.env("GEMINI_CLI_HOME") || (home ? joinPath(home, ".gemini") : "");
			const settings = dir ? await io.readText(joinPath(dir, "settings.json")) : null;
			const configured = settings ? parseGeminiSettingsModels(settings) : [];
			const bundled = pickGeminiBinaryModels(await scanCached(io, exe, GEMINI_BINARY_PATTERN));
			return { ...base, connected: true, status: "ok", models: uniqueModels(configured, bundled), ...(configured[0] ? { current: configured[0] } : {}) };
		}

		// claude: alias dari `--help` (satu-satunya program yang dijalankan; aman, tidak memanggil model)
		const sandbox = await deps.makeSandbox();
		const ac = new AbortController();
		let help = "";
		try {
			const res = await withTimeout(deps.runner.run(exe, ["--help"], { stdin: "", cwd: sandbox.dir, signal: ac.signal }), timeoutMs, "claude --help");
			if (res.code !== 0) return { ...base, connected: false, status: "error", models: [], detail: `exit ${res.code}` };
			help = res.stdout;
		} catch (e) {
			ac.abort();
			return { ...base, connected: false, status: "error", models: [], detail: e instanceof Error ? e.message.slice(0, 120) : "help failed" };
		} finally {
			await sandbox.cleanup();
		}
		const aliases = parseClaudeHelpAliases(help);
		const dir = io.env("CLAUDE_CONFIG_DIR") || (home ? joinPath(home, ".claude") : "");
		const settings = dir ? await io.readText(joinPath(dir, "settings.json")) : null;
		const configured = settings ? parseClaudeSettingsModels(settings) : [];
		const bundled = pickClaudeBinaryModels(await scanCached(io, exe, CLAUDE_BINARY_PATTERN), aliases);
		return { ...base, connected: true, status: "ok", models: uniqueModels(configured, aliases, bundled), ...(configured[0] ? { current: configured[0] } : {}) };
	} catch (e) {
		return { ...base, connected: false, status: "error", models: [], detail: e instanceof Error ? e.message.slice(0, 120) : "error" };
	}
}

// ---------------- HTTP (lokal & API) ----------------

function statusForHttp(code: number): DiscoveryStatus {
	return code === 401 || code === 403 ? "unauthorized" : "error";
}

/** Ambil nama model dari JSON daftar model: Ollama `models[].name`; OpenAI-kompatibel `data[].id`; Gemini `models[].name`. */
export function parseModelList(text: string): string[] {
	if (text.length > MAX_BODY_CHARS) throw new Error("model list too large");
	const root = asRecord(JSON.parse(text));
	const fromArray = (value: unknown, key: string): string[] =>
		Array.isArray(value) ? (value as unknown[]).slice(0, MAX_MODELS).map((x) => asRecord(x)[key]).filter((x): x is string => typeof x === "string") : [];
	return uniqueModels(fromArray(root.data, "id"), fromArray(root.models, "name"), fromArray(root.models, "model"));
}

async function getModels(http: HttpClient, url: string, headers: Record<string, string> | undefined, timeoutMs: number): Promise<DiscoveryResult> {
	try {
		const r = await withTimeout(http.get(url, headers ? { headers } : undefined), timeoutMs, "models");
		if (r.status < 200 || r.status >= 300) return { connected: false, status: statusForHttp(r.status), models: [], detail: `HTTP ${r.status}` };
		return { connected: true, status: "ok", models: parseModelList(r.text) };
	} catch (e) {
		// A transport error can include the URL/credentials of the request: keep only a generic reason.
		return { connected: false, status: "unavailable", models: [], detail: e instanceof Error && /timeout/.test(e.message) ? "timeout" : "not reachable" };
	}
}

async function discoverLocal(target: Extract<DiscoveryTarget, { kind: "local" }>, deps: DiscoveryDeps): Promise<DiscoveryResult> {
	if (!deps.http) return { connected: false, status: "unavailable", models: [] };
	const base = target.baseUrl.trim() || LOCAL_DEFAULT_BASE[target.local];
	const url = joinUrl(base, target.local === "ollama" ? "/api/tags" : "/v1/models");
	return getModels(deps.http, url, undefined, deps.timeoutMs ?? DEFAULT_TIMEOUT);
}

async function discoverApi(target: Extract<DiscoveryTarget, { kind: "api" }>, deps: DiscoveryDeps): Promise<DiscoveryResult> {
	const base = target.baseUrl.trim();
	if (!base) return { connected: false, status: "unavailable", models: [], detail: "no base URL" };
	const key = target.apiKey.trim();
	// Tanpa kunci pada alamat cloud: 0 permintaan jaringan. Alamat lokal (mis. server di komputer ini) boleh tanpa kunci.
	if (!key && !isLocalUrl(base)) return { connected: false, status: "needsKey", models: [] };
	if (!deps.http) return { connected: false, status: "unavailable", models: [] };
	return getModels(deps.http, joinUrl(base, "/models"), key ? { Authorization: `Bearer ${key}` } : undefined, deps.timeoutMs ?? DEFAULT_TIMEOUT);
}

// ---------------- Pintu masuk ----------------

/** Target deteksi untuk satu penyedia berdasarkan pengaturan AI saat ini. */
export function discoveryTarget(ai: AiSettings, id: ProviderId): DiscoveryTarget {
	if (id === "cli") return { kind: "cli", tool: ai.providers.cli.tool };
	if (id === "local") return { kind: "local", local: ai.providers.local.kind, baseUrl: ai.providers.local.baseUrl };
	return { kind: "api", baseUrl: ai.providers.api.baseUrl, apiKey: ai.providers.api.apiKey };
}

/** Deteksi model untuk satu penyedia. Tidak pernah melempar. */
export async function discoverModels(target: DiscoveryTarget, deps: DiscoveryDeps): Promise<DiscoveryResult> {
	try {
		if (target.kind === "cli") return await discoverCli(target.tool, deps);
		if (target.kind === "local") return await discoverLocal(target, deps);
		return await discoverApi(target, deps);
	} catch {
		return { connected: false, status: "error", models: [] };
	}
}
