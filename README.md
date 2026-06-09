# MARK - Memory Adaptive Response Knowledge

> Asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh. Mark bukan sekadar chatbot — ia bisa mengingat, meriset, dan memahami konteks percakapan secara mendalam.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows** (Windows 10/11).

## Core Capabilities

- **Hybrid AI Engine:** Seamlessly toggle between **Local LLM** (LM Studio) for absolute offline privacy and **Cloud API** (Groq/Cerebras) for lightning-fast inference. Includes a **Secondary Model** pipeline that offloads background tasks (like JSON parsing and planning) to the cloud, preventing local machine bottlenecks.
- **Agentic Planning (JIT Query Generation):** The engine doesn't just chat; it executes multi-step plans autonomously. Using Just-In-Time (JIT) Query Generation, it drastically reduces unnecessary API calls (saving up to 80% RPM) and strictly differentiates between 1-step tasks (*fast lane*) and complex orchestrations (*slow lane*).
- **Implicit Learning & Vector MMS:** Mark acts as a true companion. It features an Auto-Memory evaluation system that silently profiles user preferences and schedules from casual conversations. Memories are stored via **Transformers.js** (running 100% locally in-memory via WASM) and retrieved using Cosine Similarity semantic search.
- **Native Integrations:** Directly integrated with Electron Webview for Deep Web Search, YouTube Music API for seamless audio playback, and Edge-TTS + Groq STT for live Voice-to-Voice interactions.

## Arsitektur Proyek

```text
mark/
├── src/
│   ├── main/              # Electron Main Process (Window management, IPC, TTS, Tray)
│   ├── preload/           # Preload scripts (Electron bridge)
│   └── renderer/          # React Frontend
│       └── src/
│           ├── api/
│           │   ├── ai.js           # LLM integration (LM Studio, Groq & Cerebras + JSON Schema Auto-Retry)
│           │   ├── db.js           # Dexie (IndexedDB) schemas & migrations
│           │   ├── scraping.js     # Google search & deep web scraping
│           │   └── vectorMemory.js # Vector embeddings (Transformers.js / LM Studio)
│           ├── components/         # Reusable UI components
│           ├── contexts/           # Global states (ChatContext, YoutubeMusicContext)
│           └── pages/              # Chat, Configuration UI
```

## Teknologi yang Digunakan

| Kategori         | Teknologi                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| **Framework**    | Electron 39, React 19, Vite 7                                               |
| **Styling**      | Tailwind CSS 4, DaisyUI 5                                                   |
| **AI Backend**   | LM Studio / Groq API / Cerebras API (Inference)                             |
| **Embeddings**   | Transformers.js (`@huggingface/transformers`), LM Studio                    |
| **Web Scraping** | Electron Webview (Google Search & Deep Research)                            |
| **Audio & Voice**| Groq API (STT), Edge-TTS, Web Audio API (VAD)                               |
| **YouTube**      | `youtube-transcript-plus`, `ytmusic-api`, `yt-search`                       |
| **Database**     | Dexie.js (IndexedDB wrapper)                                                |
| **Markdown**     | React Markdown, React Syntax Highlighter, remark-gfm, rehype-external-links |

## Persiapan & Instalasi

### Prasyarat
- **Operating System**: Windows 10/11
- **Node.js**: v18+
- (Opsional) **LM Studio** jika ingin menjalankan model secara offline.
- (Opsional) **Groq API Key** jika ingin menggunakan model cloud super cepat.

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

4.  **Konfigurasi Awal:**
    Buka menu **Pengaturan** di dalam aplikasi, pilih provider AI (LM Studio atau Groq), masukkan API Key (jika memakai Groq), dan atur provider Vector Embeddings (disarankan menggunakan **Transformers.js** agar berjalan 100% lokal tanpa instalasi eksternal).

## Build Aplikasi

Untuk membuat *executable file* (Windows):
```bash
npm run build:win
```
Output installer (`.exe`) akan tersedia di folder `dist/`.

## Roadmap

- [x] Web Search Integration & Deep Research
- [x] Vector MMS (Semantic memory search dengan Transformers.js & LM Studio)
- [x] YouTube Summary (Transkrip & metada video)
- [x] Multi-Turn Conversation & Time Awareness
- [x] Few-Shot Examples untuk konsistensi JSON
- [x] Configuration Page (Halaman pengaturan dinamis untuk AI Engine & Provider)
- [x] YouTube Music Player & Ad-Blaster
- [x] Voice Interaction (Live Audio Beta & STT Groq)
- [x] Agentic Planning dengan sumber/source citations
- [ ] Vision Capability (Analisis gambar secara lokal)
- [ ] Export/Import Memory (Backup & restore memori pengguna)
- [ ] Custom Tools (Code Interpreter): Fitur untuk mengeksekusi *custom script* (JavaScript/Node) secara dinamis oleh AI, memberikan kebebasan kustomisasi *action* tanpa batas.
- [ ] Prompt Templates / Custom Commands: Fitur untuk menyimpan *template prompt* panjang atau persona khusus (misal: spesialis pembuat PRD). Pengguna cukup mengetik `@nama-template` di kolom *chat* untuk memanggil instruksi kompleks tanpa perlu mengetik ulang setiap saat.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial tanpa izin.**

---
> Dibuat untuk masa depan AI yang lebih privat dan cerdas.
