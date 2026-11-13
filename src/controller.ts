import { MarkdownView, Notice } from "obsidian";
import type { App, TFile } from "obsidian";
import type { IdeaIndex } from "./adapter/ideaIndex";
import type { NoteFactory } from "./adapter/noteFactory";
import type { NoteWriter } from "./adapter/noteWriter";
import type { TemplateInstaller } from "./adapter/templateInstaller";
import type { IdeaRepository } from "./adapter/repository";
import type { TermSource } from "./adapter/termSource";
import { formatCallout } from "./domain/callout";
import type { CalloutEntry } from "./domain/callout";
import { daysBetween, toISODate } from "./domain/dates";
import { analyze } from "./domain/feynman/analyzer";
import type { Gap } from "./domain/feynman/analyzer";
import { hasLegacyProps, planAdopt } from "./domain/frontmatter";
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
import { ConfirmModal } from "./ui/confirmModal";
import { DevilModal } from "./ui/devilModal";
import { PremortemModal } from "./ui/premortemModal";
import { suggest } from "./domain/v08";
import { bodyOf, buildDigest, connectQuestion, gatesFromText, rankCandidates, relatedLine } from "./domain/v08";
import type { ConnectNote } from "./domain/v08";
import { ConnectModal } from "./ui/connectModal";
import type { ConnectItem } from "./ui/connectModal";
import { PREMORTEM_CATEGORIES } from "./domain/v08";
import type { SourceLabel } from "./domain/ai/types";
import { RecallSession, parseQaPairs, pickRecall, premortemPassed, premortemQuestions, retrievalReview } from "./domain/v08";
import type { SelfRating } from "./domain/v08";
import { RetrievalModal } from "./ui/retrievalModal";
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
	templates: TemplateInstaller;
	refreshTemplateFolder(): Promise<void>;
	getQuestionService(): QuestionService;
	saveSettings(): Promise<void>;
	refreshViews(): void;
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

	/** path -> ada jejak jawaban lama? (cache per mtime supaya Inkubator tidak membaca berkas saat render) */
	private recallCache = new Map<string, { mtime: number; has: boolean }>();
	private recallBusy = new Set<string>();
	/** FY-2: jumlah pertanyaan lanjutan yang sudah diminta per (catatan|istilah) pada sesi ini. */
	private followCount = new Map<string, number>();

	/** AI aktif tetapi gagal: beri tahu, lalu pemanggil memakai bank/aturan. */
	private noticeAiFailed(svc: QuestionService): void {
		if (!svc.aiAvailable) return;
		const fails = svc.lastAttempts.filter((a) => !a.ok);
		const reason = (fails.length ? fails.map((a) => a.provider + ": " + (a.error ?? "error")).join("; ") : "no valid output").slice(0, 200);
		new Notice(this.t("notice.aiFailedBank", { reason }));
	}

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

	/** Perintah "Migrate Seedbed properties": ubah catatan berproperti lama, dengan konfirmasi. Konflik dilewati dan didaftar. */
	migrateProperties(): void {
		const t = this.t;
		const names = this.settings.properties;
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => hasLegacyProps(this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined, names));
		if (files.length === 0) {
			new Notice(t("migrate.none"));
			return;
		}
		new ConfirmModal(this.app, t("migrate.title"), t("migrate.body", { n: files.length }), t("btn.cancel"), t("migrate.confirm"), (ok) => {
			if (!ok) return;
			void this.safe(async () => {
				let done = 0;
				let failed = 0;
				const skipped: string[] = [];
				for (const f of files) {
					try {
						const r = await this.host.repo.migrate(f);
						if (r.conflict) skipped.push(f.path);
						else if (r.changed) done++;
					} catch (e) {
						failed++;
						console.error("[seedbed] migrate", f.path, e);
					}
				}
				const summary = t("migrate.done", { n: done, skipped: skipped.length, failed });
				if (skipped.length === 0) {
					new Notice(summary);
					return;
				}
				const shown = skipped.slice(0, 25);
				if (skipped.length > shown.length) shown.push(t("migrate.more", { n: skipped.length - shown.length }));
				new ConfirmModal(this.app, t("migrate.title"), `${summary} ${t("migrate.skippedHint")}`, "", t("btn.ok"), () => undefined, shown).open();
			});
		}).open();
	}

	/** Perintah "Create Seedbed templates": tidak pernah menimpa; melaporkan yang dibuat dan yang dilewati. */
	async createTemplates(): Promise<void> {
		const t = this.t;
		const r = await this.host.templates.create();
		await this.host.refreshTemplateFolder();
		const parts: string[] = [];
		if (r.created.length > 0) parts.push(t("templates.created", { n: r.created.length, folder: r.folder || "/" }));
		if (r.skipped.length > 0) parts.push(t("templates.skipped", { names: r.skipped.join(", ") }));
		new Notice(parts.join(" "));
	}

	/** Tawaran sekali saat plugin pertama kali aktif: tidak menulis apa pun tanpa persetujuan. */
	async offerTemplates(): Promise<void> {
		if (this.settings.templates.offered) return;
		const t = this.t;
		const folder = await this.host.templates.folder();
		this.settings.templates.offered = true;
		await this.host.saveSettings();
		new ConfirmModal(this.app, t("templates.offer.title"), t("templates.offer.body", { folder }), t("templates.offer.later"), t("templates.offer.create"), (ok) => {
			if (ok) void this.safe(() => this.createTemplates());
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
		// Catatan yang sudah punya type/status dari template lain tidak ditimpa (nama properti umum mudah bentrok).
		const plan = planAdopt(
			this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined,
			{ tipe, status: "benih", dibuat: today, tinjau: nextReview("benih", today, this.settings), gerbang: [] },
			this.settings.properties,
		);
		if (!plan.ok) {
			new Notice(this.t("notice.adoptConflict", { key: plan.key }));
			return;
		}
		await this.host.repo.write(file, plan.patch);
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

	// ---------- Pre-mortem (0.8.0) ----------

	async premortemActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		if (!this.host.index.get(file.path)) {
			new Notice(this.t("notice.notIdea"));
			return;
		}
		await this.premortem(file.path);
	}

	/** Gerbang opsional untuk ide matang. Tidak mengubah status/review; hanya menambah 'premortem' ke gates bila lolos. */
	async premortem(path: string): Promise<void> {
		if (!this.settings.premortem.enabled) {
			new Notice(this.t("notice.pmDisabled"));
			return;
		}
		const cur = this.ideaOf(path);
		if (!cur) return;
		if (cur.idea.status !== "matang") {
			new Notice(this.t("notice.pmNotMature"));
			return;
		}
		const { file } = cur;
		const lang = this.settings.language;
		let items: Array<{ category: (typeof PREMORTEM_CATEGORIES)[number]; text: string; source: SourceLabel }> = premortemQuestions(lang).map((q) => ({ ...q, source: { kind: "bank" } as SourceLabel }));
		const svc = this.host.getQuestionService();
		if (svc.aiAvailable) {
			new Notice(this.t("notice.aiPreparing"));
			const ai = await svc.premortemBatch({ language: lang, noteText: await this.app.vault.read(file) });
			if (ai) items = items.map((it, i) => (ai.texts[i] ? { ...it, text: ai.texts[i] as string, source: ai.source } : it));
			else this.noticeAiFailed(svc);
		}
		const cfg = this.settings.premortem;
		new PremortemModal(this.app, this.t, lang, items, {
			minAnswered: cfg.minAnswered,
			minChars: cfg.minChars,
			onDone: (answers) => {
				void this.safe(async () => {
					const filled = answers.filter((a) => a.answer.trim().length > 0);
					if (filled.length === 0) return;
					const entries: CalloutEntry[] = filled.map((a) => ({
						label: this.t(`cat.${a.item.category}`),
						question: a.item.text,
						answer: a.answer.trim(),
						source: formatSource(a.item.source ?? { kind: "bank" }, lang),
					}));
					await this.host.writer.appendCallout(
						file,
						formatCallout("premortem", this.t("callout.premortem"), this.today(), entries, this.t("callout.answer")),
					);
					const res = premortemPassed(answers.map((a) => a.answer), cfg.minAnswered, cfg.minChars);
					if (res.passed) {
						await this.host.repo.write(file, { addGates: ["premortem"] });
						new Notice(this.t("notice.pmPassed"));
					} else {
						new Notice(this.t("notice.pmSaved"));
					}
				});
			},
		}).open();
	}

	// ---------- Retrieval (0.8.0) ----------

	/** Sinkron: pakai cache; bila belum ada, hitung di latar belakang lalu segarkan tampilan. */
	hasRecall(path: string): boolean {
		if (!this.settings.retrieval.enabled) return false;
		const file = this.host.repo.getFile(path);
		if (!file) return false;
		const hit = this.recallCache.get(path);
		if (hit && hit.mtime === file.stat.mtime) return hit.has;
		if (!this.recallBusy.has(path)) {
			this.recallBusy.add(path);
			const mtime = file.stat.mtime;
			void this.app.vault
				.cachedRead(file)
				.then((text) => {
					this.recallCache.set(path, { mtime, has: parseQaPairs(text).length > 0 });
					this.recallBusy.delete(path);
					this.host.refreshViews();
				})
				.catch(() => this.recallBusy.delete(path));
		}
		return false;
	}

	async recallActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		if (!this.host.index.get(file.path)) {
			new Notice(this.t("notice.notIdea"));
			return;
		}
		await this.recall(file.path);
	}

	/** Latihan mengingat: pertanyaan lama dulu, jawaban lama baru terbuka setelah jawaban baru dikirim. Tanpa skor. */
	async recall(path: string): Promise<void> {
		if (!this.settings.retrieval.enabled) {
			new Notice(this.t("notice.recallDisabled"));
			return;
		}
		const cur = this.ideaOf(path);
		if (!cur) return;
		const { idea, file } = cur;
		const text = await this.app.vault.read(file);
		const picked = idea.status === "dibuang" ? [] : pickRecall(parseQaPairs(text), 2);
		if (picked.length === 0) {
			new Notice(this.t("notice.recallNone"));
			return;
		}
		const session = new RecallSession(picked);
		const lang = this.settings.language;
		new RetrievalModal(this.app, this.t, {
			questions: session.questions().map((q) => ({ label: q.label, question: q.question })),
			submit: (i, a) => session.submit(i, a),
			onFinish: (_count, rating: SelfRating | undefined) => {
				void this.safe(async () => {
					const done = session.answered();
					if (done.length === 0) return;
					const entries: CalloutEntry[] = done.map((d) => ({
						label: this.t("callout.recallLabel"),
						question: d.pair.question,
						answer: d.answer,
						source: formatSource({ kind: "bank" }, lang),
						meta: rating ? [rating] : [],
						extra: [{ label: this.t("callout.earlier"), text: d.pair.answer }],
					}));
					await this.host.writer.appendCallout(
						file,
						formatCallout("retrieval", this.t("callout.retrieval"), this.today(), entries, this.t("callout.answer")),
					);
					const next = retrievalReview(idea.status, rating, this.today(), this.settings);
					if (next !== null) {
						await this.host.repo.write(file, { tinjau: next });
						new Notice(this.t("notice.recallSaved", { date: next }));
					}
				});
			},
		}).open();
	}

	// ---------- Connect (0.8.0) ----------

	async connectActive(): Promise<void> {
		const file = this.activeMarkdown();
		if (!file) return;
		if (!this.host.index.get(file.path)) {
			new Notice(this.t("notice.notIdea"));
			return;
		}
		await this.connect(file.path);
	}

	/** Kandidat hanya dari IdeaIndex (catatan Seedbed). Catatan lain tidak pernah dibaca. Tautan hanya setelah klik. */
	async connect(path: string): Promise<void> {
		if (!this.settings.connect.enabled) {
			new Notice(this.t("notice.connectDisabled"));
			return;
		}
		const cur = this.ideaOf(path);
		if (!cur) return;
		const { file } = cur;
		const target: ConnectNote = { path, title: cur.idea.title, text: await this.app.vault.read(file) };
		const pool = this.host.index.all().filter((i) => i.path !== path);
		// Vault besar: baca isi hanya untuk 300 catatan dengan judul paling mirip dulu.
		const byTitle = rankCandidates(
			{ ...target, text: "" },
			pool.map((i) => ({ path: i.path, title: i.title, text: "" })),
			pool.length,
		).map((x) => x.note.path);
		const rest = pool.map((i) => i.path).filter((p) => !byTitle.includes(p));
		const chosen = [...byTitle, ...rest].slice(0, 300);
		const others: ConnectNote[] = [];
		for (const p of chosen) {
			const f = this.host.repo.getFile(p);
			const idea = this.host.index.get(p);
			if (!f || !idea) continue;
			others.push({ path: p, title: idea.title, text: bodyOf(await this.app.vault.cachedRead(f)).slice(0, 600) });
		}
		const ranked = rankCandidates(target, others, 10);
		if (ranked.length === 0) {
			new Notice(this.t("notice.connectNone"));
			return;
		}
		const lang = this.settings.language;
		let items: ConnectItem[] = ranked.map((r) => ({ path: r.note.path, title: r.note.title, question: connectQuestion(lang, r.note.title), source: { kind: "bank" } }));
		const svc = this.host.getQuestionService();
		if (svc.aiAvailable) {
			new Notice(this.t("notice.aiPreparing"));
			// Hanya catatan aktif + (judul, 300 karakter pertama) kandidat Seedbed yang dikirim. Tanpa path.
			const ai = await svc.connectBatch(
				{ language: lang, noteText: target.text },
				ranked.map((r) => ({ title: r.note.title, text: r.note.text })),
			);
			if (ai) items = items.map((it, i) => (ai.texts[i] ? { ...it, question: ai.texts[i] as string, source: ai.source } : it));
			else this.noticeAiFailed(svc);
		}
		new ConnectModal(this.app, this.t, lang, items, {
			addLink: async (item) => {
				let added = false;
				await this.safe(async () => {
					added = await this.host.writer.appendLine(file, relatedLine(item.title));
				});
				return added;
			},
			onDone: (answers) => {
				void this.safe(async () => {
					if (answers.length === 0) return;
					const entries: CalloutEntry[] = answers.map((a) => ({
						label: a.item.title,
						question: a.item.question,
						answer: a.answer,
						source: formatSource(a.item.source ?? { kind: "bank" }, lang),
					}));
					await this.host.writer.appendCallout(file, formatCallout("connect", this.t("callout.connect"), this.today(), entries, this.t("callout.answer")));
					new Notice(this.t("notice.connectSaved"));
				});
			},
		}).open();
	}

	// ---------- Digest (0.8.0) ----------

	/** Digest mingguan: tulis `Seedbed digest YYYY-MM-DD.md` (tidak menimpa). Hanya catatan Seedbed yang dibaca. */
	async createDigest(): Promise<void> {
		const today = this.today();
		const ideas = this.host.index.all();
		const gatesThisWeek: Array<{ title: string; gate: string }> = [];
		for (const idea of ideas) {
			// Hanya catatan yang diedit dalam 7 hari terakhir yang mungkin punya callout baru.
			if (idea.status === "dibuang" || !idea.tersentuh || daysBetween(idea.tersentuh, today) > 7) continue;
			const file = this.host.repo.getFile(idea.path);
			if (!file) continue;
			const text = await this.app.vault.cachedRead(file);
			for (const gate of gatesFromText(text, today)) gatesThisWeek.push({ title: idea.title, gate });
		}
		let suggestQuestion: { text: string; source: string } | undefined;
		const svc = this.host.getQuestionService();
		const sug = svc.aiAvailable ? suggest(ideas, today, this.settings.digest.stuckDays) : null;
		if (sug) {
			const facts = (sug.reasonKey === "due" ? "review overdue " : "not edited for ") + sug.days + " days; status " + sug.idea.status;
			const ai = await svc.digestQuestion(this.settings.language, sug.idea.title, facts);
			if (ai) suggestQuestion = { text: ai.text, source: formatSource(ai.source, this.settings.language) };
			else this.noticeAiFailed(svc);
		}
		const body = buildDigest({ ideas, today, stuckDays: this.settings.digest.stuckDays, gatesThisWeek, lang: this.settings.language, suggestQuestion });
		const file = await this.host.factory.createDigest(this.settings.digest.folder, `Seedbed digest ${today}`, body);
		new Notice(this.t("notice.digestCreated", { path: file.path }));
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	// ---------- Feynman: tanya lanjut (FY-2) ----------

	get aiFollowUp(): boolean {
		return this.host.getQuestionService().aiAvailable;
	}

	followUpLeft(path: string, key: string): number {
		return Math.max(0, 2 - (this.followCount.get(path + "|" + key) ?? 0));
	}

	/** Maks. 2 pertanyaan per celah per sesi; tidak disimpan di catatan. Gerbang tetap dihitung analyze(). */
	async followUp(path: string, gap: Gap): Promise<{ text: string; source: string } | null> {
		const svc = this.host.getQuestionService();
		const k = path + "|" + gap.key;
		if (!svc.aiAvailable || this.followUpLeft(path, gap.key) <= 0) return null;
		const res = await svc.followUp(this.settings.language, gap.term, gap.weak ?? "missing", gap.snippet);
		if (!res) {
			this.noticeAiFailed(svc);
			return null;
		}
		this.followCount.set(k, (this.followCount.get(k) ?? 0) + 1);
		return { text: res.text, source: formatSource(res.source, this.settings.language) };
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
