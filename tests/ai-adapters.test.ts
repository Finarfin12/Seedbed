import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertGuards, CLI_SPECS, isSafeModelName } from "../src/adapter/ai/cliSpecs";
import { detectProviders } from "../src/adapter/ai/detector";
import { buildProviders, createQuestionService } from "../src/adapter/ai/factory";
import type { FactoryDeps } from "../src/adapter/ai/factory";
import { isLocalUrl, joinUrl } from "../src/adapter/ai/http";
import { ApiProvider, CliProvider, LocalHttpProvider } from "../src/adapter/ai/providers";
import type { CliDeps } from "../src/adapter/ai/providers";
import { findExecutable, makeSandboxDir, NodeProcessRunner } from "../src/adapter/ai/runner";
import type { ProcessRunner, RunOptions } from "../src/adapter/ai/runner";
import { ProviderChain } from "../src/domain/ai/chain";
import { parseSingleQuestion } from "../src/domain/ai/outputValidator";
import { QuestionService } from "../src/domain/ai/questionService";
import type { Prompt } from "../src/domain/ai/types";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import bankEn from "../src/domain/questions/bank.en.json";
import bankId from "../src/domain/questions/bank.id.json";
import { StaticQuestionProvider } from "../src/domain/questions/staticProvider";
import type { Banks } from "../src/domain/questions/staticProvider";
import { CountingHttp, CountingRunner, NodeFetchHttp, startMockServer } from "./helpers/fakes";
import type { MockServer } from "./helpers/fakes";

const FAKE = resolve(__dirname, "helpers", "fake-claude.mjs");
const banks: Banks = { id: bankId as Banks["id"], en: bankEn as Banks["en"] };
const staticP = () => new StaticQuestionProvider(banks, () => 0);
const prompt: Prompt = { system: "SYSTEM RULES", user: "catatan pengguna" };
const okQ = '{"question":"Apa asumsimu?","category":"asumsi"}';

/** Menjalankan skrip claude tiruan lewat runner nyata (spawn tanpa shell), dengan env FAKE_*. */
class MappedRunner implements ProcessRunner {
	count = 0;
	constructor(private env: Record<string, string> = {}) {}
	async run(_file: string, args: string[], opts: RunOptions) {
		this.count++;
		return new NodeProcessRunner().run(process.execPath, [FAKE, ...args], { ...opts, env: { ...process.env, ...this.env } });
	}
}
const cliDeps = (runner: ProcessRunner): CliDeps => ({ runner, findExe: async () => "C:\\fake\\claude.exe", makeSandbox: makeSandboxDir });

async function waitDead(pid: number, ms = 5000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		try {
			process.kill(pid, 0);
		} catch {
			return true;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return false;
}

describe("NodeProcessRunner (keamanan §7.3)", () => {
	it("passes stdin, runs without a shell (metacharacters stay literal), honours cwd", async () => {
		const dir = mkdtempSync(join(tmpdir(), "bengkel-t-"));
		const canary = join(dir, "CANARY");
		const evil = [`& echo pwned > "${canary}"`, `; touch ${canary}`, "$(whoami)", "`id`", "|calc", ">out.txt"];
		const r = await new NodeProcessRunner().run(
			process.execPath,
			["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),s})))", ...evil],
			{ stdin: "isi catatan\nbaris dua", cwd: dir, signal: new AbortController().signal },
		);
		const out = JSON.parse(r.stdout.trim());
		expect(r.code).toBe(0);
		expect(out.args).toEqual(evil); // argumen utuh, tidak ditafsirkan shell
		expect(out.s).toBe("isi catatan\nbaris dua");
		expect(realpathSync(out.cwd)).toBe(realpathSync(dir)); // lintas OS
		expect(existsSync(canary)).toBe(false);
		expect(existsSync(join(dir, "out.txt"))).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});
	it("kills the process on abort (timeout) and rejects", async () => {
		const pidFile = join(mkdtempSync(join(tmpdir(), "bengkel-t-")), "pid");
		const ac = new AbortController();
		const p = new NodeProcessRunner().run(process.execPath, [FAKE], { stdin: "x", cwd: tmpdir(), signal: ac.signal, env: { ...process.env, FAKE_MODE: "sleep", FAKE_PIDFILE: pidFile } });
		await new Promise((r) => setTimeout(r, 800));
		const pid = Number(readFileSync(pidFile, "utf8"));
		expect(pid).toBeGreaterThan(0);
		ac.abort();
		await expect(p).rejects.toThrow(/killed/);
		expect(await waitDead(pid)).toBe(true);
	});
	it("an already-aborted signal never spawns", async () => {
		const ac = new AbortController();
		ac.abort();
		await expect(new NodeProcessRunner().run(process.execPath, ["-e", "1"], { stdin: "", cwd: tmpdir(), signal: ac.signal })).rejects.toThrow(/aborted/);
	});
	it("kills a process that floods stdout beyond the limit", async () => {
		const pidFile = join(mkdtempSync(join(tmpdir(), "bengkel-t-")), "pid");
		const p = new NodeProcessRunner().run(process.execPath, [FAKE], {
			stdin: "x",
			cwd: tmpdir(),
			signal: new AbortController().signal,
			maxOutputBytes: 200_000,
			env: { ...process.env, FAKE_MODE: "flood", FAKE_PIDFILE: pidFile },
		});
		await expect(p).rejects.toThrow(/too large/);
		expect(await waitDead(Number(readFileSync(pidFile, "utf8")))).toBe(true);
	});
	it("spawn error (missing program) rejects instead of hanging", async () => {
		await expect(new NodeProcessRunner().run("definitely-not-a-program-xyz", [], { stdin: "", cwd: tmpdir(), signal: new AbortController().signal })).rejects.toThrow();
	});
	it("findExecutable resolves .exe on PATH, ignores missing programs and .cmd shims (need a shell)", async () => {
		expect(await findExecutable("node")).toBeTruthy();
		expect(await findExecutable("definitely-not-a-program-xyz")).toBeNull();
		if (process.platform === "win32") {
			const d = mkdtempSync(join(tmpdir(), "bengkel-t-"));
			writeFileSync(join(d, "shimtool.cmd"), "@echo hi");
			expect(await findExecutable("shimtool", d)).toBeNull();
			writeFileSync(join(d, "realtool.exe"), "");
			expect(await findExecutable("realtool", d)).toBe(join(d, "realtool.exe"));
		}
	});
	it("makeSandboxDir creates an EMPTY temp dir and removes it", async () => {
		const s = await makeSandboxDir();
		expect(existsSync(s.dir)).toBe(true);
		expect(realpathSync(s.dir).toLowerCase().startsWith(realpathSync(tmpdir()).toLowerCase())).toBe(true);
		const { readdirSync } = await import("node:fs");
		expect(readdirSync(s.dir)).toEqual([]);
		await s.cleanup();
		expect(existsSync(s.dir)).toBe(false);
	});
});

describe("CLI specs: only verified CLIs are supported", () => {
	it("claude is supported with every guard flag; codex/gemini are NOT supported with a reason", () => {
		expect(CLI_SPECS.claude.supported).toBe(true);
		for (const t of ["codex", "gemini"] as const) {
			expect(CLI_SPECS[t].supported).toBe(false);
			expect(CLI_SPECS[t].reason).toMatch(/Tidak didukung/);
			expect(() => CLI_SPECS[t].buildArgs({ system: "s", model: "" })).toThrow();
		}
	});
	it("claude args: no-tools / no-permission / no-persistence / safe-mode flags, no --bare, no skip-permissions", () => {
		const args = CLI_SPECS.claude.buildArgs({ system: "SYS", model: "haiku" });
		const at = (f: string) => args[args.indexOf(f) + 1];
		expect(args[0]).toBe("-p");
		expect(args.indexOf("--tools")).toBeGreaterThan(-1);
		expect(at("--tools")).toBe(""); // "" = matikan semua tool
		expect(at("--permission-mode")).toBe("dontAsk");
		expect(at("--permission-prompts")).toBe("none");
		expect(args).toContain("--no-session-persistence");
		expect(args).toContain("--safe-mode");
		expect(args).toContain("--strict-mcp-config");
		expect(args).toContain("--disable-slash-commands");
		expect(at("--output-format")).toBe("json");
		expect(at("--system-prompt")).toBe("SYS");
		expect(at("--model")).toBe("haiku");
		for (const banned of ["--bare", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--permission-mode=bypassPermissions", "--allowedTools", "--allowed-tools", "--add-dir"]) {
			expect(args).not.toContain(banned);
		}
		expect(args).not.toContain("bypassPermissions");
		assertGuards(CLI_SPECS.claude, args);
	});
	it("assertGuards refuses tampered argument lists", () => {
		const good = CLI_SPECS.claude.buildArgs({ system: "s", model: "" });
		expect(() => assertGuards(CLI_SPECS.claude, good.filter((a) => a !== "--safe-mode"))).toThrow(/safe-mode/);
		const noTools = [...good];
		noTools.splice(noTools.indexOf("--tools"), 2);
		expect(() => assertGuards(CLI_SPECS.claude, noTools)).toThrow(/--tools/);
		const wrongTools = [...good];
		wrongTools[wrongTools.indexOf("--tools") + 1] = "Bash";
		expect(() => assertGuards(CLI_SPECS.claude, wrongTools)).toThrow(/--tools/);
		const wrongMode = [...good];
		wrongMode[wrongMode.indexOf("--permission-mode") + 1] = "bypassPermissions";
		expect(() => assertGuards(CLI_SPECS.claude, wrongMode)).toThrow(/permission-mode/);
	});
	it("model names cannot smuggle flags", () => {
		for (const ok of ["", "haiku", "sonnet", "claude-haiku-4-5", "gpt-4o-mini", "llama3.2:3b", "org/model-1"]) expect(isSafeModelName(ok), ok).toBe(true);
		for (const bad of ["--dangerously-skip-permissions", "-p", "a b", "x;y", "$(id)", "a\nb", "`x`", "x".repeat(80)]) expect(isSafeModelName(bad), bad).toBe(false);
	});
	it("parseOutput: result field, is_error, non-JSON", () => {
		expect(CLI_SPECS.claude.parseOutput('{"type":"result","is_error":false,"result":"abc"}')).toBe("abc");
		expect(() => CLI_SPECS.claude.parseOutput('{"is_error":true,"result":"Invalid API key"}')).toThrow(/Invalid API key/);
		expect(() => CLI_SPECS.claude.parseOutput("oops")).toThrow(/not JSON/);
		expect(() => CLI_SPECS.claude.parseOutput('{"x":1}')).toThrow(/no result/);
	});
});

describe("CliProvider (claude tiruan, runner nyata)", () => {
	it("returns the model text; note goes ONLY via stdin; cwd = empty temp dir removed afterwards", async () => {
		const note = 'Catatan: "; rm -rf / & powershell -c calc  $(id) `x`';
		const runner = new MappedRunner({ FAKE_MODE: "echo" });
		const p = new CliProvider("claude", "haiku", cliDeps(runner));
		const raw = await p.complete({ system: "SYSTEM RULES", user: note }, { signal: new AbortController().signal });
		const echoed = JSON.parse(raw);
		expect(echoed.stdin).toBe(note);
		expect(echoed.argv.join(" ")).not.toContain("rm -rf");
		expect(echoed.argv.join(" ")).not.toContain(note);
		expect(echoed.argv).toContain("--safe-mode");
		expect(echoed.argv[echoed.argv.indexOf("--tools") + 1]).toBe("");
		expect(echoed.argv[echoed.argv.indexOf("--system-prompt") + 1]).toBe("SYSTEM RULES");
		expect(echoed.cwdEntries).toEqual([]); // folder kosong
		expect(echoed.cwd.toLowerCase()).toContain("bengkel-ai-");
		expect(echoed.cwd.toLowerCase()).not.toContain("test-vault");
		expect(existsSync(echoed.cwd)).toBe(false); // dihapus setelah selesai
		expect(p.label).toEqual({ kind: "ai-cloud", name: "claude cli" });
	});
	it("sandbox is removed even when the process fails or times out", async () => {
		const seen: string[] = [];
		const spy: CliDeps = { ...cliDeps(new MappedRunner({ FAKE_MODE: "fail" })), makeSandbox: async () => { const s = await makeSandboxDir(); seen.push(s.dir); return s; } };
		await expect(new CliProvider("claude", "", spy).complete(prompt, { signal: new AbortController().signal })).rejects.toThrow(/exit 3/);
		const spy2: CliDeps = { ...cliDeps(new MappedRunner({ FAKE_MODE: "sleep" })), makeSandbox: spy.makeSandbox };
		const ac = new AbortController();
		const pr = new CliProvider("claude", "", spy2).complete(prompt, { signal: ac.signal });
		setTimeout(() => ac.abort(), 500);
		await expect(pr).rejects.toThrow(/killed/);
		expect(seen).toHaveLength(2);
		for (const d of seen) expect(existsSync(d)).toBe(false);
	});
	it("chain + CLI: timeout kills the process and falls back to the next provider/bank", async () => {
		const pidFile = join(mkdtempSync(join(tmpdir(), "bengkel-t-")), "pid");
		const runner = new MappedRunner({ FAKE_MODE: "sleep", FAKE_PIDFILE: pidFile });
		const chain = new ProviderChain([new CliProvider("claude", "", cliDeps(runner))], 700);
		const svc = new QuestionService(staticP(), chain, { maxContextChars: 4000 });
		const t0 = Date.now();
		const q = await svc.next("socratic", "asumsi", { language: "id", noteText: "n" }, []);
		expect(Date.now() - t0).toBeLessThan(5000);
		expect(q.source).toEqual({ kind: "bank" });
		expect(svc.lastAttempts[0]?.error).toMatch(/timeout/);
		expect(await waitDead(Number(readFileSync(pidFile, "utf8")))).toBe(true);
	});
	it("bad CLI behaviour (error exit, non-JSON, is_error, explanation) => bank fallback, never throws to the UI", async () => {
		for (const mode of ["fail", "badjson", "iserror", "explain"]) {
			const chain = new ProviderChain([new CliProvider("claude", "", cliDeps(new MappedRunner({ FAKE_MODE: mode })))], 3000);
			const svc = new QuestionService(staticP(), chain, { maxContextChars: 4000 });
			const q = await svc.next("socratic", "asumsi", { language: "id", noteText: "n" }, []);
			expect(q.source, mode).toEqual({ kind: "bank" });
			expect(svc.lastAttempts[0]?.ok, mode).toBe(false);
		}
	});
	it("happy path: valid question from the CLI gets the cloud label", async () => {
		const chain = new ProviderChain([new CliProvider("claude", "", cliDeps(new MappedRunner({ FAKE_MODE: "ok" })))], 3000);
		const q = await new QuestionService(staticP(), chain, { maxContextChars: 4000 }).next("socratic", "asumsi", { language: "id", noteText: "n" }, []);
		expect(q.text).toBe("Apa asumsimu?");
		expect(q.source).toEqual({ kind: "ai-cloud", name: "claude cli" });
	});
	it("unsupported tools and bad model names never spawn anything", async () => {
		const runner = new CountingRunner();
		for (const tool of ["codex", "gemini"] as const) {
			await expect(new CliProvider(tool, "", cliDeps(runner)).complete(prompt, { signal: new AbortController().signal })).rejects.toThrow(/Tidak didukung/);
		}
		await expect(new CliProvider("claude", "--dangerously-skip-permissions", cliDeps(runner)).complete(prompt, { signal: new AbortController().signal })).rejects.toThrow(/invalid model/);
		expect(runner.count).toBe(0);
	});
	it("missing executable => clear error, no spawn", async () => {
		const runner = new CountingRunner();
		const p = new CliProvider("claude", "", { ...cliDeps(runner), findExe: async () => null });
		await expect(p.complete(prompt, { signal: new AbortController().signal })).rejects.toThrow(/not found in PATH/);
		expect(runner.count).toBe(0);
	});
});

describe("Local & API providers vs. mock server (no real network)", () => {
	let srv: MockServer;
	beforeAll(async () => {
		srv = await startMockServer();
	});
	afterAll(async () => {
		await srv.close();
	});
	const http = new NodeFetchHttp();

	it("Ollama: POST /api/chat with model, system+user messages, stream:false, format:json; label = local", async () => {
		srv.requests.length = 0;
		srv.setHandler(() => ({ body: JSON.stringify({ message: { role: "assistant", content: okQ } }) }));
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "llama3.2:3b", baseUrl: srv.url, approved: true }, http);
		const raw = await p.complete(prompt);
		expect(parseSingleQuestion(raw)).toBe("Apa asumsimu?");
		const sent = JSON.parse(srv.requests.find((r) => r.method === "POST")?.body ?? "{}");
		expect(srv.requests.map((r) => `${r.method} ${r.url}`)).toEqual(["GET /api/tags", "POST /api/chat"]); // probe dulu, baru kirim catatan
		expect(sent).toMatchObject({ model: "llama3.2:3b", stream: false, format: "json" });
		expect(sent.messages).toEqual([
			{ role: "system", content: "SYSTEM RULES" },
			{ role: "user", content: "catatan pengguna" },
		]);
		expect(p.label).toEqual({ kind: "ai-local", name: "ollama" });
	});
	it("Ollama without a model fails before any request", async () => {
		srv.requests.length = 0;
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "", baseUrl: srv.url, approved: true }, http);
		await expect(p.complete(prompt)).rejects.toThrow(/model not set/);
		expect(srv.requests).toHaveLength(0);
	});
	it("LM Studio: OpenAI-style /v1/chat/completions", async () => {
		srv.requests.length = 0;
		srv.setHandler(() => ({ body: JSON.stringify({ choices: [{ message: { content: okQ } }] }) }));
		const p = new LocalHttpProvider({ enabled: true, kind: "lmstudio", model: "", baseUrl: srv.url, approved: true }, http);
		expect(parseSingleQuestion(await p.complete(prompt))).toBe("Apa asumsimu?");
		expect(srv.requests.map((r) => `${r.method} ${r.url}`)).toEqual(["GET /v1/models", "POST /v1/chat/completions"]);
		expect(JSON.parse(srv.requests.find((r) => r.method === "POST")?.body ?? "{}").model).toBe("local-model");
	});
	it("local provider errors: HTTP 500, invalid JSON, missing content", async () => {
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: srv.url, approved: true }, http);
		srv.setHandler(() => ({ status: 500, body: "boom" }));
		await expect(p.complete(prompt)).rejects.toThrow(/HTTP 500/);
		srv.setHandler(() => ({ body: "not json" }));
		await expect(p.complete(prompt)).rejects.toThrow(/not JSON/);
		srv.setHandler(() => ({ body: "{}" }));
		await expect(p.complete(prompt)).rejects.toThrow(/no message content/);
	});
	it("API: Bearer key sent to the configured endpoint; key never appears in output, errors, or attempts", async () => {
		const key = "sk-test-SECRETKEY-1234567890";
		srv.requests.length = 0;
		srv.setHandler(() => ({ body: JSON.stringify({ choices: [{ message: { content: okQ } }] }) }));
		const cfg = { enabled: true, baseUrl: `${srv.url}/v1`, model: "gpt-test", apiKey: key, approved: true };
		const p = new ApiProvider(cfg, http);
		expect(parseSingleQuestion(await p.complete(prompt))).toBe("Apa asumsimu?");
		expect(srv.requests.at(-1)?.url).toBe("/v1/chat/completions");
		expect(srv.requests.at(-1)?.headers.authorization).toBe(`Bearer ${key}`);
		expect(srv.requests.at(-1)?.body).not.toContain(key);
		expect(p.label.kind).toBe("ai-local"); // 127.0.0.1 = lokal

		srv.setHandler(() => ({ status: 401, body: JSON.stringify({ error: `bad key ${key}` }) }));
		const chain = new ProviderChain([p], 2000, [key]);
		const svc = new QuestionService(staticP(), chain, { maxContextChars: 4000 });
		const q = await svc.next("socratic", "asumsi", { language: "id", noteText: "n" }, []);
		expect(q.source).toEqual({ kind: "bank" });
		expect(JSON.stringify([q, svc.lastAttempts])).not.toContain(key);
		expect(svc.lastAttempts[0]?.error).toMatch(/HTTP 401/);
	});
	it("API with a remote host is labelled cloud; missing base URL / model fail before any request", async () => {
		const cloud = new ApiProvider({ enabled: true, baseUrl: "https://api.example.com/v1", model: "m", apiKey: "k", approved: true }, new CountingHttp());
		expect(cloud.label).toEqual({ kind: "ai-cloud", name: "api.example.com" });
		const counting = new CountingHttp();
		await expect(new ApiProvider({ enabled: true, baseUrl: "", model: "m", apiKey: "", approved: true }, counting).complete(prompt)).rejects.toThrow(/base URL/);
		await expect(new ApiProvider({ enabled: true, baseUrl: "http://x", model: "", apiKey: "", approved: true }, counting).complete(prompt)).rejects.toThrow(/model/);
		expect(counting.count).toBe(0);
	});
	it("fallback to the bank: server hangs (timeout), returns garbage, returns an explanation", async () => {
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: srv.url, approved: true }, http);
		const svc = new QuestionService(staticP(), new ProviderChain([p], 150), { maxContextChars: 4000 });
		const ctx = { language: "id" as const, noteText: "n" };
		srv.setHandler(() => ({ body: JSON.stringify({ message: { content: okQ } }), delayMs: 800 }));
		expect((await svc.next("socratic", "asumsi", ctx, [])).source).toEqual({ kind: "bank" });
		expect(svc.lastAttempts[0]?.error).toMatch(/timeout/);
		srv.setHandler(() => ({ body: JSON.stringify({ message: { content: "Maaf, saya tidak bisa." } }) }));
		expect((await svc.next("socratic", "asumsi", ctx, [])).source).toEqual({ kind: "bank" });
		srv.setHandler(() => ({ body: JSON.stringify({ message: { content: '{"question":"Cache menyimpan data supaya cepat.","category":"asumsi"}' } }) }));
		expect((await svc.next("socratic", "asumsi", ctx, [])).source).toEqual({ kind: "bank" });
	});
	it("fallback when the server is down (connection refused)", async () => {
		const dead = await startMockServer();
		const url = dead.url;
		await dead.close();
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: url, approved: true }, http);
		const svc = new QuestionService(staticP(), new ProviderChain([p], 2000), { maxContextChars: 4000 });
		const q = await svc.next("socratic", "asumsi", { language: "id", noteText: "n" }, []);
		expect(q.source).toEqual({ kind: "bank" });
		expect(svc.lastAttempts[0]?.ok).toBe(false);
		expect(svc.lastAttempts[0]?.error).toMatch(/not reachable/);
	});
	it("local server that never answers fails fast at the probe (not after the full timeout), without sending the note", async () => {
		srv.requests.length = 0;
		srv.setHandler(() => ({ body: "{}", delayMs: 1500 }));
		const p = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: srv.url, approved: true }, http, 100);
		const svc = new QuestionService(staticP(), new ProviderChain([p], 20_000), { maxContextChars: 4000 });
		const t0 = Date.now();
		const q = await svc.next("socratic", "asumsi", { language: "id", noteText: "RAHASIA" }, []);
		expect(Date.now() - t0).toBeLessThan(1200);
		expect(q.source).toEqual({ kind: "bank" });
		expect(svc.lastAttempts[0]?.error).toMatch(/not reachable/);
		expect(srv.requests.every((r) => r.method === "GET")).toBe(true); // isi catatan tidak pernah dikirim
		expect(srv.requests.some((r) => r.body.includes("RAHASIA"))).toBe(false);
	});
	it("chain order: first provider down => second (mock) answers; devil batch via one request", async () => {
		const dead = await startMockServer();
		const deadUrl = dead.url;
		await dead.close();
		srv.requests.length = 0;
		const cats = ["asumsi", "kebalikan", "bukti", "lawan", "kegagalan"];
		srv.setHandler(() => ({ body: JSON.stringify({ message: { content: JSON.stringify({ questions: cats.map((c) => ({ category: c, question: `Apa ${c} ide ini?` })) }) } }) }));
		const a = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: deadUrl, approved: true }, http);
		const b = new LocalHttpProvider({ enabled: true, kind: "ollama", model: "m", baseUrl: srv.url, approved: true }, http);
		const svc = new QuestionService(staticP(), new ProviderChain([a, b], 2000), { maxContextChars: 4000 });
		const out = await svc.batch("devil", { language: "id", noteText: "ide" });
		expect(out.every((q) => q.source?.kind === "ai-local")).toBe(true);
		expect(srv.requests.filter((r) => r.method === "POST")).toHaveLength(1); // satu panggilan untuk 5 pertanyaan
		expect(svc.lastAttempts.map((x) => x.ok)).toEqual([false, true]);
	});
	it("detector: finds Ollama/LM Studio models on the mock, reports 'missing' when nothing listens", async () => {
		srv.setHandler((r) => (r.url === "/api/tags" ? { body: JSON.stringify({ models: [{ name: "llama3.2:3b" }, { name: "qwen2.5:7b" }] }) } : { body: JSON.stringify({ data: [{ id: "lm-model" }] }) }));
		const runner = new CountingRunner();
		const d = await detectProviders({ ...cliDeps(runner), findExe: async () => null }, http, { canSpawn: true, localBase: { ollama: srv.url, lmstudio: srv.url } });
		expect(d.local.find((x) => x.kind === "ollama")).toMatchObject({ status: "available", models: ["llama3.2:3b", "qwen2.5:7b"] });
		expect(d.local.find((x) => x.kind === "lmstudio")).toMatchObject({ status: "available", models: ["lm-model"] });
		expect(d.cli.every((c) => c.status === "missing")).toBe(true);
		expect(runner.count).toBe(0);
		const dead = await startMockServer();
		const deadUrl = dead.url;
		await dead.close();
		const d2 = await detectProviders({ ...cliDeps(runner), findExe: async () => null }, http, { canSpawn: true, timeoutMs: 1500, localBase: { ollama: deadUrl, lmstudio: deadUrl } });
		expect(d2.local.every((x) => x.status === "missing")).toBe(true);
	});
	it("detector: CLI found => runs ONLY `--version`; unsupported CLIs are reported and never executed; mobile => none", async () => {
		const runner = new MappedRunner({ FAKE_MODE: "echo" });
		const calls: string[][] = [];
		const spy: ProcessRunner = { run: async (f, a, o) => (calls.push(a), runner.run(f, a, o)) };
		const d = await detectProviders({ ...cliDeps(spy), findExe: async (n) => `C:\\x\\${n}.exe` }, null, { canSpawn: true });
		expect(calls).toEqual([["--version"]]); // hanya claude, hanya --version
		expect(d.cli.find((c) => c.tool === "claude")?.status).not.toBe("unsupported");
		expect(d.cli.find((c) => c.tool === "codex")?.status).toBe("unsupported");
		expect(d.cli.find((c) => c.tool === "gemini")?.status).toBe("unsupported");
		const none = new CountingRunner();
		const m = await detectProviders({ ...cliDeps(none), findExe: async () => "x" }, null, { canSpawn: false });
		expect(none.count).toBe(0);
		expect(m.cli.every((c) => c.status === "unsupported")).toBe(true);
	});
	it("http helpers", () => {
		expect(joinUrl("http://a/", "/b")).toBe("http://a/b");
		expect(joinUrl("http://a/v1", "chat/completions")).toBe("http://a/v1/chat/completions");
		expect(isLocalUrl("http://localhost:1234/v1")).toBe(true);
		expect(isLocalUrl("http://127.0.0.1:11434")).toBe(true);
		expect(isLocalUrl("https://api.openai.com/v1")).toBe(false);
		expect(isLocalUrl("garbage")).toBe(false);
	});
});

describe("AI OFF = 0 network requests and 0 processes (NF-1)", () => {
	const mkDeps = (http: CountingHttp, runner: CountingRunner): FactoryDeps => ({
		http,
		runner,
		findExe: async () => "C:\\x\\claude.exe",
		makeSandbox: makeSandboxDir,
		canSpawn: true,
		staticProvider: staticP(),
	});
	const ctx = { language: "id" as const, noteText: "catatan" };
	const exercise = async (svc: QuestionService) => {
		await svc.batch("devil", ctx);
		await svc.batch("socratic", ctx);
		await svc.next("socratic", "asumsi", ctx, [{ category: "klarifikasi", question: "q?", answer: "a" }]);
		await svc.hint("q?", 1, ctx);
	};

	it("default settings: nothing is touched", async () => {
		const http = new CountingHttp();
		const runner = new CountingRunner();
		const svc = createQuestionService(DEFAULT_SETTINGS, mkDeps(http, runner));
		expect(svc.aiAvailable).toBe(false);
		await exercise(svc);
		expect(http.count).toBe(0);
		expect(runner.count).toBe(0);
	});
	it("master switch off, even with providers enabled+approved => nothing is touched", async () => {
		const s = mergeSettings({ ai: { enabled: false, providers: { cli: { enabled: true, approved: true }, local: { enabled: true, approved: true, model: "m" }, api: { enabled: true, approved: true, baseUrl: "http://x", model: "m", apiKey: "k" } } } });
		expect(buildProviders(s.ai, mkDeps(new CountingHttp(), new CountingRunner()))).toEqual([]);
		const http = new CountingHttp();
		const runner = new CountingRunner();
		await exercise(createQuestionService(s, mkDeps(http, runner)));
		expect(http.count + runner.count).toBe(0);
	});
	it("AI on but no provider approved/enabled => nothing is touched", async () => {
		const s = mergeSettings({ ai: { enabled: true, providers: { cli: { enabled: true }, local: { approved: true }, api: { enabled: true, approved: false, baseUrl: "http://x", model: "m" } } } });
		const http = new CountingHttp();
		const runner = new CountingRunner();
		const svc = createQuestionService(s, mkDeps(http, runner));
		expect(svc.aiAvailable).toBe(false);
		await exercise(svc);
		expect(http.count + runner.count).toBe(0);
	});
	it("real http client + mock server: AI off => the server receives 0 requests", async () => {
		const srv = await startMockServer();
		const s = mergeSettings({ ai: { enabled: false, providers: { local: { enabled: true, approved: true, model: "m", baseUrl: srv.url } } } });
		await exercise(createQuestionService(s, { ...mkDeps(new CountingHttp(), new CountingRunner()), http: new NodeFetchHttp() }));
		expect(srv.requests).toHaveLength(0);
		await srv.close();
	});
	it("control: when enabled+approved the same code DOES make requests (probe + one POST per call)", async () => {
		const http = new CountingHttp();
		const s = mergeSettings({ ai: { enabled: true, providers: { local: { enabled: true, approved: true, kind: "ollama", model: "m" } } } });
		const svc = createQuestionService(s, mkDeps(http, new CountingRunner()));
		expect(svc.aiAvailable).toBe(true);
		await svc.next("socratic", "asumsi", ctx, []);
		expect(http.count).toBe(2); // 1 probe ringan (GET) + 1 permintaan (POST)
	});
	it("buildProviders respects order, skips unsupported CLI (codex), skips CLI on mobile", () => {
		const base = { enabled: true, providers: { cli: { enabled: true, approved: true, tool: "claude" }, local: { enabled: true, approved: true, model: "m" }, api: { enabled: true, approved: true, baseUrl: "http://x/v1", model: "m" } } };
		const d = mkDeps(new CountingHttp(), new CountingRunner());
		expect(buildProviders(mergeSettings({ ai: { ...base, order: ["api", "local", "cli"] } }).ai, d).map((p) => p.id)).toEqual(["api", "local", "cli"]);
		expect(buildProviders(mergeSettings({ ai: base }).ai, d).map((p) => p.id)).toEqual(["cli", "local", "api"]);
		const codex = { ...base, providers: { ...base.providers, cli: { enabled: true, approved: true, tool: "codex" } } };
		expect(buildProviders(mergeSettings({ ai: codex }).ai, d).map((p) => p.id)).toEqual(["local", "api"]);
		expect(buildProviders(mergeSettings({ ai: base }).ai, { ...d, canSpawn: false }).map((p) => p.id)).toEqual(["local", "api"]);
	});
});

// pastikan helper dipakai (hindari peringatan unused saat refactor)
void mkdirSync;
