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
}

/** Nama model dibatasi agar tidak bisa menyelundupkan flag baru. */
export function isSafeModelName(model: string): boolean {
	return model === "" || /^[A-Za-z0-9][A-Za-z0-9._:\-\/]{0,63}$/.test(model);
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
};

const UNVERIFIED =
	"Tidak didukung: CLI ini tidak terpasang di PC pengembangan, sehingga flag mode non-interaktif + mematikan semua tool tidak bisa diverifikasi lewat --help/uji sungguhan (aturan keamanan §7.3).";

const codex: CliSpec = {
	tool: "codex",
	supported: false,
	reason: UNVERIFIED,
	exe: "codex",
	versionArgs: ["--version"],
	buildArgs: () => {
		throw new Error(UNVERIFIED);
	},
	parseOutput: () => {
		throw new Error(UNVERIFIED);
	},
	requiredGuards: [],
};

const gemini: CliSpec = { ...codex, tool: "gemini", exe: "gemini" };

export const CLI_SPECS: Record<CliTool, CliSpec> = { claude, codex, gemini };

/** Pastikan semua flag pengaman ada (pertahanan berlapis; gagal = jangan spawn). */
export function assertGuards(spec: CliSpec, args: string[]): void {
	for (const guard of spec.requiredGuards) {
		const i = args.indexOf(guard[0] as string);
		const ok = i !== -1 && guard.every((g, k) => args[i + k] === g);
		if (!ok) throw new Error(`safety flag missing: ${guard.join(" ")}`);
	}
}
