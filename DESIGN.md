# MARK UI Design System (DESIGN.md)

Dokumen ini adalah sumber arah visual (*visual direction*) resmi proyek MARK v5.0.0. antislop bertindak sebagai filter kualitas di atas aturan ini.

## 1. Identitas & Arah Karakter
- **Nama Produk:** MARK (Metacognitive Artificial Relational Knowledge)
- **Karakter:** Minimalis, futuristik, fungsional, terinspirasi dari Jarvis & Hermes Agent, tanpa dekorasi berlebihan atau efek murahan.
- **Dial Nilai:** `ENERGY 2 / RHYTHM 2 / MOTION 1`
  - **ENERGY 2 (Balanced):** Modern, kontras tegas, fokus pada konten utama dan produktivitas.
  - **RHYTHM 2 (Consistent):** Tata letak rapi berbasis grid, konsisten antar section/panel.
  - **MOTION 1 (Calm):** Transisi halus berbasis opacity (150ms-200ms), hover feedback fungsional, tanpa animasi lompat/bounce berlebihan.

## 2. Palet Warna (DaisyUI `forest` + Glassmorphism Halus)
- **Background Utama:** `#060a08` / `#0f1715` (Deep space dark ground).
- **Surface / Cards:** `bg-base-200/90`, `bg-base-300`, `bg-black/40` dengan `backdrop-blur-md` atau `backdrop-blur-xl`.
- **Primary Color:** `#1fb854` (Emerald-green khas MARK) sebagai penanda aktif, fokus, dan aksen penting.
- **Border:** `border-white/10` atau `border-white/5` (halus dan tidak tebal).
- **Text:**
  - Headings / Teks Utama: `#ffffff` atau `text-white/90`
  - Body Text: `#cac9c9`
  - Subtitle / Keterangan: `text-white/40` atau `text-white/50`
  - Accent / Primary: `text-primary`

## 3. Tipografi
- **Font Utama:** `Poppins`, sans-serif (untuk judul, navigasi, dan elemen UI).
- **Font Monospace:** `JetBrains Mono`, monospace (khusus kode, data teknis, telemetry, dan prompt/console).
- **Aturan:** Dilarang memaksa font monospace menjadi font global seluruh body teks.

## 4. Aturan Ketat UI & Copywriting
- **Strict Emoji Rule:** Dilarang keras menggunakan emoji apapun di dalam respon output, dialog, maupun UI.
- **Strict No Em-Dash:** Dilarang menggunakan em dash (`—`) di teks UI pengguna, gunakan koma, titik, atau tanda kurung.
- **Fokus Tunggal:** Setiap layar memiliki satu titik fokus utama (misal: Avatar Orb di Beranda, Input Bar di Chat Studio).
- **Scrollbar:** Gunakan `.custom-scrollbar` (lebar 5px, thumb transparan halus, hover primary glow) untuk seluruh area yang dapat di-scroll.
