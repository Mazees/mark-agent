# MARK - Memory Adaptive Response Knowledge

> **Mark adalah *Privacy-First Personal AI Assistant* (Asisten AI Pribadi yang Mengutamakan Privasi).** Bukan sekadar *chatbot* biasa, Mark adalah entitas asisten pintar yang hidup di laptop Anda—dilengkapi dengan "ingatan jangka panjang" berbasis *Vector Memory* lokal yang mempelajari kebiasaan Anda tanpa mengorbankan privasi data. Didukung oleh *Hybrid AI Engine*, Mark bisa berjalan 100% *offline* secara rahasia maupun berakselerasi dengan *Cloud API* untuk mengeksekusi tugas kompleks secara mandiri (*Agentic Planning*), merangkum video YouTube, menelusuri web secara riset mendalam (*deep research*), hingga berinteraksi langsung melalui komunikasi suara seketika (*real-time*) layaknya J.A.R.V.I.S pribadi Anda.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows** (Windows 10/11).

## Kemampuan Utama

- **Provider AI Ganda (Hybrid):** Anda bebas memilih! Gunakan **AI Lokal** (berjalan langsung di laptop tanpa butuh internet) untuk privasi 100%, atau beralih ke **AI Cloud** untuk kecepatan respons yang kilat. Sistem ini juga cukup pintar untuk membagi tugas-tugas berat di latar belakang ke internet agar laptop Anda tidak menjadi lambat.
- **Berpikir dan Bertindak Mandiri:** Mark bukan sekadar robot obrolan biasa. Jika Anda memberikan tugas yang rumit, Mark bisa menyusun rencana langkah demi langkah dan mengeksekusinya sendiri secara otomatis (misalnya: mencari data di internet, membacanya, lalu merangkumnya untuk Anda).
- **Smart AI:** Layaknya asisten manusia sungguhan, Mark diam-diam mempelajari dan mengingat preferensi, jadwal, serta kebiasaan Anda dari obrolan sehari-hari. Semua "ingatan" ini disimpan secara super aman **di dalam laptop Anda sendiri**, bukan di server milik perusahaan lain.
- **Fitur Lengkap Bawaan:** Mark sudah tersambung langsung dengan berbagai kemampuan canggih. Ia bisa menelusuri internet secara mendalam, memutar lagu favorit Anda dari YouTube Music, merangkum video panjang secara otomatis, hingga diajak mengobrol langsung menggunakan suara (*Voice-to-Voice*).

- **Otomatisasi WhatsApp (WhatsApp Bot):** Mark dapat bertindak sebagai bot asisten pribadi di WhatsApp Anda. Dilengkapi kesadaran konteks percakapan (*Context Awareness*), Mark bisa membaca riwayat obrolan, mendeteksi penyebutan (*mention*) di grup, hingga mengontrol pemutar musik di laptop langsung lewat perintah WhatsApp.

## Arsitektur Proyek

```text
mark/
├── src/
│   ├── main/              # Proses Utama Electron (Manajemen Jendela, IPC, Suara TTS, Tray)
│   ├── preload/           # Skrip Preload (Jembatan keamanan Electron)
│   └── renderer/          # Tampilan Depan (React Frontend)
│       └── src/
│           ├── api/
│           │   ├── ai/             # Modul Integrasi AI (inti, obrolan, perencanaan, alat, utilitas)
│           │   ├── db.js           # Skema & migrasi Basis Data Lokal (Dexie/IndexedDB)
│           │   ├── scraping.js     # Modul pencarian Google & penelusuran web mendalam
│           │   ├── vectorMemory.js # Sistem Vektor Ingatan (Transformers.js / LM Studio)
│           │   └── whatsapp.js     # Logika Injeksi & Ekstraksi DOM Web WhatsApp (Tanpa Preload)
│           ├── components/         # Komponen Antarmuka (Gelembung Obrolan Modular)
│           ├── contexts/           # Manajemen State Global (ChatContext, YoutubeMusicContext)
│           ├── hooks/              # Custom Hooks React
│           │   ├── agent/          # Sistem Micro-Hooks (useMarkPlan, useMarkSearch, dll)
│           │   └── whatsapp/       # Logika Otomatisasi WhatsApp (useWhatsappBot)
│           └── pages/              # Halaman Antarmuka (Obrolan, Pengaturan, Bot WhatsApp)
```

## Teknologi yang Digunakan

| Kategori         | Teknologi                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| **Kerangka Kerja** | Electron 39, React 19, Vite 7                                               |
| **Desain/Styling** | Tailwind CSS 4, DaisyUI 5                                                   |
| **Mesin AI**     | LM Studio / Groq API / Cerebras API (Untuk Inferensi)                       |
| **Vektor Memori**  | Transformers.js (`@huggingface/transformers`), LM Studio                    |
| **Pencarian Web**  | Electron Webview (Google Search & Riset Mendalam)                           |
| **Suara & Audio**  | Groq API (STT), Edge-TTS, Web Audio API (Deteksi Suara)                     |
| **Integrasi Ekstra** | `youtube-transcript-plus`, `ytmusic-api`, Injeksi Web WhatsApp (Bot)        |
| **Basis Data**     | Dexie.js (Pembungkus IndexedDB)                                                |
| **Teks Markdown**  | React Markdown, React Syntax Highlighter, remark-gfm, rehype-external-links |

## Persiapan & Instalasi

### Prasyarat Pendukung
- **Sistem Operasi**: Windows 10/11
- **Node.js**: Versi 18 atau lebih baru
- (Opsional) **LM Studio** jika Anda ingin menjalankan model secara luring (*offline*).
- (Opsional) **Groq API Key** jika Anda ingin menggunakan model *cloud* super cepat.

### Langkah-Langkah Instalasi

1.  **Unduh (Clone) repositori ini:**
    ```bash
    git clone https://github.com/username/mark-project.git
    cd mark-project/mark
    ```

2.  **Pasang dependensi yang dibutuhkan:**
    ```bash
    npm install
    ```

3.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

4.  **Konfigurasi Awal:**
    Buka menu **Pengaturan** di dalam aplikasi, pilih penyedia AI (LM Studio atau Groq), masukkan Kunci API (jika menggunakan Groq), dan atur penyedia Vektor Ingatan (disarankan menggunakan **Transformers.js** agar berjalan 100% lokal tanpa perlu instalasi aplikasi tambahan).

## Membangun Aplikasi (Build)

Untuk membuat *file* instalasi (*executable* Windows):
```bash
npm run build:win
```
Hasil *file* installer (`.exe`) akan tersedia secara otomatis di dalam folder `dist/`.

## Peta Jalan (Roadmap)

- [x] Integrasi Pencarian Web & Riset Mendalam
- [x] Vector MMS (Pencarian memori berbasis makna dengan Transformers.js & LM Studio)
- [x] Ringkasan YouTube (Penarikan transkrip & data video)
- [x] Percakapan Berkelanjutan & Kesadaran Waktu
- [x] Penggunaan Contoh (Few-Shot) untuk konsistensi respons AI
- [x] Halaman Pengaturan (Pengaturan dinamis untuk Mesin AI & Penyedia Vektor)
- [x] Pemutar Musik YouTube & Pemblokir Iklan Otomatis
- [x] Interaksi Suara Langsung (Audio Beta & Perintah Suara Groq)
- [x] Perencanaan Mandiri (Agentic Planning) dilengkapi dengan sumber referensi tautan
- [x] Integrasi WhatsApp Bot AI Pribadi (Injeksi Tanpa Preload)
- [ ] Analisis Gambar (Vision): Fitur untuk AI dapat membaca gambar secara lokal
- [ ] Ekspor/Impor Memori: Fitur cadangan (*backup*) & pemulihan memori pengguna
- [ ] Alat Khusus (Code Interpreter): Fitur yang memungkinkan AI menjalankan kode program (*script*) secara dinamis, memberikan kebebasan tanpa batas.
- [ ] Templat Perintah (Prompt Templates): Fitur untuk menyimpan perintah panjang atau persona khusus (misal: "spesialis marketing"). Pengguna cukup mengetik `@nama-template` di kolom obrolan.

## Changelog (Terbaru)

**v1.2.0**
- ✨ **Otomatisasi WhatsApp Bot**: Mark kini bisa dihubungkan langsung ke WhatsApp Web sebagai *personal assistant* yang berjalan di latar belakang! Fitur ini bisa membalas obrolan pribadi & grup dengan *context-awareness* (membaca riwayat 4 pesan terakhir), hingga kemampuan memutar lagu di PC langsung dari perintah chat WhatsApp!
- 🛠️ **Refactor Arsitektur Webview (Zero-Preload)**: Seluruh logika penyadapan dan injeksi DOM WhatsApp telah dipindahkan ke pendekatan React murni menggunakan *custom hooks* (`useWhatsappBot`) dan `executeJavaScript`. Beban memori (*Memory Leak*) dari `wa-preload.js` berhasil dihilangkan sepenuhnya, membuat performa jauh lebih ringan dan antarmuka anti-beku (*freeze-free*).

**v1.1.0**
- ✨ **Otomatisasi YouTube Summary**: Fitur `yt-summary` kini berjalan sepenuhnya secara otomatis dan mandiri (Agentic). Mark bisa langsung menelusuri, mengekstrak, memecah (chunking) transkrip, hingga menyimpulkan isi video YouTube ke dalam *Plan Conclusion* yang rapi tanpa perlu instruksi lanjutan.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial tanpa izin tertulis.**

---
> Dibuat untuk masa depan AI yang lebih privat dan cerdas.
