import { cleanVaultName, mergeSettings, SETTINGS_RANGE } from "../domain/settings";
import type { Settings } from "../domain/settings";
import { t } from "../i18n/strings";
import type { Key } from "../i18n/strings";
import { getSettings, saveSettings } from "../storage";

const app = document.getElementById("app") as HTMLElement;

function field(label: string, control: HTMLElement, desc?: string): HTMLElement {
	const wrap = document.createElement("div");
	const id = control.id;
	const l = document.createElement("label");
	l.htmlFor = id;
	l.textContent = label;
	wrap.append(l, control);
	if (desc) {
		const d = document.createElement("div");
		d.className = "desc";
		d.textContent = desc;
		wrap.append(d);
	}
	return wrap;
}

function info(text: string): HTMLElement {
	const d = document.createElement("div");
	d.className = "info";
	d.textContent = text;
	return d;
}

async function main(): Promise<void> {
	let s: Settings = await getSettings();
	const draw = (): void => {
		const L = (k: Key): string => t(s.language, k);
		document.documentElement.lang = s.language;
		document.title = L("options.title");

		const h1 = document.createElement("h1");
		h1.textContent = L("options.title");

		const vault = document.createElement("input");
		vault.type = "text";
		vault.id = "vault";
		vault.value = s.vault;
		vault.autocomplete = "off";
		vault.spellcheck = false;

		const lang = document.createElement("select");
		lang.id = "language";
		for (const [v, name] of [["id", "Bahasa Indonesia"], ["en", "English"]] as const) {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = name;
			o.selected = s.language === v;
			lang.append(o);
		}
		// Bahasa langsung mengganti teks halaman ini (tanpa menyimpan nilai lain yang belum disimpan).
		lang.addEventListener("change", () => {
			s = { ...readForm(), language: lang.value === "en" ? "en" : "id" };
			draw();
		});

		const maxQuote = document.createElement("input");
		maxQuote.type = "number";
		maxQuote.id = "maxQuote";
		maxQuote.min = String(SETTINGS_RANGE.maxQuote[0]);
		maxQuote.max = String(SETTINGS_RANGE.maxQuote[1]);
		maxQuote.value = String(s.maxQuote);

		const daily = document.createElement("input");
		daily.type = "number";
		daily.id = "dailyLimit";
		daily.min = String(SETTINGS_RANGE.dailyLimit[0]);
		daily.max = String(SETTINGS_RANGE.dailyLimit[1]);
		daily.value = String(s.dailyLimit);

		const mode = document.createElement("select");
		mode.id = "mode";
		for (const [v, key] of [["seedbed", "options.mode.seedbed"], ["fallback", "options.mode.fallback"]] as const) {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = L(key);
			o.selected = s.mode === v;
			mode.append(o);
		}

		const status = document.createElement("div");
		status.className = "status";
		status.setAttribute("role", "status");

		const save = document.createElement("button");
		save.type = "button";
		save.textContent = L("options.save");

		function readForm(): Settings {
			return mergeSettings({
				vault: cleanVaultName(vault.value),
				language: lang.value,
				maxQuote: Number(maxQuote.value),
				dailyLimit: Number(daily.value),
				mode: mode.value,
			});
		}

		save.addEventListener("click", () => {
			const next = readForm();
			if (!next.vault) {
				status.className = "status error";
				status.textContent = L("options.vaultRequired");
				vault.focus();
				return;
			}
			void saveSettings(next).then(() => {
				s = next;
				status.className = "status";
				status.textContent = L("options.saved");
				maxQuote.value = String(next.maxQuote);
				daily.value = String(next.dailyLimit);
			});
		});

		app.replaceChildren(
			h1,
			field(L("options.vault"), vault, L("options.vault.desc")),
			field(L("options.language"), lang),
			field(L("options.maxQuote"), maxQuote),
			field(L("options.dailyLimit"), daily, L("options.dailyLimit.desc")),
			field(L("options.mode"), mode),
			save,
			status,
			info(L("options.install")),
			info(L("options.shortcut")),
			info(L("options.permissions")),
			info(L("options.privacy")),
		);
	};
	draw();
}

void main();
