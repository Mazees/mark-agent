# Personal dan Agent

Personal dan Agent berada dalam satu kerangka aplikasi. Header mode mengganti tampilan tanpa membuat ulang `ChatProvider`, listener suara, atau runtime pekerjaan. Personal memakai route `/`; Agent memakai `/chat`, dengan `?session=<id>` untuk membuka percakapan tertentu.

## Identitas dan riwayat

`src/shared/agent-mode.js` menentukan mode dari identitas sesi. Sesi `1`, termasuk bentuk lama `1.0`, adalah Personal. Sesi lain adalah Agent. Main Thread tetap menggunakan ID dan data lamanya; tidak ada pemindahan, penggabungan, atau penghapusan riwayat.

Sidebar Agent menyaring Main Thread sebelum pencarian dan pemilihan sesi. Agent memulihkan sesi terakhir yang masih tersedia, memilih sesi terbaru jika pilihan lama hilang, atau menampilkan ajakan membuat percakapan bila daftar kosong. Preferensi mode, pilihan sesi, dan keterbukaan panel disimpan pada `mark-interface` di browser pengguna. Ini adalah preferensi tampilan lokal, bukan perubahan skema sesi SQLite atau format backup.

Kedua tampilan tetap terpasang setelah dibuka. Tampilan tersembunyi memakai `hidden` dan `inert`, sehingga tidak menerima fokus atau input. Draf teks, referensi skill, dan lampiran dipisahkan per sesi melalui cache serta `sessionStorage`; pemulihannya tidak mengirim pesan otomatis. Posisi scroll dipertahankan selama tampilan hidup. Metadata tab workspace tetap memakai penyimpanan backend yang sudah ada.

## Personal

Home menempatkan avatar di kiri dan percakapan di kanan; layar sempit menempatkan avatar di atas. Percakapan memakai `ChatStudio` dalam varian Personal sehingga Markdown, workflow, persetujuan, laporan, dan kartu perubahan memakai komponen yang sama dengan Agent. Tampilan awal berisi giliran terbaru; Riwayat membuka pesan sebelumnya secara bertahap.

Riwayat dan Workspace berupa kontrol tanpa bar judul tambahan. Effort, izin, dan informasi konteks berada di Pengaturan sesi pada input. Workspace membuka browser, berkas, diff, dokumen, dan terminal milik sesi Personal. Tool Clusters, Live Response, ticker, sapaan tetap, serta label siaga dihapus. Pesan sapaan AI yang dihasilkan saat startup tetap disimpan sebagai pesan biasa dan tidak dibuat ulang saat mengganti mode.

Avatar menggunakan mood dan aktivitas sesi Personal. Audio input Agent tidak menggerakkan avatar. Pembacaan otomatis jawaban dibatasi pada Personal; tool suara yang diminta eksplisit tetap dapat digunakan pada Agent, dengan identitas sumber audio terpisah.

## Suara dan pekerjaan latar belakang

Wake word memakai callback aktivasi eksplisit: pilih Personal, tetapkan tujuan ucapan ke sesi `1`, lalu lanjutkan perekaman atau kirim perintah yang sudah dikenali. Mikrofon manual menangkap ID sesi ketika perekaman dimulai. Mengganti tampilan sebelum transkrip selesai tidak mengalihkan tujuan ucapan tersebut.

Indikator tab menunjukkan pekerjaan berjalan atau hasil baru pada mode lain. Permintaan izin tetap berada pada antrean bersama; UI menyediakan akses ke sesi asal. Membuka panel dari kartu berkas menyimpan permintaan beserta ID sesi sebelum melakukan navigasi, sehingga pemuatan sesi tidak menghilangkan permintaan tersebut. Event browser latar belakang tidak memaksa perpindahan mode atau membuat browser baru.

Hentikan dan intervensi menggunakan sesi yang ditampilkan. Pergantian tampilan tidak membatalkan pekerjaan, terminal, atau koneksi browser. Pemulihan tab Browser tidak melakukan navigasi otomatis.

## Prompt dan kontrak provider

`getCommunicationPrompt` menyusun gaya bahasa bersama. Personal menambahkan karakter, instruksi emosi, dan ekspresi avatar; Agent menggunakan instruksi kerja yang lebih singkat. Profil, preferensi, tool, dan kebijakan izin tetap tersedia pada kedua mode.

`responseContract` menghasilkan JSON untuk provider web dan tag kontrol untuk provider dengan tool calling. Mood diminta hanya untuk Personal. Sinyal `done`, `await_user`, `message`, dan pemanggilan tool tetap mengendalikan kelanjutan pekerjaan.

Backend `fetchAI` memeriksa identitas sesi asal, bukan tab yang sedang terlihat. Untuk Agent dan request pendukung, metadata mood dari riwayat asisten dibuang sebelum request, callback mood dinonaktifkan, dan mood dikeluarkan dari metadata respons. Parser tetap membaca riwayat lama serta mempertahankan sinyal kontrol. Peninjauan izin dan kompaksi tidak menerima persona Personal.

Minibot, kelanjutan workflow, dan peninjauan laporan menggunakan sesi induk yang sudah diteruskan runtime. Tidak ada pemindahan tugas antarsesi atau perubahan mesin suara pada tahap ini.
