import { localDate, normalizeState } from "./domain/dailyLimit";
import type { DailyState } from "./domain/dailyLimit";
import { DEFAULT_SETTINGS, mergeSettings } from "./domain/settings";
import type { Settings } from "./domain/settings";

/**
 * Semua penyimpanan LOKAL (chrome.storage.local); sengaja bukan storage.sync supaya tidak ada sinkronisasi akun.
 * Data dari storage selalu divalidasi ulang (tidak tepercaya).
 */
const KEY_SETTINGS = "settings";
const KEY_DAILY = "daily";

export async function getSettings(): Promise<Settings> {
	const r = await chrome.storage.local.get(KEY_SETTINGS);
	return mergeSettings(r[KEY_SETTINGS] ?? DEFAULT_SETTINGS);
}

export async function saveSettings(s: Settings): Promise<void> {
	await chrome.storage.local.set({ [KEY_SETTINGS]: mergeSettings(s) });
}

export async function getDaily(now: Date = new Date()): Promise<DailyState> {
	const today = localDate(now);
	const r = await chrome.storage.local.get(KEY_DAILY);
	return normalizeState(r[KEY_DAILY], today);
}

export async function saveDaily(s: DailyState): Promise<void> {
	await chrome.storage.local.set({ [KEY_DAILY]: s });
}

/** Data tangkapan sementara (sekali pakai) di storage.session, bukan di URL popup. */
export interface Pending {
	text: string;
	url?: string;
	title?: string;
}

const pendingKey = (id: string): string => `cap:${id}`;

export async function putPending(id: string, p: Pending): Promise<void> {
	await chrome.storage.session.set({ [pendingKey(id)]: p });
}

/** Ambil lalu hapus (sekali pakai). */
export async function takePending(id: string): Promise<Pending | null> {
	if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
	const k = pendingKey(id);
	const r = await chrome.storage.session.get(k);
	await chrome.storage.session.remove(k);
	const v = r[k] as Partial<Pending> | undefined;
	if (!v || typeof v.text !== "string" || v.text.length === 0) return null;
	return {
		text: v.text,
		url: typeof v.url === "string" ? v.url : undefined,
		title: typeof v.title === "string" ? v.title : undefined,
	};
}
