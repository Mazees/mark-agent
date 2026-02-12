# MARK - Memory Adaptive Response Knowledge (Windows Only)

MARK adalah asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh. Mark bukan sekadar chatbot, tapi asisten yang bisa mengingat, meriset, dan memahami konteks percakapan secara mendalam.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows**.

## Fitur Utama

- **Local LLM Support**: Integrasi penuh dengan model open-source (Gemma 3-4b, Llama, Mistral) via LM Studio.
- **Multi-Turn Conversation**: Riwayat percakapan dikirim sebagai native multi-turn messages ke LLM, bukan text dump — menghasilkan pemahaman konteks yang jauh lebih baik, terutama untuk model kecil.
- **Context & Time Awareness**: Mark memahami konteks percakapan sebelumnya dan sadar waktu (tanggal saat ini) untuk menentukan relevansi informasi.
- **Web Search & Deep Research**: Mencari data real-time dan melakukan riset mendalam langsung melalui browser siluman terintegrasi (Electron-based). Tanpa butuh instalasi Chrome tambahan atau Puppeteer.
- **YouTube Video Summary**: Merangkum isi video YouTube hanya dengan mengirimkan link. Mark mengambil transkrip, menganalisis, dan memberikan poin-poin penting lengkap dengan timestamp.
- **Vector Memory Management System (MMS)**: Memori cerdas menggunakan **Local Vector Embeddings** via LM Studio (`embeddinggemma-300m-qat`). Mark menyimpan memori dalam kategori:
  - `profile`, `preference`, `skill`, `project`, `transaction`, `goal`, `relationship`, `fact`, `other` (note/learn).
- **Semantic Search**: Memahami konteks secara semantik dengan threshold relevansi 0.6, memastikan memori yang dipanggil benar-benar akurat.
- **Local Database**: Semua memori tersimpan aman di IndexedDB (via Dexie) di perangkat pengguna.
- **Few-Shot Prompt Engineering**: System prompt dilengkapi contoh output (few-shot examples) untuk meningkatkan konsistensi respons JSON dari model kecil.
- **Modern & Premium UI**: Desain menggunakan **Tailwind CSS 4** dan **DaisyUI 5** dengan animasi halus dan mode interaksi yang dinamis.

## Teknologi yang Digunakan

| Kategori         | Teknologi                                                                |
| ---------------- | ------------------------------------------------------------------------ |
| **Core**         | Electron 39, React 19, Vite 7                                            |
| **Styling**      | Tailwind CSS 4, DaisyUI 5                                                |
| **AI Backend**   | LM Studio (Local Inference & Embeddings)                                 |
| **Web Scraping** | Electron BrowserWindow (Web Search), `youtube-transcript-plus` (YouTube) |
| **Database**     | Dexie.js (IndexedDB)                                                     |
| **Parsing**      | React Markdown, React Syntax Highlighter                                 |

## Persiapan & Instalasi

### Prasyarat

- **Operating System**: Windows 10/11
- **Node.js**: v18+
- **LM Studio**: Berjalan pada `http://localhost:1234` dengan model bahasa dan embedding model ter-load.

### Model yang Direkomendasikan

| Fungsi             | Model                     | Catatan                                                 |
| ------------------ | ------------------------- | ------------------------------------------------------- |
| **Chat/Inference** | `google/gemma-3-4b`       | Bisa diganti model lain di `src/renderer/src/api/ai.js` |
| **Embedding**      | `embeddinggemma-300m-qat` | Untuk vector memory & semantic search                   |

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

3.  **Jalankan LM Studio** dan load kedua model (chat + embedding).

4.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

## Build Aplikasi

Untuk membuat executable file (Windows Only):

```bash
npm run build:win
```

## Roadmap

- [x] **Web Search Integration**: Pencarian data real-time tanpa Puppeteer.
- [x] **Deep Research**: Scraping dan perangkuman konten web (via BrowserWindow).
- [x] **Vector MMS**: Pencarian memori berbasis semantik (Local Embedding).
- [x] **YouTube Summary**: Merangkum video via transkrip & metadata.
- [x] **Multi-Turn Conversation**: Native multi-turn messages untuk konteks yang lebih baik.
- [x] **Time Awareness**: Kesadaran waktu untuk relevansi informasi.
- [x] **Few-Shot Examples**: Contoh output di prompt untuk konsistensi respons.
- [ ] **Session Persistence**: Menyimpan dan memuat riwayat sesi chat.
- [ ] **Configuration Page**: Halaman pengaturan untuk model, API URL, dll.
- [ ] **Command Running**: Menjalankan command sesuai risk level secara otomatis.
- [ ] **Voice Interaction**: Antarmuka berbasis suara.
- [ ] **Vision Capability**: Analisis gambar secara lokal.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial.**

---

Dibuat untuk masa depan AI yang lebih privat dan terbuka.
