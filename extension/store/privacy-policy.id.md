# Kebijakan Privasi: Seedbed Capture

Berlaku sejak: 2026-11-12 (versi 0.2.0)
Pengembang / kontak: TODO-your-name, TODO-contact-email

Seedbed Capture adalah ekstensi Chrome yang menyimpan teks yang kamu pilih di halaman web sebagai catatan ("benih") di vault Obsidian milikmu sendiri. Kebijakan ini menjelaskan apa yang ditangani ekstensi dan ke mana data itu pergi.

## Ringkasan
- Ekstensi ini tidak punya server, akun, analitik, atau iklan, dan tidak membuat permintaan jaringan.
- Teks yang kamu pilih hanya keluar dari ekstensi lewat satu cara: tautan `obsidian://` lokal yang diserahkan Chrome ke aplikasi Obsidian di komputermu sendiri.
- Pengembang tidak menerima data apa pun darimu.

## Data yang ditangani
Saat kamu memulai tangkapan (klik kanan "Simpan sebagai benih", pintasan keyboard, atau tombol toolbar), ekstensi menangani:
1. Teks yang kamu pilih di halaman.
2. Alamat (URL) dan judul halaman, agar catatan bisa menaut ke sumbernya.
3. Pertanyaan pemicu di jendela tangkapan, dan satu kalimat jawaban opsional yang kamu ketik.

Ekstensi tidak membaca halaman kecuali kamu memulai tangkapan, dan tidak membaca isi halaman lain, cookie, kata sandi, formulir, atau riwayat penjelajahan.

## Ke mana data pergi
- Chrome membuka tautan `obsidian://` lokal yang memuat hal-hal di atas. Obsidian di komputermu membuat catatan di vault yang kamu tulis di opsi ekstensi.
- Apa yang terjadi sesudahnya, termasuk apakah Obsidian atau plugin Seedbed menyinkronkan vault-mu, diatur oleh aplikasi itu dan pengaturanmu sendiri, bukan oleh ekstensi ini.
- Ekstensi tidak mengirim data ke situs, server, atau pihak ketiga mana pun.

## Yang disimpan ekstensi
- **Opsi** (nama vault, bahasa, mode, panjang kutipan, batas harian) dan **penghitung tangkapan harian**, di `chrome.storage.local` pada perangkatmu. Tersimpan sampai kamu mengubahnya, menghapus data ekstensi, atau mencopot ekstensi.
- **Tangkapan yang sedang berjalan**, di `chrome.storage.session` (memori sementara browser), hanya untuk meneruskannya dari latar belakang ke jendela tangkapan. Dihapus begitu jendela membacanya. Bila kamu meninggalkan tangkapan sebelum jendelanya terbuka, data hanya tinggal di memori sesi sampai Chrome membersihkan sesi.
- Tidak ada riwayat tangkapan, dan tidak ada yang disinkronkan lewat akun Google-mu (`chrome.storage.sync` tidak dipakai).

## Izin
- `contextMenus`: item klik kanan "Simpan sebagai benih".
- `storage`: opsi, penghitung, dan tangkapan sementara di atas.
- `activeTab`: akses sementara ke tab saat ini, hanya setelah kamu menekan pintasan atau tombol toolbar.
- `scripting`: membaca teks yang sedang kamu pilih di tab aktif setelah kamu menekan pintasan atau tombol toolbar. Tidak ada kode lain yang disuntikkan.

Ekstensi tidak meminta izin host dan tidak punya content script.

## Berbagi, menjual, dan iklan
Pengembang tidak mengumpulkan, menjual, membagikan, atau mentransfer datamu, dan tidak memakainya untuk iklan, profiling, atau keputusan kredit. Tidak ada orang di pihak pengembang yang bisa membacanya, karena data itu tidak pernah sampai ke pengembang.

## Kode jarak jauh
Ekstensi tidak memuat atau menjalankan kode jarak jauh. Semua kode ada di dalam paket ekstensi.

## Pernyataan Limited Use
Penggunaan informasi yang diterima dari API Chrome akan mematuhi Kebijakan Data Pengguna Chrome Web Store, termasuk persyaratan Limited Use.

## Anak-anak
Ekstensi ini alat produktivitas umum dan tidak ditujukan untuk anak-anak.

## Perubahan
Bila kebijakan ini berubah, versi baru akan dipublikasikan di alamat yang sama dengan tanggal berlaku baru.

## Kontak
TODO-contact-email
