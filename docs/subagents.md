# Minibots: runtime server dan penugasan

Minibots menjalankan pekerjaan di proses server Mark. Menutup atau memuat ulang WebUI tidak menghentikan pekerjaan. Mematikan server menghentikan runtime; pekerjaan yang belum selesai menunggu peninjauan sebelum dilanjutkan.

## Alur kerja

1. Mark atau pengguna membuat profil agent dan memberikan penugasan.
2. Penugasan disimpan sebelum scheduler mulai bekerja. Tidak ada batas jumlah agent yang berjalan bersamaan dari scheduler. Satu agent tetap memiliki satu run aktif; pekerjaan terpisah untuk agent yang sama mengantre.
3. Run memakai tujuan, workspace sesi asal, batas tool, konteks, dan sesi AI/browser tersendiri. Riwayat pekerjaan lama tidak otomatis masuk konteks pekerjaan baru.
4. Tool dan pesan diproses pada batas langkah. Mark menetapkan pekerjaan; Minibot hanya bertukar informasi dengan pekerjaan yang terkait.
5. Jawaban final atau `report_to_lead` mengakhiri loop. Tool berikutnya dalam batch tidak dijalankan setelah laporan final.
6. Hasil dan laporan disimpan di SQLite. Laporan digabung ke sesi asal dengan ID stabil sebelum notifikasi WebSocket. Laporan akhir baru masuk antrean tanggapan Mark; saat Mark tidak sibuk, Mark meninjau dan menanggapi tanpa perintah tambahan dari pengguna.

### Laporan asinkron ke Mark

Mark dapat memberi tugas lalu melanjutkan percakapan tanpa wait_subagents. Minibot mengirim laporan saat selesai. Jika Mark sedang melayani pengguna, laporan menunggu sampai Mark siap; laporan ditangani di sesi asalnya, termasuk ketika pengguna sedang membuka sesi lain.

Runtime menyimpan followupStatus pada laporan akhir baru. UI mengambil hak penanganan laporan melalui claim sebelum memanggil Mark, lalu menandainya handled. Penanganan diserialkan per sesi untuk mencegah tanggapan ganda dari dua tab. Laporan historis dan permintaan persetujuan tidak memicu giliran Mark otomatis. Kegagalan atau tanggapan yang terputus tidak dijalankan ulang otomatis karena aksi sebelumnya mungkin sudah terjadi; laporan aslinya tetap tersimpan.

Pemicu tanggapan Mark berjalan saat WebUI tersambung. Jika UI tertutup, Minibot tetap bekerja di server dan laporannya menunggu sampai UI tersambung kembali. Ini belum memindahkan seluruh percakapan Lead Agent ke server.

## Identitas dan status

- `subagents`: profil, peran, dan izin tool. Nama yang sama memakai profil yang sudah ada.
- `subagent_jobs`: tujuan dan hasil setiap penugasan, sesi asal, workspace, batas tool, dan tautan opsional workflow/tahap.
- `subagent_runs`: percobaan eksekusi, checkpoint aksi terakhir, dan waktu penyelesaian.
- `subagent_messages`: percakapan/tool log, dikelompokkan dengan `job_id` dan `run_id`.
- `subagent_inbox`: pesan informasi, pertanyaan, dan balasan yang tersimpan.
- `subagent_reports`: antrean laporan hasil atau permintaan keputusan dengan ID stabil.

Status pekerjaan adalah `queued`, `running`, `waiting_peer`, `waiting_review`, `waiting_user`, `interrupted`, `completed`, `failed`, dan `cancelled`. Aktivitas `thinking`, `using_tool`, dan `waiting_resource` tidak mengganti status pekerjaan. Status profil di UI merupakan ringkasan penugasan aktif atau terakhir.

## Koordinasi

`message_agent` mengembalikan tanda diterima, bukan hasil executor target. Parameter tambahan: `job_id`, `kind` (`info`, `question`, `reply`), dan `reply_to`. Sebutkan `job_id` jika penerima memiliki beberapa pekerjaan. Pesan peer hanya diizinkan dalam sesi asal dan workspace yang sama.

Pertanyaan menyimpan dependensi. Pekerjaan yang menunggu melepas slot scheduler dan dilanjutkan saat balasan diterima. Siklus saling menunggu ditolak. Setelah 120 detik tanpa jawaban, pekerjaan meminta peninjauan Mark melalui `waiting_review`. Hasil pekerjaan kolega yang sudah selesai dapat menjawab pertanyaan tanpa memanggil model lagi.

`request_lead_input` khusus Minibot meminta keputusan atau pekerjaan tambahan kepada Mark tanpa menyatakan pekerjaan selesai. Minibot tidak dapat membuat agent, memberikan pekerjaan baru, atau mengubah checkpoint workflow induk. `send_message` dari Mark mengirim ke pekerjaan aktif, atau membuat penugasan lanjutan jika pekerjaan sebelumnya sudah berakhir. `wait_subagents` hanya menunggu status secara terbatas; timeout tidak membatalkan pekerjaan.

### Peninjauan Mark dan keputusan pengguna

request_lead_input dan timeout kolega ditinjau Mark di server, tanpa perlu membuka detail agent. Mark menerima tujuan, kendala, aktivitas terakhir, dan hasil kolega dalam sesi serta workspace yang sama. Keputusannya berupa arahan kelanjutan, persetujuan satu tindakan tulis berkas biasa di workspace, atau permintaan kepada pengguna. Peninjau tidak menjalankan tool dan tidak dapat memperluas izin profil/penugasan.

Hanya write-file dan replace-lines pada berkas biasa di workspace yang dapat disetujui Mark. Path di luar workspace, symlink yang keluar workspace, berkas kredensial, shell, penghapusan, serta tindakan lain yang memerlukan izin tetap mengikuti persetujuan pengguna atau izin tersimpan. Persetujuan Mark terikat pada satu tool call, bukan izin permanen.

Chat asal dan halaman utama menampilkan **Koordinasi Minibots**. Pengguna dapat membaca alasan, memeriksa argumen tindakan, menyetujui/menolak, memberikan arahan, mengambil gambar kamera, atau meminta Mark meninjau pekerjaan yang terputus. Tidak perlu membuka agent satu per satu. Permintaan lama tidak dapat menyetujui tool call atau permintaan kamera yang sudah berubah.

Satu review berjalan pada satu waktu. Tidak ada panggilan model hanya karena polling atau reconnect. Maksimal tiga putaran peninjauan kendala teknis otomatis per penugasan; persetujuan tindakan dihitung terpisah. Jika review gagal, pengguna melihat alasan di chat asal. Pembatalan dan penghentian server membatalkan review; hasil yang terlambat tidak melanjutkan pekerjaan. Pekerjaan yang terputus saat restart tetap memerlukan arahan atau tombol **Minta Mark meninjau**.

## Penghentian, izin, dan pemulihan

- Pembatalan milik run yang dipilih. Tombol berhenti chat utama tidak membatalkan seluruh Minibot.
- Izin profil dan penugasan diperiksa di server. Metadata persetujuan tool tetap berlaku, termasuk mode otomatis sesi asal dan izin permanen. Persetujuan satu tindakan terikat ke tool call yang menunggu.
- Tool yang memerlukan UI, seperti pengambilan gambar kamera, menunggu pengguna. Tidak ada persetujuan otomatis hanya karena UI tertutup.
- Browser Puppeteer terisolasi per run. Browser yang menunggu kolega tetap dipertahankan sampai pekerjaan berakhir atau dibatalkan; percobaan baru mendapat sesi baru.
- Desktop dan Chrome Bridge memakai akses eksklusif. Mutasi file dan shell dalam workspace yang sama diserialkan secara konservatif. Ini bukan sandbox; proses eksternal dan plugin tetap dapat berbagi sumber daya.
- Setelah crash, aksi dengan hasil tidak diketahui dicatat sebagai terputus dan tidak otomatis diulang. Pengguna atau Mark memeriksa kondisi nyata sebelum melanjutkan. Membatalkan pekerjaan tidak membatalkan efek tool yang sudah terjadi.
- Kelanjutan dan retry membuat run baru sambil mempertahankan konteks pekerjaan dan riwayat percobaan sebelumnya.
- Restore/reset menghentikan runtime sebelum mengganti data. Backup menyertakan empat tabel runtime baru. Data lama menjadi satu penugasan berlabel riwayat lama per agent; pembagian historis yang tidak tercatat tidak direkonstruksi.

## API

Seluruh path berada di bawah `/api/subagents`. Gunakan `API_BASE` pada renderer.

| Operasi | Endpoint |
| --- | --- |
| Daftar/buat profil | `GET /`, `POST /` |
| Daftar/buat penugasan agent | `GET /:id/jobs`, `POST /:id/jobs` |
| Snapshot semua penugasan | `GET /jobs` |
| Detail penugasan dan percobaan | `GET /jobs/:id` |
| Riwayat penugasan | `GET /jobs/:id/messages` |
| Kotak masuk | `POST /:id/messages` |
| Batalkan | `POST /jobs/:id/cancel` |
| Lanjutkan/coba lagi | `POST /jobs/:id/resume`, `POST /jobs/:id/retry` |
| Keputusan tindakan/gambar kamera | `POST /jobs/:id/decision`, `POST /jobs/:id/frame` |
| Klaim/akhiri tanggapan laporan | POST /reports/:id/claim, POST /reports/:id/settle |
| Daftar keputusan sesi | GET /attention?sessionId=... |
| Minta tinjauan Mark | POST /jobs/:id/review |
| Laporan sesi | `GET /reports?sessionId=...` |

Pembuatan penugasan dan pesan memerlukan `requestId` untuk mencegah duplikasi saat request dikirim ulang. Operasi mengembalikan `{ success, data }` atau `{ success: false, error }`. Event server: `subagent:updated`, `subagent:activity`, `subagent:message`, `subagent:report`. UI mengambil snapshot saat reconnect; WebSocket bukan satu-satunya tempat penyimpanan hasil.

## Verifikasi

```powershell
npm run build:ui
npm run lint
```

Saat verifikasi, pengujian runtime menggunakan SQLite in-memory dan provider/tool tiruan. Pengujian integrasi memakai database sementara, provider HTTP lokal, tool baca berkas native, serta backup/restore tanpa mengubah konfigurasi pengguna. Pengujian browser menjalankan dua sesi Puppeteer nyata pada halaman fixture lokal dan membersihkan profil run pengujian. Provider cloud dan Chrome Bridge pengguna tidak dijalankan sebagai bagian pengujian.

Virtual office, rapat simulasi, pengambilan pekerjaan mandiri, dan pemindahan Lead Agent sepenuhnya ke server berada di luar perubahan ini. Peninjauan kendala Minibot sudah berjalan di server; percakapan utama tetap menangani tujuan dan jawaban akhir pengguna.

### Hasil pemeriksaan 25 Oktober 2026

Sebanyak 22 skenario runtime/integrasi lolos, mencakup antrean dan konkurensi, pembatalan, pesan peer dan siklus dependensi, timeout, izin tool, keputusan pengguna, pemulihan tanpa mengulang mutasi, urutan observasi visual, HTTP, migrasi, serta backup/restore. Dua sesi Puppeteer nyata membaca halaman fixture berbeda tanpa mencampur DOM. Pemeriksaan UI desktop/mobile mencakup pemilihan riwayat, kelanjutan pekerjaan, pesan ketika mengantre, keyboard, dan overflow horizontal.

Skrip pengujian, database sementara, profil browser pengujian, dan screenshot pemeriksaan sudah dibersihkan sesuai permintaan. Hasil pemeriksaan dicatat di sini; skrip tersebut tidak disertakan dalam source akhir.

Build UI dan pemeriksaan sintaks berhasil. Pemeriksaan lint pada 37 file JavaScript/JSX yang berubah tidak menambah error dibanding HEAD. `npm run lint` untuk seluruh repository masih gagal karena temuan lama, termasuk source hasil packaging di `dist-release`.

Penambahan koordinasi keputusan diverifikasi dengan 10 skenario runtime/API terarah: review otomatis satu kali, pembatalan review, izin sensitif, batas putaran, persetujuan tulis berkas dan urutan tool, eskalasi pengguna, kegagalan provider, batas path, parser review, serta endpoint keputusan per sesi. UI terpusat diuji pada desktop 1280 piksel dan mobile 390 piksel untuk persetujuan, balasan, isolasi sesi, keyboard, dan overflow. Seluruh pengujian tambahan dijalankan tanpa skrip permanen.

Jalur produksi fetchAI juga lolos dengan provider HTTP lokal. Pemeriksaan tambahan memastikan empat persetujuan tindakan terpisah tetap ditinjau Mark, review yang dihentikan tidak berjalan kembali saat restart, dan junction keluar workspace ditolak.

Pemulihan tanggapan laporan otomatis lolos sembilan skenario runtime/API: laporan persisten, batas sesi, penundaan saat sibuk, dua penerima bersamaan, deduplikasi, penundaan setelah claim, kegagalan, pemulihan proses, dan pengabaian laporan historis. Hook React diperiksa di browser untuk antrean saat sibuk, tanggapan otomatis, sesi asal, draft pengguna, dan deduplikasi setelah reload.
