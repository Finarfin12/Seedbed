import { MarkdownView, Notice } from "obsidian";
import type { App, TFile } from "obsidian";
import type { IdeaIndex } from "./adapter/ideaIndex";
import type { NoteFactory } from "./adapter/noteFactory";
import type { NoteWriter } from "./adapter/noteWriter";
import type { IdeaRepository } from "./adapter/repository";
import type { TermSource } from "./adapter/termSource";
import { formatCallout } from "./domain/callout";
import type { CalloutEntry } from "./domain/callout";
import { toISODate } from "./domain/dates";
import { analyze } from "./domain/feynman/analyzer";
import type { Gap } from "./domain/feynman/analyzer";
import { devilGate } from "./domain/gates/devil";
import { feynmanGate } from "./domain/gates/feynman";
import { socraticGate } from "./domain/gates/socratic";
import { SOCRATIC_CATEGORIES } from "./domain/questions/provider";
import type { Question } from "./domain/questions/provider";
import type { QuestionService } from "./domain/ai/questionService";
import { formatSource } from "./domain/ai/types";
import { nextReview, snooze } from "./domain/scheduler";
import { canTransition, nextStatus } from "./domain/stateMachine";
import { applyPatchFor } from "./domain/transition";
import type { GateId, Idea, Settings, Status, Tipe } from "./domain/types";
import { makeT } from "./i18n";
import type { TFn } from "./i18n";
import { DevilModal } from "./ui/devilModal";
import { PromptModal } from "./ui/promptModal";
import type { HintFn, SessionEntry } from "./ui/session";
import { SocraticModal } from "./ui/socraticModal";
import type { SocraticFlow } from "./ui/socraticModal";

/** Yang dibutuhkan Controller dari plugin (menghindari impor melingkar). */
export interface PluginHost {
	app: App;
	settings: Settings;
	index: IdeaIndex;
	repo: IdeaRepository;
	writer: NoteWriter;
	termSource: TermSource;
	factory: NoteFactory;
	getQuestionService(): QuestionService;
	saveSettings(): Promise<void>;
	openIncubator(): Promise<void>;
	showGaps(path: string): Promise<void>;
}

export interface Analysis {
	path: string;
	gaps: Gap[];
	openTerms: number;
	maxGaps: number;
}

/** Orkestrasi aksi pengguna: menggabungkan domain (aturan) dengan adapter (vault) dan UI. */
export class Controller {
	constructor(private host: PluginHost) {}

	private get app(): App {
		return this.host.app;
	}
	private get settings(): Settings {
		return this.host.settings;
	}
	get t(): TFn {
		return makeT(this.settings.language);
	}
	today(): string {
		return toISODate(new Date());
	}

	/** Bungkus aksi: kesalahan ditampilkan sebagai Notice, bukan diam-diam. */
	async safe(fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
		} catch (e) {
			console.error("[seedbed]", e);
			new Notice(this.t("notice.error", { error: e instanceof Error ? e.message : String(e) }));
		}
	}

	private activeMarkdown(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice(this.t("notice.noActiveNote"));
			return null;
		}
		return file;
	}

	// ---------- Menangkap & membuat ----------

	capture(): void {
		const t = this.t;
		new PromptModal(this.app, t, t("prompt.captureTitle"), t("prompt.captureLabel"), (title) => {
			void this.safe(() => this.createNote(title, "ide", false));
		}).open();
	}

	startFeynman(): void {
		const t = this.t;
		new PromptModal(this.app, t, t("prompt.feynmanTitle"), t("prompt.feynmanLabel"), (title) => {
			void this.safe(() => this.createNote(title, "konsep", true));
		}).open();
	}

	private async createNote(title: string, tipe: Tipe, feynman: boolean): Promise<void> {
		const file = await this.host.factory.create(title, tipe, this.today(), this.settings, this.settings.language, feynman);
		if (!file) {
			new Notice(this.t("notice.emptyTitle"));
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
		new Notice(this.t("notice.created", { name: file.basename }));
	}

	async makeFromActive(tipe: Tipe): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		if (this.host.index.get(file.path)) {
			new Notice(this.t("notice.alreadyIdea"));
			return;
		}
		const today = this.today();
		await this.host.repo.write(file, {
			tipe,
			status: "benih",
			dibuat: today,
			tinjau: nextReview("benih", today, this.settings),
			gerbang: [],
		});
		new Notice(this.t(tipe === "ide" ? "notice.madeIdea" : "notice.madeConcept", { name: file.basename }));
	}

	// ---------- Status ----------

	private ideaOf(path: string): { idea: Idea; file: TFile } | null {
		const idea = this.host.index.get(path);
		const file = this.host.repo.getFile(path);
		if (!idea || !file) return null;
		return { idea, file };
	}

	async promoteActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		if (!this.host.index.get(file.path)) {
			new Notice(this.t("notice.notIdea"));
			return;
		}
		await this.promote(file.path);
	}

	/** "Naikkan": langsung jika tanpa gerbang, atau buka gerbang yang dibutuhkan. */
	async promote(path: string): Promise<void> {
		const cur = this.ideaOf(path);
		if (!cur) return;
		const to = nextStatus(cur.idea.status);
		if (!to) {
			new Notice(this.t("notice.alreadyMature"));
			return;
		}
		const res = canTransition(cur.idea, to, this.settings);
		if (res.ok) return this.commit(cur.idea, cur.file, to);
		switch (res.requiredGate) {
			case "socratic":
				return this.runSocratic(cur.idea, cur.file, to);
			case "devil":
				return this.runDevil(cur.idea, cur.file, to);
			case "feynman":
				return this.runFeynmanGate(cur.idea, cur.file, to);
			default:
				new Notice(this.t(`notice.cannot.${res.reason ?? "skip-not-allowed"}`));
		}
	}

	/** Buang / Buka ulang / Pulihkan. */
	async transitionTo(path: string, to: Status): Promise<void> {
		const cur = this.ideaOf(path);
		if (!cur) return;
		const res = canTransition(cur.idea, to, this.settings);
		if (!res.ok) {
			new Notice(this.t(`notice.cannot.${res.reason ?? "skip-not-allowed"}`));
			return;
		}
		await this.commit(cur.idea, cur.file, to);
	}

	async snooze(path: string): Promise<void> {
		const cur = this.ideaOf(path);
		if (!cur || cur.idea.status === "dibuang") return;
		const date = snooze(this.today(), this.settings.snoozeDays);
		await this.host.repo.write(cur.file, { tinjau: date });
		new Notice(this.t("notice.snoozed", { name: cur.file.basename, date }));
	}

	private async commit(idea: Idea, file: TFile, to: Status, gate?: GateId): Promise<void> {
		const patch = applyPatchFor(idea, to, this.today(), this.settings, gate);
		await this.host.repo.write(file, patch);
		new Notice(this.t("notice.moved", { name: file.basename, status: this.t(`status.${to}`) }));
	}

	// ---------- Gerbang ----------

	/** Entri callout: label sumber (R-6), tanda keliru (R-5), jumlah petunjuk (R-3). */
	private entriesOf(entries: SessionEntry[], skipEmpty: boolean): CalloutEntry[] {
		const lang = this.settings.language;
		const out: CalloutEntry[] = [];
		for (const e of entries) {
			const answer = e.answer.trim();
			if (skipEmpty && answer.length === 0) continue;
			const meta: string[] = [];
			if (e.flagged) meta.push(this.t("callout.flagged"));
			if (e.hints > 0) meta.push(this.t("callout.hints", { n: e.hints }));
			out.push({
				label: this.t(`cat.${e.question.category}`),
				question: e.question.text,
				answer,
				source: formatSource(e.question.source ?? { kind: "bank" }, lang),
				meta,
			});
		}
		return out;
	}

	/** Beri tahu pengguna bila AI diaktifkan tetapi gagal sehingga bank dipakai. */
	private noticeFallback(svc: QuestionService, used: Question[]): void {
		if (!svc.aiAvailable || used.length === 0 || used.some((q) => q.source?.kind !== "bank")) return;
		const fails = svc.lastAttempts.filter((a) => !a.ok);
		if (fails.length === 0) return;
		const reason = fails.map((a) => `${a.provider}: ${a.error ?? "error"}`).join("; ").slice(0, 200);
		new Notice(this.t("notice.aiFallback", { reason }));
	}

	private hintFn(svc: QuestionService, ctx: { language: Settings["language"]; noteText: string }): HintFn | undefined {
		if (!svc.aiAvailable || this.settings.ai.hintsPerQuestion <= 0) return undefined;
		return (q, level, answer) => svc.hint(q.text, level, ctx, answer);
	}

	private async runSocratic(idea: Idea, file: TFile, to: Status): Promise<void> {
		const noteText = await this.app.vault.read(file);
		const svc = this.host.getQuestionService();
		const ctx = { language: this.settings.language, noteText };
		const adaptive = svc.aiAvailable && this.settings.ai.socraticMode === "adaptif";
		let batch: Question[] | null = null;
		if (!adaptive) {
			// Bank, atau AI mode "satu tarikan": semua pertanyaan diambil sekaligus di awal.
			if (svc.aiAvailable) new Notice(this.t("notice.aiPreparing"));
			batch = await svc.batch("socratic", ctx);
			this.noticeFallback(svc, batch);
		}
		let warned = false;
		const flow: SocraticFlow = {
			categories: SOCRATIC_CATEGORIES,
			getQuestion: async (i, previous) => {
				if (batch) return batch[i] as Question;
				const q = await svc.next("socratic", SOCRATIC_CATEGORIES[i] as string, ctx, previous);
				if (!warned && q.source?.kind === "bank") {
					warned = true;
					this.noticeFallback(svc, [q]);
				}
				return q;
			},
			getHint: this.hintFn(svc, ctx),
			hintsPerQuestion: this.settings.ai.hintsPerQuestion,
			prefetch: adaptive,
			onDone: (entries) => {
				void this.safe(async () => {
					// R-4: gerbang dinilai aturan pasti (panjang jawaban), bukan AI.
					const outcome = socraticGate.evaluate({ settings: this.settings, answers: entries.map((e) => e.answer) });
					if (!outcome.passed) return;
					const block = formatCallout(
						"socratic",
						this.t("callout.socratic"),
						this.today(),
						this.entriesOf(entries, false),
						this.t("callout.answer"),
					);
					await this.host.writer.appendCallout(file, block);
					await this.commit(idea, file, to, "socratic");
				});
			},
		};
		new SocraticModal(this.app, this.t, this.settings.language, this.settings, flow).open();
	}

	private async runDevil(idea: Idea, file: TFile, to: Status): Promise<void> {
		const required = Math.min(5, Math.max(1, this.settings.devilMinAnswered));
		await this.openDevil(file, required, async (entries) => {
			const outcome = devilGate.evaluate({ settings: this.settings, answers: entries.map((e) => e.answer) });
			if (!outcome.passed) return;
			await this.host.writer.appendCallout(file, this.devilBlock(entries));
			await this.commit(idea, file, to, "devil");
		});
	}

	/** "Tantang ide ini": bisa dipakai kapan saja, pada catatan apa pun. */
	async challengeActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		await this.openDevil(file, 1, async (entries) => {
			await this.host.writer.appendCallout(file, this.devilBlock(entries));
			const idea = this.host.index.get(file.path);
			const outcome = devilGate.evaluate({ settings: this.settings, answers: entries.map((e) => e.answer) });
			if (idea && outcome.passed && !idea.gerbang.includes("devil")) {
				await this.host.repo.write(file, { gerbang: [...idea.gerbang, "devil"] });
				new Notice(this.t("notice.gatePassed"));
			} else {
				new Notice(this.t("notice.challengeSaved"));
			}
		});
	}

	private devilBlock(entries: SessionEntry[]): string {
		return formatCallout("devil", this.t("callout.devil"), this.today(), this.entriesOf(entries, true), this.t("callout.answer"));
	}

	private async openDevil(file: TFile, required: number, onDone: (entries: SessionEntry[]) => Promise<void>): Promise<void> {
		const noteText = await this.app.vault.read(file);
		const svc = this.host.getQuestionService();
		const ctx = { language: this.settings.language, noteText };
		if (svc.aiAvailable) new Notice(this.t("notice.aiPreparing"));
		const questions = await svc.batch("devil", ctx);
		this.noticeFallback(svc, questions);
		new DevilModal(this.app, this.t, this.settings.language, questions, required, {
			getHint: this.hintFn(svc, ctx),
			hintsPerQuestion: this.settings.ai.hintsPerQuestion,
			onDone: (entries) => {
				void this.safe(() => onDone(entries));
			},
		}).open();
	}

	// ---------- Feynman ----------

	async analyzeFile(path: string): Promise<Analysis | null> {
		const file = this.host.repo.getFile(path);
		if (!file) return null;
		const text = await this.app.vault.read(file);
		const terms = this.host.termSource.getTerms(path);
		const ignored = this.settings.feynman.ignored[path] ?? [];
		const gaps = analyze(text, terms, this.settings, ignored);
		const gate = feynmanGate.evaluate({ settings: this.settings, gaps });
		return { path, gaps, openTerms: gate.done, maxGaps: this.settings.feynman.maxGaps };
	}

	private async runFeynmanGate(idea: Idea, file: TFile, to: Status): Promise<void> {
		const analysis = await this.analyzeFile(file.path);
		if (!analysis) return;
		const outcome = feynmanGate.evaluate({ settings: this.settings, gaps: analysis.gaps });
		if (outcome.passed) {
			await this.commit(idea, file, to, "feynman");
			return;
		}
		new Notice(this.t("notice.feynmanGaps", { n: outcome.done }));
		await this.host.showGaps(file.path);
	}

	async checkFeynmanActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		await this.host.showGaps(file.path);
	}

	async ignoreTerm(path: string, key: string): Promise<void> {
		const list = this.settings.feynman.ignored[path] ?? [];
		if (!list.includes(key)) list.push(key);
		this.settings.feynman.ignored[path] = list;
		await this.host.saveSettings();
	}

	/** Buka catatan dan loncat ke posisi karakter (klik pada celah). */
	async jumpTo(path: string, offset: number, length: number): Promise<void> {
		const file = this.host.repo.getFile(path);
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			const from = view.editor.offsetToPos(offset);
			const to = view.editor.offsetToPos(offset + length);
			view.editor.setSelection(from, to);
			view.editor.scrollIntoView({ from, to }, true);
			view.editor.focus();
		}
	}

	async openPath(path: string): Promise<void> {
		const file = this.host.repo.getFile(path);
		if (file) await this.app.workspace.getLeaf(false).openFile(file);
	}
}
