import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { CaptureData } from "../domain/captureValidator";
import type { TFn } from "../i18n";

/**
 * Konfirmasi tangkapan (default aktif). Situs mana pun bisa membuka link obsidian://, jadi pengguna melihat
 * apa yang akan disimpan. Fokus awal di "Batal": menekan Enter secara tidak sengaja tidak menyimpan apa pun.
 */
export class CaptureConfirmModal extends Modal {
	private decided = false;

	constructor(
		app: App,
		private t: TFn,
		private data: CaptureData,
		private onResult: (save: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, data: d, t } = this;
		contentEl.empty();
		this.setTitle(t("capture.confirm.title"));
		contentEl.createEl("p", { text: t("capture.confirm.intro"), cls: "setting-item-description" });

		// setText/textContent (bukan HTML): teks halaman tidak pernah ditafsirkan.
		const q = contentEl.createEl("blockquote", { cls: "bengkel-capture-quote" });
		q.setText(d.text.length > 600 ? `${d.text.slice(0, 600)}…` : d.text);
		if (d.title) contentEl.createDiv({ cls: "bengkel-meta", text: `${t("capture.confirm.page")}: ${d.title}` });
		if (d.url) contentEl.createDiv({ cls: "bengkel-meta", text: d.url });
		if (d.q) contentEl.createDiv({ cls: "bengkel-meta", text: `${t("capture.confirm.trigger")}: ${d.q}` });
		if (d.a) contentEl.createDiv({ cls: "bengkel-meta", text: `${t("capture.confirm.answer")}: ${d.a.length > 200 ? `${d.a.slice(0, 200)}…` : d.a}` });
		if (d.truncated) contentEl.createDiv({ cls: "bengkel-meta", text: t("capture.confirm.truncated") });

		const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
		const cancel = row.createEl("button", { text: t("btn.cancel") });
		const ok = row.createEl("button", { text: t("btn.save"), cls: "mod-cta" });
		cancel.addEventListener("click", () => this.finish(false));
		ok.addEventListener("click", () => this.finish(true));
		cancel.focus();
	}

	private finish(save: boolean): void {
		if (this.decided) return;
		this.decided = true;
		this.close();
		this.onResult(save);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decided) {
			this.decided = true;
			this.onResult(false);
		}
	}
}
