# MARK - Memory Adaptive Response Knowledge

MARK adalah asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh.
Ditenagai oleh LLM (_Large Language Model_) open-source, MARK memungkinkan Anda memiliki asisten pintar tanpa bergantung pada koneksi internet atau layanan cloud pihak ketiga.

## Fitur Utama

- **Local LLM Support**: Kompatibel dengan model open-source terbaik seperti **Gemma**, **Llama**, dan **Mistral**. Bebas disesuaikan dengan spek perangkat Anda.
- **Memory Management System (MMS)**: MARK mampu mengingat konteks percakapan sebelumnya dan menyimpan "ingatan" jangka panjang untuk pengalaman yang lebih personal.
- **Safe Command Execution**: Dapat membantu menjalankan perintah sistem (PowerShell/Shell) secara aman dengan sistem konfirmasi risiko sebelum eksekusi.
- **Modern & Sleek UI**: Antarmuka berbasis **React 19** dengan **Tailwind CSS 4** dan **DaisyUI 5** yang responsif dan estetik.
- **Privacy First**: Semua data, memori, dan pemrosesan AI dilakukan 100% secara lokal di perangkat Anda.

## Teknologi yang Digunakan

- **Frontend**: React 19, Tailwind CSS 4, DaisyUI 5
- **Desktop Framework**: Electron
- **AI Integration**: LM Studio

## Persiapan & Instalasi

### Prasyarat

- [Node.js](https://nodejs.org/) (Versi terbaru disarankan)
- Local LLM Runner [LM Studio](https://lmstudio.ai/)

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

3. **Jalankan aplikasi dalam mode pengembangan:**
   ```bash
   npm run dev
   ```

## Build Aplikasi

Untuk membuat executable file sesuai OS Anda:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Roadmap Masa Depan
- [ ] **Customize Assistant**: Dapat menyesuaikan asisten dengan preferensi pengguna.
- [ ] **Voice Interaction**: Dapat berkomunikasi dengan asisten menggunakan suara.
- [ ] **Vision Capability**: Dapat menganalisis gambar dan memberikan informasi.
- [ ] **Improved MMS**: Sinkronisasi memori yang lebih cerdas menggunakan Vector Database.
- [ ] **Hardware Integration**: Dapat diintegrasikan dengan perangkat keras.

## Kontribusi

Proyek ini masih dalam tahap pengembangan aktif. Kontribusi dalam bentuk _bug report_, ide fitur, atau _pull request_ sangat disambut baik!

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini atau bagian apa pun didalamnya untuk keuntungan komersial.** Proyek ini dibuat demi kemajuan komunitas AI yang terbuka dan gratis.

---

Dibuat untuk masa depan AI yang lebih privat dan terbuka.
