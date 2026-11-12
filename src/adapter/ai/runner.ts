/**
 * Penjalan proses untuk CLI. Aturan keamanan (Addendum §7.3):
 *  - spawn TANPA shell, argumen berupa array;
 *  - isi catatan hanya lewat stdin;
 *  - cwd disetel pemanggil (folder sementara kosong);
 *  - kill (termasuk anak proses) saat dibatalkan/timeout;
 *  - keluaran dibatasi ukurannya.
 * Modul node dimuat malas supaya plugin tetap bisa dimuat di mobile (tanpa Node).
 */

/**
 * require() Node yang BARU dipanggil saat dipakai (desktop). Sengaja bukan import()/import statis:
 * di renderer Obsidian import() tidak mengenal modul bawaan Node, dan import statis akan memecahkan pemuatan di mobile.
 */
declare const require: (id: string) => unknown;
const nodeRequire = (id: string): unknown => require(id);

export interface RunOptions {
	stdin: string;
	cwd: string;
	env?: Record<string, string | undefined>;
	signal: AbortSignal;
	maxOutputBytes?: number;
}

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface ProcessRunner {
	run(file: string, args: string[], opts: RunOptions): Promise<RunResult>;
}

const DEFAULT_MAX_OUTPUT = 256 * 1024;

export class NodeProcessRunner implements ProcessRunner {
	async run(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
		const cp = nodeRequire("child_process") as typeof import("child_process");
		return new Promise<RunResult>((resolve, reject) => {
			if (opts.signal.aborted) return reject(new Error("aborted"));
			const max = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
			let settled = false;
			let out = "";
			let err = "";
			const child = cp.spawn(file, args, {
				cwd: opts.cwd,
				env: opts.env ?? process.env,
				shell: false, // WAJIB: tanpa shell
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});

			const killTree = () => {
				try {
					if (process.platform === "win32" && child.pid) {
						// taskkill juga membunuh anak proses; tanpa shell.
						cp.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
					} else {
						child.kill("SIGKILL");
					}
				} catch {
					/* proses sudah selesai */
				}
			};
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				opts.signal.removeEventListener("abort", onAbort);
				fn();
			};
			const onAbort = () => {
				killTree();
				finish(() => reject(new Error("aborted (timeout/cancel): process killed")));
			};
			opts.signal.addEventListener("abort", onAbort, { once: true });

			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (d: string) => {
				out += d;
				if (out.length > max) {
					killTree();
					finish(() => reject(new Error("output too large: process killed")));
				}
			});
			child.stderr.on("data", (d: string) => {
				if (err.length < max) err += d;
			});
			child.on("error", (e) => finish(() => reject(e)));
			child.on("close", (code) => finish(() => resolve({ code, stdout: out, stderr: err })));
			child.stdin.on("error", () => {
				/* proses mungkin menutup stdin lebih awal */
			});
			child.stdin.end(opts.stdin, "utf8");
		});
	}
}

/** Cari file eksekusi di PATH tanpa shell. Windows: hanya .exe (shim .cmd/.bat butuh shell, jadi tidak didukung). */
export async function findExecutable(name: string, envPath: string | undefined = process.env.PATH): Promise<string | null> {
	const fs = nodeRequire("fs") as typeof import("fs");
	const path = nodeRequire("path") as typeof import("path");
	const isWin = process.platform === "win32";
	const exts = isWin ? [".exe"] : [""];
	for (const dir of (envPath ?? "").split(isWin ? ";" : ":")) {
		if (!dir) continue;
		for (const ext of exts) {
			const full = path.join(dir, name + ext);
			try {
				if (fs.statSync(full).isFile()) return full;
			} catch {
				/* lanjut */
			}
		}
	}
	return null;
}

/** Buat folder sementara KOSONG (cwd CLI) dan fungsi pembersihnya. */
export async function makeSandboxDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
	const fs = nodeRequire("fs") as typeof import("fs");
	const os = nodeRequire("os") as typeof import("os");
	const path = nodeRequire("path") as typeof import("path");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bengkel-ai-"));
	return {
		dir,
		// Setelah kill, Windows masih memegang cwd sesaat: ulangi sampai folder benar-benar hilang.
		cleanup: async () => {
			for (let i = 0; i < 30; i++) {
				try {
					fs.rmSync(dir, { recursive: true, force: true });
				} catch {
					/* terkunci; coba lagi */
				}
				if (!fs.existsSync(dir)) return;
				await new Promise((r) => setTimeout(r, 100));
			}
		},
	};
}
