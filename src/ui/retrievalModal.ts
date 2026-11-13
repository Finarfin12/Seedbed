import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { SelfRating } from "../domain/v08";
import type { TFn } from "../i18n";

export interface RecallFlow {
	questions: Array<{ label: string; question: string }>;
	/** Mengembalikan jawaban lama HANYA setelah jawaban baru dikirim (dijaga RecallSession). */
	submit: (index: number, answer: string) => string | null;
	/** Dipanggil tepat sekali saat modal ditutup. `answered` = jumlah jawaban yang sempat dikirim. */
	onFinish: (answered: number, rating: SelfRating | undefined) => void;
}

/**
 * Retrieval dua tahap per pertanyaan: (1) jawab dari ingatan, (2) bandingkan dengan jawaban lama.
 * Modal TIDAK memegang jawaban lama sebelum submit; tidak ada skor, benar/salah.
 */
export class RetrievalModal extends Modal {
	private answered = 0;
	private rating: SelfRating | undefined;
	private finished = false;

	constructor(
		app: App,
		private t: TFn,
		private flow: RecallFlow,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("bengkel-devil-modal");
		this.setTitle(this.t("recall.title"));
		this.showQuestion(0);
	}

	private showQuestion(i: number): void {
		const { contentEl } = this;
		contentEl.empty();
		const n = this.flow.questions.length;
		const q = this.flow.questions[i] as { label: string; question: string };
		const body = contentEl.createDiv({ cls: "bengkel-devil-body" });
		body.createEl("p", { text: this.t("recall.intro") });
		body.createEl("small", { text: this.t("recall.progress", { i: i + 1, n }), cls: "bengkel-source" });
		const block = body.createDiv({ cls: "bengkel-devil-block" });
		block.createEl("strong", { text: q.label });
		const qEl = block.createEl("p", { text: q.question, cls: "bengkel-question", attr: { id: "bengkel-rq" } });
		const area = block.createEl("textarea", { cls: "bengkel-answer", attr: { rows: "4", "aria-labelledby": qEl.id } });
		const compare = block.createDiv({ cls: "bengkel-recall-compare" });

		const footer = contentEl.createDiv({ cls: "bengkel-sticky-footer" });
		const row = footer.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: this.t("btn.cancel") }).addEventListener("click", () => this.close());
		const send = row.createEl("button", { text: this.t("recall.submit"), cls: "mod-cta" });
		send.disabled = true;
		area.addEventListener("input", () => {
			send.disabled = area.value.trim().length === 0;
		});

		const submit = () => {
			if (send.disabled) return;
			const old = this.flow.submit(i, area.value);
			if (old === null) return;
			this.answered++;
			area.disabled = true;
			send.remove();
			compare.empty();
			compare.createEl("strong", { text: this.t("recall.compare") });
			const grid = compare.createDiv({ cls: "bengkel-recall-grid" });
			const now = grid.createDiv({ cls: "bengkel-recall-col" });
			now.createEl("em", { text: this.t("recall.now") });
			now.createEl("p", { text: area.value.trim() });
			const prev = grid.createDiv({ cls: "bengkel-recall-col" });
			prev.createEl("em", { text: this.t("recall.earlier") });
			prev.createEl("p", { text: old });
			compare.createEl("p", { text: this.t("recall.notice"), cls: "bengkel-question" });
			if (i + 1 < n) {
				const next = row.createEl("button", { text: this.t("recall.next"), cls: "mod-cta" });
				next.addEventListener("click", () => this.showQuestion(i + 1));
				next.focus();
			} else {
				this.showRating(compare, row);
			}
		};
		send.addEventListener("click", submit);
		area.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		area.focus();
	}

	private showRating(host: HTMLElement, row: HTMLElement): void {
		host.createEl("p", { text: this.t("recall.rate") });
		const group = host.createDiv({ cls: "bengkel-modal-buttons", attr: { role: "group" } });
		const buttons: Array<[SelfRating, HTMLButtonElement]> = [];
		for (const r of ["remembered", "partly", "forgot"] as const) {
			const b = group.createEl("button", { text: this.t(`recall.${r}`), attr: { "aria-pressed": "false" } });
			buttons.push([r, b]);
			b.addEventListener("click", () => {
				this.rating = this.rating === r ? undefined : r;
				for (const [k, x] of buttons) x.setAttr("aria-pressed", String(this.rating === k));
				for (const [k, x] of buttons) x.toggleClass("mod-cta", this.rating === k);
			});
		}
		const fin = row.createEl("button", { text: this.t("recall.finish"), cls: "mod-cta" });
		fin.addEventListener("click", () => this.close());
		fin.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.finished) return;
		this.finished = true;
		this.flow.onFinish(this.answered, this.rating);
	}
}
