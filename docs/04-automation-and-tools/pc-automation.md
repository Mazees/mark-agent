# Computer Use Windows

Computer Use mengendalikan desktop Windows yang sama dengan pengguna. Input dikirim melalui daemon PowerShell/C# Win32; hasil visual dikembalikan ke AI melalui tool computer_use. Jendela browser Minibot tetap terisolasi, sedangkan mouse desktop memakai satu antrean bersama.

## Alur aksi dan screenshot

1. AI memanggil open_session. UI menampilkan izin khusus sesi; Auto Mode, izin chat lama, dan whitelist tidak melewati pertanyaan ini. Selama izin belum diberikan, mouse tetap tersedia dan overlay belum dibuka. Penolakan tidak menjalankan input atau mengambil gambar.
2. Setelah diizinkan, server mengonsumsi token satu kali yang terikat ke sesi chat dan run. Mouse dikunci, overlay ditampilkan, dan screenshot awal dikembalikan. Hasilnya memiliki observation.id, waktu, identitas jendela/proses, geometri, dan ruang koordinat monitor-1280x720.
3. AI mengirim aksi berdasarkan gambar tersebut. observation_id yang kedaluwarsa, target yang berubah, atau geometri yang bergeser ditolak.
4. Daemon menjalankan input. Respons dicocokkan dengan ID request, bukan urutan respons yang diasumsikan.
5. Server menunggu wait_ms, lalu mengambil screenshot hasil aksi dalam panggilan tool yang sama. Klik dengan wait_ms:5000 berarti klik, tunggu lima detik, lalu kembalikan gambar. Tidak diperlukan panggilan screenshot tambahan hanya untuk memeriksa hasil aksi.
6. AI memeriksa gambar pada inferensi berikutnya. executionStatus:executed menyatakan input dijalankan; verificationStatus:unverified berarti tujuan tugas masih harus diperiksa. Sesi tetap aktif saat AI berpikir atau berpindah ke aksi berikutnya.
7. AI memanggil close ketika selesai atau tidak lagi membutuhkan desktop. Mouse dilepas, pointer dipulihkan, dan overlay ditutup. Executor juga menutup sesi milik run tersebut ketika pekerjaan berakhir atau gagal. Sesi chat/Minibot lain tidak dapat memakai atau menutup kendalinya.

Izin hanya berlaku sampai sesi Computer Use itu ditutup. Membuka sesi berikutnya meminta izin baru. Keputusan UI dikirim ke endpoint lokal yang memeriksa Origin; token tidak dimasukkan ke argumen model atau hasil tool. Ini tetap layanan desktop lokal tepercaya, bukan server multi-user yang terautentikasi.

wait_ms menerima 0 hingga 10000 ms, dengan default 300 ms. Pada batch, wait_ms di root mengatur jeda sebelum screenshot akhir. Untuk kompatibilitas, wait_ms pada aksi terakhir dipakai jika root tidak mengisinya. delay_after_ms mengatur jeda sebelum aksi berikutnya. Setiap batch berisi 1 hingga 30 aksi dan berhenti pada kegagalan pertama. Langkah yang membutuhkan hasil visual baru harus menunggu pemeriksaan AI.

Berkas pc-command-channel.js menangani korelasi request, antrean, dan timeout. Timeout atau pembatalan aktif menutup channel serta membatalkan antrean yang belum dijalankan. Perintah mutasi tidak dicoba ulang otomatis; hasil aksi yang terputus dianggap belum diketahui.

## Target dan koordinat

list_windows mengembalikan window_id, hwnd, process_id, dan judul. Gunakan window_id pada focus_window; pencarian judul hanya diterima jika cocok dengan tepat satu jendela. Pemilihan jendela tidak otomatis memaksimalkannya. Identitas proses dan waktu proses dimulai ikut diperiksa untuk mengurangi risiko memakai ulang HWND yang telah berubah pemilik.

Gambar berasal dari monitor jendela aktif melalui GDI BitBlt. Ini bukan capture jendela tertutup yang bebas occlusion. Posisi dan ukuran monitor disimpan bersama observasi; transformasi koordinat memakai geometri tersebut. Sebelum mutasi, target dan geometri diperiksa lagi di server serta daemon. Screenshot setelah aksi menolak perpindahan fokus ke jendela lain, kecuali owned popup milik target. Mode DPI per monitor digunakan bila didukung Windows.

## Overlay HTML dan cursor

Sumber UI adalah src/renderer/public/overlay-hud.html. OverlayHost.cs menampilkannya melalui WebView2CompositionControl dalam jendela WPF transparan. Jendela dibuat topmost, tidak tampil di taskbar, tidak mengambil fokus, dan kliknya tembus ke aplikasi. Tampilan memakai warna hijau Mark, font sistem, banner ringkas, serta SVG cursor yang mengikuti gaya BrowserPanel. Cahaya tipis menandai kendali aktif dan ripple menunjukkan klik; reduced motion menonaktifkan animasi dekoratif.

Host hanya membuka halaman lokal overlay yang dipetakan ke mark-overlay.local. Navigasi lain, popup, izin browser, menu konteks, dan DevTools ditolak. Status dikirim lewat stdin/stdout JSON antara proses, sehingga tidak bergantung pada port HTTP atau WebSocket publik.

OverlayNative.cs menjalankan penjaga cursor di proses terpisah. Magnification API menyembunyikan gambar pointer Windows tanpa mengganti tema atau bentuk cursor pengguna. HTML menggambar cursor Mark pada posisi pointer fisik yang sama; input tetap dikirim ke posisi tersebut. Hook mouse menahan input di luar Mark sepanjang sesi aktif. Input Mark memiliki penanda dwExtraInfo tersendiri. Overlay tetap terlihat dan kendali tetap dipegang antar panggilan, termasuk selama inferensi AI. Tidak ada penutupan berdasarkan waktu tidak aktif selama sesi masih aktif.

SetWindowDisplayAffinity mengecualikan overlay dari capture; banner tetap terlihat oleh pengguna saat screenshot diambil. Host mengonfirmasi kesiapan compositor dan menolak capture bila pengecualian tidak tersedia. Screenshot AI mendapat satu cursor Mark yang digambar pada hotspot yang sama. Widget preview tidak menambahkan cursor merah kedua. Hasil GDI pada fixture diperiksa secara visual untuk memastikan banner tidak ikut tertangkap.

## Ctrl+Shift+R dan pemulihan

Pintasan Ctrl+Shift+R didengarkan secara global oleh hook keyboard penjaga, termasuk ketika overlay tidak fokus. Penekanan ini memulihkan pointer, melepaskan input Mark yang masih ditahan, menghentikan hook mouse aktif, menutup overlay, membatalkan request desktop, dan menghentikan daemon Computer Use. Tool mengembalikan cancelledBy:user dan alasan pembatalan kepada AI. Event computer:interrupted memberi tahu UI.

Run AI yang dibatalkan tidak boleh mengirim aksi desktop baru. ID run berasal dari executor, bukan argumen buatan AI. Pembatalan dikirim sebagai hasil tool dan intervensi ke loop Mark, termasuk jika Mark sedang memeriksa hasil. Instruksi pengguna pada giliran baru memiliki run baru dan perlu membuka sesi yang diizinkan lagi. Pembatalan tidak mengurungkan klik atau ketikan yang sudah terjadi.

Penjaga memantau heartbeat serta proses host. Hilangnya heartbeat atau matinya host memulihkan pointer dan melepas hook. Host juga melakukan pemulihan jika penjaga mati. Lease cursor lintas proses mencegah dua proses Mark menyembunyikan pointer secara bersamaan. Tidak ada penggunaan BlockInput, sehingga pintasan pembatalan tetap tersedia.

Tombol mouse atau keyboard yang ditahan dilepas ketika sesi berakhir. Pasangkan key_down/key_up dan mouse_down/mouse_up dalam batch bila memungkinkan agar tidak tertahan selama AI berpikir. Untuk gerakan seret biasa, gunakan drag.

## Aksi

| Kelompok     | Aksi                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| Observasi    | screenshot, list_windows, wait                                                                |
| Pointer      | click, double_click, right_click, middle_click, move, drag, burst_click, mouse_down, mouse_up |
| Keyboard     | type, key, hotkey, key_down, key_up                                                           |
| Jendela      | focus_window, maximize_window, open_app                                                       |
| Sesi desktop | open_session, close                                                                           |

Pengetikan memakai SendInput Unicode dengan layout struktur INPUT yang sesuai arsitektur x64. Tombol dan mouse dikirim dengan penanda input Mark. Kebijakan approval tool tetap berada di dispatch aplikasi; pemeriksaan kombinasi tombol bukan sandbox umum Windows.

## Build dan distribusi

Target host awal adalah Windows 10 versi 2004 atau Windows 11 x64, .NET Framework 4.6.2 atau lebih baru, serta WebView2 Runtime yang telah terpasang. SDK WebView2 1.0.3537.50 yang diperlukan untuk host disertakan bersama lisensi, notice, dan checksum di overlay-runtime. Tidak ada unduhan SDK atau instalasi npm pada startup.

npm run build:computer-overlay mengompilasi host. npm run build:ui memanggil build host terlebih dahulu pada Windows, kemudian membangun renderer. Rilis npm menyertakan MarkOverlay.exe dan build-id. Checkout source dapat mengompilasi sekali ke cache native Mark menggunakan compiler .NET Windows. Bila host atau runtime tidak tersedia, sesi gagal dibuka dengan pesan jelas sebelum mouse dikunci atau input dikirim. Sesi, token izin, dan lock tidak dipulihkan setelah restart; pengguna perlu memberi izin baru.

## Verifikasi

- node --test scripts/computer-use.test.mjs: korelasi respons, timeout, pembatalan antrean, batas delay, dan perubahan identitas/geometri.
- node scripts/computer-use-native-smoke.mjs: startup HTML, atribut layered/non-activating, hit testing, hide/restore cursor tanpa perubahan bentuk, serta pemulihan heartbeat.
- node scripts/computer-use-approval-smoke.mjs: modal izin memakai data dummy, tidak dilewati Auto Mode, hanya Tolak/Izinkan, navigasi keyboard, dan izin baru untuk sesi berikutnya.
- node scripts/computer-overlay-ui-smoke.mjs: transparansi, status mouse, judul panjang pada 320 px, dan reduced motion.
- node scripts/computer-use-desktop-smoke.mjs: fixture WinForms tersendiri untuk satu klik dengan jeda lima detik, screenshot pada hasil yang sama, Unicode/multiline, berhenti pada error batch, observasi kedaluwarsa, mouse terkunci, pembatalan Ctrl+Shift+R, dan larangan melanjutkan run yang dibatalkan.
- npm run lint dan npm run build:ui: pemeriksaan sumber serta renderer.

Fixture dibuat di .mark/computer-use-smoke, tanpa membuka dokumen pribadi. Source dan executable fixture dihapus setelah uji. Screenshot fixture boleh disimpan sementara untuk pemeriksaan visual lalu dihapus.
