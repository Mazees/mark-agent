export const faqs = [
  {
    q: "Apakah Mark membutuhkan koneksi internet?",
    a: "Tidak selalu! Jika Anda mengatur AI Provider ke LM Studio (Offline), sebagian besar fungsi Mark bisa berjalan tanpa internet secara lokal. Namun, fitur Voice (Speech-to-Text), Web Search (mencari di Google), dan perangkum YouTube tetap membutuhkan koneksi internet."
  },
  {
    q: "Bagaimana cara kerja sistem memori Mark?",
    a: "Mark tidak mengingat percakapan sekadar dari kata kunci yang sama persis. Mark mengubah informasi penting menjadi 'konsep makna'. Jadi saat Anda bertanya, Mark akan langsung mencari ingatan yang paling nyambung maknanya dengan obrolan saat itu."
  },
  {
    q: "Mark tiba-tiba mengajak bicara saat saya sedang diam. Kenapa?",
    a: "Itu adalah hasil kerja Awareness Engine. Mark secara berkala memantau aktivitas Anda di laptop (misal: Anda sedang buka Youtube, atau memutar musik). Jika Anda ingin privasi penuh dan ingin Mark diam saja, matikan toggle Awareness Engine di halaman Pengaturan."
  },
  {
    q: "Apa arti perubahan warna bola cahaya (Orb) Mark di layar?",
    a: "Warna tersebut menunjukkan 1 dari 9 Emosi yang sedang dirasakan Mark. Misalnya kuning keemasan untuk senang, merah untuk kesal, atau kelabu untuk bosan. Emosi ini akan berubah secara alami tergantung cara Anda memperlakukannya tiap hari."
  },
  {
    q: "Bagaimana kalau Mark tiba-tiba mengotak-atik sistem penting di laptop saya?",
    a: "Tidak akan terjadi tanpa izin Anda! Alat-alat berisiko (seperti menghapus file atau menjalankan terminal PC) WAJIB menunggu persetujuan (Acc) dari Anda melalui klik tombol sebelum dijalankan. Jika Anda menolak, Mark tidak akan memaksa."
  },
  {
    q: "Mark macet dan terus menerus error saat mencoba sesuatu. Apa yang harus saya lakukan?",
    a: "Jika Mark terjebak kebingungan memecahkan sebuah error panjang, Anda bisa langsung menghentikan proses berpikirnya dengan mengklik tombol STOP (Kotak Merah) di dekat area tempat Anda mengetik chat."
  },
  {
    q: "Bagaimana cara saya ngobrol pakai suara sama Mark?",
    a: "Cukup pakai mikrofon Anda! Mark otomatis bisa mendeteksi saat Anda mulai berbicara dan kapan Anda selesai ngomong, lalu dia akan langsung membalas pakai suara."
  },
  {
    q: "Apakah Mark bisa menyetel lagu?",
    a: "Ya! Anda bisa bilang, 'Putarkan lagu Nadin Amizah'. Mark otomatis mencari dan memutar lagunya secara tersembunyi di latar belakang tanpa Anda harus repot buka aplikasi musik visual."
  },
  {
    q: "Mark bisa dihubungi lewat Telegram?",
    a: "Sangat bisa! Mark punya fitur bot Telegram khusus. Cukup masukkan API Token dari @BotFather dan Telegram User ID kamu di menu Pengaturan. Mark bisa mendownload lagu YouTube lalu dikirim ke Telegram Anda sebagai MP3 atau mengirimkan screenshot PC."
  },
  {
    q: "Apakah Mark bisa membantu saya ngoding dan ngecek file kerjaan di laptop?",
    a: "Tentu. Mark punya fitur khusus untuk menjelajahi dan membaca ratusan file kerjaan dalam folder Anda secara mandiri, sangat cocok dijadikan asisten ngoding pribadi."
  },
  {
    q: "Bagaimana cara mengubah otak pintar (AI Provider) Mark?",
    a: "Buka menu Configuration. Di sana Anda bisa memilih antara Gemini (Gratis tanpa API Key), LM Studio (Offline lokal), atau Custom API (OpenAI-Compatible Endpoint). Pilih model dari dropdown yang tersedia."
  },
  {
    q: "Kenapa balasan Mark kadang sangat lambat?",
    a: "Jika Anda pakai mode Offline (LM Studio), kecepatan mikir Mark 100% bergantung pada kekuatan prosesor (CPU) dan VGA laptop Anda. Semakin besar memori otak (model AI) yang dipakai, semakin berat kerja laptopnya."
  },
  {
    q: "Untuk apa Groq API Key di pengaturan?",
    a: "Groq API Key digunakan khusus untuk fitur Speech-to-Text (Voice STT via Whisper), sehingga Mark dapat mendengarkan ucapan suara Anda dari mikrofon secara cepat dan akurat."
  },
  {
    q: "Bisakah saya menghapus ingatan Mark tentang saya?",
    a: "Bisa. Ingatan disimpan aman di database lokal laptop Anda. Anda bisa menyuruh Mark 'Lupakan tentang hal itu', atau Anda bisa menghapusnya manual lewat menu kelola memori."
  },
  {
    q: "Apakah riwayat curhat saya ke Mark dikirim ke internet?",
    a: "TIDAK SAMA SEKALI. Seluruh riwayat obrolan, ingatan, dan pengaturan tersimpan murni secara rahasia di dalam hard disk Anda. Tidak ada sekecil apapun data yang dicolong ke server pusat aplikasi."
  },
  {
    q: "Apakah Mark bisa melacak lokasi fisik saya di dunia nyata?",
    a: "Tidak bisa melacak koordinat GPS. Namun jika Anda menyuruh Mark memakai kamera laptop (camera-look) atau melihat layar (analyze-screen), Mark dapat melihat sebatas apa yang terlihat di monitor atau ruangan Anda."
  },
  {
    q: "Bagaimana cara stop musik latar yang tadi dinyalakan Mark?",
    a: "Cukup ketik 'Mark, stop musiknya' atau 'pause musik'. Mark otomatis akan langsung menghentikan lagu tersebut di latar belakang."
  },
  {
    q: "Apakah video YouTube durasi panjang bisa dirangkum semua sama Mark?",
    a: "Bisa, asalkan video tersebut punya teks *subtitle/transkrip* bawaan. Jika durasinya berjam-jam, Mark akan memotong-motongnya perlahan untuk dibaca dan dirangkum secara mandiri."
  },
  {
    q: "Siapa saja yang bisa mengakses bot Telegram Mark saya?",
    a: "Hanya user yang ID Telegram-nya terdaftar di menu Pengaturan (Telegram Admin User IDs). Orang lain yang mencoba chat ke bot akan ditolak otomatis."
  },
  {
    q: "Bagaimana cara mendapatkan Telegram Bot Token?",
    a: "Buka aplikasi Telegram, cari akun resmi @BotFather, ketik /newbot, ikuti petunjuk pembuatan nama bot, lalu copy API Token yang diberikan ke halaman Configuration di Mark."
  },
  {
    q: "Kok Mark kadang bisa tiba-tiba nanya 'Lagi sibuk ngerjain dokumen ya?'",
    a: "Itu berkat Awareness Engine! Fitur ini diam-diam ngecek judul jendela aplikasi apa yang lagi kebuka paling depan di layar laptop Anda (misal lagi buka MS Word atau Game), jadi Mark ngerasa lebih peka."
  },
  {
    q: "Apa maksudnya kalau warna Mark berubah jadi abu-abu pucat?",
    a: "Abu-abu itu emosi kebosanan. Ini wajar kalau Anda udah lama banget nyuekin dia atau interaksi Anda jawabnya cuma 'oke', 'sip', tanpa ada obrolan bermakna."
  },
  {
    q: "Apakah Mark jago bikin aplikasi utuh dari nol?",
    a: "Bisa banget! Mark bisa ngetik kode sendiri, bikin folder sendiri, dan ngetes aplikasinya lewat terminal laptop Anda. Tapi, Anda tetap harus mandorin ngasih instruksi yang jelas tahap demi tahap."
  },
  {
    q: "Kenapa pas disuruh, Mark kadang cuma diam 'Berpikir' agak lama?",
    a: "Itu namanya Agentic Planning. Daripada langsung asal jawab, Mark lagi asik nyusun langkah-langkah di kepalanya, makai beberapa alat, ngecek hasilnya bener apa salah, baru ngasih tau Anda kesimpulan akhirnya."
  },
  {
    q: "Bisakah Mark disuruh buka Instagram lalu balesin DM mantan saya?",
    a: "Prakteknya susah karena website modern punya sistem keamanan tebal (seperti minta konfirmasi login/captcha). Biasanya Mark bakal nyerah dan nyuruh Anda bantu login manual dulu di layar pop-up nya."
  },
  {
    q: "Apakah Mark bisa mendownload file dari internet ke laptop saya?",
    a: "Bisa, asalkan Anda ngasih izin (klik OK) waktu notifikasi keamanan muncul untuk mengunduh skrip dari internet."
  },
  {
    q: "Bisa panggil Mark saat saya lagi seru-serunya main game full-screen?",
    a: "Bisa! Meskipun wujud Mark mungkin ketutupan game, kalau Anda pakai fitur mikrofon (Voice Chat), teriak aja manggil namanya dan Mark bakal ngebales pakai suara."
  },
  {
    q: "Bikin baterai laptop boros dan cepat panas nggak sih?",
    a: "Kalau Anda atur otak AI-nya pakai mode Offline (LM Studio) pas nggak di-cas, JELAS IYA. Mesin AI lokal itu kerja rodi. Tapi kalau pakai sambungan online (Groq), dampaknya enteng banget buat laptop."
  },
  {
    q: "Bagaimana caranya bikin fitur atau kemampuan baru buat Mark?",
    a: "Ke menu Plugins > klik Buat Plugin Baru. Isi nama dan apa gunanya. Lalu ketik instruksi script sederhananya. Habis di-save, Mark otomatis jadi makin pinter dan ngerti pakai kemampuan baru itu."
  },
  {
    q: "Apakah fitur Plugin tambahan bisa ambil bahan dari luar?",
    a: "Bisa! Kalau butuh tambahan paket dari internet (NPM), cukup ketik namanya di kolom yang disediain. Nanti Mark otomatis download perlengkapannya sendiri sebelum pakai fiturnya."
  },
  {
    q: "Berapa banyak ekstensi (Plugin) yang bisa saya tambahkan ke Mark?",
    a: "Anda bisa membuat sebanyak apa pun yang Anda butuhkan! Mark cukup cerdas untuk menyortir dan hanya menggunakan plugin yang paling nyambung dengan perintah Anda saat itu. Jadi meski Anda punya puluhan plugin, pikiran Mark tidak akan terbebani apalagi bikin laptop nge-lag."
  },
  {
    q: "Mark kadang gagal klik tombol di dalam website, kenapa ya?",
    a: "Beberapa website dibikin dengan desain animasi rumit atau elemen yang tersembunyi. Kalau Mark bingung nggak nemu tombolnya, dia bakal baca ulang layarnya atau ujung-ujungnya minta tolong Anda."
  },
  {
    q: "Apakah Mark ngintipin isi email pribadi saya diam-diam?",
    a: "Jelas TIDAK. Mark cuma tahu hal yang Anda kasih tahu, file kerjaan yang Anda perbolehkan dia baca, atau sebatas apa yang lagi tampil di layar saat itu. Mark nggak punya sihir buat ngebobol password email."
  },
  {
    q: "Apakah aplikasi Mark ini gratis selamanya?",
    a: "Aplikasi Mark 100% gratis buat pribadi. Tapi kalau Anda milih pakai otak online pihak ketiga (seperti API dari Groq), nah itu ngikutin aturan dari pihak sananya, apakah masih gratis atau ada limit kuotanya."
  },
  {
    q: "Bisa ganti suara robot ngomongnya Mark?",
    a: "Suara bawaannya sudah cukup natural (dialek Indonesia). Buat sekarang fitur gonta-ganti suara belum nongol di tombol sederhana, tapi bisa diakalin lewat bongkar file pengaturannya."
  },
  {
    q: "Kenapa kalau Mark ngomong kadang suaranya patah-patah putus?",
    a: "Itu efek internet lagi ngos-ngosan nyedot data suaranya, atau bisa juga karena laptop Anda lagi berat banget mikir proses AI sehingga audio-nya ikutan macet-macet."
  },
  {
    q: "Bisakah saya mengubah sifat asli Mark jadi manja atau agresif?",
    a: "Kerangka sifat aslinya udah dipatenkan biar Mark tetep bisa kerja bener. Tapi sapaan dan nada bicaranya itu berevolusi ngikutin Anda. Kalau tiap hari Anda ramah banget, lama-lama gaya bicara dia ikutan jadi manis."
  },
  {
    q: "Katakanlah Mark bikin error codingan saya, apa dia mau belajar?",
    a: "Banget! Kalau dia eksekusi perintah terus dapet balasan error panjang berwarna merah, Mark sadar dia salah, nyoba perbaikin, dan kalau udah sukses, dia bakal nginget 'solusi fix' itu selamanya di otaknya."
  },
  {
    q: "Aku udah hapus ingatan Mark di memori, kok dia di chat ini masih inget?",
    a: "Mark punya dua ingatan: 'Ingatan Obrolan Aktif' (pesan yang baru aja diketik) dan 'Ingatan Jangka Panjang' (database). Ngehapus database nggak otomatis ngehapus tulisan yang masih nempel nangkring di atas layar chat Anda."
  },
  {
    q: "Cara ngelihat jaringan urat nadi otaknya Mark pas mikir?",
    a: "Di beberapa versi tampilan (kalau nggak disembunyiin), bakal kelihatan garis-garis nyala muter di wujud Orb Mark, itu menandakan sel otak neural-nya lagi sibuk ngeproses mikir keras."
  },
  {
    q: "Apa bedanya Mark sama Siri di iPhone atau Google Assistant?",
    a: "Siri itu kaku, cuma ngerjain 1 tugas (nyalain alarm) lalu tidur. Mark itu 'Agen Mandiri'. Kasih 1 tugas sulit (misal: 'Bikin kalkulator web'), Mark bakal mandiri ngetik, ngetes, dan kerja sendiri ngerampunginnya sambil Anda tinggal ngopi."
  },
  {
    q: "Kenapa laptop saya butuh RAM gede banget buat jalanin mode Offline?",
    a: "Otak AI (Large Language Models) itu ibarat buku ensiklopedia raksasa yang harus dibuka semua halamannya sekaligus biar otaknya bisa jalan. Jadi minimal banget butuh sisa RAM 8GB di laptop biar jalan mulus."
  },
  {
    q: "Saya biasanya pakai aplikasi Ollama, bisa nyambung ke Mark?",
    a: "Sangat bisa! Asalkan Ollama di laptop Anda sudah jalan, Anda tinggal masukin alamat settingan (URL) lokal Ollama-nya ke kolom penyedia AI di halaman pengaturan Mark."
  },
  {
    q: "Kenapa tiba-tiba Mark bertingkah amnesia nanya 'Aku siapa?' ke diri sendiri?",
    a: "Itu namanya efek 'Halusinasi AI'. Biasanya karena obrolan kalian udah kelewat panjang banget bikin ingatan pendeknya kepenuhan dan mulai pikun sesaat. Paling sering kejadian kalau pakai otak AI lokal yang speknya pas-pasan."
  },
  {
    q: "Apa itu Aturan Etika (Proactive Proposal Boundary) di Mark?",
    a: "Ini biar Mark peka sikon (situasi dan kondisi). Kalau Mark tahu Anda lagi repot (buka software berat, banyak meeting), dia bakal sadar diri nahan mulut biar nggak ganggu. Kalau Anda lagi gabut buka sosmed, baru dia berani ngoceh ngajak ngobrol."
  },
  {
    q: "Biar Mark nggak rese tiba-tiba nyela pas saya ada meeting kampus gimana?",
    a: "Paling gampang: matikan saklar Awareness Engine sebentar. Atau simpelnya ketik/omongin aja 'Mark, aku lagi meeting, diem ya'. Nanti dia nyatet pesen itu biar nggak ganggu."
  },
  {
    q: "Kenapa fitur Mark jepret layar (Screenshot-to-WA) cuma aktif pas Mark dihubungi dari HP?",
    a: "Fitur jepret itu emang sengaja dirancang buat kontrol jarak jauh. Jadi pas Anda lagi pergi keluar rumah dan chat bot Mark dari HP WA, Anda bisa nyuruh dia motoin layar laptop di rumah Anda buat ngecek kerjaan yang ditinggal."
  },
  {
    q: "Bisakah Mark diajak mabar main game bareng?",
    a: "Kalau gamenya model tebak teks kata, dia sangat pinter. Tapi kalau game aksi yang butuh kecepatan gerakan (FPS real-time), kemampuan lihat mata Mark belum bisa gerak refleks secepat atlet e-sport (masih ada jeda per detik)."
  },
  {
    q: "Apakah Mark diem-diem bisa narik uang atau buka M-Banking saya?",
    a: "Sama sekali nggak bisa. Mark ini asisten jujur yang cuma bisa meraba barang yang ada di folder kerjaannya, atau ngecek sesuatu yang Anda suruh tayangin terang-terangan di layar."
  },
  {
    q: "Apa visi jangka panjang diciptakannya Mark?",
    a: "Menciptakan asisten yang mengerti Anda lebih dari siapa pun, dan mampu menjadi sahabat sekaligus rekan kerja virtual seumur hidup."
  }
];
