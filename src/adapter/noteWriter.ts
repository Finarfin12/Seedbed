import type { App, TFile } from "obsidian";
import { appendBlock } from "../domain/callout";

/** Menambah callout di akhir catatan. Tidak pernah menghapus/menimpa isi (NF-6). */
export class NoteWriter {
	constructor(private app: App) {}

	/** Tambah satu baris di akhir catatan, hanya bila baris itu belum ada. Mengembalikan true bila ditambahkan. */
	async appendLine(file: TFile, line: string): Promise<boolean> {
		let added = false;
		await this.app.vault.process(file, (data) => {
			if (data.split(/\r?\n/).some((l) => l.trim() === line.trim())) return data;
			added = true;
			return appendBlock(data, line);
		});
		return added;
	}

	async appendCallout(file: TFile, block: string): Promise<void> {
		await this.app.vault.process(file, (data) => appendBlock(data, block));
	}
}
