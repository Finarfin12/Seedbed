# Checklist submit ke Chrome Web Store (langkah untuk kamu)

Paket ini sudah menyiapkan semua berkas. **Belum ada yang di-upload, tidak ada akun yang dibuat atau dimasuki, tidak ada biaya dibayar, dan kebijakan privasi belum di-host.** Semua langkah bertanda 👤 hanya bisa kamu lakukan.

Versi paket: ekstensi 0.2.0 · ZIP: `store/seedbed-capture-0.2.0.zip`

## 0. Sebelum mulai

- [ ] 👤 **Putuskan nama penerbit dan email kontak.** Ganti `TODO-your-name` dan `TODO-contact-email` di: `store/privacy-policy.md` dan `store/privacy-policy.id.md` (`LICENSE` sudah memakai Finarfin12, sama dengan plugin). Lalu jalankan `node scripts/make-policy-html.mjs` supaya `.html`-nya ikut berubah. (`TODO-github-url` di `listing-en.md` hanya bila kamu mengisi Homepage/Support URL.)
- [ ] 👤 **Pastikan Seedbed 0.7.0 tersedia untuk orang lain.** Listing menyebut "Seedbed 0.7.0 atau lebih baru" (properti catatan berbahasa Inggris, `seedbed-*`), padahal rilis publik di GitHub baru 0.5.0 (draft); 0.6.0 dan 0.7.0 belum di-push. Listing sudah menulis dengan jujur bahwa Seedbed dipasang manual dari GitHub (belum di Community Plugins) dan menyebut mode cadangan; rilis 0.7.0 di GitHub dulu (atau ubah kalimat itu) sebelum submit. Tanpa plugin, ekstensi tetap jalan di "mode cadangan", yang kini menulis format properti yang sama.
- [ ] Bila kode berubah: `npm test`, lalu `npm run package` (membuat ulang ZIP; daftar isi dan SHA256 dicetak).

## 1. Akun developer 👤

Daftar di Chrome Web Store Developer Dashboard (<https://chrome.google.com/webstore/devconsole>) dengan akun Google.
- **Biaya:** dokumentasi resmi yang kubaca hanya menyebut "biaya pendaftaran satu kali" tanpa nominal. **Lihat nominalnya di halaman pendaftaran.** Aku tidak menebak angkanya.
- **Verifikasi email kontak:** wajib saat akun baru (halaman Account; link verifikasi dikirim ke email). Email akun **tidak bisa diganti** setelah dibuat; pakai email yang rutin kamu cek.
- **Nama penerbit** wajib dan tampil sebagai "Offered by".
- Syarat lain (verifikasi dua langkah, status trader/non-trader di wilayah tertentu) **tidak tercantum di dokumen yang kubaca**; ikuti apa yang diminta dashboard.

## 2. Host kebijakan privasi 👤

Dashboard meminta **URL publik** kebijakan privasi (kebijakan harus diposting di dashboard; dokumentasi tidak merinci bentuk hosting, tetapi isian-nya berupa URL). Pilihan umum: GitHub Pages dari repositori, atau halaman statis lain milikmu.
- [ ] Upload `store/privacy-policy.html` (EN) dan `store/privacy-policy.id.html` (ID) ke tempat publik. HTML-nya statis, tanpa skrip, CSS inline, mendukung mode gelap.
- [ ] Catat URL-nya; dipakai di tab Privacy dan boleh ditautkan dari Homepage URL. Halaman itu juga sudah memuat pernyataan **Limited Use** yang diminta kebijakan data pengguna.
- [ ] Buka URL tanpa login di jendela samaran untuk memastikan benar-benar publik.

## 3. Upload ZIP

- [ ] Dashboard → **Add new item** → pilih `store/seedbed-capture-0.2.0.zip` → Upload. (Batas ukuran paket dalam dokumen: 2 GB; ZIP ini ±18 KB.)
- Isi ZIP: 13 berkas, `manifest.json` di akar, tanpa source map, tes, `node_modules`, atau profil/harness uji.
- Catatan review: kode diminify (esbuild), bukan di-obfuscate; obfuscation dilarang oleh dokumen proses review, minify tidak disebut dilarang. Sumber lengkap tersedia di repositori bila reviewer meminta.

## 4. Tab Store listing

| Kolom dashboard | Isi dari berkas |
|---|---|
| Ringkasan/nama | otomatis dari manifest (`_locales`); 98 karakter EN, 120 ID, batas 132 |
| Detailed description | `store/listing-en.md`, bagian "Detailed description" |
| Kategori | Productivity (lihat catatan di `listing-en.md`) |
| Bahasa | English; tambah Indonesia dengan `store/listing-id.md` bila mau |
| Store icon 128×128 | otomatis dari ZIP (`icons/icon128.png`; gambar 96×96 + 16 px transparan tiap sisi) |
| Screenshots (maks. 5) | `store/images/en/screenshot-1.png` … `screenshot-5.png` (1280×800) |
| Small promo tile 440×280 | `store/images/promo-small-440x280.png` |
| Marquee 1400×560 | tidak dibuat (opsional) |
| Homepage / Support URL | opsional: URL repositori publikmu |
| Video, mature content | kosong / mati |

## 5. Tab Privacy

Salin dari `store/privacy-form.md`: single purpose, alasan tiap izin (`contextMenus`, `storage`, `activeTab`, `scripting`), remote code = **No**, centang jenis data (rekomendasi konservatif ada di file itu; **baca label kotak di dashboard sebelum mencentang**), tiga sertifikasi, dan URL kebijakan privasi dari langkah 2.

## 6. Tab Distribution 👤

- Harga: gratis. Wilayah: All regions (atau pilih sendiri).
- **Visibilitas** (dokumentasi resmi; semua tingkat tunduk pada syarat kebijakan yang sama):
  - **Public:** terdaftar di Chrome Web Store untuk semua orang.
  - **Unlisted:** tidak muncul di pencarian/daftar, tetapi siapa pun yang tahu URL Web Store-nya bisa memasang.
  - **Private:** hanya pengguna tertentu (penguji tepercaya atau anggota Google Group milikmu).
- **Rekomendasi: Unlisted**, selama Seedbed belum ada di Community Plugins Obsidian. Ekstensi ini baru berguna penuh bersama plugin atau mode cadangan, jadi tak perlu muncul di pencarian dulu. Bisa dinaikkan ke Public nanti tanpa mengunggah ulang paket.

## 7. Tab Test instructions (disarankan; dokumen menyebutnya "jika perlu")

Reviewer tidak punya Obsidian, jadi beri petunjuk. Teks yang bisa ditempel:

> Seedbed Capture saves selected text as a note through a local obsidian:// link, so a full end-to-end test needs the free Obsidian desktop app. Without Obsidian you can still verify the extension: (1) open any web page and select some text; (2) right-click and choose "Save as seed" (or press Alt+Shift+S); (3) the capture window opens with the quote, a trigger question, an optional answer box, and Save/Cancel; (4) open the extension options page to see the settings (vault name, language, mode, limits). On Save, Chrome asks whether to open Obsidian; the extension makes no network requests and sends nothing anywhere. To test end to end: install Obsidian, create a vault named "demo", enter "demo" as the vault name in the options, choose "fallback mode", then Save; a note appears in the vault folder "Ide".

## 8. Submit 👤

- [ ] **Submit for Review** dan konfirmasi. Kamu bisa mematikan centang "publish otomatis" supaya menerbitkan manual setelah lolos (dokumen: ada **hingga 30 hari** untuk menerbitkan, lalu kembali ke draft).
- Waktu review menurut dokumen: "biasanya beberapa hari, bisa sampai beberapa minggu"; lebih lama untuk pengembang/ekstensi baru dan izin sensitif. Jika lebih dari tiga minggu, hubungi dukungan developer.
- Email penolakan/takedown menyebut kebijakan yang dilanggar; balas dengan perbaikan lalu submit ulang.

## Yang hanya bisa dilakukan kamu (ringkas)

1. Membuat/masuk akun developer dan memverifikasi email kontak; membayar biaya pendaftaran (cek nominal di halaman pendaftaran).
2. Menentukan nama penerbit, kontak, dan mengganti semua placeholder `TODO-*`.
3. Meng-host kebijakan privasi di URL publik.
4. Memastikan Seedbed 0.7.0 dirilis (atau mengubah teks listing).
5. Mengisi dan mengirim formulir, memilih visibilitas, dan menekan Submit.

## Sumber dokumentasi (dibaca 2026-11-12)

- Gambar (ikon 128×128 dengan padding, screenshot 1280×800 atau 640×400 maks. 5, promo 440×280 dan 1400×560): <https://developer.chrome.com/docs/webstore/images>
- Tab Store listing: <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>
- Tab Privacy: <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- Distribusi dan visibilitas: <https://developer.chrome.com/docs/webstore/cws-dashboard-distribution>
- Publikasi dan batas paket: <https://developer.chrome.com/docs/webstore/publish>
- Proses review: <https://developer.chrome.com/docs/webstore/review-process>
- Persiapan akun: <https://developer.chrome.com/docs/webstore/set-up-account> dan <https://developer.chrome.com/docs/webstore/register>
- Kebijakan data pengguna dan Limited Use: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
- Batas 132 karakter `description` manifest: <https://developer.chrome.com/docs/extensions/reference/manifest/description>

Halaman dokumentasi tidak menyebut batas karakter deskripsi panjang, nominal biaya, atau persyaratan 2FA/trader; semuanya sengaja tidak ditebak di sini.
