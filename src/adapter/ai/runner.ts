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

/*
 * Tipe Node minimal, ditulis sendiri. Review bot Obsidian memeriksa `src/` TANPA @types/node: modul Node dan `process`
 * menjadi tipe error dan memicu peringatan no-unsafe-*. Dengan tipe lokal ini hasil lint sama di mesin pengembang dan di bot.
 */
interface Readable {
	setEncoding(enc: "utf8"): void;
	on(event: "data", cb: (chunk: string) => void): void;
}
interface Writable {
	on(event: "error", cb: () => void): void;
	end(data: string, enc: "utf8"): void;
}
interface ChildLike {
	pid?: number;
	stdout: Readable;
	stderr: Readable;
	stdin: Writable;
	kill(signal: string): void;
	on(event: "error", cb: (e: Error) => void): void;
	on(event: "close", cb: (code: number | null) => void): void;
}
interface ChildProcessModule {
	spawn(
		file: string,
		args: string[],
		opts: { cwd?: string; env?: Record<string, string | undefined>; shell: false; windowsHide: boolean; stdio: string | string[] },
	): ChildLike;
}
interface Stats {
	isFile(): boolean;
	size: number;
	mtimeMs: number;
}
interface FileHandle {
	read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
	close(): Promise<void>;
}
interface FsModule {
	statSync(p: string): Stats;
	mkdtempSync(prefix: string): string;
	rmSync(p: string, opts: { recursive: boolean; force: boolean }): void;
	existsSync(p: string): boolean;
	promises: {
		stat(p: string): Promise<Stats>;
		readFile(p: string, opts: { encoding: "utf8" }): Promise<string>;
		open(p: string, flags: "r"): Promise<FileHandle>;
	};
}
interface PathModule {
	join(...parts: string[]): string;
}
interface OsModule {
	tmpdir(): string;
	homedir(): string;
}
interface ProcessLike {
	env: Record<string, string | undefined>;
	platform: string;
}
/** `process` lewat `window` (renderer Obsidian punya Node) supaya tidak bergantung pada deklarasi global Node. */
const nodeProcess = (): ProcessLike => (window as unknown as { process: ProcessLike }).process;

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
		const cp = nodeRequire("child_process") as ChildProcessModule;
		return new Promise<RunResult>((resolve, reject) => {
			if (opts.signal.aborted) return reject(new Error("aborted"));
			const max = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
			let settled = false;
			let out = "";
			let err = "";
			const child = cp.spawn(file, args, {
				cwd: opts.cwd,
				env: opts.env ?? nodeProcess().env,
				shell: false, // WAJIB: tanpa shell
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});

			const killTree = () => {
				try {
					if (nodeProcess().platform === "win32" && child.pid) {
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
			child.on("error", (e: Error) => finish(() => reject(e)));
			child.on("close", (code: number | null) => finish(() => resolve({ code, stdout: out, stderr: err })));
			child.stdin.on("error", () => {
				/* proses mungkin menutup stdin lebih awal */
			});
			child.stdin.end(opts.stdin, "utf8");
		});
	}
}

/** Cari file eksekusi di PATH tanpa shell. Windows: hanya .exe (shim .cmd/.bat butuh shell, jadi tidak didukung). */
export async function findExecutable(name: string, envPath: string | undefined = nodeProcess().env.PATH): Promise<string | null> {
	const fs = nodeRequire("fs") as FsModule;
	const path = nodeRequire("path") as PathModule;
	const isWin = nodeProcess().platform === "win32";
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
	const fs = nodeRequire("fs") as FsModule;
	const os = nodeRequire("os") as OsModule;
	const path = nodeRequire("path") as PathModule;
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
				await new Promise((r) => window.setTimeout(r, 100));
			}
		},
	};
}

// ---------------- Pembacaan berkas lokal untuk deteksi model ----------------

/**
 * Akses berkas hanya-baca untuk deteksi model (konfigurasi CLI di folder pengguna). Tidak pernah menulis dan tidak
 * pernah membaca berkas token/login: pemanggil hanya menyebut berkas konfigurasi model. Dimuat malas (tanpa Node di mobile).
 */
export interface DiscoveryIo {
	homeDir(): string;
	env(name: string): string | undefined;
	/** Isi berkas teks UTF-8 (maks 1 MB), atau null bila tidak ada/tidak terbaca. */
	readText(file: string): Promise<string | null>;
	/** Kunci cache sebuah berkas (path + ukuran + waktu ubah), atau null bila tidak ada. */
	fileKey(file: string): Promise<string | null>;
	/**
	 * Pindai berkas besar (mis. executable 300 MB) per potongan tanpa memuatnya utuh ke memori; kumpulkan semua
	 * kecocokan `pattern` (tanpa duplikat). null bila berkas tidak bisa dibuka.
	 */
	scanFile(file: string, pattern: RegExp): Promise<string[] | null>;
}

const MAX_TEXT_BYTES = 1024 * 1024;
const SCAN_CHUNK = 4 * 1024 * 1024;
const SCAN_OVERLAP = 128;
/** Batas keras pemindaian supaya berkas aneh tidak membuat Obsidian macet. */
const SCAN_MAX_BYTES = 1024 * 1024 * 1024;

/** 1 byte = 1 karakter. (Di TextDecoder "latin1" = windows-1252; untuk nama model ASCII hasilnya identik.) */
const LATIN1 = new TextDecoder("latin1");
function latin1(buf: Uint8Array, length: number): string {
	return LATIN1.decode(buf.subarray(0, length));
}

export class NodeDiscoveryIo implements DiscoveryIo {
	homeDir(): string {
		return (nodeRequire("os") as OsModule).homedir();
	}

	env(name: string): string | undefined {
		return nodeProcess().env[name];
	}

	async readText(file: string): Promise<string | null> {
		const fs = nodeRequire("fs") as FsModule;
		try {
			const st = await fs.promises.stat(file);
			if (!st.isFile() || st.size > MAX_TEXT_BYTES) return null;
			return await fs.promises.readFile(file, { encoding: "utf8" });
		} catch {
			return null;
		}
	}

	async fileKey(file: string): Promise<string | null> {
		const fs = nodeRequire("fs") as FsModule;
		try {
			const st = await fs.promises.stat(file);
			return st.isFile() ? `${file}|${st.size}|${Math.round(st.mtimeMs)}` : null;
		} catch {
			return null;
		}
	}

	async scanFile(file: string, pattern: RegExp): Promise<string[] | null> {
		const fs = nodeRequire("fs") as FsModule;
		let handle: FileHandle;
		try {
			handle = await fs.promises.open(file, "r");
		} catch {
			return null;
		}
		const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
		const found = new Set<string>();
		try {
			const buf = new Uint8Array(SCAN_CHUNK);
			let pos = 0;
			let tail = "";
			while (pos < SCAN_MAX_BYTES) {
				const { bytesRead } = await handle.read(buf, 0, SCAN_CHUNK, pos);
				if (bytesRead <= 0) break;
				pos += bytesRead;
				// latin1: 1 byte = 1 karakter, jadi nama model ASCII terbaca tanpa dekode UTF-8
				const text = tail + latin1(buf, bytesRead);
				const re = new RegExp(pattern.source, flags);
				let m: RegExpExecArray | null;
				while ((m = re.exec(text)) !== null) {
					found.add(m[0]);
					if (m[0].length === 0) re.lastIndex++;
				}
				tail = text.slice(-SCAN_OVERLAP);
				// beri kesempatan ke UI di antara potongan
				await new Promise<void>((r) => window.setTimeout(r, 0));
			}
		} catch {
			return found.size > 0 ? Array.from(found) : null;
		} finally {
			await handle.close().catch(() => undefined);
		}
		return Array.from(found);
	}
}
