import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { ProviderId } from "../domain/ai/types";
import type { TFn } from "../i18n";

export interface ApproveInfo {
	provider: ProviderId;
	/** Nama tampilan, mis. "Claude Code (claude)", "ollama", "api.example.com". */
	name: string;
	cloud: boolean;
	maxContextChars: number;
}

/** Layar persetujuan per penyedia (F-43): menyebut LOKAL/CLOUD dan data apa yang dikirim. */
export class ApproveModal extends Modal {
	private decided = false;

	constructor(
		app: App,
		private t: TFn,
		private info: ApproveInfo,
		private onResult: (approved: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const t = this.t;
		contentEl.empty();
		this.setTitle(t("approve.title"));
		const where = this.info.cloud
			? t("approve.cloud", { n: this.info.maxContextChars, name: this.info.name })
			: t("approve.local", { name: this.info.name });
		contentEl.createEl("p", { text: where, cls: this.info.cloud ? "bengkel-warn" : "" });
		if (this.info.provider === "cli") contentEl.createEl("p", { text: t("approve.cli") });
		if (this.info.provider === "api") contentEl.createEl("p", { text: t("approve.api") });
		contentEl.createEl("p", { text: t("approve.rule") });

		const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: t("btn.cancel") }).addEventListener("click", () => this.finish(false));
		const ok = row.createEl("button", { text: t("approve.agree"), cls: "mod-cta" });
		ok.addEventListener("click", () => this.finish(true));
		// Fokus awal di "Batal": persetujuan harus disengaja.
		(row.firstElementChild as HTMLElement | null)?.focus();
	}

	private finish(approved: boolean): void {
		if (this.decided) return;
		this.decided = true;
		this.close();
		this.onResult(approved);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decided) {
			this.decided = true;
			this.onResult(false);
		}
	}
}
