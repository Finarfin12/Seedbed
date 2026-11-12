import { ItemView, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { debounce } from "../domain/debounce";
import type { Analysis, Controller } from "../controller";
import type { IdeaIndex } from "../adapter/ideaIndex";

export const GAPS_VIEW = "bengkel-gaps";

/** Jeda sebelum panel memeriksa ulang; menggabungkan ketikan/penyimpanan beruntun (ringan di vault besar). */
export const GAPS_REFRESH_MS = 600;

export class FeynmanGapsView extends ItemView {
	private path: string | null = null;
	private analysis: Analysis | null = null;
	private seq = 0;
	private scheduleRefresh = debounce(() => void this.refreshNow(), GAPS_REFRESH_MS);

	constructor(
		leaf: WorkspaceLeaf,
		private controller: Controller,
		private index: IdeaIndex,
	) {
		super(leaf);
	}

	getViewType(): string {
		return GAPS_VIEW;
	}
	getDisplayText(): string {
		return this.controller.t("view.gaps");
	}
	getIcon(): string {
		return "search-check";
	}

	onOpen(): Promise<void> {
		this.render();
		// Panel mengikuti catatan yang sedang diperiksa: diubah, dibuat ulang, dihapus, atau di-rename.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.path === this.path) this.scheduleRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file.path === this.path) this.scheduleRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file.path !== this.path) return;
				this.scheduleRefresh.cancel();
				this.seq++;
				this.path = null;
				this.analysis = null;
				this.render();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (oldPath !== this.path || !(file instanceof TFile)) return;
				this.path = file.path;
				this.scheduleRefresh();
			}),
		);
		// Status ide berubah (mis. naik ke Tumbuh dari luar panel): tombol Promote ikut menyesuaikan.
		this.register(this.index.onChange(() => { if (this.path) this.scheduleRefresh(); }));
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.scheduleRefresh.cancel();
		return Promise.resolve();
	}

	private async refreshNow(): Promise<void> {
		if (!this.path) return;
		await this.show(this.path);
	}

	/** Periksa catatan `path` lalu tampilkan hasilnya. */
	async show(path: string): Promise<void> {
		this.path = path;
		const my = ++this.seq;
		const analysis = await this.controller.analyzeFile(path);
		if (my !== this.seq) return; // ada pemeriksaan yang lebih baru
		this.analysis = analysis;
		this.render();
	}

	private render(): void {
		const t = this.controller.t;
		const root = this.contentEl;
		root.empty();
		root.addClass("bengkel-view");
		root.createEl("h4", { text: t("view.gaps") });
		root.createDiv({ cls: "bengkel-meta", text: t("gaps.title") });

		const a = this.analysis;
		if (!a || !this.path) {
			root.createEl("p", { cls: "bengkel-empty", text: t("gaps.noNote") });
			return;
		}
		const name = a.path.split("/").pop()?.replace(/\.md$/, "") ?? a.path;
		root.createDiv({ cls: "bengkel-meta", text: t("gaps.for", { name }) });
		root.createDiv({ cls: "bengkel-meta", text: t("gaps.stale") });
		root.createDiv({ cls: "bengkel-gate-status", text: t("gaps.open", { open: a.openTerms, max: a.maxGaps }) });

		const row = root.createDiv({ cls: "bengkel-actions" });
		const recheck = row.createEl("button", { text: t("btn.recheck") });
		recheck.addEventListener("click", () => void this.controller.safe(() => this.show(a.path)));

		const idea = this.index.get(a.path);
		if (idea && idea.status === "benih" && idea.tipe === "konsep") {
			const up = row.createEl("button", { text: t("btn.promoteToGrow"), cls: "mod-cta" });
			up.disabled = a.openTerms > a.maxGaps;
			up.addEventListener("click", () =>
				void this.controller.safe(async () => {
					await this.controller.promote(a.path);
					await this.show(a.path);
				}),
			);
		}

		const terms = a.gaps.filter((g) => g.kind === "term");
		const sentences = a.gaps.filter((g) => g.kind === "sentence");
		if (a.gaps.length === 0) {
			root.createEl("p", { cls: "bengkel-empty", text: t("gaps.none") });
			return;
		}

		if (terms.length > 0) {
			const openTerms = terms.filter((g) => !g.ignored).length;
			const ignoredTerms = terms.length - openTerms;
			const head = ignoredTerms > 0 ? t("gaps.termsHeadIgnored", { open: openTerms, ignored: ignoredTerms }) : `(${openTerms})`;
			root.createEl("h5", { text: `${t("gaps.terms")} ${head}` });
			const ul = root.createEl("ul", { cls: "bengkel-list" });
			for (const g of terms) {
				const li = ul.createEl("li", { cls: `bengkel-item${g.ignored ? " is-ignored" : ""}` });
				const top = li.createDiv({ cls: "bengkel-item-top" });
				const link = top.createEl("a", { text: g.term, cls: "bengkel-title", attr: { href: "#" } });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					void this.controller.safe(() => this.controller.jumpTo(a.path, g.offset, g.length));
				});
				top.createSpan({ cls: "bengkel-tag", text: t("gaps.termMeta", { n: g.count }) });
				li.createDiv({ cls: "bengkel-meta", text: g.snippet });
				if (g.ignored) {
					li.createDiv({ cls: "bengkel-meta", text: t("gaps.ignored") });
				} else {
					const btn = li.createEl("button", { text: t("btn.ignore") });
					btn.addEventListener("click", () =>
						void this.controller.safe(async () => {
							await this.controller.ignoreTerm(a.path, g.key);
							await this.show(a.path);
						}),
					);
				}
			}
		}

		if (sentences.length > 0) {
			root.createEl("h5", { text: `${t("gaps.sentences")} (${sentences.length})` });
			const ul = root.createEl("ul", { cls: "bengkel-list" });
			for (const g of sentences) {
				const li = ul.createEl("li", { cls: "bengkel-item" });
				const top = li.createDiv({ cls: "bengkel-item-top" });
				const link = top.createEl("a", { text: g.snippet, cls: "bengkel-title", attr: { href: "#" } });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					void this.controller.safe(() => this.controller.jumpTo(a.path, g.offset, g.length));
				});
				top.createSpan({ cls: "bengkel-tag", text: t("gaps.sentenceMeta", { n: g.words }) });
			}
		}
	}
}
