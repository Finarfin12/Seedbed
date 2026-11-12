import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import { formatSource } from "../domain/ai/types";
import type { PreviousAnswer } from "../domain/ai/types";
import { socraticGate } from "../domain/gates/socratic";
import type { Question } from "../domain/questions/provider";
import type { Language, Settings } from "../domain/types";
import type { TFn } from "../i18n";
import type { HintFn, SessionEntry } from "./session";

export interface SocraticFlow {
	categories: readonly string[];
	/** Ambil pertanyaan ke-`index`. Mode adaptif memakai `previous`. Tidak boleh melempar (layanan jatuh ke bank). */
	getQuestion(index: number, previous: PreviousAnswer[]): Promise<Question>;
	getHint?: HintFn;
	hintsPerQuestion: number;
	/** Minta pertanyaan berikutnya selagi pengguna mengetik (F-48). Hanya untuk mode adaptif dengan AI. */
	prefetch: boolean;
	onDone: (entries: SessionEntry[]) => void;
}

interface Slot {
	question?: Question;
	answer: string;
	flagged: boolean;
	hints: number;
	hintTexts: Array<{ text: string; source: string }>;
}

const PREFETCH_IDLE_MS = 1500;

/**
 * Satu pertanyaan per layar. R-2: Lanjut aktif hanya jika jawaban >= N karakter, tidak ada "lihat jawaban".
 * R-3 petunjuk bertingkat, R-5 tandai keliru, R-6 label sumber, F-48 prefetch.
 */
export class SocraticModal extends Modal {
	private index = 0;
	private slots: Slot[];
	private done = false;
	private prefetching = new Map<number, { snapshot: string; promise: Promise<Question> }>();
	private prefetchStarted = new Set<number>();
	private prefetchTimer: number | null = null;
	private pending = new Map<number, Promise<Question>>();

	constructor(
		app: App,
		private t: TFn,
		private lang: Language,
		private settings: Settings,
		private flow: SocraticFlow,
	) {
		super(app);
		this.slots = flow.categories.map(() => ({ answer: "", flagged: false, hints: 0, hintTexts: [] }));
	}

	onOpen(): void {
		this.setTitle(this.t("socratic.title"));
		this.render();
	}

	onClose(): void {
		if (this.prefetchTimer !== null) window.clearTimeout(this.prefetchTimer);
		this.contentEl.empty();
	}

	private previous(upTo: number): PreviousAnswer[] {
		const out: PreviousAnswer[] = [];
		for (let i = 0; i < upTo; i++) {
			const s = this.slots[i];
			if (s?.question && s.answer.trim()) out.push({ category: s.question.category, question: s.question.text, answer: s.answer.trim() });
		}
		return out;
	}

	/** Pastikan pertanyaan ke-i ada (pakai hasil prefetch bila jawaban sebelumnya tidak berubah). */
	private ensureQuestion(i: number): Promise<Question> {
		const slot = this.slots[i] as Slot;
		if (slot.question) return Promise.resolve(slot.question);
		const existing = this.pending.get(i);
		if (existing) return existing;
		const prevAnswer = (this.slots[i - 1]?.answer ?? "").trim();
		const pre = this.prefetching.get(i);
		const promise = (pre && pre.snapshot === prevAnswer ? pre.promise : this.flow.getQuestion(i, this.previous(i))).then((q) => {
			slot.question = q;
			this.pending.delete(i);
			return q;
		});
		this.pending.set(i, promise);
		return promise;
	}

	private schedulePrefetch(area: HTMLTextAreaElement): void {
		const i = this.index;
		if (!this.flow.prefetch || i >= this.slots.length - 1 || this.prefetchStarted.has(i + 1)) return;
		if (this.prefetchTimer !== null) window.clearTimeout(this.prefetchTimer);
		if (area.value.trim().length < this.settings.socraticMinChars) return;
		this.prefetchTimer = window.setTimeout(() => {
			this.prefetchTimer = null;
			const answer = area.value.trim();
			if (this.index !== i || answer.length < this.settings.socraticMinChars || this.prefetchStarted.has(i + 1)) return;
			this.prefetchStarted.add(i + 1);
			const prev = [...this.previous(i)];
			const q = this.slots[i]?.question;
			if (q) prev.push({ category: q.category, question: q.text, answer });
			this.prefetching.set(i + 1, { snapshot: answer, promise: this.flow.getQuestion(i + 1, prev) });
		}, PREFETCH_IDLE_MS);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const n = this.slots.length;
		const i = this.index;
		const slot = this.slots[i] as Slot;
		const last = i === n - 1;

		contentEl.createDiv({ cls: "bengkel-progress", text: this.t("socratic.progress", { i: i + 1, n }), attr: { "aria-live": "polite" } });

		if (!slot.question) {
			contentEl.createEl("p", { cls: "bengkel-loading", text: this.t("modal.loading"), attr: { role: "status" } });
			const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
			const back = row.createEl("button", { text: this.t("btn.back") });
			back.disabled = i === 0;
			back.addEventListener("click", () => {
				this.index--;
				this.render();
			});
			void this.ensureQuestion(i).then(() => {
				if (this.index === i && !this.done) this.render();
			});
			return;
		}

		const q = slot.question;
		contentEl.createEl("h4", { text: this.t(`cat.${q.category}`) });
		contentEl.createDiv({ cls: "bengkel-source", text: formatSource(q.source ?? { kind: "bank" }, this.lang) });
		const qEl = contentEl.createEl("p", { text: q.text, cls: "bengkel-question", attr: { id: `bengkel-q-${i}` } });

		for (const [k, h] of slot.hintTexts.entries()) {
			const box = contentEl.createDiv({ cls: "bengkel-hint" });
			box.createEl("strong", { text: this.t("modal.hintTitle", { n: k + 1 }) });
			box.createSpan({ text: ` · ${h.source}` , cls: "bengkel-source"});
			box.createEl("p", { text: h.text });
		}

		const area = contentEl.createEl("textarea", { cls: "bengkel-answer", attr: { rows: "6", "aria-labelledby": qEl.id } });
		area.value = slot.answer;
		const counter = contentEl.createDiv({ cls: "bengkel-counter" });
		const status = contentEl.createDiv({ cls: "bengkel-gate-status", attr: { "aria-live": "polite" } });

		const tools = contentEl.createDiv({ cls: "bengkel-tools" });
		const flag = tools.createEl("button", { cls: "bengkel-flag", attr: { "aria-pressed": String(slot.flagged) } });
		const setFlagText = () => {
			flag.setText(this.t(slot.flagged ? "modal.flagged" : "modal.flag"));
			flag.setAttr("aria-pressed", String(slot.flagged));
		};
		setFlagText();
		flag.addEventListener("click", () => {
			slot.flagged = !slot.flagged;
			setFlagText();
		});

		if (this.flow.getHint && this.flow.hintsPerQuestion > 0 && slot.hints < this.flow.hintsPerQuestion) {
			const hintBtn = tools.createEl("button", { text: this.t("modal.hint", { n: this.flow.hintsPerQuestion - slot.hints }) });
			hintBtn.addEventListener("click", () => {
				slot.answer = area.value;
				hintBtn.disabled = true;
				hintBtn.setText(this.t("modal.hintLoading"));
				void this.flow.getHint?.(q, slot.hints + 1, area.value).then((res) => {
					if (this.done) return;
					if (res) {
						slot.hints++;
						slot.hintTexts.push({ text: res.text, source: formatSource(res.source, this.lang) });
					} else {
						new Notice(this.t("modal.hintUnavailable"));
					}
					if (this.index === i) this.render();
				});
			});
		}

		const row = contentEl.createDiv({ cls: "bengkel-modal-buttons" });
		const back = row.createEl("button", { text: this.t("btn.back") });
		back.disabled = i === 0;
		const forward = row.createEl("button", { text: this.t(last ? "btn.finish" : "btn.next"), cls: "mod-cta" });

		const update = () => {
			slot.answer = area.value;
			const len = area.value.trim().length;
			const min = this.settings.socraticMinChars;
			counter.setText(this.t("socratic.chars", { c: len, m: min }));
			counter.toggleClass("is-short", len < min);
			if (last) {
				const answers = this.slots.map((s) => s.answer);
				const outcome = socraticGate.evaluate({ settings: this.settings, answers });
				forward.disabled = !outcome.passed;
				status.setText(outcome.passed ? "" : this.t("socratic.incomplete", { m: min }));
			} else {
				forward.disabled = len < min; // R-2
				status.setText(len < min ? this.t("socratic.needMin", { m: min }) : this.t("socratic.hint"));
			}
			this.schedulePrefetch(area);
		};
		area.addEventListener("input", update);
		update();

		const advance = () => {
			slot.answer = area.value;
			if (forward.disabled || this.done) return;
			if (!last) {
				this.index++;
				this.render();
				return;
			}
			this.done = true;
			this.close();
			this.flow.onDone(
				this.slots.map((s) => ({ question: s.question as Question, answer: s.answer, flagged: s.flagged, hints: s.hints })),
			);
		};
		forward.addEventListener("click", advance);
		back.addEventListener("click", () => {
			slot.answer = area.value;
			this.index--;
			this.render();
		});
		area.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
				e.preventDefault();
				advance();
			}
		});
		area.focus();
	}
}
