# MARK - Memory Adaptive Response Knowledge (Windows Only)

MARK adalah asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows**.

## Fitur Utama

- **Local LLM Support**: Integrasi penuh dengan model open-source (Gemma 3-4b, Llama, Mistral) via LM Studio.
- **Web Search & Deep Research**: Kemampuan mencari data terbaru secara real-time dan melakukan riset mendalam langsung melalui browser siluman terintegrasi dengan electron.
- **Vector Memory Management System (MMS)**: Implementasi memori cerdas menggunakan **Local Vector Embeddings** via LM Studio (`embeddinggemma-300m-qat`). MARK menyimpan memori dalam kategori:
  - `profile`, `preference`, `skill`, `project`, `transaction`, `goal`, `relationship`, `fact`, `other` (note/learn).
- **Semantic Search**: MARK memahami konteks secara semantik dengan nilai ambang batas relevansi (threshold) 0.6, memastikan memori yang dipanggil benar-benar akurat.
- **Local Database**: Semua memori dan riwayat percakapan tersimpan aman di IndexedDB (via Dexie) di perangkat pengguna.
- **Safe Command Execution**: Sistem perintah PowerShell terintegrasi dengan indikator tingkat risiko (`safe`, `confirm`, `blocked`).
- **Modern & Premium UI**: Desain mewah menggunakan **Tailwind CSS 4** dan **DaisyUI 5** dengan efek glassmorphism dan animasi halus.

## Teknologi yang Digunakan

- **Core**: Electron 39, React 19, Vite 7
- **Styling**: Tailwind CSS 4, DaisyUI 5
- **Automation**: Electron BrowserWindow (Web Search & Deep Research)
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

- [x] **Web Search Integration**: Mendukung pencarian data real-time.
- [x] **Deep Research**: Scraping dan perangkuman konten web (via BrowserWindow).
- [x] **Vector MMS**: Pencarian memori berbasis semantik (Local Embedding).
- [ ] **Command Running**: Menjalankan command sesuai risk level.
- [ ] **Voice Interaction**: Berkomunikasi dengan suara.
- [ ] **Vision Capability**: Analisis gambar secara lokal.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial.**

---

Dibuat untuk masa depan AI yang lebih privat dan terbuka.
