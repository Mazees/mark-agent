export const faqs = [
  {
    q: 'Apakah semua fitur Mark bisa digunakan tanpa internet?',
    a: 'Tidak. Model lokal dapat memproses permintaan di komputer, tetapi pencarian web, integrasi akun, YouTube, dan layanan suara tertentu tetap memerlukan jaringan. Periksa kebutuhan fitur yang sedang digunakan.'
  },
  {
    q: 'Apakah percakapan selalu berada di komputer saya?',
    a: 'Penyimpanan utamanya lokal. Jika memakai provider AI online, konteks yang diperlukan untuk menjawab dikirim ke provider tersebut. Integrasi Google, Telegram, layanan suara, dan web juga melibatkan layanan eksternal.'
  },
  {
    q: 'Kenapa endpoint Custom API ditolak?',
    a: 'Isi URL HTTP atau HTTPS lengkap yang diakhiri dengan /chat/completions, bukan hanya alamat server atau /v1. Cocokkan ID model dan API key dengan server yang Anda gunakan, lalu Simpan.'
  },
  {
    q: 'Kenapa jawaban lambat atau proses tidak selesai?',
    a: 'Periksa provider AI, ukuran model lokal, koneksi, serta aktivitas tool terakhir. Tugas yang memakai banyak tool membutuhkan waktu lebih panjang. Hentikan proses jika terus mengulang, lalu kirim instruksi yang lebih terarah.'
  },
  {
    q: 'Bagaimana menghentikan pekerjaan Mark?',
    a: 'Gunakan tombol penghentian pada area pesan atau Hentikan pada detail Minibot. Untuk otomasi desktop, tersedia penghentian darurat Ctrl+Shift+S. Aksi yang sudah dilakukan tidak otomatis diurungkan.'
  },
  {
    q: 'Mengapa mikrofon atau kata panggilan tidak bekerja?',
    a: 'Gunakan browser yang mendukung Web Speech API, periksa izin mikrofon dan perangkat utama Windows, serta bahasa input pada Pengaturan > Suara. Periksa koneksi jika layanan pengenalan suara memerlukannya.'
  },
  {
    q: 'Mengapa kamera tidak muncul atau tidak dapat diakses?',
    a: 'Buka Pengaturan > Kamera, mulai pratinjau, dan berikan izin melalui browser. Perbarui daftar perangkat setelah izin diberikan. Pastikan kamera tidak sedang dikunci aplikasi lain. Pratinjau berhenti saat Anda berpindah bagian.'
  },
  {
    q: 'Mengapa screenshot atau gambar tidak dapat dianalisis?',
    a: 'Pastikan lampiran berhasil dimuat dan provider mendukung input gambar. Jalur Gemini Web saat ini tidak mendukung input gambar. Gunakan model vision yang sesuai atau berikan teks yang perlu dianalisis.'
  },
  {
    q: 'Bagaimana membuat Mark tidak menyapa sendiri?',
    a: 'Matikan Awareness Engine di Pengaturan > Perilaku, lalu Simpan. Chat biasa tetap dapat digunakan. Izin kamera dan mikrofon dikelola terpisah.'
  },
  {
    q: 'Apa arti ekspresi dan status avatar?',
    a: 'Status menunjukkan keadaan seperti mendengarkan, bekerja, berbicara, atau memutar musik. Mood dan sifat relasi dipakai untuk menyesuaikan ekspresi dan gaya jawaban; keduanya bukan indikator keberhasilan pekerjaan.'
  },
  {
    q: 'Mengapa Mark masih mengingat sesuatu setelah memori dihapus?',
    a: 'Informasi yang sama mungkin masih ada pada percakapan aktif, arsip, atau berkas. Menghapus satu memori tidak sekaligus menghapus semua sumber informasi itu.'
  },
  {
    q: 'Mengapa Main Thread tidak bisa dipindah ke folder lain?',
    a: 'Main Thread memakai Documents/Mark Workspace sebagai folder umum. Buat sesi workspace lain jika ingin bekerja pada folder proyek tertentu. Folder sesi yang sedang berjalan tidak dapat diganti.'
  },
  {
    q: 'Apa perbedaan browser bawaan dan Chrome Bridge?',
    a: 'Browser bawaan berjalan dalam panel Browser dengan sesi Mark. Chrome Bridge memakai satu tab pada Chrome pribadi yang dipilih melalui ekstensi Mark Agent Bridge, sehingga dapat memakai sesi login yang sudah aktif di tab itu.'
  },
  {
    q: 'Mengapa Chrome Bridge terpasang tetapi belum terhubung?',
    a: 'Pemasangan di Mark menyiapkan engine dan folder ekstensi. Anda masih perlu memuat ekstensi melalui Developer mode > Load unpacked di Chrome, lalu memilih Hubungkan tab ini pada popup. Periksa juga apakah koneksi sedang dijeda.'
  },
  {
    q: 'Apakah ekstensi Mark Agent Bridge dipasang otomatis?',
    a: 'Versi ini menggunakan Load unpacked. Tombol Install pada Mark menyiapkan berkas, sedangkan pemuatan ekstensi dilakukan melalui pengelola ekstensi Chrome. Setelah pembaruan paket, muat ulang ekstensi di Chrome.'
  },
  {
    q: 'Mengapa chrome-use terlihat di Plugin Hub tetapi tidak dapat diedit?',
    a: 'Engine chrome-use dikelola oleh add-on Chrome Bridge dan ditandai editable: false. Tool dan penandaan tetap dapat dipakai. Gunakan detail add-on untuk mengelola pemasangan dan koneksinya.'
  },
  {
    q: 'Mengapa dialog izin kadang tidak muncul?',
    a: 'Sesi mungkin memakai mode otomatis atau sudah memiliki izin untuk sesi maupun izin permanen yang cocok. Mekanisme persetujuan juga tidak diterapkan sama pada setiap jalur tool. Periksa mode sesi dan Pengaturan > Izin akses.'
  },
  {
    q: 'Apa bedanya plugin, User Skills, dan skill dipelajari?',
    a: 'Plugin menambah tool eksekusi. User Skills berisi instruksi Markdown yang dipilih melalui slash command. Skill dipelajari adalah prosedur yang disimpan Mark dan ditinjau melalui Neural Core.'
  },
  {
    q: 'Mengapa Minibot gagal atau berhenti?',
    a: 'Mark meninjau kendala teknis secara otomatis. Permintaan yang memerlukan Anda muncul di Koordinasi Minibots pada chat asal, sehingga tidak perlu membuka agent satu per satu. Detail agen tetap menyediakan status, akses tool, dan riwayat kendala. Periksa provider dan instruksi tugas. Pilih penugasan untuk memeriksa kendalanya. Lanjutkan pekerjaan setelah meninjau checkpoint; gunakan Coba lagi untuk pekerjaan gagal atau dibatalkan. Anda dapat mengirim pesan saat agent aktif atau membuat penugasan baru yang masuk antrean. Menutup UI tidak menghentikan server; mematikan server membuat pekerjaan menunggu peninjauan.'
  },
  {
    q: 'Apakah workflow langsung berjalan kembali setelah Mark dimulai ulang?',
    a: 'Workflow yang terputus dijeda dan checkpoint tetap tersimpan. Buka sesi asal dan pilih Lanjutkan pada kartunya. Mark memeriksa hasil aksi terakhir yang belum diketahui sebelum meneruskan. Laporan Minibot melanjutkan workflow terkait saat Mark siap; workflow yang sudah dihentikan tidak diaktifkan lagi oleh laporan terlambat.'
  },
  {
    q: 'Mengapa Google Workspace gagal meski statusnya terhubung?',
    a: 'Periksa API yang diaktifkan, izin OAuth, akun yang dipilih, dan kebijakan organisasi. Uji dengan satu aksi baca. Jangan mengirim email atau membuat event hanya untuk menguji koneksi.'
  },
  {
    q: 'Mengapa bot Telegram tidak merespons?',
    a: 'Periksa status pada Add-ons > Telegram, token bot, konfigurasi ID admin, jaringan, serta apakah Mark masih berjalan. Halaman Log bot membantu memeriksa pesan yang diterima dan dikirim.'
  },
  {
    q: 'Mengapa video YouTube tidak dapat dirangkum atau musik tidak berjalan?',
    a: 'Transkrip mungkin tidak tersedia atau layanan tidak dapat diakses. Periksa koneksi, URL, ketersediaan video, serta status pemutar. Jika transkrip gagal, berikan teks sendiri atau gunakan sumber lain.'
  },
  {
    q: 'Apakah reset juga menghapus proyek dan plugin di disk?',
    a: 'Reset pada Neural Core menghapus data AI yang tercantum dalam dialog dan mempertahankan konfigurasi sistem. Itu bukan perintah untuk menghapus seluruh folder workspace, paket plugin, atau berkas pribadi. Buat cadangan sebelum melakukan reset.'
  }
]
