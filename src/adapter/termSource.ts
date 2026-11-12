import type { App } from "obsidian";

interface TermEntry {
	term: string;
	path: string;
}

const MIN_LENGTH = 3;

function toList(v: unknown): string[] {
	if (typeof v === "string") return v.split(",");
	if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
	return [];
}

/** Daftar istilah dari judul + alias semua catatan vault. Cache dibuang saat vault berubah. */
export class TermSource {
	private entries: TermEntry[] | null = null;

	constructor(private app: App) {}

	invalidate(): void {
		this.entries = null;
	}

	/** `excludePath`: catatan yang sedang diperiksa tidak boleh menjadi istilahnya sendiri. */
	getTerms(excludePath?: string): string[] {
		if (!this.entries) this.entries = this.collect();
		const out = new Set<string>();
		for (const e of this.entries) {
			if (e.path !== excludePath) out.add(e.term);
		}
		return [...out];
	}

	private collect(): TermEntry[] {
		const entries: TermEntry[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const names = [file.basename];
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (fm) names.push(...toList(fm["aliases"]), ...toList(fm["alias"]));
			for (const n of names) {
				const term = n.trim();
				if (term.length >= MIN_LENGTH) entries.push({ term, path: file.path });
			}
		}
		return entries;
	}
}
