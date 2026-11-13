import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type SeedbedPlugin from "../main";
import { checkName, DEFAULT_NAMES, FIELDS } from "../domain/frontmatter";
import { cleanFolder } from "../domain/templateFiles";
import type { Key } from "../i18n/id";
import type { ActiveStatus, GateId, Language } from "../domain/types";
import { buildAiSettingGroup } from "./settingsAi";
import { hasUpdateMethod, resolveVisible, type SettingGroupDef, type SettingItemDef } from "./settingDefinitions";

export class BengkelSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: SeedbedPlugin,
	) {
		super(app, plugin);
	}

	/** Memperbarui tampilan dan indeks pengaturan. Kompatibel dengan Obsidian < 1.13.0 dan >= 1.13.0. */
	private redisplay(): void {
		const top = this.containerEl.scrollTop;
		if (hasUpdateMethod(this)) {
			this.update();
		} else {
			this.display();
		}
		this.containerEl.scrollTop = top;
		if (typeof window.requestAnimationFrame === "function") {
			window.requestAnimationFrame(() => {
				this.containerEl.scrollTop = top;
			});
		}
	}

	/** Definisi deklaratif seluruh grup dan item pengaturan Seedbed (Obsidian 1.13.0+ & fallback < 1.13.0). */
	getSettingDefinitions(): SettingGroupDef[] {
		const s = this.plugin.settings;
		const t = this.plugin.controller.t;

		const save = async () => {
			await this.plugin.saveSettings();
		};

		const numberControl = (
			setting: Setting,
			get: () => number,
			set: (v: number) => void,
			min: number,
			max: number,
		) => {
			setting.addText((c) => {
				c.inputEl.type = "number";
				c.inputEl.min = String(min);
				c.inputEl.max = String(max);
				c.setValue(String(get())).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || v.trim() === "") return;
					set(Math.min(max, Math.max(min, Math.round(n))));
					await save();
				});
			});
		};

		const groups: SettingGroupDef[] = [];

		// 1. General
		groups.push({
			type: "group",
			id: "general",
			heading: t("set.general"),
			items: [
				{
					id: "general.privacy",
					name: "",
					desc: t("set.privacy"),
					searchable: false,
					render: () => {},
				},
				{
					id: "general.language",
					name: t("set.language"),
					desc: t("set.language.desc"),
					render: (setting) => {
						setting.addDropdown((d) =>
							d
								.addOption("id", "Bahasa Indonesia")
								.addOption("en", "English")
								.setValue(s.language)
								.onChange(async (v) => {
									s.language = v as Language;
									await save();
									this.plugin.refreshViews();
									this.redisplay();
								}),
						);
					},
				},
				{
					id: "general.folderIde",
					name: t("set.folderIde"),
					render: (setting) => {
						setting.addText((c) =>
							c.setValue(s.folderIde).onChange(async (v) => {
								s.folderIde = v.trim();
								await save();
							}),
						);
					},
				},
				{
					id: "general.folderKonsep",
					name: t("set.folderKonsep"),
					render: (setting) => {
						setting.addText((c) =>
							c.setValue(s.folderKonsep).onChange(async (v) => {
								s.folderKonsep = v.trim();
								await save();
							}),
						);
					},
				},
				{
					id: "general.notifyOnStartup",
					name: t("set.notifyOnStartup"),
					desc: t("set.notifyOnStartup.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.notifyOnStartup).onChange(async (v) => {
								s.notifyOnStartup = v;
								await save();
							}),
						);
					},
				},
			],
		});

		// 2. Review
		const reviewItems: SettingItemDef[] = (["benih", "tumbuh", "matang"] as ActiveStatus[]).map((st) => ({
			id: `review.interval.${st}`,
			name: t("set.interval", { status: t(`status.${st}`) }),
			render: (setting: Setting) => {
				numberControl(setting, () => s.intervals[st], (v) => (s.intervals[st] = v), 1, 3650);
			},
		}));
		reviewItems.push({
			id: "review.snoozeDays",
			name: t("set.snoozeDays"),
			render: (setting) => {
				numberControl(setting, () => s.snoozeDays, (v) => (s.snoozeDays = v), 1, 3650);
			},
		});
		groups.push({
			type: "group",
			id: "review",
			heading: t("set.review"),
			items: reviewItems,
		});

		// 3. Gates
		const gateItem = (id: GateId, name: string, desc: string): SettingItemDef => ({
			id: `gates.${id}`,
			name,
			desc,
			render: (setting) => {
				setting.addToggle((c) =>
					c.setValue(s.gates[id]).onChange(async (v) => {
						s.gates[id] = v;
						await save();
					}),
				);
			},
		});
		groups.push({
			type: "group",
			id: "gates",
			heading: t("set.gates"),
			items: [
				gateItem("socratic", t("set.gate.socratic"), t("set.gate.socratic.desc")),
				gateItem("devil", t("set.gate.devil"), t("set.gate.devil.desc")),
				gateItem("feynman", t("set.gate.feynman"), t("set.gate.feynman.desc")),
				{
					id: "gates.devilForKonsep",
					name: t("set.devilForKonsep"),
					desc: t("set.devilForKonsep.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.devilForKonsep).onChange(async (v) => {
								s.devilForKonsep = v;
								await save();
							}),
						);
					},
				},
				{
					id: "gates.socraticMinChars",
					name: t("set.socraticMinChars"),
					render: (setting) => {
						numberControl(setting, () => s.socraticMinChars, (v) => (s.socraticMinChars = v), 0, 1000);
					},
				},
				{
					id: "gates.devilMinAnswered",
					name: t("set.devilMinAnswered"),
					render: (setting) => {
						numberControl(setting, () => s.devilMinAnswered, (v) => (s.devilMinAnswered = v), 1, 5);
					},
				},
			],
		});

		// 4. Premortem
		groups.push({
			type: "group",
			id: "premortem",
			heading: t("set.premortem"),
			items: [
				{
					id: "premortem.enabled",
					name: t("set.premortem.enabled"),
					desc: t("set.premortem.enabled.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.premortem.enabled).onChange(async (v) => {
								s.premortem.enabled = v;
								await save();
								this.plugin.refreshViews();
							}),
						);
					},
				},
				{
					id: "premortem.minAnswered",
					name: t("set.premortem.minAnswered"),
					render: (setting) => {
						numberControl(setting, () => s.premortem.minAnswered, (v) => (s.premortem.minAnswered = v), 1, 5);
					},
				},
				{
					id: "premortem.minChars",
					name: t("set.premortem.minChars"),
					render: (setting) => {
						numberControl(setting, () => s.premortem.minChars, (v) => (s.premortem.minChars = v), 0, 1000);
					},
				},
			],
		});

		// 5. Retrieval
		groups.push({
			type: "group",
			id: "retrieval",
			heading: t("set.retrieval"),
			items: [
				{
					id: "retrieval.enabled",
					name: t("set.retrieval.enabled"),
					desc: t("set.retrieval.enabled.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.retrieval.enabled).onChange(async (v) => {
								s.retrieval.enabled = v;
								await save();
								this.plugin.refreshViews();
							}),
						);
					},
				},
				{
					id: "retrieval.adjustInterval",
					name: t("set.retrieval.adjust"),
					desc: t("set.retrieval.adjust.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.retrieval.adjustInterval).onChange(async (v) => {
								s.retrieval.adjustInterval = v;
								await save();
							}),
						);
					},
				},
			],
		});

		// 6. Connect
		groups.push({
			type: "group",
			id: "connect",
			heading: t("set.connect"),
			items: [
				{
					id: "connect.enabled",
					name: t("set.connect.enabled"),
					desc: t("set.connect.enabled.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.connect.enabled).onChange(async (v) => {
								s.connect.enabled = v;
								await save();
							}),
						);
					},
				},
			],
		});

		// 7. Digest
		groups.push({
			type: "group",
			id: "digest",
			heading: t("set.digest"),
			items: [
				{
					id: "digest.folder",
					name: t("set.digest.folder"),
					desc: t("set.digest.folder.desc"),
					render: (setting) => {
						setting.addText((c) => {
							c.setValue(s.digest.folder);
							c.inputEl.addEventListener("change", () => {
								s.digest.folder = cleanFolder(c.inputEl.value) || "Digests";
								c.setValue(s.digest.folder);
								void save();
							});
						});
					},
				},
				{
					id: "digest.stuckDays",
					name: t("set.digest.stuckDays"),
					desc: t("set.digest.stuckDays.desc"),
					render: (setting) => {
						numberControl(setting, () => s.digest.stuckDays, (v) => (s.digest.stuckDays = v), 1, 3650);
					},
				},
				{
					id: "digest.reminder",
					name: t("set.digest.reminder"),
					desc: t("set.digest.reminder.desc"),
					render: (setting) => {
						setting
							.addToggle((c) =>
								c.setValue(s.digest.reminder.enabled).onChange(async (v) => {
									s.digest.reminder.enabled = v;
									await save();
								}),
							)
							.addDropdown((d) => {
								for (let i = 0; i < 7; i++) d.addOption(String(i), t(("day." + i) as Key));
								d.setValue(String(s.digest.reminder.day)).onChange(async (v) => {
									s.digest.reminder.day = Number(v);
									await save();
								});
							});
					},
				},
			],
		});

		// 8. Feynman
		groups.push({
			type: "group",
			id: "feynman",
			heading: t("set.feynman"),
			items: [
				{
					id: "feynman.jargon",
					name: t("set.feynman.jargon"),
					desc: t("set.feynman.jargon.desc"),
					render: (setting) => {
						setting.addTextArea((c) => {
							c.setValue(s.feynman.jargon.join("\n")).onChange(async (v) => {
								s.feynman.jargon = v
									.split("\n")
									.map((x) => x.trim())
									.filter((x) => x.length > 0);
								await save();
							});
							c.inputEl.rows = 5;
						});
					},
				},
				{
					id: "feynman.maxSentenceWords",
					name: t("set.feynman.maxSentenceWords"),
					render: (setting) => {
						numberControl(setting, () => s.feynman.maxSentenceWords, (v) => (s.feynman.maxSentenceWords = v), 5, 500);
					},
				},
				{
					id: "feynman.maxGaps",
					name: t("set.feynman.maxGaps"),
					render: (setting) => {
						numberControl(setting, () => s.feynman.maxGaps, (v) => (s.feynman.maxGaps = v), 0, 1000);
					},
				},
			],
		});

		// 9. Bank
		groups.push({
			type: "group",
			id: "bank",
			heading: t("set.bank"),
			items: [
				{
					id: "bank.customPath",
					name: t("set.customBankPath"),
					desc: t("set.customBankPath.desc"),
					render: (setting) => {
						setting.addText((c) =>
							c.setValue(s.customBankPath).onChange(async (v) => {
								s.customBankPath = v.trim();
								await save();
								await this.plugin.loadQuestionBank(true);
							}),
						);
					},
				},
			],
		});

		// 10. Props
		const propItems: SettingItemDef[] = [
			{
				id: "props.desc",
				name: "",
				desc: t("set.props.desc"),
				searchable: false,
				render: () => {},
			},
		];
		for (const field of FIELDS) {
			propItems.push({
				id: `props.${field}`,
				name: t(`set.props.${field}` as Key),
				render: (setting) => {
					setting.addText((c) => {
						c.setValue(s.properties[field]);
						// "change" = Enter atau kehilangan fokus (bukan tiap ketikan), supaya indeks tidak dibangun dengan nama setengah jadi.
						c.inputEl.addEventListener("change", () => {
							const value = c.inputEl.value.trim();
							const problem = checkName(s.properties, field, value);
							if (problem) {
								new Notice(t(problem === "invalid" ? "set.props.invalid" : "set.props.duplicate"));
								c.setValue(s.properties[field]);
								return;
							}
							s.properties[field] = value;
							void save().then(() => this.plugin.rebuildIndex(false));
						});
					});
				},
			});
		}
		propItems.push({
			id: "props.reset",
			name: "",
			searchable: false,
			render: (setting) => {
				setting.addButton((b) =>
					b.setButtonText(t("set.props.reset")).onClick(async () => {
						s.properties = { ...DEFAULT_NAMES };
						await save();
						this.plugin.rebuildIndex(false);
						this.redisplay();
					}),
				);
			},
		});
		groups.push({
			type: "group",
			id: "props",
			heading: t("set.props"),
			items: propItems,
		});

		// 11. Templates
		groups.push({
			type: "group",
			id: "templates",
			heading: t("set.templates"),
			items: [
				{
					id: "templates.desc",
					name: "",
					desc: t("set.templates.desc"),
					searchable: false,
					render: () => {},
				},
				{
					id: "templates.folder",
					name: t("set.templates.folder"),
					desc: t("set.templates.folder.desc"),
					render: (setting) => {
						setting.addText((c) => {
							c.setValue(s.templates.folder);
							c.inputEl.addEventListener("change", () => {
								s.templates.folder = cleanFolder(c.inputEl.value);
								c.setValue(s.templates.folder);
								void save().then(() => this.plugin.refreshTemplateFolder());
							});
							void this.plugin.templates.folder().then((f) => {
								c.setPlaceholder(f);
							});
						});
					},
				},
				{
					id: "templates.btn",
					name: "",
					searchable: false,
					render: (setting) => {
						setting.addButton((b) =>
							b
								.setButtonText(t("set.templates.btn"))
								.onClick(() => void this.plugin.controller.safe(() => this.plugin.controller.createTemplates())),
						);
					},
				},
			],
		});

		// 12. Capture
		groups.push({
			type: "group",
			id: "capture",
			heading: t("set.capture"),
			items: [
				{
					id: "capture.intro",
					name: "",
					desc: t("set.capture.intro"),
					searchable: false,
					render: () => {},
				},
				{
					id: "capture.confirm",
					name: t("set.capture.confirm"),
					desc: t("set.capture.confirm.desc"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.capture.confirm).onChange(async (v) => {
								s.capture.confirm = v;
								await save();
							}),
						);
					},
				},
				{
					id: "capture.openAfter",
					name: t("set.capture.openAfter"),
					render: (setting) => {
						setting.addToggle((c) =>
							c.setValue(s.capture.openAfter).onChange(async (v) => {
								s.capture.openAfter = v;
								await save();
							}),
						);
					},
				},
				{
					id: "capture.maxChars",
					name: t("set.capture.maxChars"),
					render: (setting) => {
						numberControl(setting, () => s.capture.maxChars, (v) => (s.capture.maxChars = v), 200, 20000);
					},
				},
			],
		});

		// 13. AI Settings
		groups.push(buildAiSettingGroup(this.plugin, () => this.redisplay()));

		// 14. Maintenance
		groups.push({
			type: "group",
			id: "maintenance",
			heading: t("set.maintenance"),
			items: [
				{
					id: "maintenance.rebuildIndex",
					name: t("set.rebuildIndex"),
					desc: t("set.rebuildIndex.desc"),
					render: (setting) => {
						setting.addButton((b) =>
							b.setButtonText(t("set.rebuildIndex.btn")).onClick(() => {
								this.plugin.rebuildIndex(true);
							}),
						);
					},
				},
			],
		});

		return groups;
	}

	/** Fallback renderer untuk Obsidian < 1.13.0. Menjadikan getSettingDefinitions() sebagai single source of truth. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const group of this.getSettingDefinitions()) {
			if (!resolveVisible(group.visible)) continue;
			if (group.heading) {
				new Setting(containerEl).setName(group.heading).setHeading();
			}
			for (const item of group.items) {
				if (!resolveVisible(item.visible)) continue;
				const setting = new Setting(containerEl);
				if (item.name) setting.setName(item.name);
				if (item.desc) setting.setDesc(item.desc);
				if (item.cls) setting.settingEl.addClass(item.cls);
				item.render(setting);
			}
		}
	}
}
