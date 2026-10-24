# Neural Core

Halaman `/neural-core` menggunakan lebar konten, tipografi, pencarian, dan tombol yang konsisten dengan Plugin Hub serta Sub-Agents.

- **Ringkasan** menjadi pintu masuk ke karakter, memori, skill yang dipelajari, dan buku harian. Jumlah data berasal dari penyimpanan Mark.
- **Karakter** menampilkan lima sifat, tingkatnya, jumlah evaluasi, serta alasan perubahan terakhir. Nilai nol tetap ditampilkan sebagai 0%, bukan diganti nilai netral.
- **Memori** menampilkan peta node secara default, dengan tombol **Peta** di kiri dan **Daftar** di kanan. Peta mempertahankan kelompok arsip menurut topik dan ingatan menurut tipe. Daftar dapat dicari dan difilter, sekaligus menyediakan alternatif navigasi melalui keyboard.
- **Skill dipelajari** berisi panduan hasil belajar Mark. Detail Markdown dan penghapusan tersedia melalui dialog.
- **Buku harian** menampilkan catatan terbaru terlebih dahulu, dengan dukungan waktu `created_at` dan `createdAt`.
- **Kelola data** memuat unduhan cadangan JSON, pemulihan database, dan reset. Pemulihan memerlukan konfirmasi; reset tetap memerlukan dua tahap dan teks `RESET MARK`.

Parameter tab lama `tri-lobe`, `emotional`, `synaptic`, dan `procedural` tetap diterima. Tab mengikuti URL sehingga tombol kembali/maju browser memperbarui bagian yang terlihat.

`neuralCoreData.js` membentuk data peta dengan `recordId` dan `kind` terpisah dari ID visual. Penghapusan memakai ID asli secara utuh, termasuk ID string yang mengandung tanda hubung. Skill lokal hanya ditampilkan sebagai informasi; pengelolaannya tetap melalui halaman Skills. Perubahan ini tidak mengubah format backup, endpoint, atau schema database.

## Pemeriksaan

```powershell
node --test scripts/neural-core-ui.test.mjs
npx eslint src/renderer/src/pages/NeuralCore.jsx src/renderer/src/components/neural-core scripts/neural-core-ui.test.mjs
npm run build:ui
npm run lint
```

Pengujian browser menggunakan komponen dan proxy database asli dengan API penyimpanan simulasi. Cakupannya meliputi tab lama dan navigasi browser, nilai karakter nol, pencarian/filter, ID penghapusan utuh, skill lokal yang tidak dapat dihapus melalui Neural Core, peta dan ukurannya, buku harian, keyboard pada dialog, unduhan cadangan, penolakan file JSON tidak valid, pembatalan pemulihan, kegagalan pemulihan, serta konfirmasi reset. Reset sungguhan tidak dijalankan. Proses perawatan memori disimulasikan agar tidak mengubah data atau memanggil model AI.

Set `NEURAL_SCREENSHOT_DIR` untuk menyimpan pratinjau dan `CHROME_BRIDGE_TEST_BROWSER` untuk memilih executable Chrome lain. Tidak ada database pengguna yang dibaca atau diubah oleh pengujian ini.
