# Git bawaan Mark

Mark mengemas distribusi **MinGit 2.56.0.4 Windows x64 standar** dari Git for Windows, tanpa mengubah binary distribusinya. Versi, URL arsip, dan SHA-256 dikunci dalam `manifest.json`.

- Rilis dan arsip resmi: https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4
- Source Git pada tag yang sama: https://github.com/git-for-windows/git/tree/v2.56.0.windows.4
- Arsip source: https://github.com/git-for-windows/git/archive/refs/tags/v2.56.0.windows.4.tar.gz

Jalankan `npm run prepare:git` saat menyiapkan development/rilis. Script memverifikasi checksum, mengekstrak seluruh distribusi ke `win32-x64/`, lalu memeriksa versi executable. Direktori hasil tidak disimpan dalam Git source Mark, tetapi masuk paket npm dan portabel. Lifecycle `prepack` dan `prepublishOnly` memastikan persiapan dilakukan sebelum distribusi.

Distribusi menyertakan `win32-x64/LICENSE.txt`, lisensi komponen pada direktori `usr/share/licenses` serta `ucrt64/share/licenses`, dan pemberitahuan komponen pada distribusi aslinya. Semua berkas tersebut harus dipertahankan dalam paket. Lisensi Mark tidak menggantikan lisensi komponen Git for Windows.

Penggunaan Mark yang sudah terpasang tidak mengunduh atau menginstal MinGit. Runtime menggunakan executable absolut dan menambahkan direktorinya hanya pada PATH proses terminal Mark. PATH Windows tidak diubah dan tidak ada fallback tersembunyi ke Git sistem.
