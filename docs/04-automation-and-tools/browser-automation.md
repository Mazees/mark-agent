# Browser di Chat Studio

Browser memakai Puppeteer headless dan tampil di panel kanan Chat Studio. Pengguna dapat langsung mengklik, mengetik, scroll, dan membuka alamat pada halaman yang sama dengan Mark, tanpa tombol Ambil alih.

Tautan yang meminta tab baru (`target="_blank"` atau nama jendela lain), form dengan target baru, dan `window.open(url)` diarahkan ke halaman Browser yang sama. Tautan dan form tetap memakai navigasi bawaan situs agar handler klik serta metode POST tetap berjalan. Popup yang lolos pengalihan ditutup dan URL HTTP/HTTPS-nya dibuka pada halaman sesi asal melalui antrean browser. Alur yang membutuhkan objek jendela terpisah, misalnya `window.open('')` lalu mengubah isi popup atau komunikasi antarpopup, belum didukung.

Permintaan umum seperti "buka di browser", "buka website", atau "buka localhost" memakai `browser_use` → `browser-navigate`. Tool membuka panel otomatis; Mark tidak perlu meluncurkan Chrome/Edge desktop atau memakai computer-use untuk menampilkannya. Browser desktop, tab Chrome pengguna, atau plugin seperti chrome-use dipilih jika diminta secara eksplisit. Jika browser bawaan gagal, Mark melaporkan kendala tanpa otomatis beralih ke browser desktop. Minibot memakai browser Puppeteer sesinya sendiri, bukan browser percakapan utama.

## Sesi dan profil

- Main Thread memakai profil browser main; percakapan lain memakai workspace-<id>. Browser Minibot tetap terisolasi.
- Profil Chromium berada di `~/.config/mark-agent/browser-sessions/<sessionId>`.
- Cookie login dipertahankan ketika browser ditutup dan dibuka kembali. Startup serta penanganan halaman blokir tidak menghapus cookie profil.
- Permintaan launch bersamaan pada profil yang sama menunggu satu promise. Kegagalan launch dikembalikan sebagai error; percobaan berikutnya dapat mencoba lagi.
- Menutup panel menghentikan streaming. Browser tanpa pelanggan, antrean aksi, atau pekerjaan aktif ditutup setelah pemeriksaan idle lima menit. Cookie profil tetap tersimpan.
- Tool browser-close mengakhiri proses browser sesi tersebut. Akhir giliran chat dan tombol Stop tidak menutup browser.

## Hasil setiap aksi

Navigasi, klik, ketik, scroll, script, ekstraksi, screenshot, dan download menyertakan observasi DOM halaman setelah aksi. Screenshot tetap membawa gambar untuk model. Hasil script/ekstraksi tetap dicantumkan sebelum observasi; teks hasil yang terlalu panjang dipotong terpisah agar DOM terbaru tetap tersedia.

Contoh hasil browser-click:

```text
Berhasil klik elemen [2].

[Observasi halaman setelah aksi]
[URL Aktif]: https://example.com/hasil
[Title]: Hasil pencarian

== ELEMEN INTERAKTIF (2 ditemukan) ==
[1] Input (search): "kata pencarian"
[2] Button: "Cari"
```

Model menggunakan observasi dan ID elemen terbaru itu langsung. browser-read tersedia untuk perubahan halaman berikutnya atau jika observasi otomatis gagal. browser-search dan browser-fetch tetap mengembalikan daftar sumber/konten tanpa membuka browser. browser-close hanya mengembalikan status penutupan karena halaman sudah berakhir.

Sesudah aksi, engine memberi kesempatan singkat agar perubahan DOM selesai, dengan batas waktu supaya animasi atau halaman yang terus berubah tidak menahan loop. Jika DOM tidak dapat dibaca, tool menyatakan observasi belum tersedia; kegagalan pembacaan tidak mengubah aksi yang sudah berhasil menjadi klaim bahwa pembacaan berhasil.

## Balasan pengguna dan Stop

Pada awal giliran dan setelah intervensi melalui chat, Mark menerima DOM dan screenshot terbaru dari browser yang sudah terbuka. Pengambilan observasi tidak membuka browser baru. Pesan pengguna tetap diteruskan apa adanya, termasuk jika pengguna mengatakan langkahnya belum selesai.

Stop dengan ID sesi hanya membatalkan request sesi itu. Stop global tetap tersedia untuk penghentian semua sesi. Browser dan cookie tidak ikut ditutup atau dihapus.

## Antrean dan resize

Aksi AI, input panel, observasi, dan perubahan viewport memakai antrean per browser. Resize menunggu aksi yang sedang berlangsung selesai. Perubahan viewport memperbarui revisi browser sehingga rencana dari ukuran sebelumnya perlu diamati ulang. Perilaku berbagi halaman tidak menjamin dua input yang saling bertentangan akan menghasilkan tujuan yang sama; setiap aksi tetap dijalankan berurutan.

## Kursor dan streaming

Kursor AI adalah overlay di panel React. Kursor muncul sejak browser terbuka di posisi awal (64, 64), mengikuti target aksi, dan menetap di posisi terakhir. Membuka ulang panel memulihkan posisi kursor sesi tersebut. Perubahan ukuran panel menghitung ulang skala dan area kosong gambar. Pergerakan kursor tidak memerlukan tambahan frame browser.

Perpindahan target memakai transisi sekitar 180 ms; efek klik sekitar 250 ms. Reduced motion mengurangi animasi. Overlay tidak menerima input dan tidak masuk screenshot model. Eksekusi script dengan target klik yang tidak diketahui tidak menghasilkan animasi target buatan.

CDP screencast mengirim JPEG hanya kepada pelanggan sesi terkait. Streaming berhenti ketika panel ditutup, halaman Mark tersembunyi, atau client terputus. Jika screencast tidak tersedia, engine memakai screenshot berkala dengan interval 100 ms, tanpa pengambilan tumpang tindih.

Pengiriman ditargetkan maksimum 30 FPS, JPEG kualitas 65, dengan viewport 1280×720. Ini adalah batas pengiriman, bukan jaminan FPS minimum pada setiap situs atau perangkat. Pembatas FPS menyimpan frame terbaru untuk dikirim pada slot berikutnya, sehingga frame penutup perubahan halaman tidak ikut terbuang. Ukuran maksimum screencast mengikuti viewport aktif.

Panel mendecode satu gambar dalam satu waktu dan menggambarnya ke canvas melalui `requestAnimationFrame`. JPEG berikutnya tidak membatalkan decode yang masih berlangsung. Setelah frame digambar, WebUI mengirim `frame-ack` tanpa membuat request/response baru. Server membatasi satu frame yang belum diakui per pelanggan dan hanya menyimpan frame terbaru berikutnya. Pelanggan lambat tidak menahan pelanggan lain; buffer WebSocket di atas 128 KB menunda pengiriman, dan ACK yang tidak kembali diberi batas dua detik sebelum pemulihan pada pemeriksaan berikutnya. Frame tidak disimpan dalam state React per gambar.

Navigasi mempertahankan koneksi screencast yang sedang berjalan. Jika tidak ada frame baru selama dua detik, watchdog mengambil frame melalui CDP dengan batas waktu tiga detik; kegagalan memulai ulang stream. Pengambilan frame tidak memakai antrean screenshot Puppeteer. Timer pemulihan, frame tertunda, dan status ACK dibersihkan bersama subscription terakhir. Setelah memperbarui server, muat ulang WebUI agar protokol ACK dan penampil frame memakai versi yang sama.

Browser headless diluncurkan dengan preferensi Chromium `--force-high-performance-gpu` agar memprioritaskan GPU performa tinggi jika tersedia. Tidak ada pemilihan indeks GPU atau pemaksaan backend grafis; pemilihan adapter dan fallback tetap ditangani Chromium, Windows, dan driver. Preferensi ini bukan jaminan dGPU akan dipakai pada semua konfigurasi. Kompresi JPEG dan pengiriman frame tetap dapat memakai CPU.

Perintah protokol browser dibatasi 15 detik; pembacaan DOM memakai batas tiga detik. Timeout aksi mengembalikan hasil yang belum pasti, bukan mengulangi klik otomatis. Gerakan mouse manual yang masih mengantre digabungkan menjadi posisi terbaru. Scroll berurutan dengan viewport yang sama digabungkan sampai batas delta yang diterima server; urutan klik, drag, dan keyboard tetap dipertahankan. Input yang tertahan lebih dari tiga detik dilewati agar tidak memicu klik lama setelah browser pulih; pelepasan mouse dan keyboard tetap diteruskan. Penutupan pelanggan terakhir melepas tombol manual yang masih tertahan setelah antrean selesai.

Animasi kursor 180 ms hanya mengatur tampilannya. Pengiriman posisi kursor Mark tidak lagi menunda eksekusi aksi selama durasi animasi tersebut. Waktu penyelesaian aksi AI, navigasi situs, dan antrean sesi tetap terpisah dari kelancaran frame; streaming ini bukan jendela browser lokal maupun video 60 FPS.

## Audio halaman

Browser chat (`main` dan `workspace-<id>`) tidak memakai argumen bawaan Puppeteer `--mute-audio`. Video atau audio yang dimainkan pada halaman, misalnya YouTube, dapat mengeluarkan suara melalui perangkat audio Windows pada komputer yang menjalankan server Mark. Volume dan mute pada pemutar situs maupun mixer Windows tetap berlaku. Kebijakan autoplay tidak dilewati; pengguna mungkin perlu mengeklik Play atau mengaktifkan suara pada pemutar.

Suara berasal langsung dari proses browser, bukan dari stream JPEG atau canvas WebUI. Membuka WebUI dari komputer/ponsel lain belum meneruskan audio ke perangkat tersebut. Jalur gambar dan audio ini juga tidak menyediakan sinkronisasi audiovisual khusus untuk koneksi jarak jauh.

Browser Minibot dan sesi otomasi lain tetap memakai mute bawaan Puppeteer agar pekerjaan latar belakang tidak menghasilkan suara. Perubahan pengaturan launch berlaku setelah proses browser sesi lama ditutup dan dibuka kembali; menyembunyikan panel saja tidak membuat proses baru. Media yang masih dimainkan dapat tetap bersuara saat panel disembunyikan sampai dijeda atau browser ditutup.

## Lokasi implementasi

- Engine dan profil: src/main/browser-agent.js
- Antrean, streaming, dan kontrol panel: src/main/browser-panel-runtime.js
- Route serta perintah WebSocket: src/server/routes/browser.routes.js
- Tampilan panel dan kursor: src/renderer/src/components/BrowserPanel.jsx
- Decode frame dan penggabungan input: src/renderer/src/api/browser-stream.js
- Integrasi observasi ke loop AI: src/renderer/src/hooks/agent/useMarkPlan.js

Browser mendukung HTTP/HTTPS termasuk localhost. Browser memakai sandbox bawaan Chromium; nama fitur ini tidak berarti filesystem, plugin, atau seluruh tool Mark berada di dalam sandbox.
