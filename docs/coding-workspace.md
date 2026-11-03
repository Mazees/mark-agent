# Coding di Chat Studio

Chat Studio memakai workspace sesi sebagai lokasi efektif untuk konteks proyek, edit native, terminal, dan pekerjaan Minibot. Panel kanan menyediakan Perubahan, Terminal, dan Browser. Provider, persona, dan alur persetujuan tool tetap mengikuti konfigurasi pengguna.

Panel Perubahan menjelaskan fungsi peninjauan kode sebelum menampilkan daftar berkas. Cakupan Edit Mark menampilkan rekaman pekerjaan percakapan, sedangkan Semua perubahan menggunakan Git. Kondisi kosong memberi petunjuk untuk meminta perubahan melalui chat. Hasil pemeriksaan muncul ketika ada pekerjaan atau hasil yang bisa ditinjau; worktree ditempatkan pada Pengaturan lanjutan.

Tab Terminal menyiapkan satu terminal saat pertama dibuka jika daftar terminal sesi kosong. Pembuatan otomatis memakai `POST /terminals` dengan `onlyIfEmpty: true`, sehingga permintaan bersamaan tidak menggandakan terminal awal. Tombol tambah tetap membuat terminal baru secara eksplisit.

## Konteks dan checkpoint

`coding-workspace.js` menentukan folder di backend, membaca struktur ringkas, manifest, package manager, scripts, dan instruksi proyek. Dalam satu direktori, `AGENTS.override.md` menggantikan `AGENTS.md`. Instruksi direktori anak dimuat ketika target di bawahnya dibaca atau akan diedit, dengan cakupan direktori yang jelas. Tidak ada indeks vektor codebase baru.

Catatan progres menggunakan kunci sesi dan workspace dalam SQLite. Tool `update-working-memory` menyimpan catatan; rekaman edit dan pemeriksaan juga memperbarui daftar berkas serta pemeriksaan terakhir. Core memory profil/preferensi tidak diganti. Berkas `.mark` yang sudah ada tidak dipindah, dihapus, atau dianggap sebagai checkpoint otomatis.

## Edit, pemeriksaan, dan undo

Dispatcher menyuntikkan `codingSessionId`, `codingRunId`, `toolCallId`, workspace, dan kaitan task/langkah. Model tidak menentukan identitas eksekusi melalui argumen tool. Backend kembali menentukan root dari sesi. Minibot memakai pekerjaan anak dengan `parentCodingRunId` dan `ownedFiles`, serta workspace efektif sesi asal.

Tool native `write-file`, `replace-content`, `replace-lines`, `delete-file`, dan `apply-patch` merekam snapshot sebelum/sesudah. Berkas yang sudah ada harus dibaca dahulu. Hash isi dan penguncian per berkas menolak edit kedaluwarsa. Beberapa edit pada target yang sama menjadi satu diff kumulatif per pekerjaan.

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

Undo tersedia setelah pekerjaan berhenti dan hanya untuk snapshot lengkap. Isi disk harus sama dengan hasil terakhir yang direkam. Konflik membuat seluruh permintaan undo ditolak sebelum penulisan. Undo tidak memakai reset Git, tidak membuat commit, dan tidak menghapus perubahan awal pengguna. Edit dari shell, MCP, atau terminal manual tidak mendapat snapshot otomatis; diff Git menampilkannya sebagai perubahan workspace tanpa mengatribusikan pembuatnya.

## Terminal dan preview

`terminal-service.js` mengelola proses bersama untuk panel terminal, `run-powershell`, `run-task`, `read-task-output`, `kill-task`, dan `list-tasks`. Setiap terminal memiliki host Node khusus (`terminal-host.js`) yang memuat `node-pty`, menjalankan PowerShell melalui Windows ConPTY, dan melepas worker native saat shell selesai. Tidak ada fallback terminal noninteraktif jika PTY gagal dimuat.

Output mempunyai nomor urut dan buffer terbatas 256.000 karakter per proses. WebSocket hanya mengirim output kepada client yang berlangganan terminal pada sesi yang sesuai. Reload melakukan replay buffer tanpa menjalankan ulang perintah. Input mentah pengguna tidak ditulis ke database. Menutup panel tidak menghentikan terminal; tombol stop, pembatalan command, dan shutdown Mark menghentikan pohon proses yang dikelola.

`run-powershell` menunggu maksimal 60 detik. Gunakan `run-task` untuk server atau proses lebih panjang. ID proses yang sudah tersimpan setelah restart tidak dipakai untuk menjalankan ulang command. Metadata lama ditandai terputus, sementara log terminal bersifat sementara.

Alamat lokal yang tercetak pada output menjadi kandidat preview. Pengguna memilih alamat dan backend memeriksa koneksinya sebelum navigasi pada browser sesi yang sama. URL tidak ditebak dari port. Agen diarahkan menjalankan dev server hanya jika pekerjaan membutuhkan aplikasi dijalankan atau ditinjau.

### Kontrak HTTP dan WebSocket

Semua endpoint berada di `/api`, memakai `sessionId`, dan mengembalikan `{ success, data }` atau `{ success: false, error }`.

| Endpoint                             | Fungsi                                                 |
| ------------------------------------ | ------------------------------------------------------ |
| `POST /workspace/context`            | Konteks sesi; `paths` opsional memuat instruksi target |
| `PATCH /workspace/memory`            | Menyimpan objek `memory`                               |
| `GET /coding/runs`                   | Daftar rekaman pada root sesi aktif                    |
| `GET /coding/runs/:id`               | Ringkasan pekerjaan dan kaitan pekerjaan anak          |
| `GET /coding/runs/:id/diff?path=...` | Snapshot diff berkas                                   |
| `POST /coding/runs/:id/undo`         | Undo seluruh pekerjaan atau satu `path`                |
| `POST /coding/runs/:id/finish`       | Menutup rekaman dengan status akhir                    |
| `GET /coding/workspace-diff`         | Daftar diff Git; `path` opsional membaca isi diff      |
| `GET /terminals`, `POST /terminals`  | Daftar terminal atau membuat PowerShell interaktif     |
| `POST /terminals/:id/stop`           | Menghentikan pohon proses                              |
| `POST /terminals/:id/preview`        | Memeriksa `url` yang berasal dari proses aktif         |
| `POST /coding/worktree`              | Membuat worktree sesi dari HEAD                        |
| `POST /coding/worktree/return`       | Membawa perubahan ke folder asal jika tidak konflik    |

Event `terminal:command` membawa `terminalId`, `sessionId`, dan `action`: `subscribe`, `unsubscribe`, `input`, atau `resize`. Subscribe dapat menyertakan `afterSequence`; input membawa `data`, resize membawa `cols` dan `rows`. Respons berkorelasi memakai ID request. Event `terminal:output`, `terminal:state`, dan `terminal:exit` terbatas kepada subscriber; `coding:updated` hanya mengirim identitas untuk invalidasi. Origin terminal harus cocok dengan WebUI. Layanan lokal ini bukan sistem autentikasi multi-user.

## Worktree, backup, dan distribusi

Worktree opsional berada di `.config/mark-agent/worktrees/<id>` dan dimulai dari commit HEAD. Perubahan lokal belum di-commit dan dependensi tidak disalin. Berpindah worktree ditolak ketika pekerjaan Mark, Minibot, atau terminal sesi masih aktif. Pengembalian hasil memeriksa folder asal terhadap commit dasar, lalu menulis semua target dengan snapshot untuk undo. Tidak ada commit, merge, push, atau penghapusan worktree otomatis.

Tabel `coding_records` menyimpan jenis `run`, `memory`, `terminal`, dan `worktree`. Export/restore memakai `tables.codingRecords`; backup lama tetap dibaca tanpa membuat snapshot fiktif. Backup tidak menyimpan proses aktif atau input mentah terminal. Restore menghentikan terminal, menandai proses terputus, dan menonaktifkan metadata worktree. Restore tidak menulis snapshot ke proyek.

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
