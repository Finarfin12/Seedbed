import { Notice, Setting } from "obsidian";
import { isLocalUrl } from "../adapter/ai/http";
import { CLI_SPECS } from "../adapter/ai/cliSpecs";
import type { ProviderId, SocraticMode } from "../domain/ai/types";
import type SeedbedPlugin from "../main";
import { ApproveModal } from "./approveModal";
import type { ApproveInfo } from "./approveModal";
import { resolveVisible, type SettingGroupDef, type SettingItemDef } from "./settingDefinitions";

/** Membangun grup pengaturan AI secara deklaratif. */
export function buildAiSettingGroup(plugin: SeedbedPlugin, rerender: () => void): SettingGroupDef {
	const s = plugin.settings;
	const ai = s.ai;
	const t = plugin.controller.t;
	const save = async () => {
		await plugin.saveSettings();
		plugin.rebuildQuestionService();
	};

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

	const cli = ai.providers.cli;
	const local = ai.providers.local;
	const api = ai.providers.api;

	const d = plugin.lastDetection;
	let detectDesc = t("set.ai.detect.none");
	if (d) {
		const lines: string[] = [];
		for (const c of d.cli) {
			const name = t(`cli.${c.tool}`);
			lines.push(`${name}: ${t(`det.${c.status}`)}${c.version ? ` (${c.version})` : ""}${c.status === "error" ? ` — ${c.detail}` : ""}`);
		}
		for (const l of d.local) {
			lines.push(`${l.kind}: ${t(`det.${l.status}`)}${l.models.length ? ` — ${l.models.slice(0, 6).join(", ")}` : ""}`);
		}
		detectDesc = lines.join(" · ");
	}

	const isAiEnabled = () => ai.enabled;

	const items: SettingItemDef[] = [
		{
			id: "ai.intro",
			name: "",
			desc: t("set.ai.intro"),
			searchable: false,
			render: () => {},
		},
		{
			id: "ai.enabled",
			name: t("set.ai.enable"),
			desc: t("set.ai.enable.desc"),
			render: (setting) => {
				setting.addToggle((c) =>
					c.setValue(ai.enabled).onChange(async (v) => {
						ai.enabled = v;
						await save();
						rerender();
					}),
				);
			},
		},
		{
			id: "ai.detect",
			name: t("set.ai.detect"),
			desc: detectDesc,
			visible: isAiEnabled,
			render: (setting) => {
				setting.addButton((b) =>
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
			},
		},
		{
			id: "ai.order.header",
			name: t("set.ai.order"),
			desc: t("set.ai.order.desc"),
			visible: isAiEnabled,
			render: () => {},
		},
	];

	ai.order.forEach((id: ProviderId, i: number) => {
		items.push({
			id: `ai.order.${id}`,
			name: `${i + 1}. ${t(`ai.provider.${id}`)}`,
			visible: isAiEnabled,
			render: (setting) => {
				setting
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
			},
		});
	});

	items.push(
		// ---- CLI ----
		{
			id: "ai.cli.enable",
			name: t("set.ai.cli.enable"),
			desc: t("set.ai.cli.enable.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addToggle((c) =>
					c.setValue(cli.enabled && cli.approved).onChange(
						toggleProvider("cli", () => ({ provider: "cli", name: t(`cli.${cli.tool}`), cloud: true, maxContextChars: ai.maxContextChars })),
					),
				);
			},
		},
		{
			id: "ai.cli.tool",
			name: t("set.ai.cli.tool"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addDropdown((dd) => {
					for (const tool of ["claude", "codex", "gemini"] as const) dd.addOption(tool, t(`cli.${tool}`));
					dd.setValue(cli.tool).onChange(async (v) => {
						cli.tool = v as typeof cli.tool;
						revoke("cli");
						if (!CLI_SPECS[cli.tool].supported) new Notice(CLI_SPECS[cli.tool].reason ?? "unsupported");
						await save();
						rerender();
					});
				});
			},
		},
		{
			id: "ai.cli.model",
			name: t("set.ai.cli.model"),
			desc: t("set.ai.cli.model.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) =>
					c.setPlaceholder("haiku").setValue(cli.model).onChange(async (v) => {
						cli.model = v.trim();
						await save();
					}),
				);
			},
		},
		// ---- Local ----
		{
			id: "ai.local.enable",
			name: t("set.ai.local.enable"),
			desc: t("set.ai.local.enable.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addToggle((c) =>
					c.setValue(local.enabled && local.approved).onChange(
						toggleProvider("local", () => ({ provider: "local", name: local.kind, cloud: false, maxContextChars: ai.maxContextChars })),
					),
				);
			},
		},
		{
			id: "ai.local.kind",
			name: t("set.ai.local.kind"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addDropdown((dd) =>
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
			},
		},
		{
			id: "ai.local.model",
			name: t("set.ai.local.model"),
			desc: t("set.ai.local.model.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) =>
					c.setPlaceholder("llama3.2:3b").setValue(local.model).onChange(async (v) => {
						local.model = v.trim();
						await save();
					}),
				);
			},
		},
		{
			id: "ai.local.url",
			name: t("set.ai.local.url"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) =>
					c.setPlaceholder(local.kind === "ollama" ? "http://localhost:11434" : "http://localhost:1234").setValue(local.baseUrl).onChange(async (v) => {
						local.baseUrl = v.trim();
						revoke("local");
						await save();
					}),
				);
			},
		},
		// ---- API ----
		{
			id: "ai.api.enable",
			name: t("set.ai.api.enable"),
			desc: t("set.ai.api.enable.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addToggle((c) =>
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
			},
		},
		{
			id: "ai.api.url",
			name: t("set.ai.api.url"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) =>
					c.setPlaceholder("https://api.example.com/v1").setValue(api.baseUrl).onChange(async (v) => {
						api.baseUrl = v.trim();
						revoke("api");
						await save();
					}),
				);
			},
		},
		{
			id: "ai.api.model",
			name: t("set.ai.api.model"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) =>
					c.setValue(api.model).onChange(async (v) => {
						api.model = v.trim();
						await save();
					}),
				);
			},
		},
		{
			id: "ai.api.key",
			name: t("set.ai.api.key"),
			desc: t("set.ai.api.key.warn"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) => {
					c.inputEl.type = "password";
					c.inputEl.autocomplete = "off";
					c.setValue(api.apiKey).onChange(async (v) => {
						api.apiKey = v;
						await save();
					});
				});
			},
		},
		// ---- Behavior ----
		{
			id: "ai.behavior.mode",
			name: t("set.ai.mode"),
			desc: t("set.ai.mode.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addDropdown((dd) =>
					dd
						.addOption("adaptif", t("mode.adaptif"))
						.addOption("satu-tarikan", t("mode.satu-tarikan"))
						.setValue(ai.socraticMode)
						.onChange(async (v) => {
							ai.socraticMode = v as SocraticMode;
							await save();
						}),
				);
			},
		},
		{
			id: "ai.behavior.timeout",
			name: t("set.ai.timeout"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) => {
					c.inputEl.type = "number";
					c.inputEl.min = "3";
					c.inputEl.max = "300";
					c.setValue(String(ai.timeoutSec)).onChange(async (v) => {
						const n = Number(v);
						if (!Number.isFinite(n) || v.trim() === "") return;
						ai.timeoutSec = Math.min(300, Math.max(3, Math.round(n)));
						await save();
					});
				});
			},
		},
		{
			id: "ai.behavior.maxContext",
			name: t("set.ai.maxContext"),
			desc: t("set.ai.maxContext.desc"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) => {
					c.inputEl.type = "number";
					c.inputEl.min = "500";
					c.inputEl.max = "20000";
					c.setValue(String(ai.maxContextChars)).onChange(async (v) => {
						const n = Number(v);
						if (!Number.isFinite(n) || v.trim() === "") return;
						ai.maxContextChars = Math.min(20000, Math.max(500, Math.round(n)));
						await save();
					});
				});
			},
		},
		{
			id: "ai.behavior.hints",
			name: t("set.ai.hints"),
			visible: isAiEnabled,
			render: (setting) => {
				setting.addText((c) => {
					c.inputEl.type = "number";
					c.inputEl.min = "0";
					c.inputEl.max = "5";
					c.setValue(String(ai.hintsPerQuestion)).onChange(async (v) => {
						const n = Number(v);
						if (!Number.isFinite(n) || v.trim() === "") return;
						ai.hintsPerQuestion = Math.min(5, Math.max(0, Math.round(n)));
						await save();
					});
				});
			},
		},
		// ---- Usage ----
		{
			id: "ai.usage",
			name: t("set.ai.usage"),
			desc: t("set.ai.usage.line", { cli: plugin.aiStats.cli, local: plugin.aiStats.local, api: plugin.aiStats.api }),
			visible: isAiEnabled,
			render: () => {},
		},
	);

	return {
		type: "group",
		id: "ai",
		heading: t("set.ai"),
		items,
	};
}

/** Bagian pengaturan AI. Mendukung pemanggilan manual via containerEl. */
export function renderAiSettings(plugin: SeedbedPlugin, el: HTMLElement, rerender: () => void): void {
	const group = buildAiSettingGroup(plugin, rerender);
	if (group.heading) {
		new Setting(el).setName(group.heading).setHeading();
	}
	for (const item of group.items) {
		if (!resolveVisible(item.visible)) continue;
		const setting = new Setting(el);
		if (item.name) setting.setName(item.name);
		if (item.desc) setting.setDesc(item.desc);
		if (item.cls) setting.settingEl.addClass(item.cls);
		item.render(setting);
	}
}
