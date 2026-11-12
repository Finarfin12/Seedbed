import { putPending, getSettings } from "./storage";
import type { Pending } from "./storage";
import { t } from "./i18n/strings";

const MENU_ID = "seedbed-save";
const POPUP = { width: 540, height: 680 };

async function refreshMenu(): Promise<void> {
	const s = await getSettings();
	await chrome.contextMenus.removeAll();
	chrome.contextMenus.create({
		id: MENU_ID,
		title: t(s.language, "menu.title"),
		contexts: ["selection"],
	});
}

async function openCapturePopup(p: Pending): Promise<void> {
	if (!p.text || p.text.trim().length === 0) {
		await chrome.runtime.openOptionsPage();
		return;
	}
	const id = crypto.randomUUID();
	await putPending(id, p);
	await chrome.windows.create({
		url: chrome.runtime.getURL(`capture.html?id=${id}`),
		type: "popup",
		width: POPUP.width,
		height: POPUP.height,
		focused: true,
	});
}

/** Baca teks terpilih di tab aktif. Hanya dipanggil setelah gestur pengguna (pintasan / ikon): activeTab berlaku. */
async function captureFromActiveTab(tab?: chrome.tabs.Tab): Promise<void> {
	const target = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
	if (!target?.id) return;
	let text = "";
	try {
		const res = await chrome.scripting.executeScript({
			target: { tabId: target.id },
			func: () => window.getSelection()?.toString() ?? "",
		});
		text = res[0]?.result ?? "";
	} catch {
		// Halaman yang tidak boleh disuntik (chrome://, Web Store): anggap tidak ada teks terpilih.
	}
	await openCapturePopup({ text, url: target.url, title: target.title });
}

chrome.runtime.onInstalled.addListener(() => void refreshMenu());
chrome.runtime.onStartup.addListener(() => void refreshMenu());

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes.settings) void refreshMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId !== MENU_ID) return;
	void openCapturePopup({ text: info.selectionText ?? "", url: tab?.url ?? info.pageUrl, title: tab?.title });
});

chrome.commands.onCommand.addListener((command, tab) => {
	if (command === "capture-selection") void captureFromActiveTab(tab);
});

// Klik ikon toolbar: tangkap pilihan; jika tidak ada pilihan, buka pengaturan.
chrome.action.onClicked.addListener((tab) => void captureFromActiveTab(tab));
