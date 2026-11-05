# Coding di Chat Studio

Chat Studio memakai workspace sesi sebagai lokasi efektif untuk konteks proyek, edit native, terminal, dan pekerjaan Minibot. Panel kanan menyediakan Perubahan, Terminal, dan Browser. Provider, persona, dan alur persetujuan tool tetap mengikuti konfigurasi pengguna.

Panel Perubahan menjelaskan fungsi peninjauan kode sebelum menampilkan daftar berkas. Cakupan Giliran dipilih membuka rekaman yang tepat, sedangkan Seluruh workspace memakai HEAD proyek Git atau baseline awal folder non-Git. Kondisi kosong memberi petunjuk untuk meminta perubahan melalui chat. Hasil pemeriksaan muncul ketika ada pekerjaan atau hasil yang bisa ditinjau; worktree ditempatkan pada Pengaturan lanjutan.

Tab Terminal menyiapkan satu terminal saat pertama dibuka jika daftar terminal sesi kosong. Pembuatan otomatis memakai `POST /terminals` dengan `onlyIfEmpty: true`, sehingga permintaan bersamaan tidak menggandakan terminal awal. Tombol tambah tetap membuat terminal baru secara eksplisit.

## Konteks dan checkpoint

`coding-workspace.js` menentukan folder di backend, membaca struktur ringkas, manifest, package manager, scripts, dan instruksi proyek. Dalam satu direktori, `AGENTS.override.md` menggantikan `AGENTS.md`. Instruksi direktori anak dimuat ketika target di bawahnya dibaca atau akan diedit, dengan cakupan direktori yang jelas. Tidak ada indeks vektor codebase baru.

Catatan progres menggunakan kunci sesi dan workspace dalam SQLite. Tool `update-working-memory` menyimpan catatan; rekaman edit dan pemeriksaan juga memperbarui daftar berkas serta pemeriksaan terakhir. Core memory profil/preferensi tidak diganti. Berkas `.mark` yang sudah ada tidak dipindah, dihapus, atau dianggap sebagai checkpoint otomatis.

## Edit, pemeriksaan, dan undo

Dispatcher menyuntikkan `codingSessionId`, `codingRunId`, `toolCallId`, workspace, dan kaitan task/langkah. Model tidak menentukan identitas eksekusi melalui argumen tool. Backend kembali menentukan root dari sesi. Minibot memakai pekerjaan anak dengan `parentCodingRunId` dan `ownedFiles`, serta workspace efektif sesi asal.

Checkpoint awal dibuat sebelum tool workspace pertama, termasuk filesystem, shell, MCP/plugin, dan delegasi Minibot. Checkpoint akhir dibuat setelah eksekusi berhenti. Repository bare internal berada di `~/.config/mark-agent/coding-git/<workspaceKey>/`, terpisah dari index, branch, remote, serta commit pengguna. Blob ditulis tanpa filter atau konversi akhir baris, sehingga CRLF dan berkas biner mempertahankan byte asli. Ignore proyek serta direktori metadata Git, dependency, cache, dan output build standar membatasi cakupan pencatatan. Tool native `write-file`, `replace-content`, `replace-lines`, `delete-file`, dan `apply-patch` tetap memakai penguncian mutasi. Berkas yang sudah ada harus dibaca dahulu. Hash isi dan penguncian per berkas menolak edit kedaluwarsa. Beberapa edit pada target yang sama menjadi satu diff kumulatif per pekerjaan.

`apply-patch` menerima `{ patch: string }`:

```text
*** Begin Patch
*** Update File: src/example.js
@@
-export const count = 1
+export const count = 2
*** Add File: notes.txt
+Catatan proyek
*** End Patch
```

Operasi Add, Update, dan Delete didukung. Hunk menggunakan konteks yang unik; patch ini tidak mendukung rename atau patch biner. Seluruh path, konteks, dan hash diperiksa sebelum penulisan. Bila penulisan gagal, target yang sudah tersentuh dipulihkan. Target symlink ke luar workspace ditolak. Batas ini melindungi operasi yang dicatat, bukan sandbox untuk PowerShell, MCP, atau plugin.

Keberhasilan aksi dan verifikasi adalah dua hal berbeda. Hasil penulisan dapat tetap tercatat saat pemeriksaan sintaks gagal. Build, lint, typecheck, atau test yang dijalankan melalui tool command mempunyai hasil tersendiri. Pembacaan ulang berkas tidak menjadi bukti build. Pemeriksaan kustom tetap perlu dibaca dan dijelaskan hasilnya oleh agen; deteksi nama perintah bukan pembuktian fungsi aplikasi.

Undo tersedia setelah pekerjaan berhenti dan hanya untuk snapshot lengkap. Isi disk harus sama dengan hasil terakhir yang direkam. Konflik membuat seluruh permintaan undo ditolak sebelum penulisan. Undo tidak memakai reset Git, tidak membuat commit, dan tidak menghapus perubahan awal pengguna. Edit shell, MCP, plugin, terminal manual, atau pengguna selama jendela pekerjaan ikut dalam checkpoint. Tidak ada klaim bahwa semuanya dibuat Mark. Edit berikutnya tidak menghitung ulang kartu lama. Proses latar belakang yang terus berjalan setelah akhir giliran tidak memperpanjang jendela rekaman tersebut.

## Terminal dan preview

`terminal-service.js` mengelola proses bersama untuk panel terminal, `run-powershell`, `run-task`, `read-task-output`, `kill-task`, dan `list-tasks`. Setiap terminal memiliki host Node khusus (`terminal-host.js`) yang memuat `node-pty`, menjalankan PowerShell melalui Windows ConPTY, dan melepas worker native saat shell selesai. Tidak ada fallback terminal noninteraktif jika PTY gagal dimuat.

Output mempunyai nomor urut dan buffer terbatas 256.000 karakter per proses. WebSocket hanya mengirim output kepada client yang berlangganan terminal pada sesi yang sesuai. Reload melakukan replay buffer tanpa menjalankan ulang perintah. Input mentah pengguna tidak ditulis ke database. Menutup panel tidak menghentikan terminal; tombol stop, pembatalan command, dan shutdown Mark menghentikan pohon proses yang dikelola.

`run-powershell` menunggu maksimal 60 detik. Gunakan `run-task` untuk server atau proses lebih panjang. ID proses yang sudah tersimpan setelah restart tidak dipakai untuk menjalankan ulang command. Metadata lama ditandai terputus, sementara log terminal bersifat sementara.

Alamat lokal yang tercetak pada output menjadi kandidat preview. Pengguna memilih alamat dan backend memeriksa koneksinya sebelum navigasi pada browser sesi yang sama. URL tidak ditebak dari port. Agen diarahkan menjalankan dev server hanya jika pekerjaan membutuhkan aplikasi dijalankan atau ditinjau.

### Kontrak HTTP dan WebSocket

Semua endpoint berada di `/api`, memakai `sessionId`, dan mengembalikan `{ success, data }` atau `{ success: false, error }`.

| Endpoint                             | Fungsi                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `POST /workspace/context`            | Konteks sesi; `paths` opsional memuat instruksi target                                      |
| `PATCH /workspace/memory`            | Menyimpan objek `memory`                                                                    |
| `POST /coding/runs/begin`            | Menyiapkan identitas turn; `capture: false` hanya metadata, default membuat checkpoint awal |
| `GET /coding/runs`                   | Daftar rekaman pada root sesi aktif                                                         |
| `GET /coding/runs/:id`               | Ringkasan pekerjaan dan kaitan pekerjaan anak                                               |
| `GET /coding/runs/:id/diff?path=...` | Diff dari pasangan checkpoint tersimpan                                                     |
| `POST /coding/runs/:id/undo`         | Undo seluruh pekerjaan atau satu `path`                                                     |
| `POST /coding/runs/:id/finish`       | Menutup rekaman dengan status akhir                                                         |
| `GET /coding/workspace-diff`         | Daftar diff Git; `path` opsional membaca isi diff                                           |
| `GET /terminals`, `POST /terminals`  | Daftar terminal atau membuat PowerShell interaktif                                          |
| `POST /terminals/:id/stop`           | Menghentikan pohon proses                                                                   |
| `POST /terminals/:id/preview`        | Memeriksa `url` yang berasal dari proses aktif                                              |
| `POST /coding/worktree`              | Membuat worktree sesi dari HEAD                                                             |
| `POST /coding/worktree/return`       | Membawa perubahan ke folder asal jika tidak konflik                                         |

Event `terminal:command` membawa `terminalId`, `sessionId`, dan `action`: `subscribe`, `unsubscribe`, `input`, atau `resize`. Subscribe dapat menyertakan `afterSequence`; input membawa `data`, resize membawa `cols` dan `rows`. Respons berkorelasi memakai ID request. Event `terminal:output`, `terminal:state`, dan `terminal:exit` terbatas kepada subscriber; `coding:updated` hanya mengirim identitas untuk invalidasi. Origin terminal harus cocok dengan WebUI. Layanan lokal ini bukan sistem autentikasi multi-user.

## Worktree, backup, dan distribusi

Worktree opsional berada di `.config/mark-agent/worktrees/<id>` dan dimulai dari commit HEAD. Perubahan lokal belum di-commit dan dependensi tidak disalin. Berpindah worktree ditolak ketika pekerjaan Mark, Minibot, atau terminal sesi masih aktif. Pengembalian hasil membandingkan byte folder asal dan worktree dengan checkpoint awal masing-masing, lalu menulis semua target dengan checkpoint Git untuk undo. Perubahan awal pengguna pada target yang sama dan edit setelah worktree dibuat menimbulkan konflik. Worktree lama tanpa checkpoint lengkap dipertahankan untuk peninjauan manual. Tidak ada commit, merge, push, atau penghapusan worktree otomatis.

Tabel `coding_records` menyimpan jenis `run`, `memory`, `terminal`, `worktree`, dan `git-workspace`. Rekaman baru menyimpan ID objek Git, metadata berkas, status pencatatan, dan pemeriksaan, tanpa isi before/after Base64. Migrasi snapshot lama memverifikasi blob sebelum menghapus isi lama; kegagalan mempertahankan sumber untuk dicoba kembali. Cakupan migrasi hanya berkas yang benar-benar direkam. Export/restore memakai `tables.codingRecords`; backup lama tetap dibaca tanpa membuat snapshot fiktif. Field tingkat atas `codingGitArchives` versi 1 memuat Git bundle ber-checksum untuk repository internal. Restore memvalidasi arsip sebelum memulihkan metadata; tidak menjalankan perintah proyek, hook, filter, atau menulis workspace. Batas payload restore adalah 512 MiB. Riwayat yang dirujuk pesan tidak dibersihkan otomatis. Backup tidak menyimpan proses aktif atau input mentah terminal. Restore menghentikan terminal, menandai proses terputus, dan menonaktifkan metadata worktree. Restore tidak menulis snapshot ke proyek.

Paket npm harus menyertakan `terminal-host.js` dan dependensi produksi `node-pty`, `@xterm/xterm`, serta `@xterm/addon-fit`. Pada Windows, distribusi harus mempertahankan binary ConPTY yang cocok dengan arsitektur Node. Instalasi tanpa binary tersebut ditampilkan sebagai kegagalan PTY. Monaco dan worker diff dikemas lokal untuk tampilan Perubahan.

## Keputusan tampilan

Panel ini mengikuti DESIGN.md: ENERGY 2, RHYTHM 2, MOTION 1. Tab menjaga chat tetap luas; font aplikasi dipakai untuk navigasi dan monospace dibatasi pada kode/terminal. Hijau menandai tindakan dan fokus, sedangkan border serta jarak memisahkan bagian tanpa dekorasi baru. Ikon hanya mewakili tutup, tambah, stop, refresh, preview, dan undo. Kondisi kosong, loading, error, dan fokus keyboard tersedia pada panel yang sama.

## Hasil verifikasi implementasi

Pemeriksaan dijalankan pada Windows x64 dengan Node 24. Uji memakai database dalam memori dan proyek sementara; tidak menggunakan provider AI atau database pribadi pengguna. Fixture HTML/renderer, skrip uji sementara, dan direktori proyek uji dihapus setelah selesai.

- Backend: instruksi bertingkat, isolasi catatan sesi, patch beberapa berkas, request ganda, edit kedaluwarsa, rollback kegagalan tulis/database, hasil sintaks gagal, undo konflik, dan backup/restore lolos.
- Terminal: PTY Windows, Unicode, resize, Ctrl+C, penghentian, proses keluar secara alami, buffer besar terbatas, replay bernomor, isolasi sesi, dan penolakan menjalankan ulang proses lama lolos.
- Worktree: pembuatan terisolasi, penolakan konflik, pengembalian hasil, penyimpanan folder worktree, dan undo hasil pengembalian lolos.
- Packaging: dry-run paket memuat host PTY serta dokumentasi; dependensi produksi tercatat dan modul native dapat dimuat. Fixture sementara tidak masuk paket. Instalasi paket pada mesin Windows lain belum diuji.
- Lint seluruh repository masih mempunyai temuan lama. File baru dan modul coding terarah lolos ESLint; perbandingan berkas berubah terhadap HEAD tidak menemukan temuan nonformat baru. Build UI lolos, dengan peringatan ukuran chunk.

Gerbang UI antislop:

- Hard Gate PASS: komponen panel dijalankan pada lebar 1100 dan 380 piksel, tanpa overflow horizontal; tab dapat dipindah memakai keyboard, state kosong/error tersedia, dan tidak ada exception halaman pada uji akhir.
- Purpose Gate PASS: palet, font aplikasi, border, dan kegunaan ikon mengikuti keputusan tampilan di atas; monospace hanya dipakai untuk kode dan terminal.
- Liveliness PASS: arah 2/2/1 mengikuti DESIGN.md, dengan area isi sebagai fokus, jarak pemisah bagian, serta aksen hijau pada tindakan dan fokus.
- Craftsmanship PASS: uji klik mencakup diff, cakupan perubahan, terminal interaktif, preview dari URL keluaran, stop, reload, undo, worktree, refresh, dan tutup/buka panel. Urutan pelepasan model Monaco diperbaiki setelah ditemukan exception saat berpindah tab. Dispatch preview diuji ke handler browser fixture; navigasi browser nyata dan seluruh loop AI lintas provider belum menjadi bagian uji tersebut.

## Git bawaan dan kartu chat

MinGit 2.56.0.4 Windows x64 distribusi standar dipin dalam `resources/git/manifest.json` (URL rilis resmi dan SHA-256). Jalankan `npm run prepare:git` saat menyiapkan development. `prepack`, `prepublishOnly`, dan build rilis portabel menyiapkannya sebelum pengemasan; pengguna akhir tidak mengunduh atau memasang Git. Distribusi lengkap, lisensi, dan NOTICE ikut dalam paket. `git-runtime.js` memakai executable absolut dan menolak binary hilang atau versi yang tidak cocok, tanpa fallback ke Git sistem. PATH hanya ditambahkan pada proses terminal yang dikelola Mark. Pada volume tanpa metadata kepemilikan, pengecualian safe.directory terbatas pada repository workspace untuk proses itu, bukan konfigurasi global.

Begin/finish idempoten. Checkpoint yang gagal ditampilkan sebagai diff tidak tersedia, bukan dihitung ulang dari disk di masa depan. Restart/restore menutup rekaman terputus tanpa menjalankan ulang tool. Percakapan tanpa tool workspace tidak membuat checkpoint. Identitas turn, sesi, task/langkah, dan pekerjaan anak disuntikkan runtime. Setiap percobaan Minibot mempunyai rekaman sendiri; laporan membawa ID rekaman ke jawaban Mark yang meninjaunya. Laporan ulang tidak menciptakan checkpoint baru untuk pekerjaan lama.

Kartu di bawah jawaban hanya muncul setelah pencatatan selesai dan net diff memiliki berkas berubah, termasuk turn gagal/dibatalkan yang sudah mengubah berkas. Pemeriksaan saja tidak memunculkan kartu. Kartu tertutup secara default; membuka berkas memuat Monaco secara lazy di chat. Menutup detail melepas model editor. Berkas biner dan teks di atas 2 MiB menampilkan metadata. Pilihan manual tidak ditimpa pembaruan status. Panel tetap menyediakan tinjauan lintas pekerjaan; ID yang hilang menghasilkan pesan kesalahan dan tidak beralih ke pekerjaan terbaru.

Undo memuat isi awal dari Git, memeriksa hash semua target, lalu menulis dengan rollback jika gagal. Tidak memakai reset --hard. Edit lanjutan pengguna menyebabkan konflik. Berkas yang diabaikan, direktori yang dikecualikan, atau snapshot historis yang tidak lengkap tidak memperoleh undo. Working memory dan pemeriksaan tetap disimpan terpisah; checkpoint byte bukan bukti bahwa aplikasi berfungsi.

### Verifikasi Git per giliran (5 November 2026)

Uji memakai Windows x64, database terisolasi, proyek sementara, dan provider HTTP lokal untuk respons Minibot. Seluruh fixture dibersihkan setelah pemeriksaan.

- Diff: dua giliran, begin/finish berulang, perubahan eksternal, net zero, CRLF, Unicode, biner, ignore, folder non-Git, repository bersarang, dan staging pengguna diperiksa.
- Pemulihan: konflik undo menolak semua target, kegagalan tulis mengembalikan target yang sudah tersentuh, snapshot lama diverifikasi sebelum migrasi, dan snapshot tidak lengkap tetap dipertahankan. Restart tidak merekonstruksi akhir giliran dari disk yang lebih baru.
- Integrasi: executor Minibot, jeda/persetujuan dan kelanjutan dengan rekaman terpisah, laporan terlambat, deduplikasi laporan, serta ID rekaman pada jawaban workflow diuji. Hook dan filter proyek tidak dijalankan oleh checkpoint. Worktree, pengembalian hasil CRLF, undo hasil pengembalian, dan Git dari terminal PTY juga diuji.
- Backup: roundtrip objek Git dan metadata, checksum rusak, dan tidak adanya penulisan workspace saat restore diperiksa.
- UI: kartu tertutup, detail inline, binary notice, fokus keyboard, lebar 380/1100 piksel, undo konflik/coba lagi, penghitungan diff Monaco, font kode, serta pelepasan model setelah tutup diperiksa melalui HTTP dan browser nyata.
- Distribusi: arsip npm benar-benar dibuat dan diekstrak; runtime Git dari paket npm serta tata letak portabel dijalankan tanpa Git pada PATH sistem. Lisensi/NOTICE disertakan dan binary hilang menimbulkan error. Instalasi lengkap pada mesin Windows lain belum diuji.

Build UI berhasil dengan peringatan CSS/chunk yang sudah ada. Lint seluruh repository masih mempunyai temuan lama; pembandingan berkas berubah terhadap HEAD tidak menemukan error baru. Pengujian fixture tidak membuktikan seluruh provider AI atau seluruh pola kerja proyek pengguna.
