# MARK - Memory Adaptive Response Knowledge (Windows Only)

MARK adalah asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh.

> [!IMPORTANT]
> Proyek ini saat ini dioptimalkan khusus untuk **Windows**.

## Fitur Utama

- **Local LLM Support**: Kompatibel dengan model open-source terbaik (Gemma, Llama, Mistral) via LM Studio.
- **Web Search & Deep Research**: MARK bisa "browsing" internet secara mandiri menggunakan Puppeteer untuk mencari data terbaru tahun 2025-2026.
- **Internet Setup UI**: Proses setup koneksi internet yang mudah dengan penanganan CAPTCHA otomatis/manual.
- **Memory Management System (MMS)**: Mengingat konteks percakapan dan menyimpan preferensi pengguna secara permanen.
- **Safe Command Execution**: Menjalankan perintah PowerShell secara aman dengan sistem konfirmasi risiko.
- **Modern & Premium UI**: Desain mewah dengan efek glassmorphism, animasi halus, dan mode gelap.

## Teknologi yang Digunakan

- **Core**: Electron, React 19, Vite
- **Styling**: Tailwind CSS 4, DaisyUI 5
- **Automation**: Puppeteer Core (untuk Web Search)
- **AI Backend**: LM Studio (Local Inference)

## Persiapan & Instalasi

### Prasyarat

- **Operating System**: Windows 10/11
- **Node.js**: v18+
- **Google Chrome**: Terinstal di path default (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- **LM Studio**: Berjalan pada `http://localhost:1234`

### Langkah Instalasi

1. **Clone repository ini:**

   ```bash
   git clone https://github.com/username/mark-project.git
   cd mark-project/mark
   ```

2. **Install dependensi:**

   ```bash
   npm install
   ```

3. **Jalankan aplikasi:**
   ```bash
   npm run dev
   ```

## Build Aplikasi

Untuk membuat executable file (Windows Only):

```bash
npm run build:win
```

## Roadmap Masa Depan

- [x] **Web Search Integration**: Mendukung pencarian data real-time.
- [x] **Internet Setup UI**: Proses inisialisasi browser profile.
- [ ] **Voice Interaction**: Berkomunikasi dengan suara.
- [ ] **Vision Capability**: Analisis gambar lokal.
- [ ] **Advanced MMS**: Integrasi Vector Database (ChromaDB/Pinecone).

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial.**

---

Dibuat untuk masa depan AI yang lebih privat dan terbuka.
