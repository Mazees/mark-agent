# MCP di Plugin Hub

Di Plugin Hub, pilih **Tambah plugin → Tambahkan custom MCP server**. Isi konfigurasi server lokal (stdio) atau remote (Streamable HTTP), atau tempel JSON `mcpServers` dan pilih server yang ingin ditambahkan. Semua MCP memakai ikon yang sama; formulir tidak menyediakan unggahan ikon.

Untuk server lokal, isi command, argumen, dan environment jika diperlukan. Nilai environment disimpan sebagai rahasia. Untuk server remote, pilih tanpa autentikasi, token bearer, atau OAuth. Buka detail MCP dan pilih **Hubungkan**; periksa tujuan atau command sebelum menyetujui koneksi. Saat koneksi berlangsung, Mark menampilkan status menghubungkan dan memuat daftar tool.

Tool yang ditemukan aktif secara default. Di halaman detail, nonaktifkan tool yang tidak ingin digunakan. Pemanggilan tool mengikuti pengaturan persetujuan Mark, termasuk Auto Mode dan izin sesi atau selamanya. Sebut `@nama-server` untuk memuat grup tool; jika ada nama yang sama, pilih identitas unik pada saran mention. Nama asli tool ditampilkan di aktivitas dan persetujuan.

Kredensial disimpan terpisah memakai Windows DPAPI dan tidak termasuk backup Mark. Setelah restore, isi ulang token atau environment dan lakukan login kembali. Mengubah tujuan remote menghapus token dan kredensial OAuth yang lama. Mark tidak menjalankan instalasi paket otomatis; command yang dimasukkan pengguna, termasuk `npx`, berjalan setelah konfirmasi kepercayaan.

Mark memproses hasil teks dan gambar dari tool. Resources, prompts, dan fitur MCP lain belum tersedia sebagai antarmuka tersendiri. Server MCP dapat menjalankan kode atau mengakses layanan di luar Mark; pilih server yang dipercaya. Beberapa layanan OAuth memerlukan pendaftaran client atau kebijakan khusus yang tidak mendukung discovery otomatis; gunakan token manual jika tersedia.

Untuk integrasi tool, argumen asli MCP dibungkus dalam properti `arguments`; properti `reason` di tingkat luar dipakai Mark untuk persetujuan. Nama fungsi internal dibuat dari identitas server dan nama tool agar tidak bertabrakan.

Setelah Mark dimulai ulang, server berstatus terputus. Buka detail MCP di Plugin Hub dan pilih **Hubungkan** untuk meninjau kembali tujuan atau command sebelum memulainya.
