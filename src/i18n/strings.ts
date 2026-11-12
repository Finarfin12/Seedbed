import type { Lang } from "../domain/markdown";

/** Teks UI popup dan opsi (ID/EN). Nama ekstensi dan deskripsi ada di _locales/. */
const en = {
	"menu.title": "Save as seed",
	"popup.title": "Save as seed",
	"popup.source": "Source",
	"popup.question": "Trigger question",
	"popup.change": "Change question",
	"popup.answerLabel": "Your answer (optional)",
	"popup.answerPlaceholder": "Write 1 sentence: why does this interest you?",
	"popup.save": "Save",
	"popup.saveAnyway": "Save anyway",
	"popup.cancel": "Cancel",
	"popup.hint": "Ctrl+Enter = Save · Esc = Cancel",
	"popup.limitWarn": "Are you sure? You have already planted {n} seeds today.",
	"popup.noVault": "Set your vault name in the options first.",
	"popup.openOptions": "Open options",
	"popup.sending": "Sending to Obsidian…",
	"popup.sent": "Sent to Obsidian. If nothing happened, allow the \"Open Obsidian?\" prompt.",
	"popup.expired": "This capture expired. Select the text again and retry.",
	"popup.truncated": "The quote was shortened to fit.",
	"popup.tooLong": "The capture is too long to send. Select less text.",
	"popup.noText": "No text was selected.",
	"popup.close": "Close",
	"popup.fallback": "Fallback mode: a plain note is created without the Seedbed plugin.",
	"options.title": "Seedbed Capture: options",
	"options.vault": "Vault name",
	"options.vault.desc": "Exactly as shown in Obsidian (case matters). Required.",
	"options.language": "Language",
	"options.maxQuote": "Maximum quote length (characters)",
	"options.dailyLimit": "Seeds per day before asking \"Are you sure?\"",
	"options.dailyLimit.desc": "0 turns the check off.",
	"options.mode": "Mode",
	"options.mode.seedbed": "Seedbed (plugin installed)",
	"options.mode.fallback": "Fallback (Seedbed not installed): plain note via obsidian://new",
	"options.save": "Save options",
	"options.saved": "Saved.",
	"options.vaultRequired": "Vault name is required.",
	"options.privacy": "Privacy: this extension makes no network requests and has no server or account. Selected text is only sent to your own Obsidian through an obsidian:// link. Only a few counters and these options are stored locally.",
	"options.shortcut": "Keyboard shortcut: Alt+Shift+S (change it at chrome://extensions/shortcuts). Clicking the toolbar icon with text selected does the same.",
	"options.permissions": "Permissions: contextMenus (right-click item), storage (these options), activeTab + scripting (read the selection only when you press the shortcut or the toolbar icon).",
	"options.install": "Capture is sent to the Seedbed plugin in Obsidian. The first time, Chrome asks whether to open Obsidian; tick \"Always allow\" to skip that next time.",
} as const;

export type Key = keyof typeof en;

const id: Record<Key, string> = {
	"menu.title": "Simpan sebagai benih",
	"popup.title": "Simpan sebagai benih",
	"popup.source": "Sumber",
	"popup.question": "Pertanyaan pemicu",
	"popup.change": "Ganti pertanyaan",
	"popup.answerLabel": "Jawabanmu (opsional)",
	"popup.answerPlaceholder": "Tulis 1 kalimat: kenapa ini menarik buatmu?",
	"popup.save": "Simpan",
	"popup.saveAnyway": "Tetap simpan",
	"popup.cancel": "Batal",
	"popup.hint": "Ctrl+Enter = Simpan · Esc = Batal",
	"popup.limitWarn": "Yakin? Kamu sudah menanam {n} benih hari ini.",
	"popup.noVault": "Isi nama vault di pengaturan dulu.",
	"popup.openOptions": "Buka pengaturan",
	"popup.sending": "Mengirim ke Obsidian…",
	"popup.sent": "Terkirim ke Obsidian. Kalau tidak terjadi apa-apa, izinkan dialog \"Buka Obsidian?\".",
	"popup.expired": "Tangkapan ini sudah kedaluwarsa. Blok teksnya lagi lalu ulangi.",
	"popup.truncated": "Kutipan dipendekkan agar muat.",
	"popup.tooLong": "Tangkapan terlalu panjang untuk dikirim. Pilih teks yang lebih pendek.",
	"popup.noText": "Tidak ada teks yang dipilih.",
	"popup.close": "Tutup",
	"popup.fallback": "Mode cadangan: catatan biasa dibuat tanpa plugin Seedbed.",
	"options.title": "Seedbed Capture: pengaturan",
	"options.vault": "Nama vault",
	"options.vault.desc": "Persis seperti di Obsidian (huruf besar/kecil berpengaruh). Wajib diisi.",
	"options.language": "Bahasa",
	"options.maxQuote": "Panjang kutipan maksimum (karakter)",
	"options.dailyLimit": "Benih per hari sebelum bertanya \"Yakin?\"",
	"options.dailyLimit.desc": "0 mematikan pemeriksaan ini.",
	"options.mode": "Mode",
	"options.mode.seedbed": "Seedbed (plugin terpasang)",
	"options.mode.fallback": "Cadangan (Seedbed tidak terpasang): catatan biasa lewat obsidian://new",
	"options.save": "Simpan pengaturan",
	"options.saved": "Tersimpan.",
	"options.vaultRequired": "Nama vault wajib diisi.",
	"options.privacy": "Privasi: ekstensi ini tidak melakukan permintaan jaringan, tanpa server dan tanpa akun. Teks terpilih hanya dikirim ke Obsidian milikmu lewat link obsidian://. Yang tersimpan lokal hanya beberapa penghitung dan pengaturan ini.",
	"options.shortcut": "Pintasan keyboard: Alt+Shift+S (ubah di chrome://extensions/shortcuts). Klik ikon di toolbar saat ada teks terpilih berfungsi sama.",
	"options.permissions": "Izin: contextMenus (menu klik kanan), storage (pengaturan ini), activeTab + scripting (membaca teks terpilih hanya saat kamu menekan pintasan atau ikon toolbar).",
	"options.install": "Tangkapan dikirim ke plugin Seedbed di Obsidian. Pertama kali, Chrome menanyakan apakah boleh membuka Obsidian; centang \"Selalu izinkan\" agar tidak ditanya lagi.",
};

const TABLES: Record<Lang, Record<Key, string>> = { en, id };

export function t(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
	let s = (TABLES[lang] ?? TABLES.id)[key] ?? en[key];
	if (vars) s = s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
	return s;
}

export const KEYS = Object.keys(en) as Key[];
export const TABLE_EN: Record<Key, string> = en;
export const TABLE_ID: Record<Key, string> = id;
