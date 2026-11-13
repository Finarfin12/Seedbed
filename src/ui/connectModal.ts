import { Modal } from "obsidian";
import type { App } from "obsidian";
import { formatSource } from "../domain/ai/types";
import type { SourceLabel } from "../domain/ai/types";
import type { Language } from "../domain/types";
import type { TFn } from "../i18n";

export interface ConnectItem {
	path: string;
	title: string;
	question: string;
	source?: SourceLabel;
}

export interface ConnectFlow {
	/** Dipanggil hanya saat pengguna menekan "Tambah tautan". Mengembalikan true bila baris ditambahkan. */
	addLink: (item: ConnectItem) => Promise<boolean>;
	onDone: (answers: Array<{ item: ConnectItem; answer: string }>) => void;
}

/** Connect: satu pertanyaan per kandidat catatan Seedbed. Tautan tidak pernah dibuat otomatis. */
export class ConnectModal extends Modal {
	private answers: string[];
	private done = false;

	constructor(
		app: App,
		private t: TFn,
		private lang: Language,
		private items: ConnectItem[],
		private flow: ConnectFlow,
	) {
		super(app);
		this.answers = items.map(() => "");
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.t("connect.title"));
		this.modalEl.addClass("bengkel-devil-modal");
		const body = contentEl.createDiv({ cls: "bengkel-devil-body" });
		body.createEl("p", { text: this.t("connect.intro") });
		const areas: HTMLTextAreaElement[] = [];
		this.items.forEach((it, i) => {
			const block = body.createDiv({ cls: "bengkel-devil-block" });
			block.createEl("strong", { text: it.title });
			block.createSpan({ text: ` · ${formatSource(it.source ?? { kind: "bank" }, this.lang)}`, cls: "bengkel-source" });
			const qEl = block.createEl("p", { text: it.question, cls: "bengkel-question", attr: { id: `bengkel-cq-${i}` } });
			const area = block.createEl("textarea", { cls: "bengkel-answer", attr: { rows: "2", "aria-labelledby": qEl.id } });
			areas.push(area);
			area.addEventListener("input", () => {
				this.answers[i] = area.value;
				update();
			});
			const tools = block.createDiv({ cls: "bengkel-tools" });
			const link = tools.createEl("button", { text: this.t("connect.addLink", { title: it.title }) });
			link.addEventListener("click", () => {
				link.disabled = true;
				void this.flow.addLink(it).then((added) => {
					link.setText(this.t(added ? "connect.linked" : "connect.alreadyLinked"));
				});
			});
		});

		const footer = contentEl.createDiv({ cls: "bengkel-sticky-footer" });
		const status = footer.createDiv({ cls: "bengkel-gate-status", attr: { "aria-live": "polite" } });
		const row = footer.createDiv({ cls: "bengkel-modal-buttons" });
		row.createEl("button", { text: this.t("btn.cancel") }).addEventListener("click", () => this.close());
		const save = row.createEl("button", { text: this.t("btn.save"), cls: "mod-cta" });
		const update = () => {
			const c = this.answers.filter((a) => a.trim().length > 0).length;
			status.setText(this.t("connect.answered", { c, n: this.items.length }));
			save.disabled = c === 0;
		};
		update();
		const submit = () => {
			if (save.disabled || this.done) return;
			this.done = true;
			this.close();
			this.flow.onDone(
				this.items
					.map((item, i) => ({ item, answer: (this.answers[i] as string).trim() }))
					.filter((x) => x.answer.length > 0),
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
