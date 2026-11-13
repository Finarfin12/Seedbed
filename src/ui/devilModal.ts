import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import { formatSource } from "../domain/ai/types";
import type { Question } from "../domain/questions/provider";
import type { Language } from "../domain/types";
import type { TFn } from "../i18n";
import type { HintFn, SessionEntry } from "./session";

export interface DevilFlow {
	getHint?: HintFn;
	hintsPerQuestion: number;
	onDone: (entries: SessionEntry[]) => void;
}

/** 5 pertanyaan dalam satu layar. Simpan aktif setelah `required` pertanyaan terjawab. Badan menggulir, footer tetap terlihat. */
export class DevilModal extends Modal {
	private answers: string[];
	private flagged: boolean[];
	private hints: number[];
	private done = false;

	constructor(
		app: App,
		private t: TFn,
		private lang: Language,
		private questions: Question[],
		private required: number,
		private flow: DevilFlow,
	) {
		super(app);
		this.answers = questions.map(() => "");
		this.flagged = questions.map(() => false);
		this.hints = questions.map(() => 0);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.t("devil.title"));
		this.modalEl.addClass("bengkel-devil-modal");
		const n = this.questions.length;
		// Hanya badan pertanyaan yang menggulir; footer (status + tombol) selalu terlihat.
		const body = contentEl.createDiv({ cls: "bengkel-devil-body" });
		body.createEl("p", { text: this.t("devil.intro", { m: this.required, n }) });

		const areas: HTMLTextAreaElement[] = [];
		this.questions.forEach((q, i) => {
			const block = body.createDiv({ cls: "bengkel-devil-block" });
			block.createEl("strong", { text: this.t(`cat.${q.category}`) });
			block.createSpan({ text: ` · ${formatSource(q.source ?? { kind: "bank" }, this.lang)}`, cls: "bengkel-source" });
			const qEl = block.createEl("p", { text: q.text, cls: "bengkel-question", attr: { id: `bengkel-dq-${i}` } });
			const hintHost = block.createDiv();
			const area = block.createEl("textarea", { cls: "bengkel-answer", attr: { rows: "2", "aria-labelledby": qEl.id } });
			areas.push(area);
			area.addEventListener("input", () => {
				this.answers[i] = area.value;
				update();
			});

			const tools = block.createDiv({ cls: "bengkel-tools" });
			const flag = tools.createEl("button", { cls: "bengkel-flag", attr: { "aria-pressed": "false" } });
			const setFlag = () => {
				flag.setText(this.t(this.flagged[i] ? "modal.flagged" : "modal.flag"));
				flag.setAttr("aria-pressed", String(this.flagged[i]));
			};
			setFlag();
			flag.addEventListener("click", () => {
				this.flagged[i] = !this.flagged[i];
				setFlag();
			});
			if (this.flow.getHint && this.flow.hintsPerQuestion > 0) {
				const hintBtn = tools.createEl("button");
				const setHint = () => {
					const left = this.flow.hintsPerQuestion - (this.hints[i] as number);
					hintBtn.setText(this.t("modal.hint", { n: left }));
					hintBtn.disabled = left <= 0;
				};
				setHint();
				hintBtn.addEventListener("click", () => {
					hintBtn.disabled = true;
					hintBtn.setText(this.t("modal.hintLoading"));
					void this.flow.getHint?.(q, (this.hints[i] as number) + 1, area.value).then((res) => {
						if (this.done) return;
						if (res) {
							this.hints[i] = (this.hints[i] as number) + 1;
							const box = hintHost.createDiv({ cls: "bengkel-hint" });
							box.createEl("strong", { text: this.t("modal.hintTitle", { n: this.hints[i] }) });
							box.createSpan({ text: ` · ${formatSource(res.source, this.lang)}`, cls: "bengkel-source" });
							box.createEl("p", { text: res.text });
						} else {
							new Notice(this.t("modal.hintUnavailable"));
						}
						setHint();
					});
				});
			}
		});

		const footer = contentEl.createDiv({ cls: "bengkel-sticky-footer" });
		const status = footer.createDiv({ cls: "bengkel-gate-status", attr: { "aria-live": "polite" } });
		const row = footer.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: this.t("btn.cancel") }).addEventListener("click", () => this.close());
		const save = row.createEl("button", { text: this.t("btn.save"), cls: "mod-cta" });

		const update = () => {
			const c = this.answers.filter((a) => a.trim().length > 0).length;
			status.setText(this.t("devil.answered", { c, n, m: this.required }));
			save.disabled = c < this.required;
		};
		update();

		const submit = () => {
			if (save.disabled || this.done) return;
			this.done = true;
			this.close();
			this.flow.onDone(
				this.questions.map((q, i) => ({ question: q, answer: this.answers[i] as string, flagged: this.flagged[i] as boolean, hints: this.hints[i] as number })),
			);
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
