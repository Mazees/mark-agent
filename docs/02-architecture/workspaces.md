# Workspace percakapan

Chat Studio mengelompokkan sesi berdasarkan kolom `sessions.workspace_root` yang sudah ada. Tidak ada tabel workspace. Nama grup berasal dari nama folder, sedangkan identitas grup menggunakan path yang dibandingkan tanpa membedakan kapitalisasi, separator Windows, atau separator terakhir. Path asli tetap disimpan untuk eksekusi.

## Percakapan Umum

Main Thread selalu dipin paling atas dan memakai `Documents/Mark Workspace` milik pengguna yang menjalankan server. Sesi tanpa folder khusus dan sesi yang menunjuk folder default masuk Percakapan Umum. Root efektif diteruskan secara eksplisit ke prompt, native tools, dan pencarian file; konfigurasi workspace global tidak menggantikan folder sesi umum.

Folder Main Thread tidak dapat diganti. Pembacaan sesi melalui API mengembalikan folder default meskipun backup lama menyimpan lokasi lain. Penulisan folder berbeda melalui API sesi ditolak. Backup tetap mempertahankan data mentah lama sampai sesi tersebut disimpan kembali; tidak ada migrasi atau penghapusan data.

## Sidebar dan editor sesi

- Tambah Workspace memilih folder lalu langsung membuat satu percakapan kosong. Pembatalan tidak membuat sesi. Memilih folder yang sama menambah percakapan ke grup yang sudah ada.
- Percakapan Baru membuat sesi umum; tombol tambah dalam grup mewariskan folder grup.
- Ikon pengaturan terlihat ketika baris sesi di-hover atau mendapat fokus keyboard. Editor menyimpan judul dan folder sekaligus setelah pengguna menekan Simpan.
- Ubah workspace menawarkan grup yang sudah tersedia, Percakapan Umum, dan Tambah folder. Tambah folder dalam editor memindahkan sesi yang diedit setelah Simpan; tidak membuat sesi tambahan.
- Workspace tidak dapat diganti selama sesi berjalan. Main Thread hanya menampilkan informasi folder.
- Konfirmasi hapus mengganti footer editor menjadi satu pasangan Batal/Hapus. Hanya sesi yang dihapus; folder dan berkas tetap ada. Grup hilang ketika sesi terakhirnya dihapus.

## API

`GET /api/workspace/info` mengembalikan `{ success: true, data: { defaultWorkspaceRoot } }`. Bridge menyimpan metadata ini di cache; kegagalan dapat dicoba kembali.

`PATCH /api/sessions/:id` menerima `title` dan/atau `workspaceRoot` (`null` untuk folder umum). Pembaruan memakai satu operasi SQL terhadap metadata sehingga riwayat `data` tidak dikirim atau ditimpa. Respons mengembalikan metadata sesi. Sesi yang tidak ditemukan menghasilkan 404; judul/folder tidak valid dan perubahan folder Main Thread menghasilkan 400.

Sidebar tetap memakai endpoint ringkasan sesi, bukan mengambil riwayat seluruh percakapan. Restore memuat ulang ringkasan dan menerapkan kembali pengelompokan serta kebijakan Main Thread.
