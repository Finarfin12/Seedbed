import type { App, TFile } from "obsidian";
import { applyPatch, migrateLegacy } from "../domain/frontmatter";
import type { MigrateResult, PropNames } from "../domain/frontmatter";
import type { IdeaPatch } from "../domain/frontmatter";
import type { IdeaIndex } from "./ideaIndex";

/**
 * Tulis frontmatter lewat fileManager.processFrontMatter (atomik, aman terhadap edit pengguna).
 * Hanya kunci bengkel-* yang diubah (lihat domain/frontmatter.applyPatch).
 */
export class IdeaRepository {
	constructor(
		private app: App,
		private index: IdeaIndex,
		private names: () => PropNames,
	) {}

	getFile(path: string): TFile | null {
		const f = this.app.vault.getFileByPath(path);
		return f ?? null;
	}

	/** Ubah properti format lama (bengkel-*) catatan ini ke format baru. Hanya properti milik plugin; isi catatan tidak disentuh. */
	async migrate(file: TFile): Promise<MigrateResult> {
		let result: MigrateResult = { changed: false, conflict: false };
		let snapshot: Record<string, unknown> = {};
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			result = migrateLegacy(fm, this.names());
			snapshot = { ...fm };
		});
		if (result.changed) this.index.setFromFrontmatter(file, snapshot);
		return result;
	}

	async write(file: TFile, patch: IdeaPatch): Promise<void> {
		let snapshot: Record<string, unknown> = {};
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			applyPatch(fm, patch, this.names());
			snapshot = { ...fm };
		});
		this.index.setFromFrontmatter(file, snapshot);
	}
}
