import { Notice } from "obsidian";
import type { App } from "obsidian";
import { toISODate } from "../domain/dates";
import { planCapture } from "../domain/captureValidator";
import type { CaptureParams, CapturePlan } from "../domain/captureValidator";
import type { Settings } from "../domain/types";
import { makeT } from "../i18n";
import type { TFn } from "../i18n";
import { CaptureConfirmModal } from "../ui/captureModal";
import type { IdeaIndex } from "./ideaIndex";
import type { NoteFactory } from "./noteFactory";
import type { IdeaRepository } from "./repository";

export interface CaptureHost {
	app: App;
	settings: Settings;
	index: IdeaIndex;
	repo: IdeaRepository;
	factory: NoteFactory;
}

/** Batas laju saat konfirmasi dimatikan: link berulang dari situs jahat tidak membanjiri vault. */
const MAX_PER_MINUTE = 10;

/**
 * obsidian://seedbed-capture. Hanya MEMBUAT catatan benih baru yang sudah divalidasi:
 * tidak membaca, menimpa, atau menghapus apa pun. Frontmatter ditulis lewat processFrontMatter.
 */
export class CaptureHandler {
	private pending = false;
	private recent: number[] = [];

	constructor(private host: () => CaptureHost) {}

	handle = (params: Record<string, string>): void => {
		void this.run(params as CaptureParams);
	};

	private async run(params: CaptureParams): Promise<void> {
		const h = this.host();
		const t = makeT(h.settings.language);
		try {
			const res = planCapture(params, {
				settings: h.settings,
				today: toISODate(new Date()),
				maxText: h.settings.capture.maxChars,
			});
			if (!res.ok) {
				new Notice(t(res.error === "bad-version" ? "capture.err.version" : "capture.err.empty"));
				return;
			}
			if (this.pending) {
				new Notice(t("capture.err.busy"));
				return;
			}
			if (h.settings.capture.confirm) {
				this.pending = true;
				const save = await new Promise<boolean>((resolve) => {
					new CaptureConfirmModal(h.app, t, res.plan.data, resolve).open();
				});
				this.pending = false;
				if (!save) return;
			} else if (!this.allowRate()) {
				new Notice(t("capture.err.rate"));
				return;
			}
			await this.save(h, res.plan, t);
		} catch (e) {
			this.pending = false;
			console.error("[seedbed]", e);
			new Notice(t("notice.error", { error: e instanceof Error ? e.message : String(e) }));
		}
	}

	private allowRate(): boolean {
		const now = Date.now();
		this.recent = this.recent.filter((x) => now - x < 60_000);
		if (this.recent.length >= MAX_PER_MINUTE) return false;
		this.recent.push(now);
		return true;
	}

	private async save(h: CaptureHost, plan: CapturePlan, t: TFn): Promise<void> {
		const file = await h.factory.createFromBody(plan.base, plan.body, h.settings);
		await h.repo.write(file, plan.patch);
		const n = h.index.all().filter((i) => i.status === "benih").length;
		new Notice(t("capture.saved", { n }));
		if (h.settings.capture.openAfter) await h.app.workspace.getLeaf(false).openFile(file);
	}
}
