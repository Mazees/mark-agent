# Pencarian memori dan manajemen konteks

## 1. Embedding lokal

Mark membuat embedding 384 dimensi dengan model `Xenova/paraphrase-multilingual-MiniLM-L12-v2` melalui Transformers.js. Pembuatan embedding mempertahankan pemotongan input, mean pooling, dan normalisasi yang sudah digunakan. Model disimpan di `~/.cache/mark-transformers/`. Setelah model tersedia di cache, pembuatan embedding berjalan secara lokal.

Backend memanaskan model di worker ketika Mark mulai. Chat dan Minibot dapat langsung berjalan. Selama model belum siap atau ekstensi SQLite tidak dapat dimuat, pencarian menggunakan kata kunci dan menandai hasilnya sebagai terbatas.

## 2. Pencarian hibrida dari SQLite

`memory-worker.js` membuka koneksi baca-saja ke `mark.db` dan memuat ekstensi Windows `sqlite-vec` 0.1.9. Jarak kosinus dihitung menggunakan nilai di kolom `vector TEXT` yang sudah ada. Vektor kosong, rusak, atau berbeda dimensi tetap dapat ditemukan lewat teks. Vektor valid lama tetap bisa digunakan. Koneksi tidak membuat indeks tambahan atau mengubah skema dan format backup.

Pencocokan teks mengutamakan frasa utuh, lalu pengenal seperti `package.json`, kemudian kecocokan token. Filter sumber, jenis memori, dan sesi diterapkan sebelum pemeringkatan. Setiap jalur mengambil hingga empat kali batas hasil. Mark menggabungkan keduanya dengan Reciprocal Rank Fusion (konstanta 60). Nilai `score` adalah kemiripan kosinus, atau `null` jika hasil hanya berasal dari kata kunci. Ambang kemiripan hanya berlaku pada jalur semantik.

Pencarian tetap memindai kandidat. Cache konversi JSON yang dibatasi ukurannya mengurangi penguraian ulang pada basis data yang sering dicari. Cache berada di worker dan dibersihkan saat reset atau restore. Jika data sangat besar, biaya pemindaian dan penguraian JSON tetap bertambah.

## 3. Persiapan jawaban

- Profile dan preference dibaca utuh melalui SQL tanpa mengambil vektornya. Worker mencari hingga tiga arsip (ambang 0,25) dan tiga pasangan percakapan (ambang 0,30).
- Konteks proyek, memori, dan metadata sesi mulai dimuat bersamaan. Penyusun prompt menggunakan hasil konteks proyek tersebut. Jika pencarian melampaui anggaran, Mark menggunakan konteks yang masih tersedia.
- Tool `memory-search` digunakan Mark dan Minibot melalui layanan yang sama. Formatnya `query || threshold || limit`, dengan default 0,5 dan lima hasil per sumber. Pencarian tersedia pada `POST /api/memory/search`, dan konteks awal pada `POST /api/memory/context`.
- Kesiapan worker, ekstensi, dan model tersedia pada `GET /api/memory/status`. `POST /api/memory/prepare` memulai ulang persiapan yang gagal.
- Penulisan teks baru segera tersedia untuk pencarian kata kunci. Backend menyimpan embedding di latar belakang jika isi yang tersimpan masih sama. Pasangan baru memakai ID giliran stabil serta ID sesi string.
- Catatan kinerja `mark:preparation` di Performance Timeline renderer berisi durasi persiapan sampai pengiriman ke gateway AI, waktu kompaksi, dan jumlah token. `mark:provider-wait` mencatat waktu dari pengiriman itu sampai keluaran pertama kembali, termasuk antrean gateway. Isinya berupa angka tanpa teks percakapan.

Tabel `documents` lama tetap tersedia untuk kompatibilitas backup. Tool `read-document` membaca berkas secara langsung.

## 4. Context Management Engine (`contextManager.js`)

Mark membedakan riwayat tersimpan dari konteks yang dikirim ke model. Kompaksi mengurangi konteks aktif melalui ringkasan dan cakupan pesan/hasil tool yang telah dirangkum; riwayat asli tetap tersimpan. Jalur sebelum giliran, di dalam loop, dan kompaksi manual memakai checkpoint sesi yang sama.

### Pemicu dan batas

- Kapasitas aplikasi saat ini `MAX_CONTEXT_TOKENS = 256000`. Ini batas internal Mark, bukan jaminan kapasitas setiap model atau server provider.
- Pemeriksaan sebelum giliran dan di dalam loop memakai ambang 90% (`GATEWAY_HYGIENE_THRESHOLD` dan `IN_LOOP_COMPACT_THRESHOLD`). Jumlah pesan saja tidak memicu kompaksi.
- Payload menghitung pesan, schema tool, dan reminder. Jika tetap terlalu besar setelah kompaksi, Mark menghentikan permintaan dengan penjelasan, bukan membuang hasil tool secara diam-diam.
- Token dihitung melalui metadata usage provider bila tersedia dan estimasi tokenizer lokal untuk pesan baru atau provider tanpa usage. Gambar menggunakan estimasi tersendiri.

### Ringkasan berbasis rekaman

Ringkasan menerima isi pesan serta rekaman `executionSteps`/`executedTools`, termasuk status dan hasilnya. Bagian tengah pesan panjang tidak lagi dibuang sebelum dikirim ke peringkas. Rekaman panjang dibagi menjadi beberapa bagian agar peringkas tetap menerima bukti yang tersedia.

Pemilihan bagian yang dipertahankan memakai anggaran token, bukan jumlah pesan tetap. Instruksi sistem dan permintaan pengguna terbaru dipertahankan; pasangan pemanggilan serta hasil tool tetap berada dalam satu kelompok. Ekor percakapan yang dipertahankan dibatasi agar ringkasan mempunyai ruang, dengan target akhir di bawah 75% kapasitas. Tujuan, batas pengguna, progres, kendala, keputusan, berkas relevan, dan langkah berikutnya menjadi bahan serah-terima. Jika instruksi wajib sendiri terlalu besar, operasi gagal dengan penjelasan tanpa mengirim request utama yang melampaui kapasitas.

Ringkasan adalah hasil model dan tetap dapat kehilangan detail; riwayat asli menjadi sumber pemeriksaan ulang. Hasil tool yang tidak tersimpan dinyatakan tidak diketahui, bukan dianggap sukses. Helper pruning lama masih diekspor, tetapi jalur utama Lead Agent tidak memakainya untuk menghapus bukti sebelum ringkasan.

Request ringkasan memakai `purpose: compaction` dan tidak memiliki batas durasi yang ditetapkan Mark. Penanda ini diteruskan melalui client, gateway, dan provider; batas frontend 300 detik serta batas inferensi backend dikecualikan khusus request ringkasan nonstream dengan `isSmallTask: true`. Transport OpenAI-compatible tidak memasang batas tunggu header/body untuk request tersebut, dan Gemini Web tidak memasang timer request compacting. Batas request biasa dan peninjau izin tetap berlaku. Gangguan jaringan atau penolakan dari provider tetap dapat menghentikan request dan dilaporkan sebagai kegagalan, bukan pembatalan pengguna.

Indikator berada paling bawah grup Proses, setelah narasi serta Aktivitas, tanpa mengikuti posisi banner dalam array pesan. Penantian menampilkan nomor bagian dan waktu berlalu setiap lima detik; status ini memperbarui aktivitas pekerjaan agar penantian yang masih berlangsung tidak dianggap sesi macet. Waktu dihitung ulang dari nol saat bagian baru dimulai. Bagian berikutnya hanya dimulai setelah respons ringkasan sebelumnya berhasil diterima; tidak ada timer 60 detik yang memajukan bagian secara otomatis. Kegagalan request menghasilkan `CONTEXT_COMPACTION_FAILED`. Stop tetap membatalkan request melalui signal induk, termasuk adapter yang tidak merespons pembatalan; interval progres dan listener dibersihkan ketika selesai.

Data preview dan gambar Base64 dalam rekaman tool diganti penanda gambar sebelum dikirim ke peringkas; teks instruksi, argumen, status, serta hasil tool tetap menjadi bahan ringkasan. Respons kosong, terpotong, atau lebih dari 8192 token ditolak. Adapter OpenAI-compatible mempertahankan penanda akhir provider dan mensyaratkan respons selesai untuk kompaksi. Hasil yang tidak mengecil atau tetap melebihi target tidak mengganti checkpoint aktif.

### Checkpoint persisten dan pemulihan

Tabel `session_compact` menyimpan ringkasan aktif, `checkpoint` berupa ID/hash pesan dan hasil tool, `pending` untuk progres bagian, serta `revision`. API `GET /api/sessions/:id/compaction` membaca status. Operasi `begin`, `part`, `discard`, dan `commit` menggunakan POST pada path tersebut dan transaksi SQLite dengan pemeriksaan revisi. Komit memverifikasi hash pesan sumber agar edit yang terjadi selama peringkasan tidak tertimpa ringkasan usang.

Setiap bagian yang selesai disimpan sebelum melanjutkan request berikutnya. Percobaan berikutnya dengan sumber, cakupan, dan konfigurasi model yang sama melanjutkan bagian tersisa. Sumber yang berubah membuat pekerjaan baru. Progres parsial belum menjadi konteks aktif; hanya komit lengkap yang mengaktifkan ringkasan. Kegagalan simpan dilaporkan sebagai kegagalan. Riwayat sesi tidak ditulis ulang oleh kompaksi, sehingga pesan/intervensi yang masuk selama request tetap ada.

Perakitan payload dan penghitung token menggunakan cakupan checkpoint yang sama. Rekaman yang sudah dirangkum tidak dimasukkan kembali setelah reload atau giliran baru; rekaman yang berubah hash dimuat kembali untuk diperiksa. Identitas hasil tool juga dipakai untuk mencegah log kumulatif yang sama masuk berulang. Metadata internal cakupan tidak dikirim ke provider. Backup/restore menyertakan checkpoint serta progres parsial, tetapi tidak memulai request secara otomatis. Ringkasan lama berbasis pointer tetap terbaca bila sumber pointer masih tersedia.

### Memori dan sesi provider

Profil (`profile`) dan preferensi (`preference`) tetap menjadi core memory otomatis. Arsip dan pasangan percakapan yang ditemukan melalui pencarian dipasang sebagai data historis. Rujukan pengguna dalam percakapan aktif mempunyai prioritas atas hasil pencarian riwayat.

Rotasi sesi DeepSeek Web terpisah dari kompaksi Mark. Adapter Web selalu mengirim konteks yang disiapkan caller, termasuk ringkasan jika sudah dikompaksi. Karena transport dapat membuat sesi baru saat rotasi atau retry, adapter tidak boleh hanya mengirim pesan setelah jawaban asisten terakhir.

---

## 5. Sumber Daya Terkait

- [Arsitektur Basis Data SQLite Terpusat](./state-and-database.md)
- [Pusat Orkestrasi ReAct Loop & Intent Routing](../03-agent-engine/react-loop.md)
- [Sistem Minibot Mandiri Minibots](../03-agent-engine/multi-agent-subagents.md)
