import { normalizePath } from "obsidian";
import type { App, TFile } from "obsidian";
import { uniqueBase } from "../domain/captureValidator";
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

	/** Catatan dari tangkapan: badan sudah divalidasi/di-escape; nama unik, tidak pernah menimpa (NF-C5). */
	async createFromBody(base: string, body: string, settings: Settings): Promise<TFile> {
		const folder = settings.folderIde.trim();
		await this.ensureFolder(folder);
		return this.app.vault.create(this.uniquePath(folder, base), body);
	}

	/** Catatan digest: nama unik (tidak menimpa), isi tanpa properti Seedbed. */
	async createDigest(folder: string, base: string, body: string): Promise<TFile> {
		const f = folder.trim();
		await this.ensureFolder(f);
		return this.app.vault.create(this.uniquePath(f, base), body);
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

	/** Nama unik di folder; tanpa beda huruf besar/kecil agar tidak menabrak file di sistem berkas case-insensitive. */
	private uniquePath(folder: string, base: string): string {
		const prefix = folder ? `${normalizePath(folder)}/` : "";
		const dir = folder ? this.app.vault.getFolderByPath(normalizePath(folder)) : this.app.vault.getRoot();
		const existing = (dir?.children ?? []).map((c) => c.name);
		let name = uniqueBase(base, existing);
		// Sabuk pengaman: cek juga lewat path (case-sensitive) untuk file yang belum ada di children.
		let n = 2;
		while (this.app.vault.getAbstractFileByPath(normalizePath(`${prefix}${name}.md`))) name = `${base} ${n++}`;
		return normalizePath(`${prefix}${name}.md`);
	}
}
