import type { CliTool } from "../../domain/ai/types";

/**
 * Spesifikasi CLI langganan. Aturan Addendum §7.3: sebuah CLI hanya didukung jika ada cara TERVERIFIKASI untuk
 * (a) mode non-interaktif, (b) mematikan SEMUA tool/eksekusi, (c) tidak meminta izin. Selain itu: tidak didukung.
 */
export interface CliSpec {
	tool: CliTool;
	supported: boolean;
	/** Alasan tidak didukung (ditampilkan di pengaturan). */
	reason?: string;
	/** Nama program di PATH (tanpa ekstensi). */
	exe: string;
	versionArgs: string[];
	/** Argumen lengkap; system prompt lewat argumen, isi catatan TIDAK pernah (lewat stdin). */
	buildArgs(opts: { system: string; model: string }): string[];
	/** Ambil teks model dari stdout CLI. Lempar Error bila CLI melaporkan kesalahan. */
	parseOutput(stdout: string): string;
	/** Flag pengaman yang WAJIB ada (dicek lagi sebelum spawn). Tiap elemen = urutan argumen yang harus muncul. */
	requiredGuards: string[][];
	/** Argumen yang TIDAK BOLEH pernah muncul (melewati izin, melanjutkan sesi lama, membuka kendali jarak jauh, dst.). */
	forbiddenArgs: string[];
}

/** Nama model dibatasi agar tidak bisa menyelundupkan flag baru. */
export function isSafeModelName(model: string): boolean {
	return model === "" || /^[A-Za-z0-9][A-Za-z0-9._:\-/]{0,63}$/.test(model);
}

/**
 * Claude Code 2.1.316 — flag diverifikasi dari `claude --help` di PC ini (2026-11-12) dan diuji sungguhan:
 *  -p                      mode non-interaktif (print)
 *  --tools ""              "Use \"\" to disable all tools"
 *  --permission-mode dontAsk + --permission-prompts none   (apa pun yang akan meminta izin ditolak otomatis)
 *  --no-session-persistence  tidak menyimpan sesi ke disk
 *  --safe-mode             mematikan hooks, plugin, MCP, CLAUDE.md, skills; auth tetap jalan (langganan OAuth)
 *  --strict-mcp-config     tanpa server MCP
 *  --disable-slash-commands
 *  --output-format json    keluaran terstruktur
 * TIDAK memakai --bare: help menyatakan bare menolak OAuth/keychain (langganan tidak akan jalan).
 */
const claude: CliSpec = {
	tool: "claude",
	supported: true,
	exe: "claude",
	versionArgs: ["--version"],
	buildArgs: ({ system, model }) => {
		const args = [
			"-p",
			"--tools",
			"",
			"--permission-mode",
			"dontAsk",
			"--permission-prompts",
			"none",
			"--no-session-persistence",
			"--safe-mode",
			"--strict-mcp-config",
			"--disable-slash-commands",
			"--output-format",
			"json",
			"--system-prompt",
			system,
		];
		if (model) args.push("--model", model);
		return args;
	},
	parseOutput: (stdout) => {
		let obj: unknown;
		try {
			obj = JSON.parse(stdout.trim());
		} catch {
			throw new Error("claude: output is not JSON");
		}
		if (!obj || typeof obj !== "object") throw new Error("claude: unexpected output");
		const o = obj as Record<string, unknown>;
		// eslint-disable-next-line @typescript-eslint/no-base-to-string -- Preserve legacy CLI error formatting without exposing additional structured payload fields.
		if (o.is_error === true) throw new Error(`claude error: ${String(o.result ?? o.subtype ?? "unknown").slice(0, 200)}`);
		if (typeof o.result !== "string") throw new Error("claude: no result field");
		return o.result;
	},
	requiredGuards: [
		["-p"],
		["--tools", ""],
		["--permission-mode", "dontAsk"],
		["--permission-prompts", "none"],
		["--no-session-persistence"],
		["--safe-mode"],
		["--strict-mcp-config"],
	],
	forbiddenArgs: ["--bare", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--allowedTools", "--allowed-tools", "--add-dir", "--continue", "--resume"],
};

/**
 * Codex CLI 0.167.2 (diperiksa lewat `codex --help`, `codex exec --help`, `codex features list` di PC pengembang, 2026-11-21):
 * ada mode non-interaktif (`exec`), `--sandbox read-only`, `--ephemeral`, `--ignore-user-config`, tetapi TIDAK ADA satu
 * flag pun yang mematikan SEMUA tool. Yang tersedia hanya `--disable <fitur>` satu per satu, dan daftar fiturnya panjang dan berubah
 * antarversi (shell_tool, unified_exec, apps, browser_use, computer_use, plugins, memories, hooks, multi_agent, image_generation, ...).
 * Daftar-tolak seperti itu bukan jaminan, jadi menurut aturan §7.3 Codex hanya DIDETEKSI (model tetap tampil), tidak dijalankan.
 */
const UNSUPPORTED_CODEX =
	"Tidak didukung untuk menjalankan pertanyaan: `codex exec --help` (0.167.2) tidak punya flag yang mematikan SEMUA tool, hanya `--disable <fitur>` satu per satu yang daftarnya terus berubah (aturan keamanan §7.3). Deteksi dan daftar model tetap tampil.";

const codex: CliSpec = {
	tool: "codex",
	supported: false,
	reason: UNSUPPORTED_CODEX,
	exe: "codex",
	versionArgs: ["--version"],
	buildArgs: () => {
		throw new Error(UNSUPPORTED_CODEX);
	},
	parseOutput: () => {
		throw new Error(UNSUPPORTED_CODEX);
	},
	requiredGuards: [],
	forbiddenArgs: ["--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust", "--full-auto", "--search", "--add-dir", "resume"],
};

/** Gemini CLI tidak terpasang di PC pengembang: flag tool-off tidak bisa diverifikasi, jadi hanya dideteksi. */
const UNSUPPORTED_GEMINI =
	"Tidak didukung untuk menjalankan pertanyaan: Gemini CLI tidak terpasang di PC pengembangan, sehingga flag mode non-interaktif + mematikan semua tool tidak bisa diverifikasi lewat --help (aturan keamanan §7.3). Bila terpasang, deteksi dan daftar model tetap tampil.";

const gemini: CliSpec = {
	...codex,
	tool: "gemini",
	exe: "gemini",
	reason: UNSUPPORTED_GEMINI,
	buildArgs: () => {
		throw new Error(UNSUPPORTED_GEMINI);
	},
	parseOutput: () => {
		throw new Error(UNSUPPORTED_GEMINI);
	},
	forbiddenArgs: ["--yolo", "-y", "--approval-mode=yolo", "--all-files"],
};

/**
 * Antigravity CLI (agy 1.5.14), diperiksa lewat `agy --help` di PC pengembang (2026-11-21). Tersedia: `-p` (non-interaktif),
 * `--output-format json`, `--disable-slash-commands`, `--sandbox` ("terminal restrictions"), `--mode plan`, `--settings`.
 * TIDAK terverifikasi: cara mematikan SEMUA tool. `--sandbox` hanya membatasi terminal, `--mode plan` mengatur mode eksekusi (bukan
 * mematikan tool), dan kunci `--settings` tidak didokumentasikan di --help. Maka agy hanya DIDETEKSI (model dari `agy models`).
 * `requiredGuards` di bawah adalah syarat MINIMUM bila suatu hari tool-off terverifikasi; `forbiddenArgs` berlaku selalu.
 */
const UNSUPPORTED_AGY =
	"Tidak didukung untuk menjalankan pertanyaan: `agy --help` (1.5.14) tidak punya flag yang mematikan semua tool (`--sandbox` hanya membatasi terminal, `--mode plan` bukan tool-off, kunci `--settings` tidak terdokumentasi) (aturan keamanan §7.3). Deteksi dan daftar model (`agy models`) tetap tampil.";

const agy: CliSpec = {
	tool: "agy",
	supported: false,
	reason: UNSUPPORTED_AGY,
	exe: "agy",
	versionArgs: ["--version"],
	buildArgs: () => {
		throw new Error(UNSUPPORTED_AGY);
	},
	parseOutput: () => {
		throw new Error(UNSUPPORTED_AGY);
	},
	requiredGuards: [["-p"], ["--output-format", "json"], ["--disable-slash-commands"], ["--sandbox"], ["--mode", "plan"]],
	forbiddenArgs: ["--dangerously-skip-permissions", "--continue", "-c", "--conversation", "--remote-control", "--remote-agent", "--mode=auto", "--add-dir"],
};

export const CLI_SPECS: Record<CliTool, CliSpec> = { claude, codex, gemini, agy };

/** Pastikan semua flag pengaman ada DAN tidak ada argumen terlarang (pertahanan berlapis; gagal = jangan spawn). */
export function assertGuards(spec: CliSpec, args: string[]): void {
	for (const bad of spec.forbiddenArgs) {
		if (args.includes(bad)) throw new Error(`forbidden argument: ${bad}`);
	}
	for (const guard of spec.requiredGuards) {
		const i = args.indexOf(guard[0] as string);
		const ok = i !== -1 && guard.every((g, k) => args[i + k] === g);
		if (!ok) throw new Error(`safety flag missing: ${guard.join(" ")}`);
	}
}
