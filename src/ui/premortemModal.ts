import { Modal } from "obsidian";
import type { App } from "obsidian";
import { formatSource } from "../domain/ai/types";
import type { SourceLabel } from "../domain/ai/types";
import type { Language } from "../domain/types";
import type { PremortemCategory } from "../domain/v08";
import type { TFn } from "../i18n";

export interface PmItem {
	category: PremortemCategory;
	text: string;
	source?: SourceLabel;
}

export interface PmAnswer {
	item: PmItem;
	answer: string;
}

export interface PremortemFlow {
	minAnswered: number;
	minChars: number;
	onDone: (answers: PmAnswer[]) => void;
}

/** Pre-mortem: 5 pertanyaan satu layar (pola DevilModal). Simpan aktif bila minimal satu jawaban terisi; lolos dihitung controller. */
export class PremortemModal extends Modal {
	private answers: string[];
	private done = false;

	constructor(
		app: App,
		private t: TFn,
		private lang: Language,
		private items: PmItem[],
		private flow: PremortemFlow,
	) {
		super(app);
		this.answers = items.map(() => "");
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.t("pm.title"));
		this.modalEl.addClass("bengkel-devil-modal");
		const n = this.items.length;
		const body = contentEl.createDiv({ cls: "bengkel-devil-body" });
		body.createEl("p", { text: this.t("pm.intro", { m: this.flow.minAnswered, c: this.flow.minChars }) });
		const areas: HTMLTextAreaElement[] = [];
		this.items.forEach((q, i) => {
			const block = body.createDiv({ cls: "bengkel-devil-block" });
			block.createEl("strong", { text: this.t(`cat.${q.category}`) });
			block.createSpan({ text: ` · ${formatSource(q.source ?? { kind: "bank" }, this.lang)}`, cls: "bengkel-source" });
			const qEl = block.createEl("p", { text: q.text, cls: "bengkel-question", attr: { id: `bengkel-pm-${i}` } });
			const area = block.createEl("textarea", { cls: "bengkel-answer", attr: { rows: "2", "aria-labelledby": qEl.id } });
			areas.push(area);
			area.addEventListener("input", () => {
				this.answers[i] = area.value;
				update();
			});
		});

		const footer = contentEl.createDiv({ cls: "bengkel-sticky-footer" });
		const status = footer.createDiv({ cls: "bengkel-gate-status", attr: { "aria-live": "polite" } });
		const row = footer.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: this.t("btn.cancel") }).addEventListener("click", () => this.close());
		const save = row.createEl("button", { text: this.t("btn.save"), cls: "mod-cta" });

		const update = () => {
			const c = this.answers.filter((a) => a.trim().length >= this.flow.minChars).length;
			status.setText(this.t("pm.answered", { c, n, m: this.flow.minAnswered }));
			save.disabled = this.answers.every((a) => a.trim().length === 0);
		};
		update();

		const submit = () => {
			if (save.disabled || this.done) return;
			this.done = true;
			this.close();
			this.flow.onDone(this.items.map((item, i) => ({ item, answer: this.answers[i] as string })));
		};
		save.addEventListener("click", submit);
		for (const area of areas) {
			area.addEventListener("keydown", (e) => {
				if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
					e.preventDefault();
					submit();
				}
			});
		}
		areas[0]?.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
