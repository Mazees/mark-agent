# Perizinan tool Mark

Perizinan diputuskan di backend untuk Mark, Minibot, plugin lokal, dan MCP. Pemeriksaan dilakukan sebelum eksekusi, termasuk ketika endpoint eksekusi dipanggil langsung. Ini adalah kebijakan aplikasi, bukan isolasi sistem operasi untuk kode plugin atau shell.

## Memilih mode

Setiap percakapan memiliki mode sendiri pada kolom pesan:

- **Tanya pengguna:** operasi baca biasa berjalan langsung; perubahan dan eksekusi meminta izin bila belum memiliki izin yang sesuai.
- **Tinjau Otomatis (Mode pintar):** default sesi baru. Berkas biasa di workspace dapat dibuat, diubah, atau dihapus tanpa dialog per berkas. Perintah shell, perubahan di luar workspace, serta tindakan lain yang memerlukan penilaian diperiksa oleh model utama melalui request terpisah. Mode ini tidak membuka persetujuan manual: peninjau mengizinkan atau menolak tindakan.
- **Akses penuh:** melewati izin rutin dan peninjau model. Larangan tetap dan persetujuan awal Computer Use tetap berlaku.

Sesi lama dengan Auto Mode aktif dimigrasikan menjadi Akses penuh; sesi lama lainnya menjadi Tanya pengguna. Menyimpan chat tidak mengubah mode yang telah dipilih. Pada Telegram, gunakan `/izin manual`, `/izin smart`, atau `/izin full` untuk sesi utama.

## Peninjau otomatis

Peninjau memakai provider, model, dan kredensial aktif. Request hanya membawa instruksi peninjau berbahasa Indonesia, kebijakan backend, permintaan awal pengguna, chat lanjutan, intervensi, maksimal enam giliran sebelumnya dari sesi yang sama, tindakan, target, dan cuplikan bukti relevan. Pesan pengguna, penjelasan agen, dan observasi tool diberi asal berbeda. Maksimal enam hasil pengamatan dibawa; isi berkas, script, atau halaman tetap data, bukan izin. Persona, registry tool, dan seluruh riwayat percakapan tidak disertakan. Sesi provider dipisahkan dari percakapan utama.

Jawaban harus berupa JSON ketat `{"verdict":"APPROVE|DENY|ESCALATE","reason":"alasan singkat"}`. reason wajib 1–3 kalimat, maksimal 1200 karakter. Tidak ada JSON repair, pencarian substring verdict, atau penggunaan penalaran internal sebagai jawaban. Hasil kosong, tidak valid, terpotong, atau kegagalan provider menghentikan tindakan tanpa membuka dialog persetujuan. Peninjau memiliki batas waktu 30 detik dan tidak memilih model pengganti. Penalaran model tidak digunakan sebagai verdict.

`APPROVE` berlaku hanya untuk pemanggilan tersebut. `DENY` memblokir tindakan, bukan meminta agen mencoba command lain. Tiga penolakan model berturut-turut menjeda pekerjaan terkait. `ESCALATE` berarti informasi belum cukup: tindakan belum berjalan, alasannya dikembalikan ke Mark/Minibot, dan tidak dimintakan persetujuan manual. Agen boleh melakukan observasi relevan melalui tool yang diizinkan, lalu meminta evaluasi baru dengan ID baru setelah bukti berubah. Mengganti alasan agen atau menambahkan hasil penolakan lama tidak menjadi bukti baru. Rahasia disamarkan dan konteks ditandai tidak lengkap; efek yang tidak terlihat tidak boleh dianggap aman. Payload yang melebihi batas review dihentikan. Peninjauan pekerjaan Minibot oleh Mark tidak memberikan izin menjalankan tool.

Aktivitas chat menampilkan perisai centang hijau untuk keputusan izin dari model dan perisai silang merah untuk penolakan yang tercatat. Ikon tidak menambahkan teks pada baris aktivitas; label aksesibel tersedia untuk pembaca layar. Sumber keputusan disimpan bersama aktivitas, sehingga izin dari aturan biasa tidak ditampilkan seolah-olah ditinjau model. Status izin terpisah dari keberhasilan eksekusi: tindakan yang diizinkan masih dapat gagal saat dijalankan.

## Cakupan izin

Target berkas dinormalisasi di backend, termasuk junction dan symlink. Pada Tinjau Otomatis, mutasi di luar workspace atau folder yang sudah diizinkan dinilai model berdasarkan permintaan pengguna, tindakan, dan seluruh targetnya. Misalnya, permintaan menghapus tiga berkas tertentu di Downloads dapat disetujui khusus untuk ketiga pemanggilan tersebut, tanpa memberi izin umum pada folder Downloads. Target di luar permintaan tidak otomatis diizinkan. Pada Tanya pengguna, mutasi yang belum diizinkan tetap meminta persetujuan manusia. Patch memeriksa semua target sebelum dijalankan. Target sensitif dan penghapusan massal tidak termasuk edit biasa.

Setelah diizinkan, backend meneruskan cakupan berkas ke pembungkus coding melalui identitas objek konfigurasi dalam memori. Cakupan terikat pada tool, argumen, workspace, dan target yang sudah di-resolve, berlaku hanya selama handler berjalan, serta tidak dapat dibuat melalui field JSON dari client. Pembungkus tetap memeriksa target dan hash, kepemilikan berkas Minibot, serta rollback patch. Menghapus berkas yang sudah diizinkan tidak mewajibkan pembacaan isinya terlebih dahulu; jika berkas pernah dibaca dan berubah setelahnya, konflik tetap menolak penghapusan. Batas workspace untuk diff dan undo tetap berlaku; aksi di luar workspace tidak diklaim mempunyai checkpoint atau undo workspace.

Perintah shell diperiksa sebagai operasi yang dapat mempunyai efek di luar cwd. Deteksi pola dan model tidak dapat membatasi seluruh kemampuan program yang dipanggil. Deklarasi keamanan dari MCP atau plugin tidak menjadi izin otomatis.

**Izinkan sekali** menyetujui tindakan itu saja. **Izinkan sesi ini** dan **Simpan izin** menampilkan cakupan sebelum dipilih: tool berkas pada folder target, atau tool beserta argumen yang sama persis. Target sensitif dan Computer Use tidak menawarkan penyimpanan izin luas. Izin tersimpan dapat dicabut langsung melalui Pengaturan > Izin akses. Folder absolut dari versi lama yang masih valid dan tidak sensitif dipertahankan sebagai izin terstruktur pada pemeriksaan pertama. Entri lama yang ambigu memerlukan konfirmasi ulang. Pencabutan izin hasil migrasi tidak membuatnya aktif kembali saat restart.

## Kontrak backend

- `POST /api/tools/needs-approval`: evaluasi `{tool, query, config}`. Mengembalikan `requestId`, `status`, `source`, `reason`, `needsApproval`, `denied`, dan cakupan izin.
- `POST /api/tools/approval/decide`: `{requestId, config, choice}` dengan `approve_once`, `approve_session`, `approve_always`, atau `reject`. Keputusan manusia hanya diterima dari origin Mark lokal.
- `POST /api/tools/execute` serta `/api/plugins/execute`: memeriksa ulang identitas, target, kebijakan, dan ketersediaan tool sebelum handler dijalankan.
- `POST /api/tools/approval/cancel`: membatalkan izin tertunda untuk sesi dan pekerjaan terkait.
- `GET /api/tools/approval/pending`: antrean permintaan Minibot yang masih berlaku.
- `GET /api/tools/approval/grants` dan `DELETE /api/tools/approval/grants/:id`: melihat dan mencabut izin tersimpan.
- `GET/POST /api/sessions/:id/approval-mode`: membaca dan mengganti mode percakapan.

Runtime memasukkan identitas sesi, pekerjaan, dan ID pemanggilan; model tidak membuat ID izin sendiri. Izin berumur maksimal lima menit dan terikat pada argumen, target, workspace, dan versi kebijakan. Request dengan ID sama dan isi berbeda ditolak. Eksekusi berulang dengan ID sama tidak menjalankan handler ulang; setelah kedaluwarsa atau restart, hasil harus diperiksa sebelum membuat pemanggilan baru.

Minibot menunggu keputusan untuk aksi terkait tanpa memblokir percakapan Mark. Permintaan paralel masuk antrean UI dan tidak saling menggantikan. Pengguna dapat membatalkan pekerjaan ketika peninjauan atau persetujuan berlangsung.

## Penyimpanan dan pemulihan

SQLite menyimpan mode sesi, izin terstruktur, serta audit berupa hash tindakan, keputusan, sumber, dan alasan singkat yang sudah disamarkan. Audit tidak menyimpan argumen, prompt lengkap, atau kredensial. Metadata ini termasuk backup. Request tertunda, token, dan hasil eksekusi dalam memori tidak ikut backup. Restore tidak mengeksekusi tindakan; pekerjaan yang dilanjutkan harus memperoleh pemeriksaan baru.

Computer Use tetap memerlukan izin awal manusia saat membuka sesi. Tinjau Otomatis menolak pembukaan sesi baru yang belum diizinkan dan menampilkan alasannya, tanpa membuka dialog manual; persetujuan awal tersedia melalui Tanya pengguna. Sesi kendali yang sudah aktif dengan identitas pekerjaan yang sama tetap dapat digunakan. Mouse dan overlay mengikuti siklus sesi yang sudah ada, dengan Ctrl+Shift+R untuk membatalkan.

## Pemeriksaan implementasi

- Backend: diuji dengan request HTTP nyata untuk mutasi berkas, checkpoint coding, plugin lokal, dan adapter MCP. Request ganda tidak mengulang handler; pencabutan tool sebelum eksekusi menolak tindakan.
- Tinjau Otomatis: 19 kelompok pemeriksaan mencakup target di luar workspace, keputusan model, konteks sensitif/besar, error, deduplikasi, Minibot, pergantian mode, serta Computer Use. Jalur API nyata diuji melalui provider HTTP lokal untuk izin, penolakan, ESCALATE, respons kosong/tidak valid, dan respons terpotong; semuanya tanpa persetujuan manual dalam mode smart.
- Eksekusi berkas: 13 kelompok pengujian melewati API, peninjau HTTP fixture, tool native, pembungkus coding, dan filesystem sementara. Tiga gambar dummy di luar workspace benar-benar dihapus; pembuatan/edit/patch lintas workspace, konflik hash, penolakan, cakupan palsu/tersalin/kedaluwarsa, kepemilikan Minibot, izin manusia sekali pakai, Akses penuh, serta batas diff workspace diperiksa. Tidak ada berkas pribadi pengguna yang diubah.
- Minibot: diuji melalui loop SSE dengan dua pekerjaan paralel, antrean izin terpisah, nama pelaku, persetujuan, pencabutan tool, dan pembatalan satu pekerjaan.
- Provider: diuji melalui endpoint HTTP lokal serta adapter Web yang disimulasikan. Format verdict, jawaban kosong/terpotong, tool call, penalaran saja, pembatalan, dan batas waktu 30 detik diperiksa. Pengujian ini tidak memakai akun cloud atau sesi Web pengguna.
- Penyimpanan: diuji migrasi Auto Mode, default sesi baru, penyimpanan chat, backup/restore, kedaluwarsa, izin folder lama, serta pencabutan izin setelah restart.
- UI PASS: komponen React dijalankan di Edge; pilihan mode dan antrean dialog diuji dengan mouse/keyboard, Escape, perpindahan fokus, reload, reduced motion, dan layar 360 px. Menu menyesuaikan posisi dan dialog membungkus teks panjang tanpa overflow horizontal.
- Arah visual PASS: font Poppins dan warna tema Mark dipakai kembali; aksen hijau menunjukkan pilihan, warna peringatan menunjukkan Akses penuh. Batas panel memisahkan menu dan dialog dari chat. ENERGY 2 / RHYTHM 2 / MOTION 1 mengikuti DESIGN.md, tanpa aset atau klaim produk buatan.
- Ikon izin PASS: ProcessTimeline dijalankan di Edge pada desktop dan 360 px dengan reduced motion; perisai hijau/merah terlihat, aktivitas lama tidak diberi keputusan buatan, kegagalan tool tetap terpisah dari izin, serta buka/tutup melalui keyboard bekerja. Ikon memakai warna status tema dan ukuran yang sama agar tidak menggeser hierarki aktivitas, tanpa animasi tambahan.

Fixture pengujian bersifat sementara dan dihapus setelah pemeriksaan. Build UI, lint, pemeriksaan perbedaan lint terhadap HEAD, serta isi paket npm diperiksa terpisah. Temuan lint lama tidak dinyatakan sebagai regresi fitur ini.

## Konteks pekerjaan dan tindak lanjut

`approval-context.js` pada shared menyusun konteks yang sama untuk Mark dan Minibot. `approval-context.js` pada layanan server mencocokkan sesi, hubungan task, dan penugasan. Workflow mencari pesan pengguna sebelum kartu rencana dalam sesi asal; objective atau contextSummary buatan model tetap penjelasan agen jika pesan asli tidak ditemukan. Minibot menyimpan snapshot chat asal saat penugasan, dan membedakan pesan Mark/kolega dari pesan pengguna. Chat sebelumnya menyertakan jawaban Mark sebagai penjelasan agen, tanpa thought/reasoning. Core memory, persona, registry tool, dan gambar Base64 tidak masuk konteks reviewer.

Tujuan awal tidak diganti oleh pesan pendek seperti “coba lagi”. Reviewer menilai sendiri apakah tindakan diperlukan dan proporsional. Contoh: permintaan merapikan UI serta mengujinya di browser dapat mengizinkan server lokal setelah command, script, lokasi yang dilayani, dan jaringan diperiksa. Ini bukan whitelist npm/npx atau bypass shell.

Snapshot runtime membawa sessionId, contextId, revision, currentRequest, history, interventions, dan observations melalui konfigurasi dispatcher, bukan argumen yang dikarang model. POST /api/tools/approval/context memperbarui intervensi segera dan membatalkan izin yang belum dieksekusi. Panggilan lama ditolak setelah revisi pengguna berubah. Evaluasi terikat hash konteks, bukti, workspace, target, izin terkini, serta cuplikan script; perubahan script sebelum eksekusi memerlukan evaluasi baru. Context ID Minibot mengarah ke pekerjaan Mark asal dan tidak mengambil sesi lain.

Respons evaluasi mempertahankan status, denied, needsApproval, source, reason, dan requestId, serta menambahkan verdict, reviewError, dan contextVersion. APPROVE/DENY/ESCALATE menyertakan alasan model yang telah disamarkan. Hasil teknis tidak valid/gagal mempunyai verdict null dan reviewError, tanpa mengarang alasan penolakan dari model. Endpoint eksekusi dan dispatcher mengembalikan objek approval dalam hasil tool sehingga alasan tersedia dalam Aktivitas serta konteks agen. Tiga DENY model berturut-turut tetap menjeda pekerjaan; ESCALATE/error teknis tidak dihitung sebagai penolakan model.

Konteks dibatasi 32.000 karakter, dengan permintaan aktif dan intervensi diprioritaskan, lalu percakapan terbaru dan cuplikan pengamatan. Cuplikan pengguna yang tidak utuh ditandai incomplete. Berkas pendukung dibatasi tiga berkas dengan cuplikan 16.000 karakter; payload total dibatasi 64.000 karakter. Ini batas konteks review, bukan batas pembacaan instruksi proyek AGENTS.md. Request/izin dalam memori tidak dipulihkan sebagai izin aktif setelah restart. Metadata snapshot penugasan memakai penyimpanan JSON Minibot yang sudah ikut backup.

### Pemeriksaan konteks reviewer

Uji menggunakan database dalam memori, proyek sementara, provider HTTP lokal, dan adapter Web simulasi. Mencakup riwayat chat pendek/enam giliran, intervensi, workflow asal, asal penugasan Minibot, pemisahan instruksi halaman, semua verdict, JSON ketat, respons terpotong/gagal, pembatalan, alasan ke hasil tool HTTP, redaksi rahasia, replay, bukti baru, dan invalidasi izin paralel. Tidak memakai akun provider pengguna atau menjalankan server proyek pengguna. Uji ini memeriksa kontrak dan kebijakan; keputusan model nyata tetap dapat bervariasi. Fixture dibersihkan setelah pemeriksaan.
