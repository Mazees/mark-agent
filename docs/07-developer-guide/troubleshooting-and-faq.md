# Pemecahan Masalah & Pertanyaan Umum (FAQ)

Dokumen ini merangkum panduan diagnostik, solusi masalah teknis yang sering ditemui (_Troubleshooting_), serta jawaban atas pertanyaan umum (_Frequently Asked Questions_) seputar operasional sistem **MARK**.

---

## 1. Pemecahan Masalah Umum (Troubleshooting)

### A. Port Bentrok (_EADDRINUSE: Address Already in Use_)

- **Gejala:** Muncul pesan `Port 3000 sedang digunakan` saat MARK dijalankan.
- **Solusi Otomatis:** MARK memiliki _Dynamic Port Manager_ bawaan di [`src/server/index.js`](file:///d:/My%20Project/mark-project/mark/src/server/index.js). Jika port `3000` telah dipakai aplikasi lain, server akan otomatis menaikkan port ke `3001`, `3002`, dan seterusnya.
- **Solusi Manual:** Pengguna dapat menentukan port kustom secara eksplisit menggunakan argumen `--port`:
  ```bash
  npm start -- --port=4500
  ```

---

### B. Jendela Microsoft Edge Tidak Terbuka atau Proses Zombie

- **Gejala:** Server Node.js berjalan normal, namun jendela antarmuka Edge App Mode tidak muncul.
- **Penyebab:** Terdapat proses Edge sebelumnya yang masih terkunci di background dengan direktori profil `~/.config/mark-agent/ui-profile`.
- **Solusi:** Hentikan proses Edge yang terkait secara bersih menggunakan PowerShell:
  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*ui-profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
  Kemudian jalankan kembali `npm start`.

---

### C. Berkas Basis Data Terkunci (_SQLite Database Locked_)

- **Gejala:** Muncul error `SqliteError: database is locked` saat startup atau saat proses restore.
- **Penyebab:** Mode Write-Ahead Logging (WAL) masih memiliki transaksi aktif dari proses MARK sebelumnya yang belum sempat tertutup rapi (_graceful shutdown_).
- **Solusi:**
  1. Pastikan seluruh proses Node.js MARK telah dimatikan:
     ```powershell
     Stop-Process -Name node -Force
     ```
  2. Buka berkas `~/.config/mark-agent/` di File Explorer.
  3. Jangan hapus berkas `mark.db`. Hapus berkas checkpoint sementara `mark.db-shm` dan `mark.db-wal` jika ukurannya tidak mengecil setelah proses ditutup.
  4. Jalankan ulang MARK. SQLite akan otomatis melakukan recovery struktur data.

---

### D. Model Embeddings Vektor Lambat atau Gagal Diunduh

- **Gejala:** Saat startup, terminal terhenti lama pada tahap pembuatan vektor memori Orama.
- **Penyebab:** Library `@huggingface/transformers` sedang mengunduh model pembobotan WASM (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, ~90 MB) untuk pertama kali dan koneksi internet mengalami hambatan (_timeout_).
- **Solusi:**
  - MARK hanya mengunduh model ini **satu kali**. Berkas akan disimpan permanen di cache direktori lokal:
    ```
    C:\Users\<Username>\.cache\huggingface\hub\
    ```
  - Pastikan koneksi internet aktif saat inisialisasi awal. Setelah terunduh, MARK dapat berjalan 100% offline tanpa perlu koneksi internet lagi untuk fungsi pencarian semantik.

---

### E. Suara Edge-TTS Putus atau Tidak Berbunyi

- **Gejala:** Balasan teks muncul di obrolan, namun audio suara tidak terdengar.
- **Penyebab:** Server WebSocket Microsoft Edge TTS membatasi koneksi (_rate-limit_) atau stream audio terputus.
- **Solusi:**
  1. Periksa apakah speaker Windows disetel ke volume cukup dan tidak dalam status mute.
  2. Buka menu Settings di UI MARK, ubah konfigurasi suara dari `id-ID-ArdiNeural` ke suara alternatif seperti `id-ID-GadisNeural` atau `en-US-GuyNeural`.
  3. Jika koneksi diblokir oleh ISP lokal, aktifkan proxy atau matikan fitur TTS dengan beralih ke mode teks saja.

---

## 2. Pertanyaan Umum (FAQ)

### Apakah MARK Dapat Beroperasi 100% Secara Offline?

**Ya.** Jika Anda menghubungkan MARK ke server LLM lokal (seperti LM Studio atau Ollama yang menjalankan model Llama 3 atau Qwen) di `http://localhost:1234/v1`:

- Seluruh obrolan, memori relasional, dan pencarian vektor RAG dieksekusi secara lokal di mesin Anda via SQLite dan Transformers.js WASM.
- Otomatisasi desktop Win32 dan peramban Puppeteer berjalan lokal tanpa koneksi luar.
- Tidak ada satu pun byte data pengguna yang dikirim ke cloud.

---

### Apakah MARK Mendukung Sistem Operasi Selain Windows?

MARK versi saat ini **dioptimalkan secara khusus untuk sistem operasi Windows 10 dan Windows 11**:

- Modul kontrol desktop menggunakan Win32 API (`user32.dll`) via skrip C# PowerShell.
- Launcher antarmuka menggunakan Microsoft Edge App Mode native.
- Dukungan untuk Linux dan macOS direncanakan dalam roadmap arsitektur berikutnya dengan memetakan daemon desktop ke X11/Wayland dan AppleScript.

---

### Model AI Apa yang Paling Direkomendasikan untuk MARK?

1. **Untuk Kebutuhan Cloud (Cepat & Cerdas):**
   - Google Gemini (Gemini 2.5/3.5 Flash via native Gemini Web RPC Engine) atau Groq Cloud (Llama 3.3 70B Versatile). Model-model ini sangat cepat dan memiliki akurasi pemanggilan alat (_tool calling_) yang tinggi.
2. **Untuk Kebutuhan Lokal Offline:**
   - Qwen 2.5 Coder 7B/14B atau Llama 3.1 8B Instruct yang dijalankan melalui LM Studio. Pastikan model lokal Anda mendukung output format JSON terstruktur.

---

### Bagaimana Cara Membackup Seluruh Data MARK?

Seluruh identitas, riwayat percakapan, keahlian yang dipelajari, dan sifat hubungan MARK tersimpan dalam satu folder konfigurasi:

```
C:\Users\<Username>\.config\mark-agent\
```

Cukup salin folder tersebut ke media penyimpanan eksternal. Untuk memulihkannya di komputer baru, tempatkan kembali folder tersebut pada direktori pengguna yang sama sebelum menjalankan `npm start`. Anda juga dapat mengekspor dump JSON melalui menu Settings di WebUI MARK.
