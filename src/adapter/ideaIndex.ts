import type { App, TFile } from "obsidian";
import { parseIdeaNote } from "../domain/frontmatter";
import type { PropNames } from "../domain/frontmatter";
import { toISODate } from "../domain/dates";
import { isStuck } from "../domain/v08";
import { isDue } from "../domain/scheduler";
import type { Idea, InvalidIdea, ParsedNote } from "../domain/types";

type FM = Record<string, unknown>;

/**
 * Cache in-memory daftar ide. Dibangun sekali (onLayoutReady) lalu diperbarui per file,
 * supaya membuka panel tidak membaca ulang seluruh vault.
 */
export class IdeaIndex {
	private ideas = new Map<string, Idea>();
	private invalid = new Map<string, InvalidIdea>();
	private listeners = new Set<() => void>();

	constructor(
		private app: App,
		private names: () => PropNames,
		/** Path yang bukan catatan (mis. folder templat): tidak pernah dibaca sebagai ide. */
		private ignored: (path: string) => boolean = () => false,
	) {}

	rebuild(): void {
		this.ideas.clear();
		this.invalid.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.apply(file.path, this.parse(file));
		}
		this.emit();
	}

	/** Baca ulang satu file dari metadata cache. Emit hanya jika hasilnya berubah. */
	updateFile(file: TFile): void {
		this.set(file.path, this.parse(file));
	}

	/** Pakai frontmatter yang baru saja kita tulis (cache Obsidian mungkin belum diperbarui). */
	setFromFrontmatter(file: TFile, fm: FM): void {
		// Penulisan oleh plugin sendiri mengubah mtime, jadi "tersentuh" = hari ini (keputusan Q1).
		this.set(file.path, this.ignored(file.path) ? { kind: "none" } : this.touched(parseIdeaNote(file.path, file.basename, fm, this.names()), toISODate(new Date())));
	}

	/** Isi Idea.tersentuh (tanggal lokal). Hanya untuk catatan Seedbed yang valid. */
	private touched(p: ParsedNote, day: string): ParsedNote {
		return p.kind === "idea" ? { kind: "idea", idea: { ...p.idea, tersentuh: day } } : p;
	}

	/** Ide yang tidak diedit lebih dari `days` hari (waktu ubah berkas), paling lama dulu. */
	stuck(today: string, days: number): Idea[] {
		return this.all()
			.filter((i) => isStuck(i, today, days))
			.sort((a, b) => (a.tersentuh ?? "").localeCompare(b.tersentuh ?? "") || a.title.localeCompare(b.title));
	}

	remove(path: string): void {
		const had = this.ideas.delete(path) || this.invalid.delete(path);
		if (had) this.emit();
	}

	rename(file: TFile, oldPath: string): void {
		const had = this.ideas.delete(oldPath) || this.invalid.delete(oldPath);
		this.set(file.path, this.parse(file), had);
	}

	get(path: string): Idea | undefined {
		return this.ideas.get(path);
	}

	all(): Idea[] {
		return [...this.ideas.values()];
	}

	invalidList(): InvalidIdea[] {
		return [...this.invalid.values()];
	}

	due(today: string): Idea[] {
		return this.all()
			.filter((i) => isDue(i, today))
			.sort((a, b) => (a.tinjau ?? "").localeCompare(b.tinjau ?? "") || a.title.localeCompare(b.title));
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	private parse(file: TFile): ParsedNote {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as FM | undefined;
		if (this.ignored(file.path)) return { kind: "none" };
		return this.touched(parseIdeaNote(file.path, file.basename, fm, this.names()), toISODate(new Date(file.stat.mtime)));
	}

	private apply(path: string, parsed: ParsedNote): void {
		this.ideas.delete(path);
		this.invalid.delete(path);
		if (parsed.kind === "idea") this.ideas.set(path, parsed.idea);
		else if (parsed.kind === "invalid") this.invalid.set(path, parsed.invalid);
	}

	private set(path: string, parsed: ParsedNote, force = false): void {
		const before = JSON.stringify([this.ideas.get(path), this.invalid.get(path)]);
		this.apply(path, parsed);
		const after = JSON.stringify([this.ideas.get(path), this.invalid.get(path)]);
		if (force || before !== after) this.emit();
	}

	private emit(): void {
		for (const l of this.listeners) l();
	}
}
