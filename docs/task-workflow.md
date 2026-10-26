# Task Workflow: checklist berurutan

`/task`, permintaan jelas membuat rencana kerja, dan tugas besar memakai satu workflow. Checklist ditampilkan lalu langsung dikerjakan. Permintaan rencana saja tetap tidak menjalankan pekerjaan.

## Eksekusi dan penyimpanan

`task-workflow.js` mengelola transaksi SQLite. Hanya langkah yang ditunjuk `activeStepId` dan berstatus `running` dapat diselesaikan. Ringkasan serta bukti pemeriksaan wajib; tidak ada skor berdasarkan panjang teks atau klaim pengujian otomatis. Langkah berikutnya diaktifkan setelah checkpoint tersimpan. Workflow selesai hanya ketika seluruh langkah berstatus `completed`.

`artifactContent` opsional. Jika diberikan, server menulis Markdown dan membaca kembali hasilnya. `artifactPath` merujuk berkas yang telah dibuat dan diperiksa keberadaannya. Langkah dengan `requiredArtifact` tidak dapat selesai tanpa berkas nyata yang tidak kosong. Folder `Documents/Mark Tasks/<task-id>` baru dibuat ketika menulis artifact. Berkas wajib yang gagal ditulis tidak mengubah checkpoint menjadi selesai. Keberadaan berkas bukan jaminan kebenaran isinya; bukti pemeriksaan tetap harus sesuai pekerjaan.

`update_task_plan` menerima daftar pengganti seluruh langkah mendatang yang belum dimulai. ID lama dapat dipertahankan untuk langkah pending; ID aktif/selesai ditolak. Alasan dan versi revisi disimpan. `planVersion` bertambah hanya saat revisi; `requestId` mencegah pengulangan mutasi. Mengirim ID request yang sama dengan isi berbeda ditolak. Transaksi mencegah dua penyelesaian bersamaan melompati langkah.

## API

Semua path di bawah `/api/tasks`; renderer menggunakan `API_BASE`.

| Operasi            | Route                | Isi utama                                                                    |
| ------------------ | -------------------- | ---------------------------------------------------------------------------- |
| Buat               | `POST /workflow`     | `sessionId`, `requestId`, `title`, `objective`, `steps`                      |
| Snapshot           | `GET /:id/workflow`  | Task, langkah, dan penugasan Minibot terkait                                 |
| Selesaikan langkah | `POST /:id/complete` | Nomor `stepIndex` mulai 1, `summary`, `verificationProof`; artifact opsional |
| Revisi             | `POST /:id/plan`     | `explanation`, `steps` mendatang                                             |
| Kontrol            | `POST /:id/control`  | `action`: `pause`, `resume`, `retry`, `cancel`, `wait`, `help`, `fail`       |
| Simpan penutup     | `POST /:id/finalize` | `answer`                                                                     |

Seluruh mutasi task yang sudah dibuat memerlukan `sessionId`, `planVersion`, dan `requestId`. Respons berbentuk `{success,data}` atau `{success:false,error}`; perubahan kedaluwarsa/tidak sah memakai status 409. CRUD lama dipertahankan untuk riwayat, tetapi tidak boleh mengubah task yang dikelola alur baru. Event `task:updated` membawa snapshot; UI juga mengambil ulang saat reconnect dan polling.

## Kelanjutan dan Minibots

Lead Agent tetap berjalan di renderer. Kelanjutan dari kartu atau laporan membawa task dan sesi asal secara eksplisit. Pekerjaan yang terputus dijeda saat startup/restore; langkah aktif dipertahankan. Instruksi kelanjutan meminta pemeriksaan hasil aksi yang belum diketahui sebelum mengulang.

Penugasan dan laporan Minibot menyimpan `taskId`/`stepId`. Selama hasil yang dibutuhkan belum tersedia, langkah tetap aktif dan task menjadi `waiting_minibots`; chat dapat digunakan untuk pekerjaan lain. Laporan terakhir memicu kelanjutan pada workflow yang cocok. Laporan cepat yang selesai sebelum giliran Mark berakhir ikut dimasukkan sebagai data untuk ditinjau. Pembatalan workflow membatalkan penugasan terkait saja. Laporan terlambat dan percobaan melanjutkan Minibot milik task yang sudah berakhir ditolak/diabaikan.

## Jawaban penutup dan kartu

`taskFinalization.js` menerima permintaan awal, hasil, bukti, dan berkas; riwayat tool, penalaran, dan tab browser tidak dikirim ke tahap penutup. Panggilan ini tidak menyediakan tool. Respons kosong, JSON tidak sesuai, tool call, atau kegagalan provider memakai ringkasan faktual dari langkah tersimpan. Tidak ada pengulangan pekerjaan untuk menyusun laporan.

Jawaban pertama yang tersimpan dipertahankan dengan ID `task-final-<id>`. Penyimpanan sesi menggabungkan pesan ini berdasarkan ID agar penulisan history yang terlambat tidak menghapus atau menggandakannya. Workflow selesai yang belum memiliki jawaban diselesaikan tahap penutupnya saat WebUI siap kembali.

Kartu menampilkan progres dari status tersimpan. Baris langkah membuka sasaran, hasil, bukti, dan berkas; checkbox hanya indikator. Detail proses tertutup secara default. Kartu otomatis ringkas saat selesai, dan pembukaan manual setelahnya dipertahankan. Hentikan/Lanjutkan/Coba lagi selalu mengacu pada task yang dipilih. Riwayat lama tetap terbaca tanpa mengarang bukti maupun memperbaiki status historis secara otomatis.

## Verifikasi perubahan

Pemeriksaan memakai SQLite in-memory atau database fixture, API HTTP lokal, model/tool tiruan, serta Edge headless. Cakupan: penolakan langkah yang dilompati, deduplikasi, revisi kedaluwarsa, isolasi sesi, artifact opsional/wajib, rollback kegagalan tulis, backup/restore, restart, dependensi/pembatalan Minibot, laporan terlambat, loop Lead Agent, penutup kosong/gagal, tab Google yang tidak terkait, serta kartu desktop/mobile/keyboard/reduced motion. Fixture, profil browser, dan skrip sementara dibersihkan setelah pemeriksaan.
