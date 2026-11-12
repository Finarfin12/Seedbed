import { Notice, Setting } from "obsidian";
import { isLocalUrl } from "../adapter/ai/http";
import { CLI_SPECS } from "../adapter/ai/cliSpecs";
import type { ProviderId, SocraticMode } from "../domain/ai/types";
import type SeedbedPlugin from "../main";
import { ApproveModal } from "./approveModal";
import type { ApproveInfo } from "./approveModal";

/** Bagian pengaturan AI. Semua perubahan lewat save() yang juga menyusun ulang layanan pertanyaan. */
export function renderAiSettings(plugin: SeedbedPlugin, el: HTMLElement, rerender: () => void): void {
	const s = plugin.settings;
	const ai = s.ai;
	const t = plugin.controller.t;
	const save = async () => {
		await plugin.saveSettings();
		plugin.rebuildQuestionService();
	};

	new Setting(el).setName(t("set.ai")).setHeading();
	el.createEl("p", { text: t("set.ai.intro"), cls: "setting-item-description" });

	new Setting(el)
		.setName(t("set.ai.enable"))
		.setDesc(t("set.ai.enable.desc"))
		.addToggle((c) =>
			c.setValue(ai.enabled).onChange(async (v) => {
				ai.enabled = v;
				await save();
				rerender();
			}),
		);
	// AI mati: tidak ada yang lain ditampilkan, tidak ada deteksi, tidak ada program/jaringan.
	if (!ai.enabled) return;

	// ---- Deteksi ----
	const det = new Setting(el).setName(t("set.ai.detect")).setDesc(t("set.ai.detect.none"));
	det.addButton((b) =>
		b.setButtonText(t("set.ai.detect.btn")).onClick(async () => {
			b.setDisabled(true).setButtonText(t("set.ai.detect.running"));
			try {
				await plugin.detectAi();
			} catch (e) {
				new Notice(t("notice.error", { error: e instanceof Error ? e.message : String(e) }));
			}
			rerender();
		}),
	);
	const d = plugin.lastDetection;
	if (d) {
		const lines: string[] = [];
		for (const c of d.cli) {
			const name = t(`cli.${c.tool}`);
			lines.push(`${name}: ${t(`det.${c.status}`)}${c.version ? ` (${c.version})` : ""}${c.status === "error" ? ` — ${c.detail}` : ""}`);
		}
		for (const l of d.local) {
			lines.push(`${l.kind}: ${t(`det.${l.status}`)}${l.models.length ? ` — ${l.models.slice(0, 6).join(", ")}` : ""}`);
		}
		det.setDesc(lines.join(" · "));
	}

	// ---- Urutan ----
	const orderSetting = new Setting(el).setName(t("set.ai.order")).setDesc(t("set.ai.order.desc"));
	ai.order.forEach((id: ProviderId, i: number) => {
		new Setting(el)
			.setName(`${i + 1}. ${t(`ai.provider.${id}`)}`)
			.addExtraButton((b) =>
				b
					.setIcon("arrow-up")
					.setTooltip(t("set.ai.up"))
					.setDisabled(i === 0)
					.onClick(async () => {
						[ai.order[i - 1], ai.order[i]] = [ai.order[i] as ProviderId, ai.order[i - 1] as ProviderId];
						await save();
						rerender();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon("arrow-down")
					.setTooltip(t("set.ai.down"))
					.setDisabled(i === ai.order.length - 1)
					.onClick(async () => {
						[ai.order[i + 1], ai.order[i]] = [ai.order[i] as ProviderId, ai.order[i + 1] as ProviderId];
						await save();
						rerender();
					}),
			);
	});
	void orderSetting;

	/** Aktifkan penyedia hanya setelah layar persetujuan; menonaktifkan mencabut persetujuan. */
	const toggleProvider = (id: ProviderId, info: () => ApproveInfo) => async (v: boolean) => {
		const p = ai.providers[id];
		if (!v) {
			p.enabled = false;
			p.approved = false;
			await save();
			rerender();
			return;
		}
		new ApproveModal(plugin.app, t, info(), (ok) => {
			void (async () => {
				p.enabled = ok;
				p.approved = ok;
				await save();
				rerender();
			})();
		}).open();
	};
	const revoke = (id: ProviderId) => {
		ai.providers[id].enabled = false;
		ai.providers[id].approved = false;
	};

	// ---- CLI ----
	const cli = ai.providers.cli;
	new Setting(el)
		.setName(t("set.ai.cli.enable"))
		.setDesc(t("set.ai.cli.enable.desc"))
		.addToggle((c) =>
			c.setValue(cli.enabled && cli.approved).onChange(
				toggleProvider("cli", () => ({ provider: "cli", name: t(`cli.${cli.tool}`), cloud: true, maxContextChars: ai.maxContextChars })),
			),
		);
	new Setting(el).setName(t("set.ai.cli.tool")).addDropdown((dd) => {
		for (const tool of ["claude", "codex", "gemini"] as const) dd.addOption(tool, t(`cli.${tool}`));
		dd.setValue(cli.tool).onChange(async (v) => {
			cli.tool = v as typeof cli.tool;
			revoke("cli"); // persetujuan berlaku per program
			if (!CLI_SPECS[cli.tool].supported) new Notice(CLI_SPECS[cli.tool].reason ?? "unsupported");
			await save();
			rerender();
		});
	});
	new Setting(el)
		.setName(t("set.ai.cli.model"))
		.setDesc(t("set.ai.cli.model.desc"))
		.addText((c) =>
			c.setPlaceholder("haiku").setValue(cli.model).onChange(async (v) => {
				cli.model = v.trim();
				await save();
			}),
		);

	// ---- Lokal ----
	const local = ai.providers.local;
	new Setting(el)
		.setName(t("set.ai.local.enable"))
		.setDesc(t("set.ai.local.enable.desc"))
		.addToggle((c) =>
			c.setValue(local.enabled && local.approved).onChange(
				toggleProvider("local", () => ({ provider: "local", name: local.kind, cloud: false, maxContextChars: ai.maxContextChars })),
			),
		);
	new Setting(el).setName(t("set.ai.local.kind")).addDropdown((dd) =>
		dd
			.addOption("ollama", "Ollama")
			.addOption("lmstudio", "LM Studio")
			.setValue(local.kind)
			.onChange(async (v) => {
				local.kind = v as typeof local.kind;
				revoke("local");
				await save();
				rerender();
			}),
	);
	new Setting(el)
		.setName(t("set.ai.local.model"))
		.setDesc(t("set.ai.local.model.desc"))
		.addText((c) =>
			c.setPlaceholder("llama3.2:3b").setValue(local.model).onChange(async (v) => {
				local.model = v.trim();
				await save();
			}),
		);
	new Setting(el).setName(t("set.ai.local.url")).addText((c) =>
		c.setPlaceholder(local.kind === "ollama" ? "http://localhost:11434" : "http://localhost:1234").setValue(local.baseUrl).onChange(async (v) => {
			local.baseUrl = v.trim();
			revoke("local"); // alamat baru = persetujuan baru
			await save();
		}),
	);

	// ---- API ----
	const api = ai.providers.api;
	new Setting(el)
		.setName(t("set.ai.api.enable"))
		.setDesc(t("set.ai.api.enable.desc"))
		.addToggle((c) =>
			c.setValue(api.enabled && api.approved).onChange(
				toggleProvider("api", () => {
					let host = api.baseUrl || "(?)";
					try {
						host = new URL(api.baseUrl).host;
					} catch {
						/* biarkan apa adanya */
					}
					return { provider: "api", name: host, cloud: !isLocalUrl(api.baseUrl), maxContextChars: ai.maxContextChars };
				}),
			),
		);
	new Setting(el).setName(t("set.ai.api.url")).addText((c) =>
		c.setPlaceholder("https://api.example.com/v1").setValue(api.baseUrl).onChange(async (v) => {
			api.baseUrl = v.trim();
			revoke("api"); // host baru = persetujuan baru
			await save();
		}),
	);
	new Setting(el).setName(t("set.ai.api.model")).addText((c) =>
		c.setValue(api.model).onChange(async (v) => {
			api.model = v.trim();
			await save();
		}),
	);
	new Setting(el)
		.setName(t("set.ai.api.key"))
		.setDesc(t("set.ai.api.key.warn"))
		.addText((c) => {
			c.inputEl.type = "password";
			c.inputEl.autocomplete = "off";
			c.setValue(api.apiKey).onChange(async (v) => {
				api.apiKey = v;
				await save();
			});
		});

	// ---- Perilaku ----
	new Setting(el)
		.setName(t("set.ai.mode"))
		.setDesc(t("set.ai.mode.desc"))
		.addDropdown((dd) =>
			dd
				.addOption("adaptif", t("mode.adaptif"))
				.addOption("satu-tarikan", t("mode.satu-tarikan"))
				.setValue(ai.socraticMode)
				.onChange(async (v) => {
					ai.socraticMode = v as SocraticMode;
					await save();
				}),
		);
	const num = (name: string, desc: string, get: () => number, set: (n: number) => void, min: number, max: number) =>
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((c) => {
				c.inputEl.type = "number";
				c.setValue(String(get())).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || v.trim() === "") return;
					set(Math.min(max, Math.max(min, Math.round(n))));
					await save();
				});
			});
	num(t("set.ai.timeout"), "", () => ai.timeoutSec, (n) => (ai.timeoutSec = n), 3, 300);
	num(t("set.ai.maxContext"), t("set.ai.maxContext.desc"), () => ai.maxContextChars, (n) => (ai.maxContextChars = n), 500, 20000);
	num(t("set.ai.hints"), "", () => ai.hintsPerQuestion, (n) => (ai.hintsPerQuestion = n), 0, 5);

	new Setting(el)
		.setName(t("set.ai.usage"))
		.setDesc(t("set.ai.usage.line", { cli: plugin.aiStats.cli, local: plugin.aiStats.local, api: plugin.aiStats.api }));
}
