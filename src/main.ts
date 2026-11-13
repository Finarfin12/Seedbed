import { reminderDue } from "./domain/v08";
import { Notice, Platform, Plugin, TFile, getLanguage, normalizePath } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { createQuestionService } from "./adapter/ai/factory";
import type { FactoryDeps } from "./adapter/ai/factory";
import { detectProviders } from "./adapter/ai/detector";
import type { Detection } from "./adapter/ai/detector";
import { ObsidianHttp } from "./adapter/ai/obsidianHttp";
import { findExecutable, makeSandboxDir, NodeProcessRunner } from "./adapter/ai/runner";
import { CaptureHandler } from "./adapter/captureHandler";
import { IdeaIndex } from "./adapter/ideaIndex";
import { NoteFactory } from "./adapter/noteFactory";
import { TemplateInstaller } from "./adapter/templateInstaller";
import { isInTemplateFolder, planAutofill } from "./domain/templateFiles";
import { NoteWriter } from "./adapter/noteWriter";
import { IdeaRepository } from "./adapter/repository";
import { TermSource } from "./adapter/termSource";
import { Controller } from "./controller";
import type { Attempt } from "./domain/ai/chain";
import type { QuestionService } from "./domain/ai/questionService";
import { DEFAULT_SETTINGS, mergeSettings } from "./domain/settings";
import bankEn from "./domain/questions/bank.en.json";
import bankId from "./domain/questions/bank.id.json";
import { mergeBanks, StaticQuestionProvider } from "./domain/questions/staticProvider";
import type { Banks } from "./domain/questions/staticProvider";
import type { Settings } from "./domain/types";
import { FeynmanGapsView, GAPS_VIEW } from "./ui/gapsView";
import { INCUBATOR_VIEW, IncubatorView } from "./ui/incubatorView";
import { BengkelSettingTab } from "./ui/settingsTab";

const BASE_BANKS: Banks = { id: bankId as Banks["id"], en: bankEn as Banks["en"] };

export default class SeedbedPlugin extends Plugin {
	settings: Settings = structuredClone(DEFAULT_SETTINGS);
	index!: IdeaIndex;
	repo!: IdeaRepository;
	writer!: NoteWriter;
	termSource!: TermSource;
	factory!: NoteFactory;
	templates!: TemplateInstaller;
	/** Folder templat (di-cache sinkron untuk indeks); diperbarui saat start, saat pengaturan berubah, dan saat membuat templat. */
	templateFolder = "Templates";

	async refreshTemplateFolder(): Promise<void> {
		this.templateFolder = await this.templates.folder();
		this.rebuildIndex(false);
	}
	provider!: StaticQuestionProvider;
	controller!: Controller;
	private questionService!: QuestionService;
	/** Hitung panggilan AI sejak plugin dimuat (hanya di memori; untuk memantau kuota). */
	aiStats = { cli: 0, local: 0, api: 0 };
	lastDetection: Detection | null = null;
	private statusBarEl: HTMLElement | null = null;
	private startupNotified = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.index = new IdeaIndex(this.app, () => this.settings.properties, (p) => isInTemplateFolder(p, this.templateFolder));
		this.repo = new IdeaRepository(this.app, this.index, () => this.settings.properties);
		this.writer = new NoteWriter(this.app);
		this.termSource = new TermSource(this.app);
		this.factory = new NoteFactory(this.app);
		this.templates = new TemplateInstaller(this.app, () => this.settings);
		this.provider = new StaticQuestionProvider(BASE_BANKS);
		this.controller = new Controller(this);
		this.rebuildQuestionService();
		const c = this.controller;

		this.registerView(INCUBATOR_VIEW, (leaf: WorkspaceLeaf) => new IncubatorView(leaf, c, this.index, () => this.settings));
		this.registerView(GAPS_VIEW, (leaf: WorkspaceLeaf) => new FeynmanGapsView(leaf, c, this.index));
		this.addSettingTab(new BengkelSettingTab(this.app, this));
		this.registerCommands();
		// Tangkapan dari ekstensi Chrome "Seedbed Capture". Penangan memvalidasi semua parameter.
		const capture = new CaptureHandler(() => ({ app: this.app, settings: this.settings, index: this.index, repo: this.repo, factory: this.factory }));
		this.registerObsidianProtocolHandler("seedbed-capture", capture.handle);

		this.addRibbonIcon("lightbulb", c.t("cmd.openIncubator"), () => void this.openIncubator());

		// Status bar hanya ada di desktop; di mobile badge ada di panel Inkubator.
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("bengkel-statusbar");
		this.statusBarEl.addEventListener("click", () => void this.openIncubator());
		this.register(this.index.onChange(() => this.updateStatusBar()));

		// Event: semua lewat registerEvent supaya dilepas otomatis saat plugin dimatikan.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.index.updateFile(file);
				this.termSource.invalidate();
				this.scheduleAutofill(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) {
					this.index.rename(file, oldPath);
					this.termSource.invalidate();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.index.remove(file.path);
				this.termSource.invalidate();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.rebuildIndex(false);
			void this.refreshTemplateFolder();
			window.setTimeout(() => void this.controller.safe(() => this.controller.offerTemplates()), 1500);
			void this.loadQuestionBank(false);
			// Saat startup, metadata cache bisa belum lengkap; bangun ulang sekali lagi saat 'resolved'.
			const ref = this.app.metadataCache.on("resolved", () => {
				this.app.metadataCache.offref(ref);
				this.rebuildIndex(false);
				this.notifyStartup();
			});
			this.registerEvent(ref);
			window.setTimeout(() => this.notifyStartup(), 3000);
		});
	}

	private registerCommands(): void {
		const c = this.controller;
		const t = c.t;
		const run = (fn: () => Promise<void> | void) => () => void c.safe(async () => fn());
		this.addCommand({ id: "capture-idea", name: t("cmd.capture"), callback: run(() => c.capture()) });
		this.addCommand({ id: "make-idea", name: t("cmd.makeIdea"), callback: run(() => c.makeFromActive("ide")) });
		this.addCommand({ id: "make-concept", name: t("cmd.makeConcept"), callback: run(() => c.makeFromActive("konsep")) });
		this.addCommand({ id: "promote", name: t("cmd.promote"), callback: run(() => c.promoteActive()) });
		this.addCommand({ id: "challenge", name: t("cmd.challenge"), callback: run(() => c.challengeActive()) });
		this.addCommand({
			id: "premortem",
			name: t("cmd.premortem"),
			// Fitur dimatikan di pengaturan = perintah hilang dari palet.
			checkCallback: (checking) => {
				if (!this.settings.premortem.enabled) return false;
				if (!checking) run(() => c.premortemActive())();
				return true;
			},
		});
		this.addCommand({
			id: "recall",
			name: t("cmd.recall"),
			checkCallback: (checking) => {
				if (!this.settings.retrieval.enabled) return false;
				if (!checking) run(() => c.recallActive())();
				return true;
			},
		});
		this.addCommand({
			id: "connect",
			name: t("cmd.connect"),
			checkCallback: (checking) => {
				if (!this.settings.connect.enabled) return false;
				if (!checking) run(() => c.connectActive())();
				return true;
			},
		});
		this.addCommand({ id: "create-digest", name: t("cmd.digest"), callback: run(() => c.createDigest()) });
		this.addCommand({ id: "start-feynman", name: t("cmd.startFeynman"), callback: run(() => c.startFeynman()) });
		this.addCommand({ id: "check-feynman", name: t("cmd.checkFeynman"), callback: run(() => c.checkFeynmanActive()) });
		this.addCommand({ id: "create-templates", name: t("cmd.createTemplates"), callback: run(() => c.createTemplates()) });
		this.addCommand({ id: "migrate-properties", name: t("cmd.migrate"), callback: run(() => c.migrateProperties()) });
		this.addCommand({ id: "open-incubator", name: t("cmd.openIncubator"), callback: run(() => this.openIncubator()) });
		this.addCommand({
			id: "open-gaps",
			name: t("cmd.openGaps"),
			callback: run(() => this.revealView(GAPS_VIEW).then(() => undefined)),
		});
	}

	// ---------- AI (Addendum 07) ----------

	private aiDeps(): FactoryDeps {
		return {
			http: new ObsidianHttp(),
			runner: new NodeProcessRunner(),
			findExe: findExecutable,
			makeSandbox: makeSandboxDir,
			// CLI hanya di desktop (butuh Node). Membuat objek di atas TIDAK menjalankan apa pun.
			canSpawn: Platform.isDesktopApp,
			staticProvider: this.provider,
		};
	}

	/** Susun ulang layanan pertanyaan dari pengaturan saat ini. AI mati => hanya bank, tanpa jaringan/proses. */
	rebuildQuestionService(): void {
		this.questionService = createQuestionService(this.settings, this.aiDeps(), (a: Attempt) => {
			this.aiStats[a.provider]++;
		});
	}

	getQuestionService(): QuestionService {
		return this.questionService;
	}

	/** Deteksi penyedia. HANYA dipanggil dari tombol di pengaturan (setelah pengguna menyalakan AI). */
	async detectAi(): Promise<Detection> {
		const d = this.aiDeps();
		this.lastDetection = await detectProviders(d, d.http, { canSpawn: d.canSpawn });
		return this.lastDetection;
	}

	// ---------- Panel ----------

	private async revealView(type: string): Promise<WorkspaceLeaf | null> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(type)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type, active: true });
		}
		await workspace.revealLeaf(leaf);
		return leaf;
	}

	async openIncubator(): Promise<void> {
		await this.revealView(INCUBATOR_VIEW);
	}

	async showGaps(path: string): Promise<void> {
		const leaf = await this.revealView(GAPS_VIEW);
		if (leaf?.view instanceof FeynmanGapsView) await leaf.view.show(path);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(INCUBATOR_VIEW)) {
			if (leaf.view instanceof IncubatorView) leaf.view.refresh();
		}
		this.updateStatusBar();
	}

	// ---------- Isi otomatis created/review (catatan dari templat) ----------

	private autofillTimers = new Map<string, number>();
	private autofillBusy = new Set<string>();
	private autofillRecent = new Map<string, number>();

	/**
	 * Catatan Seedbed yang created/review-nya kosong (mis. baru dari templat Templates/Templater) diisi: created = hari ini,
	 * review = sesuai interval status. Ditunda sebentar (templat menulis beberapa kali), dibaca ulang dari cache saat
	 * dijalankan, dan dijaga dari loop tulis: sedang berjalan, baru saja diisi, dan hasil isiannya tidak kosong lagi.
	 */
	private scheduleAutofill(file: TFile): void {
		if (file.extension !== "md") return;
		const prev = this.autofillTimers.get(file.path);
		if (prev !== undefined) window.clearTimeout(prev);
		this.autofillTimers.set(
			file.path,
			window.setTimeout(() => {
				this.autofillTimers.delete(file.path);
				void this.runAutofill(file);
			}, 900),
		);
	}

	private async runAutofill(file: TFile): Promise<void> {
		const path = file.path;
		if (this.autofillBusy.has(path)) return;
		const last = this.autofillRecent.get(path);
		if (last !== undefined && Date.now() - last < 5000) return;
		if (isInTemplateFolder(path, this.templateFolder)) return; // berkas templat itu sendiri
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
		const patch = planAutofill(fm, this.settings.properties, this.controller.today(), this.settings);
		if (!patch) return;
		this.autofillBusy.add(path);
		try {
			await this.repo.write(file, patch);
			this.autofillRecent.set(path, Date.now());
		} catch (e) {
			console.error("[seedbed] autofill", path, e);
		} finally {
			this.autofillBusy.delete(path);
		}
	}

	// ---------- Index & status bar ----------

	rebuildIndex(announce: boolean): void {
		this.index.rebuild();
		this.termSource.invalidate();
		this.updateStatusBar();
		if (announce) new Notice(this.controller.t("notice.indexRebuilt", { n: this.index.all().length }));
	}

	private updateStatusBar(): void {
		if (!this.statusBarEl) return;
		const n = this.index.due(this.controller.today()).length;
		this.statusBarEl.setText(this.controller.t("view.statusBar", { n }));
		this.statusBarEl.setAttr("aria-label", this.controller.t("cmd.openIncubator"));
		this.statusBarEl.toggleClass("is-empty", n === 0);
	}

	/** DG-6: pengingat digest mingguan (default mati), paling banyak sekali seminggu. */
	private digestReminder(): void {
		const today = this.controller.today();
		if (!reminderDue(this.settings, today, new Date().getDay())) return;
		this.settings.digest.lastReminded = today;
		void this.saveSettings();
		const t = this.controller.t;
		const notice: { n?: Notice } = {};
		const frag = createFragment((f) => {
			f.createSpan({ text: t("notice.digestReminder") + " " });
			const b = f.createEl("button", { text: t("btn.createDigest") });
			b.addEventListener("click", () => {
				notice.n?.hide();
				void this.controller.safe(() => this.controller.createDigest());
			});
		});
		notice.n = new Notice(frag, 15000);
	}

	private notifyStartup(): void {
		if (this.startupNotified) return;
		this.startupNotified = true;
		this.digestReminder();
		if (!this.settings.notifyOnStartup) return;
		const n = this.index.due(this.controller.today()).length;
		if (n > 0) new Notice(this.controller.t("notice.dueStartup", { n }));
	}

	// ---------- Bank pertanyaan kustom (F-13) ----------

	async loadQuestionBank(announce: boolean): Promise<void> {
		const path = this.settings.customBankPath.trim();
		if (!path) {
			this.provider.setBanks(BASE_BANKS);
			return;
		}
		try {
			const file = this.app.vault.getFileByPath(normalizePath(path));
			if (!file) throw new Error("not found");
			const raw: unknown = JSON.parse(await this.app.vault.read(file));
			this.provider.setBanks(mergeBanks(BASE_BANKS, raw));
			if (announce) new Notice(this.controller.t("notice.bankLoaded"));
		} catch {
			this.provider.setBanks(BASE_BANKS);
			if (announce) new Notice(this.controller.t("notice.bankFailed"));
		}
	}

	// ---------- Pengaturan ----------

	async loadSettings(): Promise<void> {
		const loaded: unknown = await this.loadData();
		const defaults = structuredClone(DEFAULT_SETTINGS);
		// Pertama kali: ikuti bahasa Obsidian jika Indonesia, selain itu Inggris.
		if (loaded === null || loaded === undefined) {
			defaults.language = getLanguage().startsWith("id") ? "id" : "en";
		}
		this.settings = mergeSettings(loaded, defaults);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
