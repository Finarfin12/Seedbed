import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { Analysis, Controller } from "../controller";
import type { IdeaIndex } from "../adapter/ideaIndex";

export const GAPS_VIEW = "bengkel-gaps";

export class FeynmanGapsView extends ItemView {
	private path: string | null = null;
	private analysis: Analysis | null = null;

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
		return Promise.resolve();
	}

	/** Periksa catatan `path` lalu tampilkan hasilnya. */
	async show(path: string): Promise<void> {
		this.path = path;
		this.analysis = await this.controller.analyzeFile(path);
		this.render();
	}

	private render(): void {
		const t = this.controller.t;
		const root = this.contentEl;
		root.empty();
		root.addClass("bengkel-view");
		root.createEl("h4", { text: t("gaps.title") });

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
			root.createEl("h5", { text: `${t("gaps.terms")} (${terms.length})` });
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
