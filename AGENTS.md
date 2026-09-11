# AI Context & Planning (AGENTS.md)

## 1. Project Overview

**Project Name:** MARK (Metacognitive Artificial Relational Knowledge) — v5.0.0
**Description:** A privacy-first, local-based autonomous AI OS companion designed to assist user productivity, automate tasks, and provide lifelike companionship. MARK V5 features a decoupled **Node.js Core Server + Modern WebUI (React 19 / Vite 7)** architecture running in Microsoft Edge App Mode (or standard browser), backed by a centralized **SQLite (`better-sqlite3`)** engine and Orama WASM hybrid vector/full-text search. It includes a hybrid AI engine (Local LLM via LM Studio, Cloud API, or native Gemini Web RPC Engine), agentic planning with ReAct loop execution, **Autonomous Multi-Agent Sub-Agent Engine** (UI: **Sub-Agents**, branding: **Mission Control**) with concurrent isolated `puppeteer-core` browser sessions, **Durable Agent Tasks** (UI: **Agent Workflows**) for persistent multi-step work, high-speed Windows PC automation via C# Win32 daemon, document RAG pipeline, OS-level Awareness Engine, dynamic 4D Relational Growth, Telegram Bot integration via Telegraf, Voice Activity Detection with Groq Whisper STT / local Whisper, and Edge-TTS.
**Environment:** Node.js 20+ runtime optimized for Windows (Windows 10/11) with Edge App Mode Launcher (`bin/mark.js`).
**Author:** Mazees | **Homepage:** https://github.com/Mazees/mark-agent/

## 2. Technology Stack & Core Dependencies

- **Core Runtime & Server:** Node.js (ESM), Express 4, `ws` (WebSocket Hub at `/stream`), `better-sqlite3` (WAL mode, memory temp store), dynamic port manager with automatic fallback on `EADDRINUSE`.
- **Frontend / UI:** React 19, Vite 7, Tailwind CSS 4 (via `@tailwindcss/vite`), DaisyUI 5 (theme: `forest`), Poppins + Inter fonts, React Markdown, React Syntax Highlighter (Prism, oneDark), Monaco Editor (`@monaco-editor/react`), Driver.js, Lucide React, React Icons.
- **AI Backend:** Gemini Web RPC (Native Bridge) / Groq API / LM Studio (Local, `localhost:1234`) / Cerebras / Custom OpenAI-compatible Endpoint.
- **Embeddings & Vector Search:** `@huggingface/transformers` (Transformers.js) for fully local embeddings via WASM (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions), `@orama/orama` for Hybrid Vector + Full-Text search.
- **Database & Storage:** Centralized SQLite (`~/.config/mark-agent/mark.db`) with 12 relational stores, transparent frontend REST proxy (`src/renderer/src/api/db.js`), and full backup/restore compatibility for legacy V4 Dexie JSON dumps.
- **Web Capabilities:** Multi-Session background browser automation via `puppeteer-core` (`src/main/browser-agent.js`) with DOM parsing (max 80 interactive elements tagged with `data-mark-id`), animated cursor injection, React-compatible input binding, and Multi-Card Holo Preview (`BrowserPreviewWidget.jsx`).
- **Desktop Automation:** Persistent C# Win32 daemon (`src/main/pc-agent-scripts/pc-daemon.ps1`) executing mouse clicks, keyboard typing (SendInput Unicode), shortcuts, app opening, and window management via `src/server/tools/pc-agent.js`.
- **Voice/Audio:** Native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for zero-dependency high-speed STT with background Wake Word Engine ("Hey Mark" / "Mark" + custom triggers), Edge-TTS (`msedge-tts`, voice: `id-ID-ArdiNeural`), and Web Audio API.
- **Media/Integrations:** `youtube-transcript-plus`, `yt-search`, `youtube-dl-exec` + `ffmpeg-static`. Jangan mengasumsikan `ytmusic-api` tersedia; verifikasi `package.json` dan source sebelum mengubah fitur musik.
- **Communication:** `telegraf` (Telegram Bot Framework).

## 3. Project Architecture & File Structure

### `src/server/` — Node.js Core Server & Backend Services

| File                      | Purpose                    | Key Details                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.js`                | Core Server Entrypoint     | Express app + HTTP server + WebSocket hub (`wsHub`), setup Vite/static UI, inisialisasi service, dan graceful shutdown. Route REST didaftarkan melalui `src/server/routes/index.js`. Port bertambah otomatis saat `EADDRINUSE`.                                                                                                                  |
| `ws-hub.js`               | WebSocket Event Hub        | Manages real-time bidirectional communication between frontend and server (`chat:send`, `ai:status`, `ai:abort`, `db:restored`, `browser:preview`, etc.).                                                                                                                                                                                        |
| `launcher.js`             | WebUI Launcher             | Launches Microsoft Edge in `--app=http://localhost:<port>` mode with dedicated user data directory (`~/.config/mark-agent/ui-profile`).                                                                                                                                                                                                          |
| `memory/db-store.js`      | Centralized SQLite Engine  | `better-sqlite3` instance with 12 tables (`config`, `memories`, `sessions`, `chat_turns`, `chat_archives`, `documents`, `relationships`, `subagents`, `subagent_messages`, `learned_skills`, `agent_tasks`, `agent_task_steps`). Implements `SqliteTable` helper, `exportFullDatabase()`, and `restoreFullDatabase()` (supports V4 Dexie dumps). |
| `memory/orama-store.js`   | Hybrid Search Engine       | Orama WASM indexes for `archiveIndex` and `documentIndex` with 384-dimensional vector embeddings.                                                                                                                                                                                                                                                |
| `memory/vector-engine.js` | Local Embedding Engine     | Generates 384d vectors using `@huggingface/transformers` without external API dependencies.                                                                                                                                                                                                                                                      |
| `services/ai-bridge.js`   | AI HTTP Client & Router    | `fetchAI()` with multi-provider routing (Groq, Cerebras, Custom, LM Studio, Gemini Web), 3-tier JSON fallback (`json_schema` → `json_object` → unrestricted), rate limiting, exponential backoff, `<think>` tag extraction, and `cleanAndParse()` with `jsonrepair`.                                                                             |
| `services/gemini-web.js`  | Gemini Web RPC Engine      | Native bridge to Google's Gemini Web RPC backend (`gemini-3.6-flash`, `gemini-3.5-flash-thinking`, `gemini-flash-lite`, `gemini-auto`).                                                                                                                                                                                                          |
| `agent/planner.js`        | Server ReAct Planner       | Server-side execution loop for chat planning, category routing, and autonomous tool orchestration.                                                                                                                                                                                                                                               |
| `tools/pc-agent.js`       | Win32 PC Automation Daemon | Spawns and communicates with `pc-daemon.ps1`. Exposes desktop automation actions (`readDesktop`, `executeClick`, `executeType`, `executeKey`, `executeScroll`, `openApp`, `listWindows`, `focusWindow`).                                                                                                                                         |
| `tools/media-tools.js`    | Audio & TTS Services       | Edge-TTS synthesis and media tools.                                                                                                                                                                                                                                                                                                              |

### `src/main/` — Native Services & Automation Engines

| File                           | Purpose                            | Key Details                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser-agent.js`             | **Multi-Session Puppeteer Engine** | Manages `Map<sessionId, SessionState>()` supporting isolated concurrent Chromium windows for Lead Agent and parallel Sub-Agents. DOM parser tagging max 80 elements with `data-mark-id`, glassmorphism blocking overlay, animated SVG cursor, React 18+ input binding, `browser-ask-user` unblock mode, popup blocking, 60s load timeout, per-session base64 preview broadcasting. |
| `node-tools.js`                | Native Tool Facade                 | Re-export registry yang dirakit oleh `src/main/tools/index.js`. Implementasi tool dipisah ke modul file, browser, system, task, Git, Google, Telegram, dan media.                                                                                                                                                                                                                  |
| `git-service.js`               | Git Repository Tools               | `getGitStatus`, `getGitDiff`, `gitCommit`, `gitRevert`.                                                                                                                                                                                                                                                                                                                            |
| `task-daemon.js`               | Background Tasks Engine            | Spawns and manages long-running CLI/shell background tasks.                                                                                                                                                                                                                                                                                                                        |
| `google/google-service.js`     | Google OAuth Service               | Manages OAuth2 tokens for Google Drive, Calendar, and Gmail integrations.                                                                                                                                                                                                                                                                                                          |
| `telegram/telegram-service.js` | Telegram Bot Engine                | `Telegraf` bot framework with polling mode, admin authorization flow, screenshot triggers, and command bridge.                                                                                                                                                                                                                                                                     |
| `syntax-validator.js`          | Syntax Checker                     | Validates code files before writing to disk to prevent corrupt edits.                                                                                                                                                                                                                                                                                                              |

### `src/renderer/src/api/` — Client DB Proxy & AI Brain

| File                           | Purpose                     | Key Details                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-bridge.js`                | Web Bridge Adapter          | Exports `SERVER_CONFIG` (host, port, apiBase, wsProtocol, wsHost, wsBase), manages WebSocket lifecycle with auto-reconnect, and provides `webApi` client methods.                                                                           |
| `db.js`                        | Client DB Transparent Proxy | Zero-dependency proxy layer replacing Dexie. Implements `TableProxy` mimicking Dexie's API (`toArray()`, `get()`, `put()`, `add()`, `delete()`, `where().equals()`, `orderBy()`) backed by SQLite REST endpoints.                           |
| `vectorMemory.js`              | Frontend Vector Utilities   | Client-side vector similarity (`cosineSimilarity`), `getRelevantMemory()`, `searchExtendedMemory()` (threshold **0.3**), `getUnifiedContext()`.                                                                                             |
| `oramaStore.js`                | Client Hybrid Search        | Bridges client RAG and memory queries to Orama indexes.                                                                                                                                                                                     |
| `subagent/subagentStore.js`    | Sub-Agent Store             | Reactive CRUD for Sub-Agents & message streams backed by `db.subagents` and `db.subagentMessages`.                                                                                                                                          |
| `subagent/subagentExecutor.js` | Autonomous Sub-Agent Runner | Runs isolated ReAct tool loop for spawned sub-agents without artificial turn boundaries. Dispatches native tools with `{ sessionId: subagentId }`.                                                                                          |
| `subagent/subagentPrompt.js`   | Sub-Agent System Prompt     | Pure utilitarian, goal-oriented system prompt. Structure: Core built-in tools + Additional Tool Groups (`advanced_browser`, `pc_automation`, etc.) with dynamic guide lookup. Enforces strict JSON `{ thought, action, answer }` responses. |
| `ai/planning.js`               | Intent Router & Planner     | Intent matching for tool exposure (threshold **0.35**), persona assembly, dynamic system prompts, and multi-agent orchestration instructions.                                                                                               |
| `ai/persona.js`                | Character & Persona         | Windows PC identity, Jarvis vibe, sarcasm scaling (`<0.65` subtle, `>=0.65` roasting), adaptive tone (lu/gue vs Saya/Anda), 10 mood types, and 4D trait context injection.                                                                  |
| `ai/relationship.js`           | Relational Growth Evaluator | Evaluates 4D traits (`warmth`, `sarcasm_level`, `trust`, `energy`). `MAX_DRIFT=0.01` per step, floors at `0.15` for warmth and trust.                                                                                                       |
| `ai/awareness.js`              | Awareness Evaluation        | Evaluates OS activity buffer, memory refs, current time, and music state.                                                                                                                                                                   |

### `bin/` & `src/cli/`

| File                 | Purpose                    | Key Details                                                                                                     |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `bin/mark.js`        | CLI Entrypoint             | Boots MARK Core Server, starts the CLI live monitor, and handles graceful shutdown (`SIGINT`).                  |
| `src/cli/monitor.js` | Terminal Monitor Dashboard | Real-time CLI status dashboard showing server health, active AI provider, model, workspace, and live event log. |

## 4. Key Implementation Invariants & Gotchas

### Multi-Agent Sub-Agent Architecture

- **No Turn Limit (`maxTurns`)**: Sub-agents execute autonomously until their goal is fulfilled (`action: null`, answer provided) or until explicitly aborted/killed.
- **Session-Isolated Browser Windows**: Every sub-agent receives an isolated `puppeteer-core` browser session mapped to its unique `subagentId`. Browser actions execute on the dedicated session without cross-agent contamination.
- **Proactive Orchestration**: Lead Agent (Mark) proactively splits multi-topic research into parallel batch spawns (`spawn_subagent`) and gathers insights via `wait_subagents`.

### Centralized Storage & DB Proxy

- **Single Source of Truth**: All data is stored in centralized SQLite at `~/.config/mark-agent/mark.db`.
- **Transparent Frontend Proxy**: All `db.<store>` calls in React components (`db.memory`, `db.sessions`, `db.chatTurns`, `db.config`, etc.) route asynchronously to the backend REST API via `TableProxy`.
- **Dynamic Origin Connection**: Frontend dynamically detects its active host and port via `SERVER_CONFIG` in `src/renderer/src/api/web-bridge.js`.

### Critical Constants & Thresholds

| Constant                   | Value                     | Location                 | Purpose                             |
| -------------------------- | ------------------------- | ------------------------ | ----------------------------------- |
| Vector Similarity (Memory) | **0.3**                   | `vectorMemory.js`        | Filter irrelevant extended memories |
| Vector Similarity (Orama)  | **0.25**                  | `oramaStore.js`          | Archive & document search threshold |
| Category Router            | **0.35**                  | `planning.js`            | Intent matching for tool exposure   |
| Trait Drift                | **0.01** max              | `relationship.js`        | Max trait change per evaluation     |
| Trait Floor                | **0.15** (warmth, trust)  | `relationship.js`        | Minimum allowed trait values        |
| Awareness Cooldown         | **9 minutes**             | `useAwareness.js`        | Prevents check-in spam              |
| Awareness Interval         | **10 minutes**            | `useAwareness.js`        | Check-in loop period                |
| Relational Eval Interval   | **15 clean messages**     | `useRelationalGrowth.js` | Trait evaluation trigger            |
| Cloud Rate Limit Delay     | **3000ms**                | `ai-bridge.js`           | Min gap between cloud API calls     |
| Activity Buffer Size       | **30 entries**            | `window-tracker.js`      | Ring buffer cap                     |
| DOM Parser Elements        | **80 max**                | `browser-agent.js`       | Max interactive elements tagged     |
| RAG Chunk Size             | **500 chars, 50 overlap** | `ragPipeline.js`         | Document chunking params            |
| YT Summary Chunk           | **4000 chars**            | `tools.js`               | Transcript chunk boundary           |
| VAD Speech Threshold       | **RMS > 0.015**           | `useVAD.js`              | Voice detection sensitivity         |
| VAD Silence Timeout        | **2000ms**                | `useVAD.js`              | Auto-cut after silence              |

## 5. Development Guidelines for AI Agents

- **Read Before Modify:** Always read the corresponding `server/`, `api/`, `subagent/`, or `hooks/` file entirely before modifying state or logic.
- **Maintain Privacy-First Paradigm:** Avoid adding third-party tracking, analytics, or mandatory cloud dependencies. Everything must be able to fall back to 100% offline local state.
- **Decoupled Architecture:** Frontend in `src/renderer/` communicates with the backend in `src/server/` and `src/main/` via REST API (`API_BASE`) and WebSocket (`WS_BASE`). Never import Node.js native modules (`fs`, `path`, `child_process`) directly inside `src/renderer/`.
- **UI Design System:** The UI uses Tailwind CSS 4 + DaisyUI 5 (`forest` theme) with custom holographic/glassmorphic design tokens in `main.css`.
- **Strict Emoji Rule:** Dilarang keras menggunakan emoji apapun di dalam respon output, dialog, maupun UI.

### Route dan Native Tool Ownership

- `src/server/routes/index.js` adalah titik komposisi route. Fitur HTTP baru sebaiknya memiliki modul `*.routes.js` sendiri dan didaftarkan di sana, bukan menambah handler langsung ke `src/server/index.js`.
- `src/main/tools/index.js` adalah titik komposisi native tool. `src/main/node-tools.js` hanya facade/re-export; implementasi aktual tersebar di modul file, browser, system, task, Git, Google, Telegram, dan media.
- Endpoint berprivilege tinggi yang harus diperlakukan sebagai security-sensitive antara lain `/api/tools/execute`, `/api/db/restore`, `/api/plugins/execute`, `/api/skills/install`, dan `/api/tasks/daemon/*`.

## 6. Runtime and Development Commands

Repository menggunakan Node.js ESM dan dioptimalkan untuk Windows 10/11 dengan Node.js 20 atau lebih baru.

| Command                     | Behavior                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm start` / `npm run cli` | Menjalankan `node bin/mark.js`, server, CLI monitor, dan UI launcher.                            |
| `npm run dev`               | Menjalankan launcher terintegrasi dengan `--dev`; server memakai Vite middleware untuk renderer. |
| `npm run dev:server`        | Menjalankan `src/server/index.js --dev`.                                                         |
| `npm run dev:ui`            | Menjalankan Vite standalone di port `5173`; proxy `/api` dan `/stream` menuju port `3000`.       |
| `npm run build:ui`          | Build renderer ke `out/renderer`; direktori ini generated.                                       |
| `npm run lint`              | Menjalankan ESLint dengan cache; `node_modules`, `dist`, dan `out` diabaikan.                    |
| `npm run format`            | Menjalankan Prettier ke repository; gunakan hati-hati karena dapat menyentuh file tidak terkait. |

Server biasanya listen di port `3000` dan menaikkan port saat `EADDRINUSE`. Production menyajikan `out/renderer`, sedangkan development memasang Vite middleware. Edge App Mode aktif secara default di Windows. `--no-launch` menonaktifkan browser launch, `--headless` menekan UI terlihat, dan `--no-ui` menonaktifkan jalur startup UI yang didukung launcher.

Saat ini tidak ada script `test` atau test runner otomatis yang dikonfigurasi. Validasi minimum:

1. `npm run lint`
2. `npm run build:ui` untuk perubahan renderer atau shared UI
3. Pemeriksaan runtime terarah untuk perubahan server, WebSocket, database, native tool, atau integration

Jangan menganggap `npm test` tersedia sebelum test runner benar-benar ditambahkan.

## 7. Source Boundaries and Persistent Paths

- Renderer tidak boleh mengimpor modul Node.js seperti `fs`, `path`, atau `child_process`. Gunakan `webApi`/`API_BASE` untuk server call dan bridge `window.api` yang sudah ada untuk fitur native atau kompatibilitas. Jangan menambah hardcoded origin.
- `src/renderer/src/api/web-bridge.js` adalah batas HTTP/WebSocket client. File ini juga mengekspos bridge melalui `window.api`; itu adalah compatibility surface, bukan jaminan bahwa Electron preload tersedia di semua mode.
- `src/server/memory/db-store.js` memiliki schema SQLite, migration, dan normalisasi snake_case ke camelCase. Database berada di `%USERPROFILE%\\.config\\mark-agent\\mark.db`.
- Edge profile berada di `%USERPROFILE%\\.config\\mark-agent\\ui-profile` dan profile development terkait.
- Plugin pengguna berada di `%USERPROFILE%\\Documents\\Mark Plugins`; skill pengguna berada di `%USERPROFILE%\\Documents\\Mark Skills`.
- Workspace default berada di `%USERPROFILE%\\Documents\\Mark Workspace`.
- Artifact durable task ditulis di Documents pengguna, biasanya di bawah `Mark Tasks/<task-id>` atau path artifact yang dipilih executor.
- `out/renderer` dan `dist-release/MARK` adalah output generated/package. Source repository tetap menjadi source of truth; jangan memperbaiki masalah utama hanya di `dist-release`.

## 8. Security and Trust Boundaries

Aplikasi ini adalah trusted-local desktop service, bukan server multi-user yang sudah diautentikasi. Express mengaktifkan CORS luas dan menyediakan API berprivilege untuk filesystem, PowerShell, browser automation, desktop automation, plugin, skill, database restore, dan AI execution. Jangan bind server ke network yang tidak dipercaya.

- Approval di client bukan security boundary server-side. Saat mengubah permission atau exposure, review route dan native dispatch secara langsung.
- Deteksi command/key berbahaya pada system/task tool berbasis keyword dan bersifat advisory, bukan sandbox umum.
- Plugin dan skill adalah kode aplikasi yang dapat dieksekusi. Perlakukan direktori serta route install/execute sebagai trusted-code boundary.
- Pertahankan privacy-first fallback. Cloud provider, Telegram, Google, dan integration eksternal tidak boleh menjadi dependency wajib untuk mode lokal.
- Jangan mencatat API key, OAuth token, credential Telegram, prompt privat penuh, atau isi file sensitif.

## 9. Agent Execution Rules

- Lead-agent planning dan sub-agent execution adalah loop terpisah. Sub-agent menerima browser `sessionId` terisolasi dan himpunan `allowedTools`.
- Sub-agent harus berhenti dengan final answer atau abort eksplisit. Jangan izinkan recursive `spawn_subagent`, `wait_subagents`, atau `kill_subagent` kecuali executor memang diubah untuk mendukungnya.
- Pertahankan checkpoint dan idempotency durable task. Task dapat dilanjutkan setelah process restart, jadi jangan bergantung hanya pada state in-memory.
- Jika mengubah nama public tool, perbarui native registry, schema/prompt, route dispatch, renderer caller, dan dokumentasi secara bersamaan. File tool saat ini mencakup `read-file`, `write-file`, `replace-lines`, `delete-file`, `list-dir`, dan `grep-search`.
- Untuk perubahan AI JSON, pertahankan provider fallback dan repair path di `src/server/services/ai-bridge.js`; validasi response terstruktur dan response degraded.
- Untuk perubahan database, sinkronkan schema/migration, REST serialization, renderer proxy, serta export/restore compatibility.

## 10. Known Risks and Verification Gaps

- `puppeteer-core` diimpor oleh browser agent tetapi belum tercantum di root `package.json`; verifikasi instalasi dan resolusi Chromium sebelum mengubah browser automation.
- Dynamic port dapat tidak sinkron dengan CLI monitor dan Vite proxy yang memakai port default. Uji port collision saat menyentuh startup atau launcher.
- Handler global `uncaughtException` dan `unhandledRejection` mencatat error lalu melanjutkan proses. Setelah startup failure, verifikasi health service aktual karena state mungkin hanya terinisialisasi sebagian.
- Sebagian renderer masih memakai `window.api`, sementara bagian lain memakai `webApi`; baca caller yang ada sebelum menggabungkan kedua API.
- Belum ada automated test suite repository. Perubahan berisiko tinggi sebaiknya menambah test terarah atau minimal catatan verifikasi manual yang dapat diulang.
- Dependency opsional Windows mencakup Edge/Chrome, PowerShell, compiler .NET Framework untuk packaging, local AI service, dan credential provider. Startup harus gagal dengan jelas atau degrade gracefully saat dependency tidak tersedia.

## 11. Release and Packaging

- `build/package-release.ps1` membangun renderer lalu mengemas source, `bin`, `out`, `resources`, dan dependency.
- Release script mengharapkan compiler .NET Framework di `C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe` untuk helper native.
- `build/installer.iss` mendefinisikan layer installer secara terpisah dari PowerShell packaging script.
- Validasi source build sebelum packaging. Jangan menjadikan file hasil copy di `dist-release/MARK` sebagai pengganti perubahan di source tree.

<!-- antislop:start -->

## antislop

For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:

- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->
