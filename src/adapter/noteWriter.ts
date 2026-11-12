import type { App, TFile } from "obsidian";
import { appendBlock } from "../domain/callout";

/** Menambah callout di akhir catatan. Tidak pernah menghapus/menimpa isi (NF-6). */
export class NoteWriter {
	constructor(private app: App) {}

	async appendCallout(file: TFile, block: string): Promise<void> {
		await this.app.vault.process(file, (data) => appendBlock(data, block));
	}
}
