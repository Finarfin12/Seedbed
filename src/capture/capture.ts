import { increment, isOverLimit, localDate, localStamp } from "../domain/dailyLimit";
import { nextTrigger, pickTrigger } from "../domain/questions";
import type { Trigger } from "../domain/questions";
import { buildUri, prepare } from "../domain/uriBuilder";
import type { Settings } from "../domain/settings";
import { t } from "../i18n/strings";
import type { Key } from "../i18n/strings";
import { getDaily, getSettings, saveDaily, takePending } from "../storage";
import type { Pending } from "../storage";

const app = document.getElementById("app") as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { cls?: string; text?: string; attrs?: Record<string, string> } = {}, ...kids: Node[]): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	if (props.cls) e.className = props.cls;
	if (props.text !== undefined) e.textContent = props.text; // textContent: teks halaman tidak pernah jadi HTML
	for (const [k, v] of Object.entries(props.attrs ?? {})) e.setAttribute(k, v);
	for (const k of kids) e.append(k);
	return e;
}

/**
 * Buka link obsidian:// dari halaman popup (gestur pengguna: klik Simpan / Ctrl+Enter).
 * Dipilih setelah dicoba di Chrome sungguhan (lihat docs/capture/C6-Catatan-Build.md).
 */
function openObsidian(uri: string): void {
	window.location.href = uri;
}

async function main(): Promise<void> {
	const s = await getSettings();
	document.documentElement.lang = s.language;
	const L = (k: Key, v?: Record<string, string | number>): string => t(s.language, k, v);
	document.title = L("popup.title");

	const id = new URLSearchParams(location.search).get("id") ?? "";
	const pending = await takePending(id);
	if (!pending) {
		render(L("popup.expired"), L);
		return;
	}
	await renderCapture(pending, s, L);
}

function render(message: string, L: (k: Key) => string): void {
	app.replaceChildren(
		el("h1", { text: L("popup.title") }),
		el("div", { cls: "note", text: message }),
		el("div", { cls: "row end" }, closeButton(L)),
	);
	app.querySelector("button")?.focus();
}

function closeButton(L: (k: Key) => string): HTMLButtonElement {
	const b = el("button", { text: L("popup.close") });
	b.addEventListener("click", () => window.close());
	return b;
}

async function renderCapture(p: Pending, s: Settings, L: (k: Key, v?: Record<string, string | number>) => string): Promise<void> {
	const daily = await getDaily();
	const over = isOverLimit(daily, s.dailyLimit);
	const preview = prepare({ text: p.text, url: p.url, title: p.title }, s.maxQuote, s.language);
	if (!preview) {
		render(L("popup.noText"), L);
		return;
	}

	let trigger: Trigger = pickTrigger(s.language);
	let sending = false;

	const questionEl = el("p", { cls: "question", text: trigger.text, attrs: { id: "q" } });
	const answer = el("textarea", {
		attrs: { id: "answer", placeholder: L("popup.answerPlaceholder"), "aria-labelledby": "q", rows: "3" },
	});
	const changeBtn = el("button", { text: L("popup.change") });
	changeBtn.addEventListener("click", () => {
		trigger = nextTrigger(s.language, trigger);
		questionEl.textContent = trigger.text;
		answer.focus();
	});

	const status = el("div", { cls: "note", attrs: { role: "status" } });
	status.hidden = true;
	const saveBtn = el("button", { cls: "primary", text: over ? L("popup.saveAnyway") : L("popup.save") });
	const cancelBtn = el("button", { text: L("popup.cancel") });

	const showStatus = (msg: string): void => {
		status.hidden = false;
		status.textContent = msg;
	};

	const save = async (): Promise<void> => {
		if (sending) return;
		const built = buildUri(
			{ text: p.text, url: p.url, title: p.title, q: trigger.text, a: answer.value },
			s,
			localDate(new Date()),
			undefined,
			localStamp(new Date()),
		);
		if (!built.ok) {
			showStatus(built.error === "no-vault" ? L("popup.noVault") : built.error === "too-long" ? L("popup.tooLong") : L("popup.noText"));
			return;
		}
		sending = true;
		saveBtn.disabled = true;
		showStatus(L("popup.sending"));
		// Hitung dulu (sebelum navigasi), supaya penahan tumpukan tetap akurat walau jendela tertutup oleh Chrome.
		await saveDaily(increment(daily, localDate(new Date())));
		openObsidian(built.built.uri);
		showStatus(L("popup.sent"));
		saveBtn.hidden = true;
		cancelBtn.textContent = L("popup.close");
		cancelBtn.focus();
	};

	saveBtn.addEventListener("click", () => void save());
	cancelBtn.addEventListener("click", () => window.close());
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			window.close();
		} else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void save();
		}
	});

	const children: Node[] = [el("h1", { text: L("popup.title") })];
	if (!s.vault) {
		const open = el("button", { text: L("popup.openOptions") });
		open.addEventListener("click", () => void chrome.runtime.openOptionsPage());
		children.push(el("div", { cls: "warn", text: L("popup.noVault") }), el("div", { cls: "row" }, open));
	}
	if (over) children.push(el("div", { cls: "warn", text: L("popup.limitWarn", { n: daily.count }) }));
	if (s.mode === "fallback") children.push(el("div", { cls: "note", text: L("popup.fallback") }));

	const quoteText = preview.text.length > 700 ? `${preview.text.slice(0, 700)}…` : preview.text;
	children.push(
		el("section", {}, el("h2", { text: L("popup.source") }), el("blockquote", { cls: "quote", text: quoteText })),
		el("div", { cls: "source", text: [p.title, preview.url].filter(Boolean).join(" · ") }),
	);
	if (preview.truncated) children.push(el("div", { cls: "note", text: L("popup.truncated") }));
	children.push(
		el("section", {}, el("h2", { text: L("popup.question") }), questionEl, el("div", { cls: "row" }, changeBtn)),
		el("section", {}, el("h2", { text: L("popup.answerLabel") }), answer),
		status,
		el("div", { cls: "row end" }, cancelBtn, saveBtn),
		el("div", { cls: "hint", text: L("popup.hint") }),
	);
	app.replaceChildren(...children);
	answer.focus();
}

void main();
