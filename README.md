# MARK - Memory Adaptive Response Knowledge

> Asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh. Mark bukan sekadar chatbot — ia bisa mengingat, meriset, dan memahami konteks percakapan secara mendalam.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows** (Windows 10/11).

## Fitur Utama

### Local LLM Support

Integrasi penuh dengan model open-source (Gemma 3, Llama, Mistral) melalui **LM Studio**. Semua inferensi berjalan lokal — tanpa data yang dikirim ke server eksternal.

### Multi-Turn Conversation

Riwayat percakapan dikirim sebagai **native multi-turn messages** ke LLM (bukan text dump), menghasilkan pemahaman konteks yang jauh lebih baik — terutama untuk model kecil.

### Vector Memory Management System (MMS)

Memori cerdas menggunakan **Local Vector Embeddings** via LM Studio (`embeddinggemma-300m-qat`). Mark menyimpan memori dalam kategori:

- `profile`, `preference`, `skill`, `project`, `transaction`, `goal`, `relationship`, `fact`, `other`

Operasi memori lengkap: **insert**, **update**, dan **delete** — semuanya dikelola secara otomatis oleh AI berdasarkan konteks percakapan.

### Semantic Search

Pencarian memori berbasis **cosine similarity** dengan threshold relevansi 0.6. Memastikan hanya memori yang benar-benar relevan yang dipanggil.

### Web Search & Deep Research

Mencari data real-time melalui **Google Search** dan melakukan riset mendalam langsung via **Electron Webview** terintegrasi. Termasuk scraping **AI Overview dari Google**. Tanpa Puppeteer, tanpa instalasi Chrome tambahan.

### YouTube Accessible

Mencari video di youtube sesuai dengan permintaan user dengan `yt search`, dan merangkum isi video YouTube hanya dengan mengirimkan link. Mark mengambil transkrip via `youtube-transcript-plus`, menganalisis, dan memberikan poin-poin penting lengkap dengan timestamp.

### YouTube Music Player

Pemutar musik terintegrasi berbasis **YouTube Music** via Electron Webview. Cukup minta Mark untuk memutar lagu — ia akan mencari via `ytmusic-api` dan menampilkan daftar hasil langsung di chat. Dilengkapi dengan **Ad-Blaster** otomatis (auto-mute, 16x speed, auto-skip iklan) dan floating player yang bisa di-minimize.

### Context & Time Awareness

Mark memahami konteks percakapan sebelumnya dan sadar waktu (tanggal & jam saat ini) untuk menentukan relevansi informasi.

### Session Persistence

Menyimpan dan memuat riwayat sesi chat. Pengguna bisa melanjutkan percakapan sebelumnya melalui sidebar session history.

### Few-Shot Prompt Engineering

System prompt dilengkapi contoh output (few-shot examples) untuk meningkatkan konsistensi respons **JSON** dari model kecil.

### Modern & Premium UI

Desain menggunakan **Tailwind CSS 4** dan **DaisyUI 5** dengan fitur:

- Markdown rendering lengkap (React Markdown + Syntax Highlighter)
- External link handling otomatis
- GitHub Flavored Markdown support
- Animasi halus dan mode interaksi dinamis

## Arsitektur Proyek

```
mark/
├── src/
│   ├── main/              # Electron Main Process
│   │   └── index.js        # Window management, IPC handlers, YouTube transcript
│   ├── preload/            # Preload scripts (Electron bridge)
│   └── renderer/           # React Frontend
│       └── src/
│           ├── api/
│           │   ├── ai.js           # LLM integration, prompt engineering, response parsing
│           │   ├── db.js           # Dexie (IndexedDB) CRUD operations
│           │   ├── scraping.js     # Google search & deep web scraping
│           │   └── vectorMemory.js # Vector embedding & cosine similarity
│           ├── components/
│           │   ├── ChatList.jsx            # Chat message rendering & command UI
│           │   ├── Drawer.jsx              # Sidebar with session history
│           │   ├── Navbar.jsx              # Navigation bar
│           │   └── YoutubeMusicPlayer.jsx  # Floating YouTube Music player
│           ├── contexts/
│           │   ├── ChatContext             # Global chat state management
│           │   └── YoutubeMusicContext     # Music player state & webview control
│           └── pages/
│               ├── Chat.jsx        # Main chat interface
│               └── Configuration.jsx # Settings page (WIP)
```

## Teknologi yang Digunakan

| Kategori         | Teknologi                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| **Framework**    | Electron 39, React 19, Vite 7                                               |
| **Styling**      | Tailwind CSS 4, DaisyUI 5                                                   |
| **AI Backend**   | LM Studio (Local Inference & Embeddings via OpenAI-compatible API)          |
| **Web Scraping** | Electron Webview (Google Search & Deep Research)                            |
| **YouTube**      | `youtube-transcript-plus`, `ytmusic-api`, `yt-search`                       |
| **Database**     | Dexie.js (IndexedDB wrapper)                                                |
| **Markdown**     | React Markdown, React Syntax Highlighter, remark-gfm, rehype-external-links |
| **HTTP**         | Axios, OpenAI SDK                                                           |
| **Routing**      | React Router DOM v7                                                         |
| **Build**        | electron-vite, electron-builder                                             |

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

Untuk membuat executable file (Windows):

```bash
npm run build:win
```

Output installer akan tersedia di folder `dist/`.

## Roadmap

- [x] Web Search Integration (Google Search + AI Overview scraping)
- [x] Deep Research (Scraping & perangkuman konten web via Webview)
- [x] Vector MMS (Pencarian memori berbasis semantik dengan Local Embedding)
- [x] YouTube Summary (Merangkum video via transkrip & metadata)
- [x] Multi-Turn Conversation (Native multi-turn messages)
- [x] Time Awareness (Kesadaran waktu untuk relevansi informasi)
- [x] Few-Shot Examples (Contoh output di prompt untuk konsistensi respons)
- [x] Session Persistence (Menyimpan & memuat riwayat sesi chat)
- [x] Configuration Page (Halaman pengaturan untuk model, API URL, dll.)
- [x] YouTube Music Player (Pemutar musik terintegrasi dengan Ad-Blaster)
- [ ] Voice Interaction (Antarmuka berbasis suara) (WIP)
- [ ] Vision Capability (Analisis gambar secara lokal)
- [ ] Export/Import Memory (Backup & restore memori pengguna)

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial.**

---

> Dibuat untuk masa depan AI yang lebih privat dan terbuka.
