# Seedbed

[English](README.md) · **Bahasa Indonesia**

Plugin Obsidian untuk menginkubasi ide dan menguji pemahaman. Ide hanya naik status setelah lolos "gerbang" berpikir: **Socratic**, **Devil's Advocate**, dan **Feynman**. AI opsional hanya boleh bertanya, tidak pernah menjawab.

> **Status: v0.5.0 (pra-rilis).** Diuji manual di Obsidian desktop (Windows 11). Belum diuji di mobile. Sebelumnya bernama "Bengkel Ide".

**Privasi dan jaringan.** Saat fitur AI **mati (bawaan)**, plugin ini tidak melakukan satu pun permintaan jaringan dan tidak menjalankan program apa pun. Semua data berupa frontmatter dan callout Markdown biasa di vault-mu, jadi tetap terbaca tanpa plugin. AI hanya aktif jika kamu menyalakannya dan menyetujui tiap penyedia (lihat [AI opsional](#ai-opsional)).

## Daftar isi
- [Konsep](#konsep)
- [Perintah](#perintah)
- [Format data](#format-data)
- [Mode Feynman](#mode-feynman)
- [Bank pertanyaan kustom](#bank-pertanyaan-kustom)
- [AI opsional](#ai-opsional)
- [Bahasa](#bahasa)
- [Instalasi](#instalasi)
- [Pengembangan](#pengembangan)
- [Rilis](#rilis)
- [Lisensi](#lisensi)

## Konsep

```
Benih --(Socratic / Feynman)--> Tumbuh --(Devil's Advocate)--> Matang
  \________________ Dibuang (kapan saja) ________________/    Matang --> Tumbuh (buka ulang)
```

| Tipe | benih → tumbuh | tumbuh → matang |
|---|---|---|
| `ide` | Gerbang **Socratic** (6 pertanyaan) | Gerbang **Devil's Advocate** (minimal 4 dari 5 dijawab) |
| `konsep` | Gerbang **Feynman** (tidak ada istilah yang belum dijelaskan) | Devil's Advocate opsional (pengaturan) |

- Setiap gerbang bisa dimatikan di Pengaturan; jika mati, status naik dengan satu klik.
- Setiap status punya tanggal tinjau. Ide yang jatuh tempo muncul lagi di panel Inkubator, jadi tidak terlupakan.

## Perintah

| Perintah (Command Palette) | Fungsi |
|---|---|
| Tangkap ide baru | Buat catatan ide dari template di folder `Ide/` |
| Jadikan catatan ini ide / konsep | Tambah properti `bengkel-*` ke catatan yang sudah ada |
| Naikkan status ide ini | Naik satu status; membuka gerbang yang dibutuhkan |
| Tantang ide ini (Devil's Advocate) | 5 pertanyaan penantang untuk catatan apa pun; hasilnya jadi callout |
| Mulai Feynman | Buat catatan `Feynman - <Konsep>` (tipe konsep) di folder `Konsep/` |
| Periksa penjelasan (Feynman) | Cari istilah yang belum dijelaskan dan kalimat yang terlalu panjang |
| Buka Inkubator | Panel samping: jatuh tempo, lalu per status |

Panel Inkubator punya tombol **Naikkan / Tunda / Buang / Buka**, plus **Buka ulang / Pulihkan**. Di desktop ada penanda "💡 N jatuh tempo" di status bar; di mobile penandanya ada di panel.

## Format data

Frontmatter adalah sumber kebenaran status. Awalan `bengkel-` mencegah bentrok dengan plugin lain:

```yaml
---
bengkel-tipe: ide            # ide | konsep
bengkel-status: tumbuh       # benih | tumbuh | matang | dibuang
bengkel-dibuat: 2026-11-11
bengkel-tinjau: 2026-11-25   # jatuh tempo berikutnya
bengkel-gerbang:             # gerbang yang sudah dilewati
  - socratic
---
```

Jejak berpikir disimpan sebagai callout yang hanya ditambahkan di akhir catatan. Label sumber pertanyaan ikut tercatat:

```markdown
> [!socratic]- Sesi Socratic — 2026-11-12
> **Klarifikasi** · AI · cloud (claude cli)
> Cepat dibanding apa? Dari mana data diambil kalau tidak ada cache?
> Jawaban: Dibanding mengambil dari database.
```

Plugin **tidak pernah menghapus isi catatan**. Ia hanya menambah callout dan mengubah properti berawalan `bengkel-`.

Contoh query Dataview:

````markdown
```dataview
TABLE bengkel-status, bengkel-tinjau FROM "Ide" WHERE bengkel-tipe = "ide"
```
````

## Mode Feynman

1. Istilah = judul dan alias semua catatan vault (min. 3 huruf) + daftar jargon dari Pengaturan.
2. Istilah yang **muncul** di penjelasanmu dianggap **sudah dijelaskan** jika ada pola `istilah adalah / yaitu / ialah / artinya / berarti / merupakan` (EN: `is / means / refers to`).
3. Blok kode, kode inline, frontmatter, komentar HTML, tujuan tautan, dan callout plugin tidak dianalisis.
4. Kalimat lebih dari 25 kata ditandai sebagai **saran** (tidak menghalangi gerbang).

Ini pencocokan pola, bukan pemahaman. False positive pasti ada; pakai tombol **Abaikan** (per catatan) atau atur daftar jargon. Pemeriksaan membaca isi catatan yang **tersimpan di disk**.

## Bank pertanyaan kustom

Isi **Pengaturan → File bank kustom** dengan path file JSON di vault. Boleh sebagian saja; kategori yang kosong memakai bawaan:

```json
{
  "id": { "socratic": { "klarifikasi": ["Pertanyaanku sendiri?"] }, "devil": { "kegagalan": ["..."] } },
  "en": { "socratic": { "bukti": ["..."] } }
}
```

Kategori Socratic: `klarifikasi, asumsi, bukti, sudutPandang, implikasi, pertanyaan`. Devil's Advocate: `asumsi, kebalikan, bukti, lawan, kegagalan`.

## AI opsional

AI dipakai **hanya untuk bertanya**: pertanyaan Socratic dan Devil's Advocate yang mengacu pada isi catatan dan jawabanmu sebelumnya. AI **tidak menjelaskan, tidak menjawab, dan tidak menilai gerbang**. Lolos atau tidaknya gerbang tetap ditentukan aturan pasti (panjang jawaban / jumlah jawaban). Setiap pertanyaan diberi label sumber: `AI · lokal (ollama)`, `AI · cloud (claude cli)`, atau `Bank`.

**Mati secara default.** Aktifkan di Pengaturan → AI (opsional), lalu aktifkan dan setujui tiap penyedia satu per satu. Penyedia dicoba berurutan (bisa diatur). Jika gagal atau timeout, plugin pindah ke penyedia berikutnya, dan terakhir ke bank pertanyaan bawaan.

| Penyedia | Apa yang terjadi | Data keluar dari PC? |
|---|---|---|
| **CLI langganan** (Claude Code) | Menjalankan program `claude` yang sudah kamu login-kan. Hanya desktop. | **Ya** (cloud): isi catatan yang sedang dibuka |
| **Model lokal** (Ollama, LM Studio) | Permintaan ke server di komputermu (`localhost`). Plugin tidak memasang apa pun. | Tidak |
| **API** (kompatibel OpenAI) | Permintaan ke alamat yang kamu isi, dengan API key-mu. | **Ya** (cloud), kecuali alamatnya localhost |

**Yang dikirim:** hanya catatan yang sedang dibuka (dipotong ke batas konteks, default 4.000 karakter), jawaban sebelumnya di sesi itu, dan instruksi plugin. Tidak ada catatan lain dan tidak ada telemetri.

**Keamanan CLI** (hanya jika CLI diaktifkan dan disetujui):
- `claude` dijalankan **tanpa shell** dengan argumen tetap: `-p --tools "" --permission-mode dontAsk --permission-prompts none --no-session-persistence --safe-mode --strict-mcp-config --disable-slash-commands --output-format json`. Semua tool (baca/tulis file, shell, web) **dimatikan**, tidak ada permintaan izin, dan tidak ada sesi yang disimpan.
- Isi catatan dikirim lewat **stdin**, bukan argumen. Folder kerjanya **folder sementara kosong** yang dihapus setelah selesai, bukan vault-mu.
- Ada batas waktu; proses dihentikan paksa jika melewatinya. Keluaran hanya dipakai sebagai teks pertanyaan setelah lolos validator, dan tidak pernah dieksekusi.
- Plugin **tidak pernah membaca file login/token** penyedia mana pun.
- **Codex CLI dan Gemini CLI belum didukung**, karena flag untuk mematikan semua tool belum bisa diverifikasi.
- Prompt injection di dalam catatan tetap mungkin dicoba. Plugin membungkus catatan sebagai data, mematikan semua tool, dan menolak keluaran yang bukan pertanyaan.

**Peringatan API key:** key disimpan di `data.json` sebagai **teks biasa** dan ikut tersinkron bila vault-mu disinkronkan.

**Mode Socratic:**
- *Adaptif* (bawaan): satu pertanyaan per langkah, memakai jawabanmu sebelumnya. Pertanyaan berikutnya disiapkan di latar belakang saat kamu berhenti mengetik.
- *Satu tarikan*: 6 pertanyaan dibuat sekaligus di awal.

**Belajar aktif:** tombol Lanjut aktif hanya jika jawabanmu cukup panjang, dan tidak ada tombol "lihat jawaban". **Beri petunjuk** (maks. 2 per pertanyaan) memberi arah berpikir, bukan jawaban. **Pertanyaan ini keliru** menandai pertanyaan, dan tandanya tercatat di callout.

**Kuota langganan:** tiap pertanyaan Socratic adaptif = 1 panggilan; Devil's Advocate = 1 panggilan untuk 5 pertanyaan; tiap petunjuk = 1 panggilan. Pengaturan menampilkan jumlah panggilan sesi ini. Periksa syarat layanan tiap penyedia sebelum memakainya.

## Bahasa

UI dan bank pertanyaan tersedia dalam Bahasa Indonesia dan English (Pengaturan → Bahasa). Nama perintah di Command Palette baru berganti setelah plugin dimuat ulang.

## Instalasi

Belum tersedia di Community Plugins. Pasang manual:

1. Unduh `main.js`, `manifest.json`, dan `styles.css` dari halaman Releases.
2. Salin ke `<vault>/.obsidian/plugins/seedbed/`.
3. Aktifkan di **Settings → Community plugins**.

## Pengembangan

```bash
npm install
npm test                    # Vitest: logika domain (tanpa Obsidian)
npm run build               # tsc + esbuild -> main.js
npm run dev                 # esbuild watch
npm run test:live           # uji sungguhan dengan claude asli (memakai kuota, maks. 3 panggilan)
npm run check-integrity     # bandingkan test-vault dengan snapshot
npm run gen-test-vault      # buat test-vault/ (±22 catatan contoh)
npm run install-test-vault  # salin build ke test-vault/.obsidian/plugins/seedbed
```

Buka folder `test-vault/` sebagai vault di Obsidian (**Open folder as vault**), lalu aktifkan plugin. Jangan pakai vault utama untuk uji.

Struktur:
- `src/domain`: logika murni, tanpa `obsidian`
- `src/adapter`: vault, frontmatter, cache, penyedia AI
- `src/ui`: panel, modal, pengaturan
- `src/i18n`: teks ID/EN
- `tests/`: unit dan integrasi

## Rilis

1. Isi `author` di `manifest.json` dan nama di `LICENSE`.
2. Naikkan versi: `npm version patch` (atau `minor`/`major`). Skrip `version` memperbarui `manifest.json` dan `versions.json`.
3. `git push --follow-tags`. Workflow `.github/workflows/release.yml` menguji, membangun, lalu membuat **draft release**. Tag harus sama persis dengan `version` (tanpa awalan `v`).
4. Periksa draft di GitHub, lalu publikasikan.
5. Pertama kali saja: ajukan PR ke `obsidianmd/obsidian-releases`. Baca ulang pedoman terbaru, karena plugin ini menjalankan program dan memakai jaringan bila AI dinyalakan.

## Lisensi

0-BSD.
