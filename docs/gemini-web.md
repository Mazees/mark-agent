# Gemini Web

Provider ini mengirim request ke RPC web Google, bukan Gemini API resmi. Mark tetap menjalankan loop tool sendiri. Setiap request web adalah percakapan baru dengan konteks aktif yang disusun Mark; ID percakapan Google tidak diteruskan dari giliran, sesi, atau peninjauan izin sebelumnya. Request memakai flag temporary chat.

## Model

Katalog bersama berada di `src/shared/gemini-models.js` dan dipakai backend serta Pengaturan. Model baru yang tersedia adalah **Gemini 3.8 Flash**, **Gemini 3.8 Flash Thinking**, **Gemini 4 Argon**, dan **Gemini 4 Argon Thinking**. Pilihan lama tetap tersedia agar konfigurasi tersimpan tidak berubah otomatis; default tetap Gemini 3.6 Flash.

Routing mengirim header `x-goog-ext-525001261-jspb` beserta mode dan pengaturan thinking pada payload. Argon memakai mode 8. Nama model yang tidak dikenal ditolak. Tidak ada pergantian otomatis ke Flash Lite ketika request gagal.

Google menentukan model yang tersedia bagi tiap akun. Model baru memerlukan sesi Google dan akses model yang sesuai. Backend memeriksa nama model pada metadata respons, bukan meminta model menyebut identitasnya sendiri. Downgrade atau metadata identitas yang tidak tersedia menghasilkan error; jawaban dan tool call dari respons itu tidak dipakai. Ketersediaan dan pembatasan akun dapat berubah di sisi Google.

## Menghubungkan akun Google

Di **Pengaturan → AI → Gemini Web**, klik **Hubungkan akun Google**. Mark membuka Chrome atau Edge biasa dengan profil khusus di `~/.config/mark-agent/gemini-web/profile`. Selesaikan login, verifikasi Google, dan pembukaan halaman Gemini di jendela tersebut. Setelah halaman Gemini dapat digunakan, tutup seluruh jendela login tersebut. Mark baru membuka profil itu di latar belakang untuk memeriksa sesi dan menyimpan penanda koneksi. Selama login, browser tidak memakai remote debugging, Puppeteer, injeksi script, atau perubahan identitas browser. Pengguna tidak perlu menyalin cookie, memberi path file, atau membuat API key.

Alur ini adalah login web, bukan OAuth2 Gemini API resmi. Sesi tetap memakai cookie web yang hanya dibaca backend dari profil Mark sendiri. Mark tidak membaca profil Chrome/Edge pribadi, sandi, atau sesi akun dari browser lain. Profil browser memakai penyimpanan kredensial browser/Windows; tidak ada salinan cookie plaintext dalam SQLite, konfigurasi, konteks AI, atau API status.

Setelah restart, status **Sesi Google tersimpan** berarti profil pernah dihubungkan. Backend membuka profil itu tanpa jendela ketika membutuhkan autentikasi dan memeriksa ulang cookie yang berlaku. Jika sesi berakhir atau Google menolak login, status berubah menjadi perlu login ulang. Jendela login tidak dibuka otomatis saat startup atau inferensi; gunakan **Hubungkan ulang**. Tantangan verifikasi/CAPTCHA diselesaikan pengguna, tanpa upaya melewatinya. Penolakan login Google dapat memiliki penyebab lain; penghapusan debugger tidak menjamin semua akun dapat login.

**Putuskan** membatalkan request Gemini yang berjalan, menutup browser milik sesi ini, serta menghapus penanda koneksi dan profil khusus Gemini setelah memeriksa targetnya. Browser pribadi tidak ditutup atau diubah. Shutdown Mark hanya menutup proses yang dikelolanya, tanpa menghapus profil. Backup/restore tidak menyertakan profil atau cookie dan tidak memulihkan login secara otomatis pada komputer lain. Model lama masih dapat dipakai secara anonim saat pengguna memang belum menghubungkan akun; sesi yang kedaluwarsa tidak diam-diam diganti menjadi anonim.

Metadata build dan XSRF dibaca dari halaman Gemini, dengan cache maksimal lima menit. Tidak ada build ID tetap yang dipakai sebagai pengganti metadata gagal. Model baru tetap bergantung pada akses akun dan verifikasi metadata model aktual.

Endpoint koneksi berada di `/api/providers/gemini-web/auth`: GET `/status`, POST `/connect`, POST `/check`, dan DELETE `/disconnect`. Respons hanya memuat status, penanda terhubung, waktu koneksi, dan pesan kesalahan. Cookie tidak dikembalikan ke renderer. Untuk mempertahankan akun yang dipilih setelah login biasa, backend hanya membaca URL Gemini terakhir dari History profil khusus Mark setelah browser ditutup; riwayat browser pribadi tidak dibaca.

## Respons dan pembatalan

Input RPC inline dibatasi **128.000 byte UTF-8** sebagai anggaran konservatif Mark. Ini terpisah dari penghitung global 256K token dan bukan klaim kapasitas model Google. Teks multibahasa dapat memakai beberapa byte per karakter. Backend mengukur prompt akhir, termasuk instruksi, schema tool, dan registry, sebelum membuka koneksi provider. Input yang terlalu besar menghasilkan `GEMINI_CONTEXT_LENGTH` beserta ukuran dan overhead; teks tidak dipotong diam-diam dan respons dari input melampaui anggaran tidak dipakai untuk menjalankan tool.

Mark memulai kompaksi ketika payload Gemini mendekati anggaran byte, walaupun jumlah token sesi belum mencapai ambang global. Ringkasan memakai checkpoint persisten yang sama, menjaga pesan pengguna aktif dan instruksi wajib. Potongan peringkasan maksimal 60.000 byte UTF-8; ringkasan dibatasi ukurannya agar permintaan ringkasan berikutnya juga muat. Jika tambahan registry backend membuat prompt masih terlalu besar, Mark memperhitungkan overhead tersebut dan melakukan satu penyusunan ulang lokal sebelum inferensi. Minibot memakai anggaran yang sama dan menjaga pasangan pemanggilan/hasil tool. Tidak ada pengulangan tool saat penyusunan ulang ini.

Jika instruksi atau pesan aktif sendiri tidak muat, Mark menampilkan kesalahan tanpa membuang bagian pesan atau mengganti model. Riwayat tersimpan tidak dihapus. Popover konteks menampilkan ukuran input Gemini terakhir secara terpisah dari token sesi. Perbaikan ini mengatasi pengiriman konteks berlebih; bukan jaminan bahwa seluruh jawaban model akan selalu benar.

Transport memeriksa status HTTP, batas ukuran, penghentian koneksi, dan frame berpanjang byte. Header respons dibatasi 64 KiB; body dibatasi 32 MiB. Parser membaca kandidat utama pada `inner[4]`, menggunakan teks terbaru pada kandidat tersebut, dan memisahkan reasoning dari jawaban. Kandidat lain atau teks panjang pada metadata bukan jawaban. Frame error, respons kosong, atau frame terpotong menghentikan request tanpa menjalankan tool dari hasil parsial.

Request biasa mempunyai batas keseluruhan 180 detik. Peninjau izin tetap dibatasi 30 detik oleh layanan peninjau, sementara compacting tidak memasang batas durasi inferensi Mark. Signal pembatalan serta registry pembatalan Mark menutup request. Tidak ada penggantian model atau retry generasi jawaban biasa secara otomatis.

Peringkasan merupakan operasi baca-saja: respons Gemini kosong, koneksi terputus, kegagalan jaringan, serta HTTP 408/5xx yang dapat dipulihkan dicoba ulang pada bagian yang sama, maksimal tiga percobaan dengan jeda 2 dan 4 detik. Tombol berhenti membatalkan request maupun jedanya. Error login, batas penggunaan, penolakan upstream, ketidaksesuaian model, serta input berlebih langsung dilaporkan tanpa retry buta. Bagian hanya ditandai tersimpan setelah ringkasan valid diterima; percobaan ulang tidak menjalankan tool atau menggandakan checkpoint. Jika tetap gagal, pesan menyebut nomor bagian dan kode penyebab yang aman, tanpa menampilkan prompt atau isi error provider yang tidak tepercaya.

Input gambar belum didukung. Integrasi ini juga tidak menjamin semua jawaban model benar atau bebas halusinasi; hasil tool dan klaim pekerjaan tetap harus diverifikasi oleh loop Mark.

## Referensi protokol

- [Sophomoresty/gemini-web2api](https://github.com/Sophomoresty/gemini-web2api/tree/2bb988bfcbb82a7fab5d2c99aa5560ff40d64f7e): payload, metadata sesi, dan autentikasi web.
- [zexadev/gemini-web2api-go](https://github.com/zexadev/gemini-web2api-go/blob/8fcd6ae994b689c12607bc0b0bbbaa25ec3602e4/internal/app/gemini.go): routing 3.8 Flash/Argon, header model, dan metadata model aktual.

Pemberitahuan lisensi tercantum dalam `THIRD-PARTY-NOTICES.md`.
