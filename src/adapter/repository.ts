import type { App, TFile } from "obsidian";
import { applyPatch } from "../domain/frontmatter";
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
	) {}

	getFile(path: string): TFile | null {
		const f = this.app.vault.getFileByPath(path);
		return f ?? null;
	}

	async write(file: TFile, patch: IdeaPatch): Promise<void> {
		let snapshot: Record<string, unknown> = {};
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			applyPatch(fm, patch);
			snapshot = { ...fm };
		});
		this.index.setFromFrontmatter(file, snapshot);
	}
}
