# Runtime skill Mark

Katalog dan aktivasi skill memakai layanan `src/main/skills/skill-service.js` untuk Mark, slash command, dan Minibots.

- File pengguna: `~/.agents/skills/<folder>/SKILL.md`. Migrasi folder lama tetap tindakan manual melalui halaman Skills.
- Skill bawaan: definisi murni di `src/shared/agent/native-skills.js`; facade renderer hanya menambahkan ikon.
- Learned skills: instruksi dari SQLite `learned_skills`.

## Kontrak dan pemuatan

`GET /api/skills/catalog` mengembalikan metadata tanpa isi instruksi. `POST /api/skills/read` menerima `skill_id` atau `skill_name` dan opsional `relative_path`. Tool `read-skill` memakai layanan yang sama. `search-skills` mencari seluruh katalog, termasuk entri yang tidak tampil dalam katalog ringkas.

Hasil aktivasi berisi `id`, `name`, `source`, `content`, `contentHash`, `skillFile`, dan `basePath`. Dua lokasi terakhir null untuk instruksi tanpa file. Identitas file berasal dari lokasi kanonikal SKILL.md dan tetap sama ketika kontennya berubah. Folder symlink didukung; file referensi harus tetap berada di dalam akar skill setelah realpath.

Katalog awal dibatasi oleh `skillCatalogTokenBudget` (default 2000 token). Entri yang tidak muat dilaporkan, bukan dimuat diam-diam. Isi SKILL.md dibaca utuh ketika aktif. Referensi dibaca berdasarkan kebutuhan; script tidak dijalankan saat scanning atau aktivasi.

`agents/openai.yaml` mendukung metadata tampilan, daftar dependensi tool, serta `policy.allow_implicit_invocation`. False menuntut aktivasi eksplisit; frontmatter yang rusak juga menonaktifkan pemilihan otomatis dan ditampilkan sebagai peringatan. Pemilihan eksplisit tetap memungkinkan pengguna membuka instruksinya. Metadata allowed-tools adalah keterangan kompatibilitas, bukan penambahan izin.

## Chat dan checkpoint

InputBar mengirim teks pengguna dan skillRefs, tanpa menyisipkan dokumen skill ke teks pesan. Backend reader yang sama menyelesaikan referensi dari slash command dan read-skill. Nama bawaan yang telah dipakai sebagai command tetap dipertahankan. Nama lain yang ambigu memerlukan ID dari katalog.

Konteks aktif dilampirkan pada request model dengan file instruksi dan direktori dasarnya. File pendukung dihitung dari basePath; output tugas tetap menuju workspace pengguna. Kompaksi tidak boleh menghapus instruksi aktif: pembentuk konteks memasukkannya kembali sebelum request model. Versi konten dibaca ulang pada aktivasi berikutnya.

Riwayat sesi hanya menyimpan metadata skill yang dipakai, bukan salinan instruksi panjang. Workflow menyimpan metadata itu pada pesan kartunya; kelanjutan task membaca ulang ID yang terkait. Percakapan atau pekerjaan baru tidak otomatis menerima skill pekerjaan lain.

Minibot menerima skillRefs dari penugasan dan katalog yang sama. Metadata tersimpan pada JSON job, ikut pada backup/restore yang sudah ada. Executor memuat ulang instruksi sebelum request model, termasuk setelah kompaksi dan restart pekerjaan. Tool tetap dibatasi allowedTools serta approval runtime.

## Pemeriksaan penerimaan

Periksa kontrak file/bawaan/learned, alias nama folder, nama ambigu, beberapa skill, referensi relatif dan symlink, perubahan versi, instruksi eksplisit saja, katalog besar, pemulihan konteks, Minibot, serta serialisasi metadata. Uji browser memastikan penanda penggunaan dapat dibuka, path panjang tidak overflow, dan prompt asli tidak berisi dokumen skill. Fixture pengujian harus dihapus sesudah verifikasi.
