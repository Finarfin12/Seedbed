import { ItemView, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { Controller } from "../controller";
import type { IdeaIndex } from "../adapter/ideaIndex";
import { nextStatus } from "../domain/stateMachine";
import type { Idea, Settings, Status } from "../domain/types";
import { STATUSES } from "../domain/types";

export const INCUBATOR_VIEW = "bengkel-incubator";

export class IncubatorView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private timer: number | null = null;
	/** Status buka/tutup tiap kelompok, dipertahankan antar render. */
	private openState: Partial<Record<Status, boolean>> = {};

	constructor(
		leaf: WorkspaceLeaf,
		private controller: Controller,
		private index: IdeaIndex,
		private getSettings: () => Settings,
	) {
		super(leaf);
	}

	getViewType(): string {
		return INCUBATOR_VIEW;
	}
	getDisplayText(): string {
		return this.controller.t("view.incubator");
	}
	getIcon(): string {
		return "lightbulb";
	}

	onOpen(): Promise<void> {
		this.unsubscribe = this.index.onChange(() => this.scheduleRender());
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		if (this.timer !== null) window.clearTimeout(this.timer);
		return Promise.resolve();
	}

	/** Gabungkan banyak perubahan beruntun menjadi satu render. */
	private scheduleRender(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.render();
		}, 120);
	}

	refresh(): void {
		this.render();
	}

	/** Render ulang tanpa kehilangan posisi scroll (index berubah sering). */
	private render(): void {
		const top = this.contentEl.scrollTop;
		this.build();
		this.contentEl.scrollTop = top;
	}

	private build(): void {
		const t = this.controller.t;
		const root = this.contentEl;
		root.empty();
		root.addClass("bengkel-view");

		const today = this.controller.today();
		const ideas = this.index.all();
		const due = this.index.due(today);

		const header = root.createDiv({ cls: "bengkel-header" });
		header.createEl("h4", { text: t("view.incubator") });
		// Badge juga tampil di mobile (yang tidak punya status bar).
		header.createSpan({ cls: "bengkel-badge", text: t("view.statusBar", { n: due.length }) });

		if (ideas.length === 0 && this.index.invalidList().length === 0) {
			root.createEl("p", { cls: "bengkel-empty", text: t("view.noIdeas") });
			return;
		}

		const dueSec = root.createDiv({ cls: "bengkel-section" });
		dueSec.createEl("h5", { text: `${t("view.dueToday")} (${due.length})` });
		if (due.length === 0) dueSec.createEl("p", { cls: "bengkel-empty", text: t("view.nothingDue") });
		else this.list(dueSec, due);

		for (const status of STATUSES) {
			const group = ideas
				.filter((i) => i.status === status)
				.sort((a, b) => a.title.localeCompare(b.title));
			if (group.length === 0) continue;
			const details = root.createEl("details", { cls: "bengkel-section" });
			if (this.openState[status] ?? status !== "dibuang") details.setAttr("open", "");
			details.addEventListener("toggle", () => {
				this.openState[status] = details.open;
			});
			details.createEl("summary", { text: `${t(`status.${status}`)} (${group.length})` });
			this.list(details, group);
		}

		const invalid = this.index.invalidList();
		if (invalid.length > 0) {
			const sec = root.createDiv({ cls: "bengkel-section" });
			sec.createEl("h5", { text: `${t("view.invalidTitle")} (${invalid.length})` });
			const ul = sec.createEl("ul", { cls: "bengkel-list" });
			for (const inv of invalid) {
				const li = ul.createEl("li", { cls: "bengkel-item is-invalid" });
				const link = li.createEl("a", { text: inv.title, cls: "bengkel-title" });
				link.addEventListener("click", () => void this.controller.openPath(inv.path));
				li.createDiv({ cls: "bengkel-meta", text: t("view.invalidHint", { reason: inv.reason }) });
			}
		}
	}

	private list(parent: HTMLElement, ideas: Idea[]): void {
		const ul = parent.createEl("ul", { cls: "bengkel-list" });
		for (const idea of ideas) this.item(ul, idea);
	}

	private item(ul: HTMLElement, idea: Idea): void {
		const t = this.controller.t;
		const li = ul.createEl("li", { cls: `bengkel-item status-${idea.status}` });
		const top = li.createDiv({ cls: "bengkel-item-top" });
		const link = top.createEl("a", {
			text: idea.title,
			cls: "bengkel-title",
			attr: { href: "#", "aria-label": t("view.itemLabel", { title: idea.title, status: t(`status.${idea.status}`) }) },
		});
		link.addEventListener("click", (e) => {
			e.preventDefault();
			void this.controller.openPath(idea.path);
		});
		top.createSpan({ cls: "bengkel-tag", text: t(`tipe.${idea.tipe}`) });
		li.createDiv({
			cls: "bengkel-meta",
			text: idea.status === "dibuang" ? "" : idea.tinjau ? t("view.review", { date: idea.tinjau }) : t("view.noReview"),
		});

		const row = li.createDiv({ cls: "bengkel-actions" });
		const act = (label: string, icon: string, fn: () => Promise<void>, cls = "") => {
			const b = row.createEl("button", { cls: `bengkel-btn ${cls}`.trim(), attr: { "aria-label": label, title: label } });
			setIcon(b.createSpan({ cls: "bengkel-btn-icon" }), icon);
			b.createSpan({ text: label });
			b.addEventListener("click", () => void this.controller.safe(fn));
		};

		const path = idea.path;
		if (idea.status === "dibuang") {
			act(t("btn.restore"), "undo-2", () => this.controller.transitionTo(path, "benih"));
		} else {
			if (nextStatus(idea.status)) act(t("btn.promote"), "arrow-up", () => this.controller.promote(path), "mod-cta");
			if (idea.status === "matang" && this.getSettings().premortem.enabled && !idea.gerbangLain?.includes("premortem")) {
				act(t("btn.premortem"), "skull", () => this.controller.premortem(path));
			}
			if (idea.status === "matang") act(t("btn.reopen"), "rotate-ccw", () => this.controller.transitionTo(path, "tumbuh"));
			act(t("btn.snooze", { n: this.getSettings().snoozeDays }), "clock", () => this.controller.snooze(path));
			act(t("btn.discard"), "trash-2", () => this.controller.transitionTo(path, "dibuang"));
		}
		act(t("btn.open"), "file-text", () => this.controller.openPath(path));
	}
}

export type { Status };
