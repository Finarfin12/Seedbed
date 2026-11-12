import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type SeedbedPlugin from "../main";
import { checkName, DEFAULT_NAMES, FIELDS } from "../domain/frontmatter";
import { cleanFolder } from "../domain/templateFiles";
import type { Key } from "../i18n/id";
import type { ActiveStatus, GateId, Language } from "../domain/types";
import { renderAiSettings } from "./settingsAi";

export class BengkelSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: SeedbedPlugin,
	) {
		super(app, plugin);
	}

	/** display() ulang tanpa melompat ke atas. */
	private redisplay(): void {
		const top = this.containerEl.scrollTop;
		this.display();
		this.containerEl.scrollTop = top;
		window.requestAnimationFrame(() => {
			this.containerEl.scrollTop = top;
		});
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const t = this.plugin.controller.t;
		containerEl.empty();

		const save = async () => {
			await this.plugin.saveSettings();
		};
		const number = (
			parent: HTMLElement,
			name: string,
			desc: string,
			get: () => number,
			set: (v: number) => void,
			min: number,
			max: number,
		) => {
			new Setting(parent)
				.setName(name)
				.setDesc(desc)
				.addText((c) => {
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

		containerEl.createEl("p", { text: t("set.privacy"), cls: "setting-item-description" });

		new Setting(containerEl).setName(t("set.general")).setHeading();
		new Setting(containerEl)
			.setName(t("set.language"))
			.setDesc(t("set.language.desc"))
			.addDropdown((d) =>
				d
					.addOption("id", "Bahasa Indonesia")
					.addOption("en", "English")
					.setValue(s.language)
					.onChange(async (v) => {
						s.language = v as Language;
						await save();
						this.plugin.refreshViews();
						this.display();
					}),
			);
		new Setting(containerEl).setName(t("set.folderIde")).addText((c) =>
			c.setValue(s.folderIde).onChange(async (v) => {
				s.folderIde = v.trim();
				await save();
			}),
		);
		new Setting(containerEl).setName(t("set.folderKonsep")).addText((c) =>
			c.setValue(s.folderKonsep).onChange(async (v) => {
				s.folderKonsep = v.trim();
				await save();
			}),
		);
		new Setting(containerEl)
			.setName(t("set.notifyOnStartup"))
			.setDesc(t("set.notifyOnStartup.desc"))
			.addToggle((c) =>
				c.setValue(s.notifyOnStartup).onChange(async (v) => {
					s.notifyOnStartup = v;
					await save();
				}),
			);

		new Setting(containerEl).setName(t("set.review")).setHeading();
		for (const st of ["benih", "tumbuh", "matang"] as ActiveStatus[]) {
			number(
				containerEl,
				t("set.interval", { status: t(`status.${st}`) }),
				"",
				() => s.intervals[st],
				(v) => (s.intervals[st] = v),
				1,
				3650,
			);
		}
		number(containerEl, t("set.snoozeDays"), "", () => s.snoozeDays, (v) => (s.snoozeDays = v), 1, 3650);

		new Setting(containerEl).setName(t("set.gates")).setHeading();
		const gate = (id: GateId, name: string, desc: string) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((c) =>
					c.setValue(s.gates[id]).onChange(async (v) => {
						s.gates[id] = v;
						await save();
					}),
				);
		gate("socratic", t("set.gate.socratic"), t("set.gate.socratic.desc"));
		gate("devil", t("set.gate.devil"), t("set.gate.devil.desc"));
		gate("feynman", t("set.gate.feynman"), t("set.gate.feynman.desc"));
		new Setting(containerEl)
			.setName(t("set.devilForKonsep"))
			.setDesc(t("set.devilForKonsep.desc"))
			.addToggle((c) =>
				c.setValue(s.devilForKonsep).onChange(async (v) => {
					s.devilForKonsep = v;
					await save();
				}),
			);
		number(containerEl, t("set.socraticMinChars"), "", () => s.socraticMinChars, (v) => (s.socraticMinChars = v), 0, 1000);
		number(containerEl, t("set.devilMinAnswered"), "", () => s.devilMinAnswered, (v) => (s.devilMinAnswered = v), 1, 5);

		new Setting(containerEl).setName(t("set.feynman")).setHeading();
		new Setting(containerEl)
			.setName(t("set.feynman.jargon"))
			.setDesc(t("set.feynman.jargon.desc"))
			.addTextArea((c) => {
				c.setValue(s.feynman.jargon.join("\n")).onChange(async (v) => {
					s.feynman.jargon = v
						.split("\n")
						.map((x) => x.trim())
						.filter((x) => x.length > 0);
					await save();
				});
				c.inputEl.rows = 5;
			});
		number(
			containerEl,
			t("set.feynman.maxSentenceWords"),
			"",
			() => s.feynman.maxSentenceWords,
			(v) => (s.feynman.maxSentenceWords = v),
			5,
			500,
		);
		number(containerEl, t("set.feynman.maxGaps"), "", () => s.feynman.maxGaps, (v) => (s.feynman.maxGaps = v), 0, 1000);

		new Setting(containerEl).setName(t("set.bank")).setHeading();
		new Setting(containerEl)
			.setName(t("set.customBankPath"))
			.setDesc(t("set.customBankPath.desc"))
			.addText((c) =>
				c.setValue(s.customBankPath).onChange(async (v) => {
					s.customBankPath = v.trim();
					await save();
					await this.plugin.loadQuestionBank(true);
				}),
			);

		new Setting(containerEl).setName(t("set.props")).setHeading();
		containerEl.createEl("p", { text: t("set.props.desc"), cls: "setting-item-description" });
		for (const field of FIELDS) {
			new Setting(containerEl).setName(t(`set.props.${field}` as Key)).addText((c) => {
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
		}
		new Setting(containerEl).addButton((b) =>
			b.setButtonText(t("set.props.reset")).onClick(async () => {
				s.properties = { ...DEFAULT_NAMES };
				await save();
				this.plugin.rebuildIndex(false);
				this.redisplay();
			}),
		);

		new Setting(containerEl).setName(t("set.templates")).setHeading();
		containerEl.createEl("p", { text: t("set.templates.desc"), cls: "setting-item-description" });
		new Setting(containerEl)
			.setName(t("set.templates.folder"))
			.setDesc(t("set.templates.folder.desc"))
			.addText((c) => {
				c.setValue(s.templates.folder);
				c.inputEl.addEventListener("change", () => {
					s.templates.folder = cleanFolder(c.inputEl.value);
					c.setValue(s.templates.folder);
					void save().then(() => this.plugin.refreshTemplateFolder());
				});
				void this.plugin.templates.folder().then((f) => c.setPlaceholder(f));
			});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText(t("set.templates.btn")).onClick(() => void this.plugin.controller.safe(() => this.plugin.controller.createTemplates())),
		);

		new Setting(containerEl).setName(t("set.capture")).setHeading();
		containerEl.createEl("p", { text: t("set.capture.intro"), cls: "setting-item-description" });
		new Setting(containerEl)
			.setName(t("set.capture.confirm"))
			.setDesc(t("set.capture.confirm.desc"))
			.addToggle((c) =>
				c.setValue(s.capture.confirm).onChange(async (v) => {
					s.capture.confirm = v;
					await save();
				}),
			);
		new Setting(containerEl)
			.setName(t("set.capture.openAfter"))
			.addToggle((c) =>
				c.setValue(s.capture.openAfter).onChange(async (v) => {
					s.capture.openAfter = v;
					await save();
				}),
			);
		number(containerEl, t("set.capture.maxChars"), "", () => s.capture.maxChars, (v) => (s.capture.maxChars = v), 200, 20000);
		renderAiSettings(this.plugin, containerEl, () => this.redisplay());

		new Setting(containerEl).setName(t("set.maintenance")).setHeading();
		new Setting(containerEl)
			.setName(t("set.rebuildIndex"))
			.setDesc(t("set.rebuildIndex.desc"))
			.addButton((b) =>
				b.setButtonText(t("set.rebuildIndex.btn")).onClick(() => {
					this.plugin.rebuildIndex(true);
				}),
			);
	}
}
