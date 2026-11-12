import { Modal } from "obsidian";
import type { App } from "obsidian";

/** Modal konfirmasi umum: judul, isi, tombol Batal / aksi. `onChoose(true)` hanya bila pengguna menyetujui. */
export class ConfirmModal extends Modal {
	private done = false;

	constructor(
		app: App,
		private heading: string,
		private message: string,
		private cancelLabel: string,
		private okLabel: string,
		private onChoose: (ok: boolean) => void,
		private lines: string[] = [],
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.heading);
		contentEl.createEl("p", { text: this.message });
		if (this.lines.length > 0) {
			const ul = contentEl.createEl("ul");
			for (const l of this.lines) ul.createEl("li", { text: l });
		}
		const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
		if (this.cancelLabel) row.createEl("button", { text: this.cancelLabel }).addEventListener("click", () => this.finish(false));
		const ok = row.createEl("button", { text: this.okLabel, cls: "mod-cta" });
		ok.addEventListener("click", () => this.finish(true));
		ok.focus();
	}

	private finish(ok: boolean): void {
		if (this.done) return;
		this.done = true;
		this.close();
		this.onChoose(ok);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.done) {
			this.done = true;
			this.onChoose(false);
		}
	}
}
