# Panel workspace dan perubahan per giliran

Chat Studio memisahkan aktivitas AI di chat dari alat manual pada panel kanan. Browser merupakan satu tab tetap per sesi Puppeteer. Menu + membuka editor teks, penampil dokumen, atau terminal manual. Diff dibuka dari kartu perubahan di bawah jawaban. Source Control dan pengaturan pembuatan worktree tidak tersedia. Folder worktree lama dipertahankan sebagai workspace efektif sesi, tanpa menyalin hasil atau menghapus folder.

## Identitas, tab, dan editor

Backend menentukan root melalui sesi. Setiap target dibatasi oleh scopedPath, termasuk pemeriksaan symlink/junction. Tab, urutan, pilihan aktif, dan draf tersimpan dalam coding_records dengan kunci sesi serta workspace. Identitas tab diff mencakup runId dan path; sumber historis selalu checkpoint rekaman tersebut. Data hilang menghasilkan error, bukan pemilihan giliran terbaru.

Pemilih berkas memuat direktori per ekspansi dan menyediakan pencarian terbatas 200 hasil. Monaco dimuat lazy. Model editor dilepas saat tab ditutup, sedangkan tab editor tersembunyi mempertahankan posisi. Ctrl+S dan Simpan menulis manual. Penyimpanan memeriksa SHA-256 isi disk dengan mutex mutasi yang juga dipakai tool native. Konflik tidak menimpa berkas. UTF-8 dan UTF-16 LE/BE dengan BOM serta LF/CRLF/CR dipertahankan. Binary, encoding tidak didukung, dan teks melebihi 2 MiB menghasilkan error. Draf pulih tidak otomatis ditulis ke proyek. Penutupan tab berubah menawarkan Simpan/Buang/Batal.

Instruksi AGENTS.md dimuat utuh tanpa batas penolakan 32 KB. AGENTS.override.md menggantikan AGENTS.md pada direktori sama; instruksi anak dimuat sesuai target. Panel tab dan daftar terminal tidak bergantung pada pemuatan instruksi proyek. Catatan progres tetap terpisah dari core memory profil/preferensi.

## Checkpoint, kartu, dan keputusan

MinGit Windows x64 tetap dibawa melalui resources/git/manifest.json. Runtime memakai executable absolut dan tidak beralih ke Git sistem. Checkpoint sebelum tool workspace pertama dan setelah pekerjaan berakhir disimpan di ~/.config/mark-agent/coding-git/<workspaceKey>. Repository internal tidak menggunakan staging, remote, branch, hook, filter, atau commit proyek pengguna. Blob mempertahankan byte asli; ignore proyek, dependency, cache, dan output build membatasi cakupan.

Perubahan selama jendela giliran dapat berasal dari native tool, shell, MCP, plugin, terminal manual, dan pengguna yang bekerja bersamaan. Edit sebelum awal giliran tidak menjadi perubahan giliran. Perubahan yang kembali persis ke awal tidak tampil. Hasil final dibekukan dan tidak diperbarui dari disk lebih baru. Minibot memakai run sendiri dengan parentRunId dan nama pekerja; laporan terlambat tetap ditautkan ke jawaban yang meninjaunya.

Kartu hanya muncul setelah giliran selesai dan captureStatus completed dengan files tidak kosong, termasuk giliran gagal atau dibatalkan. Daftar berkas menampilkan penambahan/pengurangan; klik membuka tab diff hanya baca. Tidak ada editor inline atau tombol undo per berkas.

POST /coding/runs/:id/review menerima decision accepted/rejected, requestId, afterOid, dan sessionId. Accept menyimpan keputusan tanpa menulis berkas. Reject memvalidasi semua hash target sebelum menulis, mengambil isi awal Git, serta melakukan rollback jika tulis gagal. Mutex per rekaman menyerialkan keputusan bersaing dan endpoint undo lama. Replay request sama idempoten; perubahan keputusan dan undo setelah final ditolak. Konflik atau kegagalan tidak menyimpan keputusan. Tidak menggunakan reset --hard, staging, commit, merge, atau push.

Tool apply-patch tetap mendukung Add/Update/Delete dengan konteks unik dan validasi seluruh target sebelum tulis. Hash bacaan dan kepemilikan Minibot tetap berlaku. Mutasi di luar workspace hanya melalui cakupan persetujuan backend yang tepat; operasi luar folder tidak memperluas kartu. Keberhasilan tulis berbeda dari bukti build/pengujian.

## Dokumen lokal

Tautan dalam jawaban chat dibuka di tab luar menggunakan `noopener noreferrer`, tanpa mengganti halaman Mark. Path berkas relatif, path Windows absolut, dan URL `file:///` diarahkan ke `GET /api/workspace/download?sessionId=...&path=...`. Backend menentukan workspace dari sesi, memeriksa target serta junction/symlink, lalu mengirim berkas sebagai attachment. Berkas di luar workspace ditolak; halaman HTML hasil pekerjaan diunduh sebagai berkas dan tidak dijalankan di origin antarmuka Mark. Link web HTTP/HTTPS tetap menggunakan alamat aslinya. Route unduhan tidak menjalankan tool AI atau mengubah berkas.

PDF.js beserta worker, cMaps, standard fonts, dan WASM dikemas lokal. Viewer menyediakan halaman, zoom, serta pencarian teks. DOC/DOCX, PPT/PPTX, ODT/ODP dikonversi ke PDF oleh LibreOffice Windows x64 dari resources/office/manifest.json. Versi, URL resmi, dan SHA-256 dikunci. Jalankan npm run prepare:office saat development/rilis. Ekstraksi MSI memakai lessmsi terverifikasi pada tahap persiapan, tanpa memasang Office ke Windows. Ekstraktor sementara tidak dibawa ke runtime.

Konversi memakai salinan sementara, profil unik, makro dinonaktifkan, pengaturan tanpa pembaruan tautan, mode headless, dan batas 90 detik. Dokumen asli tidak diubah. Preview disimpan berdasarkan hash isi serta versi renderer di ~/.config/mark-agent/document-cache. Perubahan isi memerlukan preview baru; error menyediakan Coba lagi. Batas dokumen 150 MiB. Ini bukan isolasi OS untuk dokumen berbahaya dan tidak menjanjikan kesamaan piksel dengan Microsoft Office. Font yang tersedia dapat memengaruhi hasil.

## Terminal dan aktivitas AI

Terminal manual menggunakan satu PTY per tab dan cwd workspace. Menutup tab/panel hanya menyembunyikan proses; terminal aktif dapat dibuka kembali dari +. Hentikan dan shutdown membersihkan pohon proses. Restart tidak menjalankan ulang perintah. Tidak ada pembuatan terminal otomatis karena metadata tab dipulihkan.

Environment proses Mark menambahkan Git bawaan pada PATH dan menetapkan `GIT_PAGER=cat`. Git menafsirkan nilai ini sebagai keluaran langsung tanpa menjalankan pager, sehingga `git diff`, `git log`, dan `git show` tidak membutuhkan `less` yang tidak disertakan MinGit. Pengaturan hanya berlaku untuk proses yang dikelola Mark; konfigurasi Git global/proyek dan PATH Windows tidak diubah. Terminal yang sudah terbuka perlu dihentikan dan dibuat ulang setelah Mark dimulai ulang agar menerima environment baru.

run-powershell dan run-task menggunakan terminal-service tanpa membuka tab manual. Metadata menyimpan codingRunId, toolCallId, dan sessionId. Aktivitas menampilkan log, status, dan exit code proses yang tepat. Output bernomor urut dibatasi 256.000 karakter dan dikirim hanya ke subscriber. Input raw ditolak untuk proses AI. Perintah AI tetap melewati persetujuan tool; terminal manual merupakan tindakan langsung pengguna. run-powershell dibatasi 60 detik; run-task berjalan di latar sampai dihentikan. Buffer log tidak masuk backup.

## API

Semua route berada di /api dan membawa sessionId. Respons JSON menggunakan {success,data} atau {success:false,error}. Endpoint dokumen content mengirim application/pdf setelah memvalidasi sesi, target, dan hash sumber.

| Route | Fungsi |
|---|---|
| POST /workspace/context, PATCH /workspace/memory | Konteks proyek dan progres |
| GET /workspace/panel, POST /workspace/panel | Metadata tab per sesi/workspace |
| GET /workspace/tree?directory=&search= | Direktori bertahap/pencarian |
| GET /workspace/file?path= | Teks, hash, encoding, akhir baris, draf |
| POST /workspace/file | Simpan content dengan expectedHash |
| POST /workspace/draft | Simpan/hapus draf tanpa menulis proyek |
| POST /workspace/document | Menyiapkan PDF lokal |
| GET /workspace/document/content?path=&hash= | PDF yang cocok dengan sumber |
| POST /coding/runs/begin, POST /coding/runs/:id/finish | Checkpoint idempoten |
| GET /coding/runs, GET /coding/runs/:id, GET /coding/runs/:id/diff | Rekaman dan diff tepat |
| POST /coding/runs/:id/review | Keputusan final accepted/rejected |
| POST /coding/runs/:id/undo | Kompatibilitas undo sebelum keputusan final |
| GET /terminals, POST /terminals | Metadata proses/membuat PTY manual |
| POST /terminals/:id/stop | Menghentikan pohon proses |

Route workspace-diff, worktree, dan worktree/return dihapus tanpa fallback. WebSocket terminal:command mendukung subscribe/unsubscribe/input/resize dengan terminalId dan sessionId. Output/state/exit dibatasi ke subscriber dengan origin WebUI.

## Penyimpanan, backup, dan distribusi

coding_records menyimpan run, memory, git-workspace, workspace-panel, editor-draft, terminal serta metadata worktree historis untuk migrasi. Rekaman lama dapat dimigrasikan ke objek Git hanya dari byte yang tersimpan. Keputusan tinjauan, metadata tab, dan draf ikut backup. Objek Git diarsipkan dengan versi/checksum. Proses dan cache konversi tidak disertakan. Restore tidak menjalankan perintah, navigasi browser, atau menulis draf/snapshot ke workspace. Tab terminal hasil restore dapat menunjukkan proses tidak tersedia.

prepack/prepublishOnly serta build/package-release.ps1 menyiapkan Git dan Office sebelum pengemasan. Pengguna npm install -g @mazees/mark --ignore-scripts menerima binary yang sudah dibawa paket, tanpa pengunduhan renderer saat runtime. Distribusi harus menyertakan seluruh LibreOffice termasuk lisensi serta runtime ConPTY node-pty. Worker Monaco/PDF dan aset PDF lokal ada di out/renderer. Paket menjadi lebih besar karena menyertakan Office.
