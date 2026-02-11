# MARK - Memory Adaptive Response Knowledge (Windows Only)

MARK adalah asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh. Mark bukan sekadar chatbot, tapi asisten yang bisa mengingat, meriset, dan mengontrol sistem kamu.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows**.

## Fitur Utama

- **Local LLM Support**: Integrasi penuh dengan model open-source (Gemma 3-4b, Llama, Mistral) via LM Studio.
- **Web Search & Deep Research**: Mencari data real-time dan melakukan riset mendalam langsung melalui browser siluman terintegrasi (Electron-based). Tanpa butuh instalasi Chrome tambahan atau Puppeteer.
- **YouTube Video Summary**: Bisa merangkum isi video YouTube hanya dengan mengirimkan link. Mark akan mengambil transkrip, menganalisis, dan memberikan poin-poin penting lengkap dengan timestamp.
- **Vector Memory Management System (MMS)**: Implementasi memori cerdas menggunakan **Local Vector Embeddings** via LM Studio (`embeddinggemma-300m-qat`). Mark menyimpan memori dalam kategori:
  - `profile`, `preference`, `skill`, `project`, `transaction`, `goal`, `relationship`, `fact`, `other` (note/learn).
- **Semantic Search**: MARK memahami konteks secara semantik dengan nilai ambang batas relevansi (threshold) 0.6, memastikan memori yang dipanggil benar-benar akurat.
- **Local Database**: Semua memori dan riwayat percakapan tersimpan aman di IndexedDB (via Dexie) di perangkat pengguna.
- **Safe Command Execution**: Sistem perintah PowerShell terintegrasi untuk mengontrol desktop (buka aplikasi, kontrol media, dll) dengan sistem filtrasi risiko.
- **Modern & Premium UI**: Desain mewah menggunakan **Tailwind CSS 4** dan **DaisyUI 5** dengan efek glassmorphism, animasi halus, dan mode interaksi yang dinamis.

## Teknologi yang Digunakan

- **Core**: Electron 39, React 19, Vite 7
- **Styling**: Tailwind CSS 4, DaisyUI 5
- **Automation & Scraping**: Electron BrowserWindow (Web Search), `youtube-transcript-plus` (YouTube Scraping)
- **AI Backend**: LM Studio (Local Inference & Embeddings)
- **Database**: Dexie.js (IndexedDB)
- **Parsing**: React Markdown & React Syntax Highlighter

## Persiapan & Instalasi

### Prasyarat

- **Operating System**: Windows 10/11
- **Node.js**: v18+
- **LM Studio**: Berjalan pada `http://localhost:1234` atau IP lokal lainnya (Konfigurasi di `src/api/ai.js`).

### Langkah Instalasi

1.  **Clone repository ini:**

    ```bash
    git clone https://github.com/username/mark-project.git
    cd mark-project/mark
    ```

2.  **Install dependensi:**

    ```bash
    npm install
    ```

3.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

## Build Aplikasi

Untuk membuat executable file (Windows Only):

```bash
npm run build:win
```

## Roadmap Plan

- [x] **Web Search Integration**: Pencarian data real-time tanpa Puppeteer.
- [x] **Deep Research**: Scraping dan perangkuman konten web (via BrowserWindow).
- [x] **Vector MMS**: Pencarian memori berbasis semantik (Local Embedding).
- [x] **YouTube Summary**: Merangkum video via transkrip & metadata.
- [ ] **Command Running**: Menjalankan command sesuai risk level secara otomatis.
- [ ] **Voice Interaction**: Antarmuka berbasis suara.
- [ ] **Vision Capability**: Analisis gambar secara lokal.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial.**

---

Dibuat untuk masa depan AI yang lebih privat dan terbuka.
