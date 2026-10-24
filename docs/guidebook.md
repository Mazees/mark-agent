# Guidebook: audit fitur dan panduan penggunaan

Guidebook diperbarui berdasarkan source UI, route server, registry tool, add-on, dan executor yang tersedia pada 24 Oktober 2026. README dan dokumen arsitektur dipakai sebagai petunjuk penelusuran; klaim fitur diperiksa kembali pada implementasi, karena sebagian dokumen masih menyebut komponen atau alur lama.

## Hasil audit isi lama

- Jaminan privasi mutlak diganti dengan penjelasan penyimpanan lokal dan pengiriman konteks ke provider/integrasi yang dipilih.
- Deskripsi emosi diperbaiki: netral dan sembilan kategori lain; sifat relasi mencakup kepatuhan yang ditampilkan UI. Ekspresi avatar tidak dinyatakan sebagai perasaan manusia atau indikator keberhasilan tugas.
- Jalur suara antarmuka mengikuti `useVAD` dan Web Speech, bukan mengarahkan pengguna ke Groq API key yang tidak tersedia pada form suara saat ini.
- Penyiapan Telegram diarahkan ke Add-ons; halaman `/telegram-bot` dijelaskan sebagai log.
- Chrome Bridge, ekstensi Mark Agent Bridge, engine `chrome-use`, tab terkunci, pemasangan Load unpacked, dan pengelolaan plugin add-on dijelaskan terpisah.
- Penjelasan pemuatan tool mengikuti `read-tools` dan grup aktif. Badges “Bebas”/“Perlu Izin” berdasarkan daftar nama statis dihapus karena mode otomatis serta izin tersimpan memengaruhi dialog.
- Workspace dijelaskan sebagai konteks folder sesi, bukan sandbox. Main Thread, pengelompokan, pengeditan sesi, dan penghapusan sesi dijelaskan sesuai implementasi.
- Sub-Agents, Task Workflow, proses terminal, artifact, pengelolaan memori, cadangan, pemulihan, reset, plugin, dan skill dilengkapi. Tidak menjanjikan workflow otomatis berjalan kembali setelah restart.
- Tool lama seperti `wait_subagents`, slash command `/plan`, jalur WhatsApp, serta fitur journaling yang sudah dihapus tidak dipromosikan sebagai fitur aktif.
- Kemampuan PDF/DOCX, dukungan vision per provider, kebutuhan jaringan, login, dan CAPTCHA disampaikan dengan batasnya. Tidak menganggap semua format Office atau integrasi selalu berhasil.
- Tidak ada petunjuk tombol uji plugin atau ekspor skill yang tidak tersedia pada UI sekarang.

## Cakupan dan sumber implementasi

| Area                     | Topik Guidebook                     | Source utama yang dicocokkan                                                                                 |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Navigasi dan beranda     | Mengenal Mark                       | `App.jsx`, `MarkHome.jsx`, `FloatingMenu.jsx`                                                                |
| Provider dan konfigurasi | Pengaturan awal, Pengaturan         | `Configuration.jsx`, `AiEngineSection.jsx`, `config.routes.js`, `ai-bridge.js`                               |
| Percakapan dan konteks   | Percakapan, lampiran, dan konteks   | `ChatStudio.jsx`, `InputBar.jsx`, `MessageBubble.jsx`, `contextManager.js`                                   |
| Sesi dan workspace       | Sesi dan workspace                  | `WorkspaceSidebar.jsx`, `SessionEditor.jsx`, `workspaces.js`, `memory.routes.js`, `workspace.routes.js`      |
| ReAct dan pemuatan tool  | Cara kerja agen, Referensi tool     | `useMarkPlan.js`, `planning.js`, `api/tools/index.js`, `core-tools.js`, `group-tools.js`                     |
| Browser dan web          | Pencarian web dan browser bawaan    | `BrowserPanel.jsx`, `browser-panel-runtime.js`, `browser-agent.js`, `browser.routes.js`                      |
| Kendali desktop          | Kendali komputer Windows            | `pc-agent.js`, `overlay-manager.js`, `overlay-hud.html`, schema `computer_use`                               |
| Berkas dan coding        | Berkas, dokumen, coding, dan Git    | `file-tools.js`, `git-tools.js`, `system-tools.js`, `FileDiffModal.jsx`                                      |
| Proses latar belakang    | Berkas dan terminal                 | `task-tools.js`, `task-daemon.js`, `tasks.routes.js`                                                         |
| Multi-agent              | Sub-Agents dan Mission Control      | `Subagents.jsx`, komponen `subagent/`, `subagentStore.js`, `subagentExecutor.js`                             |
| Workflow dan checkpoint  | Task Workflow dan hasil bertahap    | `taskStore.js`, `taskExecutor.js`, `executeAgentTool.js`, `DurableTaskBubble.jsx`, skill `/task`             |
| Memori dan karakter      | Memori dan Neural Core              | `NeuralCore.jsx`, komponen `neural-core/`, `db.js`, `db-store.js`, `orama-store.js`                          |
| Awareness dan avatar     | Avatar, karakter, dan Awareness     | `useAwareness.js`, `awareness.js`, `useRelationalGrowth.js`, `MarkHome.jsx`                                  |
| Suara dan kamera         | Suara, mikrofon, kamera, dan vision | `useVAD.js`, `webSpeech.js`, `VoiceSection.jsx`, `CameraSection.jsx`, `GlobalCameraManager.jsx`, media tools |
| YouTube dan musik        | YouTube dan pemutar musik           | `YoutubeMusicContext.jsx`, `YoutubeMusicPlayer.jsx`, schema `youtube_music`                                  |
| Add-ons                  | Memilih dan memasang add-on         | `addonRegistry.js`, `Addons.jsx`, `AddonDetail.jsx`                                                          |
| Chrome pribadi           | Chrome Bridge dan Mark Agent Bridge | `ChromeBridgeAddonDetail.jsx`, `addons/chrome-bridge/service.js`, bundle ekstensi dan plugin                 |
| Plugin                   | Plugin Hub dan editor plugin        | `Plugins.jsx`, `PluginEditor.jsx`, `plugin-loader.js`, `plugins.routes.js`                                   |
| Skills                   | User Skills dan skill dipelajari    | `Skills.jsx`, `SkillEditor.jsx`, `native-skills.js`, `learn-tools.js`, `skills.routes.js`                    |
| Google                   | Google Workspace                    | `GoogleWorkspace.jsx`, `google-tools.js`, `google-service.js`, skill setup OAuth                             |
| Telegram                 | Bot Telegram                        | `TelegramAddonDetail.jsx`, `TelegramBot.jsx`, `telegram-service.js`, `ApprovalContext.jsx`                   |
| Persetujuan              | Persetujuan dan akses tool          | `ApprovalContext.jsx`, `executeAgentTool.js`, `PermissionsSection.jsx`                                       |
| Data dan privasi         | Data lokal, cadangan, dan pemulihan | `db-store.js`, `config-manager.js`, `NeuralCore.jsx`, `ResetAiModal.jsx`                                     |
| Runtime dan pembaruan    | Menjalankan Mark dan pembaruan      | `bin/mark.js`, `server/index.js`, `launcher.js`, `cli/monitor.js`, `services/updater.js`                     |

## Struktur panduan

- `src/renderer/src/data/guidebookData.js`: 26 topik dalam lima kelompok, langkah penggunaan, contoh, tautan halaman, dan panduan terkait.
- `src/renderer/src/data/faqData.js`: 24 pertanyaan dan langkah pemeriksaan yang sesuai fitur sekarang.
- `src/renderer/src/components/guidebook/guidebookTools.js`: referensi bawaan dari schema asli, penggabungan grup runtime, dan perhitungan tool unik. Pada audit ini ada 78 tool unik dalam 10 grup bawaan; jumlah UI selalu dihitung dari schema, bukan konstanta tersebut.
- `src/renderer/src/components/guidebook/ToolReference.jsx`: daftar grup aktif termasuk plugin, pencarian parameter, detail schema, serta fallback saat layanan tidak tersedia. Hanya membaca daftar tool; tidak mengeksekusi tool atau memasang integrasi.
- `src/renderer/src/pages/Guidebook.jsx`: pencarian seluruh artikel/FAQ/tool bawaan, URL `?section=...`, daftar isi desktop/mobile, salin contoh, dan navigasi antarartikel. HTML dalam FAQ atau metadata tool dirender sebagai teks.

Perubahan registry tool langsung diikuti referensinya. Perubahan perilaku produk tetap perlu diikuti pembaruan artikel dan FAQ. Plugin buatan pengguna didokumentasikan melalui metadata runtime; panduan ini tidak mengklaim mengetahui perilaku seluruh kode plugin pihak lain.

## Validasi

```powershell
node --test scripts/guidebook-ui.test.mjs
npx eslint --no-cache src/renderer/src/pages/Guidebook.jsx src/renderer/src/data/guidebookData.js src/renderer/src/data/faqData.js src/renderer/src/components/guidebook scripts/guidebook-ui.test.mjs
npm run build:ui
npm run lint
```

Pengujian memakai browser terisolasi dan API daftar tool simulasi. Tidak membaca konfigurasi atau kredensial pengguna, tidak menjalankan model AI, dan tidak mencoba tindakan Google, Telegram, desktop, atau plugin. Set `GUIDEBOOK_SCREENSHOT_DIR` untuk menyimpan screenshot. Pemeriksaan fitur pada audit ini adalah pemeriksaan source; pengujian semua integrasi langsung dengan akun pengguna berada di luar perubahan dokumentasi ini.
