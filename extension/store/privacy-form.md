# Jawaban tab "Privacy" (Chrome Web Store Developer Dashboard)

Salin jawaban berikut ke kolom yang sesuai. Semua klaim sudah dicek terhadap kode (`manifest.json`, `src/`, `scripts/check-bundle.mjs`: tanpa fetch/XHR/WebSocket, tanpa `host_permissions`, tanpa `content_scripts`). Dokumentasi resmi tab ini: <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>.

## 1. Single purpose (EN, tempel apa adanya)
> Seedbed Capture has one purpose: let the user save text they select on a web page as a note (a "seed") in their own Obsidian vault, together with a trigger question and an optional one-sentence answer, by opening a local obsidian:// link on their own computer.

## 2. Permission justifications (EN, satu kolom per izin)

| Izin | Jawaban |
|---|---|
| `contextMenus` | Adds the single "Save as seed" item to the right-click menu when the user has selected text. It is the main way to start a capture. |
| `storage` | Stores the user's options (vault name, language, mode, quote limit, daily limit) and the daily capture counter in `chrome.storage.local`. Uses `chrome.storage.session` to pass the selected text from the background service worker to the capture window once; the data is deleted as soon as the window reads it. Nothing is synced or sent anywhere. |
| `activeTab` | Gives temporary access to the current tab only after the user presses the keyboard shortcut or clicks the toolbar button, so the extension can read the text the user has selected in that tab. No broad host access is requested. |
| `scripting` | Used for one call, `chrome.scripting.executeScript`, that runs a fixed function (`window.getSelection().toString()`) in the active tab after the user presses the shortcut or the toolbar button. The extension does not inject any other code and has no content scripts. |

Tidak ada `host_permissions`, tidak ada `content_scripts`, tidak ada `<all_urls>`.

## 3. Remote code
Pilih: **"No, I am not using remote code."** Seluruh JavaScript ada di dalam ZIP. Tidak ada `eval`, `new Function`, skrip dari CDN, atau modul yang dimuat dari URL. Kode diminify oleh esbuild; minify bukan obfuscation (docs review process: obfuscation dilarang). Sumber lengkap ada di repositori.

## 4. Data usage (centang yang relevan)
Dokumentasi resmi tidak memberi daftar kotak yang pasti di formulir. Ia hanya menyebut jenis data pengguna (identitas, keuangan, kesehatan, otentikasi, **konten situs web**, data formulir, **aktivitas penjelajahan web**, komunikasi pribadi, **konten buatan pengguna**) dan bahwa pengungkapan harus sama dengan kebijakan privasi. Sumber: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>.

Rekomendasi konservatif (lebih baik mengungkap berlebih daripada kurang; cek ulang label kotaknya saat mengisi):
- **Website content**: teks yang dipilih pengguna.
- **Web browsing activity**: URL dan judul halaman sumber (disertakan di catatan).
- **User-generated content**: jawaban satu kalimat yang diketik pengguna.
- Jangan dicentang: identitas pribadi, keuangan, kesehatan, otentikasi, komunikasi pribadi, lokasi, data formulir.

Catatan: data ini diproses di perangkat dan hanya diserahkan ke aplikasi Obsidian milik pengguna lewat link lokal. Tidak dikumpulkan oleh pengembang, tidak dikirim ke server, tidak dijual atau dibagikan.

## 5. Certifications (tiga pernyataan; semuanya benar untuk ekstensi ini)
- Tidak menjual atau mentransfer data pengguna ke pihak ketiga di luar kasus penggunaan yang disetujui: benar, tidak ada transfer.
- Tidak menggunakan atau mentransfer data untuk tujuan yang tak terkait dengan fungsi tunggal: benar.
- Tidak menggunakan atau mentransfer data untuk menilai kelayakan kredit atau pinjaman: benar.

(Teks persis tiap pernyataan di dashboard bisa berbeda dari parafrasa ini; baca sebelum mencentang.)

## 6. Privacy policy URL
Isi dengan URL publik halaman kebijakan privasi. **Belum ada.** Filenya ada di `privacy-policy.html` (EN) dan `privacy-policy.id.html` (ID) tetapi belum di-host. Lihat `SUBMISSION-CHECKLIST.md`, langkah "Host kebijakan privasi". Dokumen kebijakan sudah memuat pernyataan Limited Use yang diminta kebijakan data pengguna.
