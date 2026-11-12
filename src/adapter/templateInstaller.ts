import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { coreTemplatesFolder, planTemplateFiles, resolveTemplateFolder, templateContent } from "../domain/templateFiles";
import type { Settings } from "../domain/types";

export interface InstallResult {
	folder: string;
	created: string[];
	/** Sudah ada: dilewati, tidak pernah ditimpa. */
	skipped: string[];
}

/**
 * Membuat templat Seedbed di folder templat. Folder: pengaturan plugin, lalu folder plugin inti Templates yang dibaca dari
 * .obsidian/templates.json lewat adapter vault (API publik; bukan API internal), lalu "Templates". Tidak pernah menimpa.
 */
export class TemplateInstaller {
	constructor(
		private app: App,
		private settings: () => Settings,
	) {}

	async folder(): Promise<string> {
		let core = "";
		try {
			const p = normalizePath(`${this.app.vault.configDir}/templates.json`);
			if (await this.app.vault.adapter.exists(p)) core = coreTemplatesFolder(await this.app.vault.adapter.read(p));
		} catch {
			// Tidak terbaca: pakai bawaan.
		}
		return resolveTemplateFolder(this.settings().templates.folder, core);
	}

	async create(): Promise<InstallResult> {
		const s = this.settings();
		const folder = await this.folder();
		const existing: string[] = [];
		for (const f of this.app.vault.getFiles()) existing.push(f.path);
		const plan = planTemplateFiles(folder, existing);
		const created: string[] = [];
		if (plan.create.length > 0 && folder && !this.app.vault.getFolderByPath(normalizePath(folder))) {
			try {
				await this.app.vault.createFolder(normalizePath(folder));
			} catch {
				if (!this.app.vault.getFolderByPath(normalizePath(folder))) throw new Error(`Cannot create folder ${folder}`);
			}
		}
		for (const item of plan.create) {
			const path = normalizePath(item.path);
			// Sabuk pengaman: cek ulang tepat sebelum menulis (tidak pernah menimpa).
			if (this.app.vault.getAbstractFileByPath(path)) {
				plan.skip.push(item.path);
				continue;
			}
			await this.app.vault.create(path, templateContent(item.tipe, s.properties, s.language));
			created.push(item.path);
		}
		return { folder, created, skipped: plan.skip };
	}
}
