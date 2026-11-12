import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { TFn } from "../i18n";

/** Modal satu baris teks (judul ide / konsep). Enter = kirim. */
export class PromptModal extends Modal {
	private submitted = false;

	constructor(
		app: App,
		private t: TFn,
		private heading: string,
		private label: string,
		private onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.heading);
		const input = contentEl.createEl("input", {
			type: "text",
			cls: "bengkel-prompt-input",
			attr: { "aria-label": this.label, placeholder: this.label },
		});
		const submit = () => {
			const value = input.value.trim();
			if (this.submitted) return;
			this.submitted = true;
			this.close();
			this.onSubmit(value);
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				submit();
			}
		});
		const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: this.t("btn.cancel") }).addEventListener("click", () => this.close());
		const ok = row.createEl("button", { text: this.t("btn.create"), cls: "mod-cta" });
		ok.addEventListener("click", submit);
		input.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
