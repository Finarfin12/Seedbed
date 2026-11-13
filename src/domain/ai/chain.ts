import type { AiProvider, Prompt, ProviderId, SourceLabel } from "./types";

export interface Attempt {
	provider: ProviderId;
	ok: boolean;
	/** Alasan singkat (sudah diredaksi dari rahasia). */
	error?: string;
	ms: number;
}

export interface ChainResult<T> {
	value: T | null;
	source: SourceLabel | null;
	attempts: Attempt[];
}

/** Hapus rahasia (mis. API key) dari teks yang akan ditampilkan/dilog. */
export function redact(text: string, secrets: string[]): string {
	let out = text;
	for (const s of secrets) {
		if (s) out = out.split(s).join("[redacted]");
	}
	return out.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/g, "$1[redacted]").replace(/\b(sk|key|token)[-_][A-Za-z0-9_\-]{12,}/gi, "[redacted]");
}

/**
 * Mencoba penyedia sesuai urutan. Gagal / timeout / keluaran ditolak validator => penyedia berikutnya.
 * Jika semua gagal, `value` = null dan pemanggil memakai bank statis (ujung rantai).
 */
export class ProviderChain {
	constructor(
		private providers: AiProvider[],
		private timeoutMs: number,
		private secrets: string[] = [],
		private onAttempt?: (a: Attempt) => void,
	) {}

	get size(): number {
		return this.providers.length;
	}

	async run<T>(prompt: Prompt, parse: (raw: string) => T | null): Promise<ChainResult<T>> {
		const attempts: Attempt[] = [];
		const record = (a: Attempt) => {
			attempts.push(a);
			try {
				this.onAttempt?.(a);
			} catch {
				/* penghitung tidak boleh merusak alur */
			}
		};
		for (const p of this.providers) {
			const started = Date.now();
			const ac = new AbortController();
			let timer: number | undefined;
			try {
				const timeout = new Promise<never>((_, reject) => {
					timer = window.setTimeout(() => {
						// reject DULU supaya pesan "timeout" yang tercatat, baru batalkan penyedia.
						reject(new Error(`timeout ${Math.round(this.timeoutMs / 1000)}s`));
						ac.abort();
					}, this.timeoutMs);
				});
				const raw = await Promise.race([p.complete(prompt, { signal: ac.signal }), timeout]);
				const value = parse(raw);
				if (value === null) {
					record({ provider: p.id, ok: false, error: "output rejected by validator", ms: Date.now() - started });
					continue;
				}
				record({ provider: p.id, ok: true, ms: Date.now() - started });
				return { value, source: p.label, attempts };
			} catch (e) {
				ac.abort();
				const msg = e instanceof Error ? e.message : String(e);
				record({ provider: p.id, ok: false, error: redact(msg, this.secrets).slice(0, 300), ms: Date.now() - started });
			} finally {
				if (timer) window.clearTimeout(timer);
			}
		}
		return { value: null, source: null, attempts };
	}
}
