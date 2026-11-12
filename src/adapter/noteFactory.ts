import { normalizePath } from "obsidian";
import type { App, TFile } from "obsidian";
import { newNoteContent, safeFileName } from "../domain/templates";
import type { Language, Settings, Tipe } from "../domain/types";

export class NoteFactory {
	constructor(private app: App) {}

	/** Buat catatan ide/konsep baru dari template. Mengembalikan null jika judul kosong. */
	async create(
		title: string,
		tipe: Tipe,
		today: string,
		settings: Settings,
		language: Language,
		feynman = false,
	): Promise<TFile | null> {
		const clean = safeFileName(title);
		if (!clean) return null;
		const folder = (tipe === "ide" ? settings.folderIde : settings.folderKonsep).trim();
		await this.ensureFolder(folder);
		const base = feynman ? `Feynman - ${clean}` : clean;
		const path = this.uniquePath(folder, base);
		return this.app.vault.create(path, newNoteContent(tipe, today, settings, language, feynman));
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		const path = normalizePath(folder);
		if (this.app.vault.getFolderByPath(path)) return;
		try {
			await this.app.vault.createFolder(path);
		} catch {
			// Folder dibuat bersamaan oleh proses lain; abaikan jika sekarang sudah ada.
			if (!this.app.vault.getFolderByPath(path)) throw new Error(`Gagal membuat folder ${path}`);
		}
	}

	private uniquePath(folder: string, base: string): string {
		const prefix = folder ? `${normalizePath(folder)}/` : "";
		let candidate = normalizePath(`${prefix}${base}.md`);
		let n = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${prefix}${base} ${n}.md`);
			n++;
		}
		return candidate;
	}
}
