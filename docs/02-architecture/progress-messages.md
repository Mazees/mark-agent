# Pesan progres antar-loop

Respons native dapat membawa update progres opsional melalui atribut `message`:

```xml
<mark mood="focused" done="false" message="Data ratingnya sudah terkumpul. Aku cocokkan jumlah ulasan dan tautannya sebelum mengurutkan hasil." />
```

Provider web memakai properti JSON `message` yang dipetakan ke `meta.message`. Nilai boleh dihilangkan, kosong, atau `null`. Prompt mengarahkan model memberi 1–4 kalimat saat memulai pekerjaan panjang, menemukan hasil penting, menghadapi kendala, atau mengubah pendekatan. Update tidak wajib pada setiap loop. Jawaban akhir tetap berada di isi respons atau `answer`.

Parser shared menampung tag sampai seluruh atribut selesai diterima, termasuk pesan yang lebih panjang dari 160 karakter. Nilai atribut XML mendukung tanda kutip tunggal/ganda dan entity `&quot;`, `&apos;`, `&amp;`, `&lt;`, `&gt;`. Tag yang terputus tidak ditampilkan sebagai teks chat.

`useMarkPlan` menerbitkan progres begitu event metadata diterima, dengan fallback dari respons selesai. Setiap loop menggunakan ID progres tersendiri agar event streaming dan hasil akhir tidak menggandakan pesan. Pesan disimpan sebagai entri `narration` pada `executedTools`, mengikuti mekanisme penyimpanan riwayat yang sudah ada. Metadata tidak mengubah aturan `done` atau eksekusi tool.

Request pertama membawa pengingat pembuka yang bersifat kondisional untuk tugas beberapa langkah. Jika tiga tool telah berjalan sejak narasi terakhir atau ada tool yang gagal, request berikutnya meminta update berdasarkan observasi nyata. Pengingat hanya ditambahkan ke payload request saat dibutuhkan, tidak menumpuk di riwayat loop, dan ikut perhitungan token. Tidak ada request AI tambahan atau pembuatan progres dari penalaran internal. Giliran sistem, awareness, dan mode tanpa tool tidak menerima pengingat ini.

`splitProcessTimeline` memisahkan narasi dan kelompok tool menurut urutan aslinya. Chat aktif dan riwayat menampilkan narasi di luar accordion kelompok tool, tanpa memotong isinya. Respons lama tanpa `message` tetap mendukung narasi dari isi respons. Entri lama yang hanya berisi tag metadata disembunyikan tanpa mengubah data tersimpan.
