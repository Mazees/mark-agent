# DeepSeek Web

Di Pengaturan, pilih DeepSeek Web lalu klik **Hubungkan akun DeepSeek**. Mark membuka Chrome atau Edge biasa dengan profil khusus. Selesaikan login dan verifikasi sampai halaman chat dapat digunakan, lalu tutup seluruh jendela login tersebut. Mark memeriksa sesi dan menampilkan status Terhubung. Token tidak perlu disalin melalui Inspect Element.

Profil disimpan di `~/.config/mark-agent/deepseek-web/profile`. Setelah jendela login ditutup, backend membuka profil tersebut di latar belakang untuk membaca sesi dari origin `https://chat.deepseek.com`. Mark tidak membaca profil browser pribadi. Token hanya berada dalam memori backend; metadata koneksi hanya menyimpan penanda otorisasi dan waktu koneksi. Profil browser tidak masuk backup database Mark. Status sesi tersimpan setelah restart diperiksa kembali saat provider dibutuhkan.

Chat, Minibot, unggah gambar, kompaksi, dan peninjau izin memakai sumber sesi backend yang sama. Field konfigurasi `deepseekUserToken` tidak lagi digunakan sebagai kredensial runtime. Kredensial dari login baru tidak dikembalikan melalui API status atau dimasukkan ke konfigurasi frontend. Penolakan HTTP 401/403 menandai sesi kedaluwarsa; pengguna menghubungkan ulang lewat Pengaturan.

**Putuskan** membatalkan request DeepSeek aktif, membersihkan cache percakapan upstream, menutup browser yang dikelola sesi ini, lalu menghapus profil khusus dan metadata koneksi. Shutdown hanya menutup proses yang dikelola Mark. Pemulihan backup tidak membuka login atau menjalankan permintaan otomatis.

Endpoint: GET `/api/providers/deepseek-web/auth/status`, POST `/connect`, POST `/check`, DELETE `/disconnect`. Seluruh respons hanya berisi metadata koneksi. Metode ini menggunakan sesi web DeepSeek, bukan API resmi atau OAuth API.
