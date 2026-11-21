import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertGuards, CLI_SPECS, isSafeModelName } from "../src/adapter/ai/cliSpecs";
import { buildProviders } from "../src/adapter/ai/factory";
import type { FactoryDeps } from "../src/adapter/ai/factory";
import {
	clearDiscoveryCache,
	discoverModels,
	discoveryTarget,
	parseAgyModels,
	parseClaudeHelpAliases,
	parseClaudeSettingsModels,
	parseCodexCacheModels,
	parseCodexConfigModel,
	parseGeminiSettingsModels,
	parseModelList,
	pickClaudeBinaryModels,
	uniqueModels,
} from "../src/adapter/ai/modelDiscovery";
import type { DiscoveryDeps } from "../src/adapter/ai/modelDiscovery";
import { CliProvider } from "../src/adapter/ai/providers";
import { NodeDiscoveryIo } from "../src/adapter/ai/runner";
import type { DiscoveryIo, ProcessRunner, RunOptions, RunResult } from "../src/adapter/ai/runner";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { StaticQuestionProvider } from "../src/domain/questions/staticProvider";
import { makeT } from "../src/i18n";
import { buildPicker, OTHER_VALUE, statusText, validateManualModel } from "../src/ui/modelPicker";
import { CountingHttp, NodeFetchHttp, startMockServer } from "./helpers/fakes";
import type { MockServer } from "./helpers/fakes";

// ---------------- fixture & tiruan ----------------

const CLAUDE_HELP = `Usage: claude [options]
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name.
  --tools <tools...>                    Use "" to disable all tools
`;

const CODEX_CACHE = JSON.stringify({
	fetched_at: "2026-11-21T00:00:00Z",
	models: [
		{ slug: "gpt-6.2-sol", visibility: "list" },
		{ slug: "internal-hidden-1", visibility: "hide" },
		{ slug: "gpt-6.2-astra", visibility: "list" },
		{ slug: "gpt-6.1-terra", visibility: "list" },
		{ slug: "also hidden", visibility: "hidden" },
	],
});

const AGY_OUTPUT = [
	"Fetching available models...",
	"gemini-4-neon-high\tGemini 4 Neon (High)",
	"gemini-4-neon-low\tGemini 4 Neon (Low)",
	"claude-opus-5-5-high\tClaude Opus 5.5 (High)",
	"gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
	"",
].join("\r\n");

class FakeIo implements DiscoveryIo {
	reads: string[] = [];
	scans: string[] = [];
	constructor(
		public files: Record<string, string> = {},
		public scanResult: Record<string, string[]> = {},
		public envVars: Record<string, string> = {},
	) {}
	homeDir() {
		return "/home/u";
	}
	env(name: string) {
		return this.envVars[name];
	}
	async readText(file: string) {
		this.reads.push(file);
		return this.files[file] ?? null;
	}
	async fileKey(file: string) {
		return file in this.scanResult ? `${file}|1|1` : null;
	}
	async scanFile(file: string) {
		this.scans.push(file);
		return this.scanResult[file] ?? null;
	}
}

class FakeRunner implements ProcessRunner {
	calls: Array<{ file: string; args: string[] }> = [];
	constructor(private answers: Record<string, RunResult | Error> = {}) {}
	async run(file: string, args: string[], _opts: RunOptions): Promise<RunResult> {
		this.calls.push({ file, args });
		const a = this.answers[args.join(" ")];
		if (a instanceof Error) throw a;
		return a ?? { code: 1, stdout: "", stderr: "unexpected call" };
	}
}

const sandbox = async () => ({ dir: "/tmp/x", cleanup: async () => {} });
const exes = (present: string[]) => async (name: string) => (present.includes(name) ? `/bin/${name}` : null);

function deps(over: Partial<DiscoveryDeps> = {}): DiscoveryDeps {
	return { runner: new FakeRunner(), findExe: exes([]), makeSandbox: sandbox, http: null, canSpawn: true, io: new FakeIo(), ...over };
}

beforeEach(() => clearDiscoveryCache());

// ---------------- S1: Codex ----------------

describe("S1 Codex: config.toml + models_cache.json", () => {
	const codexFiles = {
		"/home/u/.codex/config.toml": 'sandbox_mode = "workspace-write"\nmodel = "gpt-6.1-terra"\napi_key = "SECRET-IN-CONFIG"\n',
		"/home/u/.codex/models_cache.json": CODEX_CACHE,
		"/home/u/.codex/auth.json": '{"tokens":{"access_token":"SECRET-TOKEN"}}',
	};

	it("models come in original order, hidden ones are dropped, the configured model is current and first", async () => {
		const io = new FakeIo(codexFiles);
		const r = await discoverModels({ kind: "cli", tool: "codex" }, deps({ findExe: exes(["codex"]), io }));
		expect(r).toMatchObject({ connected: true, status: "ok", current: "gpt-6.1-terra", detectOnly: true });
		expect(r.models).toEqual(["gpt-6.1-terra", "gpt-6.2-sol", "gpt-6.2-astra"]);
	});

	it("never opens auth.json and never leaks other config values", async () => {
		const io = new FakeIo(codexFiles);
		const r = await discoverModels({ kind: "cli", tool: "codex" }, deps({ findExe: exes(["codex"]), io }));
		expect(io.reads.some((p) => p.includes("auth"))).toBe(false);
		expect(JSON.stringify(r)).not.toMatch(/SECRET/);
	});

	it("honours CODEX_HOME", async () => {
		const io = new FakeIo({ "/custom/codex/models_cache.json": CODEX_CACHE }, {}, { CODEX_HOME: "/custom/codex" });
		const r = await discoverModels({ kind: "cli", tool: "codex" }, deps({ findExe: exes(["codex"]), io }));
		expect(r.models).toEqual(["gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra"]);
	});

	it("missing files / broken JSON => empty list, no crash; codex not installed => unavailable", async () => {
		const none = await discoverModels({ kind: "cli", tool: "codex" }, deps({ findExe: exes(["codex"]), io: new FakeIo() }));
		expect(none).toMatchObject({ connected: true, status: "ok", models: [] });
		expect(parseCodexCacheModels("{not json")).toEqual([]);
		expect(parseCodexCacheModels('{"models":"x"}')).toEqual([]);
		expect(parseCodexConfigModel("no model here")).toBeNull();
		expect(parseCodexConfigModel('model = "bad name with space"')).toBeNull();
		const missing = await discoverModels({ kind: "cli", tool: "codex" }, deps());
		expect(missing).toMatchObject({ connected: false, status: "unavailable", models: [] });
	});

	it("Codex is only detected: it never spawns anything", async () => {
		const runner = new FakeRunner();
		await discoverModels({ kind: "cli", tool: "codex" }, deps({ runner, findExe: exes(["codex"]), io: new FakeIo(codexFiles) }));
		expect(runner.calls).toEqual([]);
	});
});

// ---------------- S2: Claude ----------------

describe("S2 Claude: aliases from --help + settings + names found in the executable", () => {
	it("parses the aliases from --help", () => {
		expect(parseClaudeHelpAliases(CLAUDE_HELP)).toEqual(["fable", "opus", "sonnet"]);
		expect(parseClaudeHelpAliases("no model flag")).toEqual([]);
	});

	it("settings: model and ANTHROPIC_DEFAULT_*_MODEL only; tokens in env are never read", () => {
		const json = JSON.stringify({ model: "opus", env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5", ANTHROPIC_AUTH_TOKEN: "SECRET", OTHER: "x" } });
		expect(parseClaudeSettingsModels(json)).toEqual(["opus", "claude-haiku-4-5"]);
		expect(parseClaudeSettingsModels("oops")).toEqual([]);
	});

	it("binary names: -v1 ignored, newest version first, noise families dropped without a hardcoded family list", () => {
		const found = [
			"claude-sonnet-4-5", "claude-sonnet-4-5-v1", "claude-sonnet-5-5", "claude-sonnet-4-5-20250929", "claude-sonnet-5",
			"claude-opus-5-5", "claude-opus-4-1", "claude-opus-4-1-20250805-v1", "claude-opus-4-1-20250805",
			"claude-haiku-5-5", "claude-haiku-4-5",
			"claude-eval-9", // famili satu versi, bukan alias => noise
			"claude-mythos-5", "claude-mythos-5-1", // famili baru dengan >= 2 versi => nyata
		];
		const picked = pickClaudeBinaryModels(found, ["fable", "opus", "sonnet"]);
		expect(picked).not.toContain("claude-eval-9");
		expect(picked.some((m) => m.endsWith("-v1"))).toBe(false);
		expect(picked).toContain("claude-mythos-5-1");
		expect(picked.indexOf("claude-sonnet-5-5")).toBeLessThan(picked.indexOf("claude-sonnet-4-5"));
		expect(picked.indexOf("claude-sonnet-4-5")).toBeLessThan(picked.indexOf("claude-sonnet-4-5-20250929"));
	});

	it("end to end: runs ONLY `--help`, scans the executable once (cached), current model from settings", async () => {
		const runner = new FakeRunner({ "--help": { code: 0, stdout: CLAUDE_HELP, stderr: "" } });
		const io = new FakeIo(
			{ "/home/u/.claude/settings.json": JSON.stringify({ model: "opus", env: { ANTHROPIC_AUTH_TOKEN: "SECRET" } }) },
			{ "/bin/claude": ["claude-sonnet-5-5", "claude-sonnet-4-5", "claude-haiku-5-5", "claude-haiku-4-5", "claude-haiku-4-5-v1"] },
		);
		const d = deps({ runner, findExe: exes(["claude"]), io });
		const r = await discoverModels({ kind: "cli", tool: "claude" }, d);
		expect(r).toMatchObject({ connected: true, status: "ok", current: "opus", detectOnly: false });
		expect(r.models).toEqual(["opus", "fable", "sonnet", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-4-5", "claude-haiku-4-5"]);
		expect(JSON.stringify(r)).not.toMatch(/SECRET/);
		expect(runner.calls.map((c) => c.args)).toEqual([["--help"]]);
		await discoverModels({ kind: "cli", tool: "claude" }, d);
		expect(io.scans).toHaveLength(1); // cache per berkas
	});

	it("--help failing or timing out => error status, empty list, no throw", async () => {
		const bad = await discoverModels({ kind: "cli", tool: "claude" }, deps({ findExe: exes(["claude"]), runner: new FakeRunner({ "--help": { code: 2, stdout: "", stderr: "boom" } }) }));
		expect(bad).toMatchObject({ connected: false, status: "error", models: [] });
		const slow = await discoverModels(
			{ kind: "cli", tool: "claude" },
			deps({ findExe: exes(["claude"]), timeoutMs: 30, runner: { run: () => new Promise<RunResult>(() => undefined) } }),
		);
		expect(slow).toMatchObject({ connected: false, status: "error", models: [] });
	});

	it("real chunked scanner finds names that straddle a chunk boundary", async () => {
		const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const dir = mkdtempSync(join(tmpdir(), "mvscan-"));
		try {
			const file = join(dir, "fake.exe");
			const chunk = 4 * 1024 * 1024;
			const filler = "\u0001".repeat(chunk - 10);
			writeFileSync(file, Buffer.from(`${filler}claude-sonnet-5-5 and claude-opus-4-1 tail`, "latin1"));
			const io = new NodeDiscoveryIo();
			const found = await io.scanFile(file, /\bclaude-[a-z]+-\d{1,2}(?:[.-]\d{1,2})*\b/);
			expect(found?.sort()).toEqual(["claude-opus-4-1", "claude-sonnet-5-5"]);
			expect(await io.scanFile(join(dir, "missing"), /x/)).toBeNull();
			expect(await io.readText(join(dir, "missing"))).toBeNull();
			expect(await io.fileKey(file)).toMatch(/fake\.exe\|\d+\|\d+/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

// ---------------- S3: Gemini ----------------

describe("S3 Gemini", () => {
	it("not installed => unavailable, models [] (no invented models)", async () => {
		const r = await discoverModels({ kind: "cli", tool: "gemini" }, deps());
		expect(r).toMatchObject({ connected: false, status: "unavailable", models: [], detectOnly: true });
	});

	it("installed: model from ~/.gemini/settings.json (+ names in the executable); never spawns", async () => {
		const runner = new FakeRunner();
		const io = new FakeIo({ "/home/u/.gemini/settings.json": JSON.stringify({ model: { name: "gemini-2.5-pro" }, apiKey: "SECRET" }) }, { "/bin/gemini": ["gemini-2.5-flash", "gemini-2.5-pro"] });
		const r = await discoverModels({ kind: "cli", tool: "gemini" }, deps({ runner, findExe: exes(["gemini"]), io }));
		expect(r.models).toEqual(["gemini-2.5-pro", "gemini-2.5-flash"]);
		expect(r.current).toBe("gemini-2.5-pro");
		expect(JSON.stringify(r)).not.toMatch(/SECRET/);
		expect(runner.calls).toEqual([]);
		expect(parseGeminiSettingsModels('{"model":"gemini-x-1"}')).toEqual(["gemini-x-1"]);
		expect(parseGeminiSettingsModels("oops")).toEqual([]);
	});
});

// ---------------- S11: Antigravity (agy) ----------------

describe("S11 Antigravity: agy models", () => {
	it("parseAgyModels: id<TAB>name, header and bad lines dropped, order kept, ids stay safe", () => {
		const p = parseAgyModels(AGY_OUTPUT);
		expect(p.ids).toEqual(["gemini-4-neon-high", "gemini-4-neon-low", "claude-opus-5-5-high", "gpt-oss-120b-medium"]);
		expect(p.labels["gemini-4-neon-high"]).toBe("Gemini 4 Neon (High)");
		const nasty = parseAgyModels("--bad-flag\tNope\na b\tNo\nok-model\t\nok-model\tDuplicate\n\tNoId\nno tab line");
		expect(nasty.ids).toEqual(["ok-model"]);
		expect(nasty.labels["ok-model"]).toBe("ok-model");
		expect(parseAgyModels("").ids).toEqual([]);
	});

	it("runs ONLY `agy models`; ids are stored, names are shown; current model from antigravity-cli/settings.json (model only)", async () => {
		const runner = new FakeRunner({ models: { code: 0, stdout: AGY_OUTPUT, stderr: "" } });
		const io = new FakeIo({ "/home/u/.gemini/antigravity-cli/settings.json": JSON.stringify({ model: "gemini-4-neon-low", trustedWorkspaces: ["C:/secret/path"] }) });
		const r = await discoverModels({ kind: "cli", tool: "agy" }, deps({ runner, findExe: exes(["agy"]), io }));
		expect(runner.calls).toEqual([{ file: "/bin/agy", args: ["models"] }]);
		expect(r).toMatchObject({ connected: true, status: "ok", detectOnly: true, current: "gemini-4-neon-low" });
		expect(r.models).toHaveLength(4);
		expect(r.labels?.["claude-opus-5-5-high"]).toBe("Claude Opus 5.5 (High)");
		expect(JSON.stringify(r)).not.toMatch(/secret/);
	});

	it("failure / timeout / not installed / mobile => empty list, right status, no throw", async () => {
		const fail = await discoverModels({ kind: "cli", tool: "agy" }, deps({ findExe: exes(["agy"]), runner: new FakeRunner({ models: { code: 1, stdout: "", stderr: "not logged in" } }) }));
		expect(fail).toMatchObject({ connected: false, status: "error", models: [] });
		const slow = await discoverModels({ kind: "cli", tool: "agy" }, deps({ findExe: exes(["agy"]), timeoutMs: 30, runner: { run: () => new Promise<RunResult>(() => undefined) } }));
		expect(slow).toMatchObject({ connected: false, status: "error", models: [] });
		expect(await discoverModels({ kind: "cli", tool: "agy" }, deps())).toMatchObject({ connected: false, status: "unavailable" });
		const mobile = new FakeRunner();
		expect(await discoverModels({ kind: "cli", tool: "agy" }, deps({ runner: mobile, canSpawn: false, io: null, findExe: exes(["agy"]) }))).toMatchObject({ status: "desktopOnly", models: [] });
		expect(mobile.calls).toEqual([]);
	});
});

// ---------------- S4: Ollama / LM Studio ----------------

describe("S4 local servers", () => {
	let srv: MockServer;
	beforeAll(async () => {
		srv = await startMockServer();
	});
	afterAll(async () => {
		await srv.close();
	});

	it("Ollama /api/tags and LM Studio /v1/models", async () => {
		srv.setHandler((r) => (r.url === "/api/tags" ? { body: JSON.stringify({ models: [{ name: "llama3.2:3b" }, { name: "qwen2.5:7b" }] }) } : { body: JSON.stringify({ data: [{ id: "lm-model" }] }) }));
		const http = new NodeFetchHttp();
		const o = await discoverModels({ kind: "local", local: "ollama", baseUrl: srv.url }, deps({ http }));
		expect(o).toMatchObject({ connected: true, status: "ok", models: ["llama3.2:3b", "qwen2.5:7b"] });
		const l = await discoverModels({ kind: "local", local: "lmstudio", baseUrl: srv.url }, deps({ http }));
		expect(l.models).toEqual(["lm-model"]);
	});

	it("server down => Not connected (unavailable), no throw, no models invented", async () => {
		const dead = await startMockServer();
		const url = dead.url;
		await dead.close();
		const r = await discoverModels({ kind: "local", local: "ollama", baseUrl: url }, deps({ http: new NodeFetchHttp(), timeoutMs: 1500 }));
		expect(r).toMatchObject({ connected: false, status: "unavailable", models: [] });
	});

	it("HTTP 500 and invalid JSON => error / unavailable, never a crash", async () => {
		srv.setHandler(() => ({ status: 500, body: "x" }));
		expect(await discoverModels({ kind: "local", local: "ollama", baseUrl: srv.url }, deps({ http: new NodeFetchHttp() }))).toMatchObject({ connected: false, status: "error", detail: "HTTP 500" });
		srv.setHandler(() => ({ body: "not json" }));
		expect(await discoverModels({ kind: "local", local: "ollama", baseUrl: srv.url }, deps({ http: new NodeFetchHttp() }))).toMatchObject({ connected: false, models: [] });
	});

	it("falls back to the default local URL when none is configured", async () => {
		const http = new CountingHttp();
		await discoverModels({ kind: "local", local: "ollama", baseUrl: "" }, deps({ http }));
		expect(http.count).toBe(1);
	});
});

// ---------------- S5: Cloud API ----------------

describe("S5 Cloud API", () => {
	let srv: MockServer;
	beforeAll(async () => {
		srv = await startMockServer();
	});
	afterAll(async () => {
		await srv.close();
	});

	it("no key on a cloud URL => needsKey and ZERO network calls", async () => {
		const http = new CountingHttp();
		const r = await discoverModels({ kind: "api", baseUrl: "https://api.example.com/v1", apiKey: "" }, deps({ http }));
		expect(r).toMatchObject({ connected: false, status: "needsKey", models: [] });
		expect(http.count).toBe(0);
		const blank = await discoverModels({ kind: "api", baseUrl: "https://api.example.com/v1", apiKey: "   " }, deps({ http }));
		expect(blank.status).toBe("needsKey");
		expect(http.count).toBe(0);
	});

	it("no base URL => unavailable, zero network calls", async () => {
		const http = new CountingHttp();
		expect(await discoverModels({ kind: "api", baseUrl: "", apiKey: "k" }, deps({ http }))).toMatchObject({ connected: false, status: "unavailable" });
		expect(http.count).toBe(0);
	});

	it("valid key: GET <base>/models with a Bearer header; data[].id listed; the key never appears in the result", async () => {
		srv.setHandler((r) => (r.url === "/v1/models" ? { body: JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }) } : { status: 404, body: "{}" }));
		const r = await discoverModels({ kind: "api", baseUrl: `${srv.url}/v1`, apiKey: "sk-SECRET" }, deps({ http: new NodeFetchHttp() }));
		expect(r).toMatchObject({ connected: true, status: "ok", models: ["model-a", "model-b"] });
		expect(JSON.stringify(r)).not.toContain("sk-SECRET");
		const last = srv.requests[srv.requests.length - 1];
		expect(last?.method).toBe("GET");
		expect(last?.headers.authorization).toBe("Bearer sk-SECRET");
	});

	it("401 => unauthorized with a clear status; Gemini-style models[].name loses its models/ prefix", async () => {
		srv.setHandler(() => ({ status: 401, body: '{"error":"bad key"}' }));
		const r = await discoverModels({ kind: "api", baseUrl: `${srv.url}/v1`, apiKey: "wrong" }, deps({ http: new NodeFetchHttp() }));
		expect(r).toMatchObject({ connected: false, status: "unauthorized", models: [], detail: "HTTP 401" });
		expect(parseModelList(JSON.stringify({ models: [{ name: "models/gemini-x" }] }))).toEqual(["gemini-x"]);
	});

	it("a local API URL may work without a key (it is not cloud)", async () => {
		srv.setHandler(() => ({ body: JSON.stringify({ data: [{ id: "local-m" }] }) }));
		const r = await discoverModels({ kind: "api", baseUrl: `${srv.url}/v1`, apiKey: "" }, deps({ http: new NodeFetchHttp() }));
		expect(r.models).toEqual(["local-m"]);
	});

	it("oversized or hostile lists are bounded and unsafe names are dropped", () => {
		expect(() => parseModelList("x".repeat(300000))).toThrow();
		const many = JSON.stringify({ data: Array.from({ length: 500 }, (_, i) => ({ id: `m-${i}` })) });
		expect(parseModelList(many).length).toBeLessThanOrEqual(60);
		expect(parseModelList(JSON.stringify({ data: [{ id: "--flag" }, { id: "a b" }, { id: "ok" }] }))).toEqual(["ok"]);
	});
});

// ---------------- S6: no hardcoded model lists ----------------

describe("S6 no hardcoded model lists in the source", () => {
	const SRC = resolve(__dirname, "..", "src");
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) walk(p);
			else if (p.endsWith(".ts")) files.push(p);
		}
	};
	walk(SRC);

	it("no concrete model identifiers appear in source files (only example placeholders are allowed)", () => {
		const pattern = /["'`](?:gpt-\d[\w.-]*|claude-(?:opus|sonnet|haiku|fable)-\d[\w.-]*|gemini-\d[\w.-]*|llama\d[\w.:-]*|qwen\d[\w.:-]*)["'`]/i;
		const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
		expect(offenders.map((f) => f.replace(SRC, ""))).toEqual([]);
	});

	it("removed placeholders: the model input no longer suggests specific names", () => {
		const ui = readFileSync(join(SRC, "ui", "settingsAi.ts"), "utf8");
		expect(ui).not.toMatch(/setPlaceholder\("(haiku|llama)/);
	});
});

// ---------------- S7 / S12: guards ----------------

describe("S7 Claude guards stay complete; S12 forbidden arguments", () => {
	it("Claude args still carry every safety flag and none of the forbidden ones", () => {
		const args = CLI_SPECS.claude.buildArgs({ system: "s", model: "opus" });
		expect(() => assertGuards(CLI_SPECS.claude, args)).not.toThrow();
		for (const g of CLI_SPECS.claude.requiredGuards) expect(args).toEqual(expect.arrayContaining(g));
		expect(CLI_SPECS.claude.requiredGuards).toHaveLength(7);
		for (const bad of ["--dangerously-skip-permissions", "--bare", "--add-dir", "--allowedTools"]) {
			expect(() => assertGuards(CLI_SPECS.claude, [...args, bad]), bad).toThrow(/forbidden/);
		}
	});

	it("Codex, Gemini and Antigravity are detect-only: unsupported, cannot build args, never reach the factory", () => {
		for (const tool of ["codex", "gemini", "agy"] as const) {
			expect(CLI_SPECS[tool].supported, tool).toBe(false);
			expect(CLI_SPECS[tool].reason).toMatch(/Tidak didukung/);
			expect(() => CLI_SPECS[tool].buildArgs({ system: "s", model: "" })).toThrow();
		}
		const deps2: FactoryDeps = { ...deps(), staticProvider: new StaticQuestionProvider({} as never, () => 0), http: null, canSpawn: true } as unknown as FactoryDeps;
		for (const tool of ["codex", "gemini", "agy"] as const) {
			const ai = { ...DEFAULT_SETTINGS.ai, enabled: true, providers: { ...DEFAULT_SETTINGS.ai.providers, cli: { enabled: true, approved: true, tool, model: "" } } };
			expect(buildProviders(ai, deps2), tool).toEqual([]);
		}
	});

	it("CliProvider refuses to spawn a detect-only CLI", async () => {
		const runner = new FakeRunner();
		for (const tool of ["codex", "gemini", "agy"] as const) {
			const p = new CliProvider(tool, "", { runner, findExe: exes([tool]), makeSandbox: sandbox });
			await expect(p.complete({ system: "s", user: "u" }, { signal: new AbortController().signal })).rejects.toThrow(/Tidak didukung/);
		}
		expect(runner.calls).toEqual([]);
	});

	it("S12 agy: the minimum guard set is declared and enforced; each forbidden flag is refused", () => {
		const good = ["-p", "--output-format", "json", "--disable-slash-commands", "--sandbox", "--mode", "plan", "--model", "x"];
		expect(() => assertGuards(CLI_SPECS.agy, good)).not.toThrow();
		for (const missing of ["-p", "--disable-slash-commands", "--sandbox"]) {
			expect(() => assertGuards(CLI_SPECS.agy, good.filter((a) => a !== missing)), missing).toThrow(/missing/);
		}
		expect(() => assertGuards(CLI_SPECS.agy, ["-p", "--output-format", "text", "--disable-slash-commands", "--sandbox", "--mode", "plan"])).toThrow(/output-format/);
		expect(() => assertGuards(CLI_SPECS.agy, ["-p", "--output-format", "json", "--disable-slash-commands", "--sandbox", "--mode", "auto"])).toThrow(/mode/);
		for (const bad of ["--dangerously-skip-permissions", "--continue", "-c", "--conversation", "--remote-control", "--remote-agent", "--add-dir", "--mode=auto"]) {
			expect(() => assertGuards(CLI_SPECS.agy, [...good, bad]), bad).toThrow(/forbidden/);
		}
	});

	it("S12: tool=agy and model discovery do not require any forbidden flag (discovery runs `models` only)", async () => {
		const runner = new FakeRunner({ models: { code: 0, stdout: AGY_OUTPUT, stderr: "" } });
		await discoverModels({ kind: "cli", tool: "agy" }, deps({ runner, findExe: exes(["agy"]) }));
		for (const c of runner.calls) for (const bad of CLI_SPECS.agy.forbiddenArgs) expect(c.args).not.toContain(bad);
	});
});

// ---------------- S8: manual input ----------------

describe("S8 manual model input", () => {
	it("unsafe names are rejected; safe names and empty are accepted", () => {
		for (const bad of ["--dangerously-skip-permissions", "-p", "a b", "x;y", "$(id)", "a\nb", "`x`", "x".repeat(80), "__other__"]) {
			expect(validateManualModel(bad).ok, bad).toBe(false);
		}
		for (const ok of ["", "opus", "claude-haiku-4-5", "org/model:1.5", "  padded  "]) expect(validateManualModel(ok).ok, ok).toBe(true);
		expect(validateManualModel("  padded  ")).toEqual({ ok: true, model: "padded" });
		expect(isSafeModelName("ok")).toBe(true);
	});

	it("uniqueModels removes unsafe names, duplicates and the models/ prefix", () => {
		expect(uniqueModels(["a", "--x", "a", "models/b", " c "], ["a", "d e"])).toEqual(["a", "b", "c"]);
	});
});

// ---------------- S9: migration ----------------

describe("S9 migration: models saved by 0.8.4 stay selected", () => {
	const t = makeT("en");

	it("settings saved by 0.8.4 load unchanged (no schema change)", () => {
		const old = { ai: { enabled: true, providers: { cli: { enabled: true, tool: "claude", model: "haiku", approved: true }, local: { enabled: false, kind: "ollama", model: "llama3.2:3b", baseUrl: "", approved: false }, api: { enabled: false, baseUrl: "https://x/v1", model: "my-model", apiKey: "k", approved: false } } } };
		const merged = mergeSettings(old, DEFAULT_SETTINGS).ai.providers;
		expect(merged.cli.model).toBe("haiku");
		expect(merged.local.model).toBe("llama3.2:3b");
		expect(merged.api.model).toBe("my-model");
		expect(mergeSettings({ ai: { providers: { cli: { tool: "agy" } } } }, DEFAULT_SETTINGS).ai.providers.cli.tool).toBe("agy");
		expect(mergeSettings({ ai: { providers: { cli: { tool: "nonsense" } } } }, DEFAULT_SETTINGS).ai.providers.cli.tool).toBe("claude");
	});

	it("a saved model that is not in the detected list is kept and shown as (saved); detected models still listed", () => {
		const v = buildPicker({ result: { connected: true, status: "ok", models: ["opus", "sonnet"] }, saved: "haiku", allowDefault: true, manual: false, t });
		expect(v.value).toBe("haiku");
		expect(v.options.map((o) => o.label)).toEqual(["(provider default)", "opus", "sonnet", "haiku (saved)", "Other…"]);
		expect(v.disabled).toBe(false);
	});

	it("a saved model that IS detected is simply selected; empty saved = provider default", () => {
		expect(buildPicker({ result: { connected: true, status: "ok", models: ["opus"] }, saved: "opus", allowDefault: true, manual: false, t }).value).toBe("opus");
		expect(buildPicker({ result: { connected: true, status: "ok", models: ["opus"] }, saved: "", allowDefault: true, manual: false, t }).value).toBe("");
	});
});

// ---------------- dropdown view ----------------

describe("dropdown + status line", () => {
	const t = makeT("en");

	it("no models: disabled dropdown with the right placeholder, manual field visible", () => {
		const none = buildPicker({ result: { connected: false, status: "unavailable", models: [] }, saved: "", allowDefault: true, manual: false, t });
		expect(none).toMatchObject({ disabled: true, showManual: true });
		expect(none.options[0]?.label).toBe("— No models detected —");
		const key = buildPicker({ result: { connected: false, status: "needsKey", models: [] }, saved: "", allowDefault: false, manual: false, t });
		expect(key.options[0]?.label).toBe("— No models detected (enter API key) —");
		expect(buildPicker({ result: null, saved: "", allowDefault: false, manual: false, t }).options[0]?.label).toBe("— No models detected —");
	});

	it("no models but a saved one: dropdown stays usable and keeps the saved value", () => {
		const v = buildPicker({ result: null, saved: "haiku", allowDefault: true, manual: false, t });
		expect(v).toMatchObject({ disabled: false, value: "haiku" });
	});

	it("\"Other…\" selects the manual field; agy shows names but stores ids; API has no empty default", () => {
		const r = { connected: true, status: "ok" as const, models: ["gemini-4-neon-high"], labels: { "gemini-4-neon-high": "Gemini 4 Neon (High)" } };
		const v = buildPicker({ result: r, saved: "", allowDefault: false, manual: true, t });
		expect(v).toMatchObject({ value: OTHER_VALUE, showManual: true });
		const plain = buildPicker({ result: r, saved: "", allowDefault: false, manual: false, t });
		expect(plain.options[0]).toEqual({ value: "gemini-4-neon-high", label: "Gemini 4 Neon (High)" });
		expect(plain.value).toBe("gemini-4-neon-high");
	});

	it("status text for every state, English and Indonesian", () => {
		const en = makeT("en");
		expect(statusText({ connected: true, status: "ok", models: ["a", "b"] }, en)).toBe("Connected · 2 models available");
		expect(statusText({ connected: false, status: "unavailable", models: [] }, en)).toBe("Not connected · Unavailable");
		expect(statusText({ connected: false, status: "needsKey", models: [] }, en)).toBe("Not connected · API key required");
		expect(statusText({ connected: false, status: "unauthorized", models: [] }, en)).toBe("Not connected · API key rejected");
		expect(statusText({ connected: false, status: "desktopOnly", models: [] }, en)).toBe("Not connected · Desktop only");
		expect(statusText({ connected: false, status: "error", models: [], detail: "HTTP 500" }, en)).toBe("Not connected · Error (HTTP 500)");
		expect(statusText({ connected: true, status: "ok", models: ["a"], detectOnly: true }, en)).toMatch(/Detect only/);
		expect(statusText(null, en)).toMatch(/Not checked/);
		const id = makeT("id");
		expect(statusText({ connected: true, status: "ok", models: ["a"] }, id)).toBe("Terhubung · 1 model tersedia");
		expect(statusText({ connected: false, status: "needsKey", models: [] }, id)).toBe("Tidak terhubung · Perlu kunci API");
	});

	it("discoveryTarget maps the current settings to a target", () => {
		const ai = { ...DEFAULT_SETTINGS.ai, providers: { cli: { enabled: false, tool: "agy" as const, model: "", approved: false }, local: { enabled: false, kind: "lmstudio" as const, model: "", baseUrl: "http://h:1", approved: false }, api: { enabled: false, baseUrl: "https://a/v1", model: "", apiKey: "k", approved: false } } };
		expect(discoveryTarget(ai, "cli")).toEqual({ kind: "cli", tool: "agy" });
		expect(discoveryTarget(ai, "local")).toEqual({ kind: "local", local: "lmstudio", baseUrl: "http://h:1" });
		expect(discoveryTarget(ai, "api")).toEqual({ kind: "api", baseUrl: "https://a/v1", apiKey: "k" });
	});
});

// ---------------- never throws ----------------

describe("discoverModels never throws", () => {
	it("a runner/io/http that explodes yields an error result", async () => {
		const boom = new Error("kaboom");
		const exploding: DiscoveryIo = { homeDir: () => { throw boom; }, env: () => undefined, readText: async () => { throw boom; }, fileKey: async () => { throw boom; }, scanFile: async () => { throw boom; } };
		for (const tool of ["claude", "codex", "gemini", "agy"] as const) {
			const r = await discoverModels({ kind: "cli", tool }, deps({ findExe: exes([tool]), io: exploding, runner: { run: async () => { throw boom; } } }));
			expect(r.models, tool).toEqual([]);
			expect(r.connected, tool).toBe(false);
		}
		const http = { get: async () => { throw boom; }, post: async () => { throw boom; } };
		expect(await discoverModels({ kind: "local", local: "ollama", baseUrl: "" }, deps({ http }))).toMatchObject({ connected: false, models: [] });
	});
});
