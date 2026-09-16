# Panduan Instalasi & Persiapan Lingkungan

Dokumen ini memandu pengembang dalam menyiapkan lingkungan kerja, memasang seluruh dependensi, dan mengonfigurasi sistem **MARK** dari nol pada mesin Windows.

---

## 1. Prasyarat Sistem

Sebelum memasang MARK, pastikan komputer memenuhi persyaratan minimum berikut:

- **Sistem Operasi**: Windows 10 (Build 19041+) atau Windows 11 (64-bit).
- **Node.js**: Versi 20.x atau 22.x LTS (Diperlukan dukungan ESM penuh, Node fetch native, dan Web Streams).
- **Package Manager**: `npm` versi 9.x atau lebih baru (bawaan Node.js).
- **Browser**: Microsoft Edge (Bawaan Windows) atau Google Chrome untuk mode browser runtime.
- **PowerShell**: Windows PowerShell 5.1 atau PowerShell 7+ (Wajib untuk Win32 C# PC Automation Daemon).
- **Audio Output & Mic**: Mikrofon fungsional jika ingin menggunakan Wake Word ("Hey Mark") dan speaker untuk TTS.

---

## 2. Langkah-Langkah Pemasangan

### 1. Kloning Repositori

Buka terminal (PowerShell atau Command Prompt) dan lakukan clone repositori:

```powershell
git clone https://github.com/Mazees/mark-agent.git
cd mark-agent
```

### 2. Pemasangan Dependensi Node.js

Jalankan perintah instalasi npm:

```powershell
npm install
```

> [!NOTE]
> Modul `better-sqlite3` menyertakan berkas biner pre-built untuk Windows x64. Jika Anda menggunakan arsitektur non-standar, pastikan Anda memiliki _Visual C++ Build Tools_ dan _Python_ terpasang di sistem untuk proses kompilasi native `node-gyp`.

### 3. Verifikasi Pemasangan Berhasil

Pastikan build renderer dapat dikompilasi dengan baik tanpa kesalahan:

```powershell
npm run build:ui
```

Jika proses build selesai dengan pesan `built in X.XXs`, antarmuka UI telah siap digunakan.

---

## 3. Struktur Direktori Data Pengguna (`~/.config/mark-agent/`)

Saat pertama kali dijalankan, MARK akan membuat direktori konfigurasi terpusat di folder profil pengguna Windows:
`C:\Users\<Username>\.config\mark-agent\`

Direktori ini menyimpan seluruh state persisten pengguna:

```text
C:\Users\<Username>\.config\mark-agent\
├── mark.db                     # Basis data SQLite utama (12 tabel relasional)
├── mark.db-wal                 # File Write-Ahead Logging SQLite (kinerja tinggi)
├── mark.db-shm                 # File shared memory index SQLite
├── ui-profile\                 # Profil Edge App Mode (riwayat, cookie, dan izin mikrofon)
├── ui-profile-dev\             # Profil Edge khusus saat mode pengujian (--dev)
├── temp-uploads\               # Penyimpanan sementara berkas lampiran chat/gambar
└── browser-sessions\           # Profil sesi browser Puppeteer terisolasi per sub-agent
```

---

## 4. Konfigurasi Penyedia AI (AI Providers)

MARK tidak mewajibkan file `.env` untuk berjalan. Seluruh konfigurasi penyedia AI diatur langsung melalui antarmuka **Configuration Studio** di dalam WebUI dan disimpan di tabel `config` pada SQLite.

MARK mendukung opsi penyedia berikut:

1. **Gemini Web RPC (Default Bawaan)**: Menggunakan engine bridge RPC Gemini untuk akses model `gemini-3.6-flash` dan `gemini-3.5-flash-thinking`.
2. **Groq API**: Membutuhkan Groq API Key (`gsk_...`) untuk inferensi cloud super cepat (Llama 3.3 70B Versatile).
3. **LM Studio / Ollama (100% Offline Lokal)**: Berjalan di `http://localhost:1234/v1` atau `http://localhost:11434/v1` dengan model lokal yang diunduh pengguna.
4. **Cerebras / Custom OpenAI-Compatible**: Mendukung endpoint kustom dengan kompatibilitas format pesan OpenAI (`/v1/chat/completions`).

---

## 5. Konfigurasi Opsional Eksternal

### Telegram Bot (Remote Control & Approval)

Jika ingin mengontrol MARK dari smartphone via Telegram:

1. Buat bot baru via Telegram `@BotFather` untuk mendapatkan Bot Token (`123456:ABC-DEF...`).
2. Dapatkan ID Telegram akun Anda via `@userinfobot`.
3. Buka menu **Settings > Integrasi** di MARK WebUI dan masukkan Token serta Admin ID.

### Google Workspace (Drive, Calendar, Gmail)

1. Buat proyek di [Google Cloud Console](https://console.cloud.google.com/).
2. Aktifkan Google Drive API, Google Calendar API, dan Gmail API.
3. Buat kredensial **OAuth 2.0 Client IDs** (Tipe Desktop App).
4. Unduh berkas JSON kredensial dan simpan melalui menu konfigurasi MARK.

---

## 6. Verifikasi Integritas Sistem

Sebelum menjalankan MARK secara penuh, Anda dapat memverifikasi status modul inti dengan perintah pengujian cepat berikut:

```powershell
# Uji coba query ke database SQLite lokal
node -e "const Database = require('better-sqlite3'); const path = require('path'); const os = require('os'); const db = new Database(path.join(os.homedir(), '.config', 'mark-agent', 'mark.db')); console.log('SQLite OK. Tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(t => t.name));"

# Uji coba sintaks daemon Win32 C#
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName UIAutomationClient; Write-Host 'Win32 UIAutomation OK'"
```

---

## 7. Langkah Lanjutan

Setelah instalasi selesai, lanjutkan ke:

- [Panduan Quickstart & Menjalankan MARK](./quickstart.md)
- [Desain Arsitektur Sistem MARK](../02-architecture/system-design.md)
