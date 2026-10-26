# Minibots

Halaman `/subagents` menampilkan daftar agen, pencarian nama/peran/tugas, dan filter status. Tampilan Topologi memperlihatkan hubungan Mark dengan seluruh agen, termasuk agen gagal atau dihentikan. Pilih agen untuk membuka `/subagents/:agentId`.

- **Aktivitas** memuat pesan sesuai urutan waktu, pemikiran yang dapat dibuka, serta input dan hasil setiap tool. Draf instruksi tetap tersimpan saat berpindah ke tab Detail agen. Pengguliran otomatis berhenti saat pengguna membaca riwayat di atas.
- **Detail agen** memuat tugas lengkap, hasil atau kendala eksekusi, sesi asal, waktu pembaruan, dan akses tool. Status `failed` ditampilkan sebagai **Gagal**, sedangkan `killed` sebagai **Dihentikan**.
- **Buat agen** membuka formulir nama, peran opsional, dan tugas. Pekerjaan langsung dimulai setelah agen dibuat. Nama yang sudah digunakan mengarah ke agen yang ada agar tidak mengaktifkan ulang tugas secara tidak sengaja.
- Instruksi baru dapat dikirim setelah eksekusi sebelumnya selesai. Tombol **Hentikan** membatalkan eksekusi melalui executor yang sudah ada. Meninggalkan halaman tidak membatalkan pekerjaan agen.
- Membersihkan riwayat dan menghapus agen memerlukan konfirmasi. Menghapus agen juga menghentikan eksekusi dan menghapus pesan-pesannya.

Komponen menggunakan tipografi, lebar konten, pencarian, dan tombol yang konsisten dengan Plugin Hub. Aktivitas menggunakan satu area percakapan dan input di bawahnya; detail tidak lagi menempati panel kanan permanen.

## Perbaikan pembacaan riwayat

`subagentStore.getMessages()` menggunakan `CollectionProxy` dari `api/db.js`. Metode `sortBy('timestamp')` menghasilkan query, sehingga perlu diakhiri dengan `.toArray()`. Mengembalikan query tersebut menyebabkan executor gagal pada `history.map()` sebelum menghubungi model AI, dan aktivitas menjadi kosong.

## Validasi

```powershell
node --test scripts/subagents-ui.test.mjs
npm run build:ui
npm run lint
```

Pengujian browser menggunakan komponen, store, proxy database, dan executor asli dengan API penyimpanan, model AI, serta tool simulasi. Tidak ada provider eksternal atau berkas pengguna yang diakses. Cakupannya meliputi riwayat terurut, instruksi → tool → observasi → hasil akhir, sesi browser agen, larangan tool orkestrasi rekursif, penghentian saat model menunggu, kegagalan provider, pembuatan/penghapusan, pencarian, filter, draf lintas tab, pembatalan dialog lewat keyboard, dan tata letak sempit.

Set `SUBAGENT_SCREENSHOT_DIR` untuk menyimpan pratinjau pengujian dan `CHROME_BRIDGE_TEST_BROWSER` untuk memakai executable Google Chrome lain.
