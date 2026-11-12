# Gambar Chrome Web Store

Ukuran mengikuti <https://developer.chrome.com/docs/webstore/images> dan <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>: screenshot 1280×800 (maks. 5, tepi persegi, tanpa padding), promo kecil 440×280. Semua PNG (RGB, tanpa alpha).

| Berkas | Ukuran | Isi |
|---|---|---|
| `en/screenshot-1.png` | 1280×800 | Halaman web dengan teks terpilih (tangkapan asli Chrome) + keterangan |
| `en/screenshot-2.png` | 1280×800 | Jendela tangkap: kutipan, pertanyaan pemicu, jawaban |
| `en/screenshot-3.png` | 1280×800 | Modal konfirmasi Seedbed di Obsidian |
| `en/screenshot-4.png` | 1280×800 | Catatan benih hasil tangkapan + panel Incubator |
| `en/screenshot-5.png` | 1280×800 | Peringatan batas harian (5 benih) |
| `promo-small-440x280.png` | 440×280 | Ikon + nama + tagline |

Ikon 128×128 ada di ZIP (`icons/icon128.png`): gambar 96×96 + 16 px transparan tiap sisi (panduan resmi), dibuat ulang dengan `npm run icons`.

## Asal gambar
Gambar-gambar ini adalah **tangkapan layar asli** (`_raw/`) yang ditata di kanvas 1280×800 dengan keterangan, bukan mock-up:
- Chrome: profil uji terpisah (`.chrome-test-profile`, tanpa login); halaman Wikipedia "Spaced repetition".
- Obsidian: **`store/demo-vault/`**, vault demo terpisah berisi 6 catatan contoh berbahasa Inggris (5 ide + 1 konsep) dengan properti baru `type/status/created/review/gates/source/origin`, plus plugin Seedbed 0.7.0, antarmuka bahasa Inggris. Bukan vault pengguna dan bukan test-vault; tanpa catatan fixture/tidak valid. Dibuka di instance Obsidian terpisah (profil data sementara, sudah dihapus) agar konfigurasi Obsidian pengguna tidak tersentuh. Tangkapan di screenshot 3/4 dikirim lewat penangan link yang sama dengan `obsidian://seedbed-capture` (dipicu dari instance demo, karena link dari Chrome selalu menuju instance Obsidian utama).
- Menu klik kanan Chrome tidak bisa ditangkap lewat protokol debug, jadi screenshot 1 menampilkan teks terpilih dan keterangan caranya.

Hanya set Inggris yang dibuat. Dokumen resmi mengizinkan screenshot per lokal; bila mau set Indonesia, atur plugin dan ekstensi ke `id`, tangkap ulang, lalu jalankan skrip di bawah.

## Membuat ulang
`node scripts/make-store-images.mjs` dari akar ekstensi (perlu Chrome profil uji berjalan dengan `--remote-debugging-port=9333`; lihat `.test-harness/`). Sumber HTML tiap gambar ada di `_src/`.
