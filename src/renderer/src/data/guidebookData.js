export const guideCategories = [
  {
    id: 'start',
    title: 'Mulai menggunakan Mark'
  },
  {
    id: 'work',
    title: 'Pekerjaan dan otomasi'
  },
  {
    id: 'personal',
    title: 'Interaksi dan memori'
  },
  {
    id: 'extend',
    title: 'Add-ons dan ekstensi'
  },
  {
    id: 'manage',
    title: 'Pengaturan dan bantuan'
  }
]

export const guideArticles = [
  {
    id: 'overview',
    category: 'start',
    title: 'Mengenal Mark',
    summary:
      'Mark adalah asisten AI yang berjalan di komputer Anda untuk membantu percakapan, pengolahan informasi, dan pekerjaan yang memerlukan tindakan pada berkas, browser, atau aplikasi.',
    keywords: 'beranda avatar companion menu studio fitur kemampuan',
    sections: [
      {
        title: 'Apa yang dapat dilakukan Mark?',
        paragraphs: [
          'Mark menerima instruksi melalui percakapan, kemudian menggunakan model AI untuk memahami tujuan dan menentukan langkah yang diperlukan. Untuk pertanyaan biasa, Mark dapat langsung menyusun jawaban. Ketika pekerjaan membutuhkan akses ke berkas, situs, atau aplikasi, Mark menggunakan tool yang tersedia dan membaca hasilnya sebelum melanjutkan.',
          'Anda dapat meminta bantuan menulis, merangkum dokumen, mencari informasi, memperbaiki kode, atau mengoperasikan halaman web. Beberapa pekerjaan memerlukan layanan yang sudah dihubungkan, model yang sesuai, atau persetujuan tindakan. Karena itu, kemampuan Mark mengikuti konfigurasi dan akses yang tersedia pada komputer Anda.'
        ]
      },
      {
        title: 'Beranda dan Chat Studio',
        paragraphs: [
          'Beranda merupakan tempat untuk mulai berbicara dengan Mark. Anda dapat mengajukan pertanyaan, menyampaikan permintaan, dan melihat respons serta aktivitasnya dari halaman yang sama. Halaman ini juga menampilkan avatar dan kontrol percakapan untuk interaksi sehari-hari.',
          'Chat Studio menyediakan ruang kerja dengan daftar sesi, pilihan workspace, dan panel Browser. Gunakan sesi terpisah untuk membahas pekerjaan yang berbeda, misalnya riset dan pengembangan aplikasi. Dengan memilih folder proyek sebagai workspace, Anda memberi Mark konteks lokasi berkas yang akan dikerjakan.',
          'Kedua halaman menggunakan mesin AI dan penyimpanan Mark yang sama. Pilih Beranda untuk memulai interaksi dengan cepat, atau buka Chat Studio ketika Anda perlu mengelola percakapan dan mengikuti pekerjaan yang melibatkan proyek atau browser.'
        ],
        links: [
          {
            label: 'Buka Chat Studio',
            to: '/chat'
          }
        ]
      },
      {
        title: 'Sebelum mulai bekerja',
        paragraphs: [
          'Pilih provider AI dan model melalui Pengaturan, lalu uji dengan mengirim pertanyaan singkat. Setelah koneksi berhasil, coba pekerjaan sederhana seperti meminta ringkasan teks. Untuk pekerjaan berkas, pilih workspace dan jelaskan hasil yang ingin dibuat.',
          'Pencarian web, layanan akun, musik YouTube, dan provider online memerlukan internet. Analisis gambar memerlukan model yang mendukung vision. Periksa kembali hasil penting, terutama sebelum menerapkan perubahan atau menggunakannya sebagai dasar keputusan.'
        ]
      }
    ],
    related: ['getting-started', 'chat', 'tools', 'privacy']
  },
  {
    id: 'getting-started',
    category: 'start',
    title: 'Pengaturan awal dan provider AI',
    summary:
      'Provider AI adalah layanan atau server model yang digunakan Mark untuk memahami instruksi dan menyusun jawaban. Anda dapat memilih layanan web, model lokal, atau API yang sesuai dengan kebutuhan.',
    keywords: 'instalasi setup model custom API key localhost internet offline',
    sections: [
      {
        title: 'Menghubungkan provider AI',
        paragraphs: [
          'Pengaturan provider menentukan ke mana Mark mengirim permintaan AI. Jika menggunakan model lokal, server model harus berjalan di komputer Anda. Jika menggunakan layanan online, koneksi internet dan kredensial yang diminta harus tersedia.',
          'Setelah menyimpan konfigurasi, kirim pertanyaan singkat untuk menguji koneksi. Jika permintaan gagal, periksa pesan kesalahan dan cocokkan kembali alamat server, nama model, atau kredensialnya.'
        ],
        steps: [
          'Buka Pengaturan Mark dan pilih bagian AI.',
          'Pilih provider, lalu lengkapi kolom konfigurasi yang ditampilkan.',
          'Simpan perubahan dan kirim pesan percobaan.'
        ],
        links: [
          {
            label: 'Buka Pengaturan',
            to: '/config'
          }
        ]
      },
      {
        title: 'Memilih layanan atau model lokal',
        paragraphs: [
          'Gemini Web menggunakan jalur layanan web dan tidak meminta API key pada konfigurasi ini. DeepSeek Web menggunakan user token sesuai petunjuk Pengaturan. Keduanya memerlukan internet; integrasi sesi web dapat terpengaruh perubahan atau pembatasan layanan.',
          'Untuk LM Studio, muat model dan jalankan server lokal terlebih dahulu. Pilihan Custom API digunakan untuk endpoint yang kompatibel dengan format OpenAI: masukkan URL lengkap berakhiran /chat/completions, ID model, dan API key jika server memerlukannya. Endpoint tersebut dapat berada di komputer lokal maupun layanan online.'
        ]
      },
      {
        title: 'Memeriksa dukungan gambar',
        paragraphs: [
          'Dukungan gambar ditentukan oleh model dan jalur provider yang digunakan. Model teks tidak dapat membaca lampiran gambar hanya karena gambar berhasil ditambahkan ke chat. Jalur Gemini Web yang didokumentasikan di Mark saat ini juga belum mendukung input gambar.',
          'Jika ingin meminta analisis screenshot atau kamera, pilih model dan provider yang mendukung vision. Bila dukungan tersebut belum tersedia, sertakan teks pesan kesalahan atau informasi lain yang dapat dibaca melalui percakapan.'
        ]
      }
    ],
    related: ['settings', 'voice-camera', 'privacy', 'faq']
  },
  {
    id: 'chat',
    category: 'start',
    title: 'Percakapan, lampiran, dan konteks',
    summary:
      'Percakapan adalah tempat Anda memberi instruksi, menyertakan bahan, dan mengikuti hasil pekerjaan Mark. Pesan dapat dilengkapi lampiran, pilihan tool, atau skill agar konteksnya lebih jelas.',
    keywords:
      'chat studio pesan proses aktivitas pemikiran lampiran paste drag drop mention tag @ file slash stop context token',
    sections: [
      {
        title: 'Menulis permintaan yang jelas',
        paragraphs: [
          'Jelaskan tujuan pekerjaan terlebih dahulu, kemudian sertakan bahan atau lokasi yang perlu digunakan. Untuk tugas berkas, sebutkan folder atau pilih workspace. Jika ada batasan, seperti hanya membaca kode atau tidak mengirim email, tuliskan bersama permintaan awal.',
          'Sebutkan bentuk hasil yang diharapkan dan cara memeriksanya. Misalnya, perbaikan aplikasi dapat diakhiri dengan build, sedangkan riset dapat menghasilkan ringkasan beserta sumber. Arahan tambahan dapat diberikan saat Mark bekerja jika kebutuhan Anda berubah.'
        ],
        example:
          'Periksa proyek pada workspace ini, temukan penyebab build gagal, lalu perbaiki dan jalankan build kembali. Jelaskan perubahan serta hasil pemeriksaannya.'
      },
      {
        title: 'Menyertakan lampiran, tool, dan skill',
        paragraphs: [
          'Gunakan tombol lampiran atau seret berkas ke kolom pesan untuk menyertakan bahan yang ingin diperiksa. Gambar dari clipboard juga dapat ditempelkan. Jelaskan bagian yang ingin ditinjau agar Mark memahami hubungan lampiran dengan permintaan Anda.',
          'Ketik @ untuk memilih berkas workspace atau grup tool dan plugin aktif dari saran yang muncul. Ketik / untuk memilih skill, lalu tambahkan instruksi pekerjaan. Skill memberikan panduan kerja, sedangkan tool menyediakan tindakan yang dapat dijalankan Mark.'
        ]
      },
      {
        title: 'Mengikuti aktivitas dan hasil',
        paragraphs: [
          'Bagian Proses menampilkan pesan kemajuan selama pekerjaan berlangsung. Buka Aktivitas untuk melihat tool yang digunakan, input yang dikirim, dan hasil yang dikembalikan. Bagian Pemikiran dapat tersedia jika model menyertakannya dalam respons.',
          'Jawaban akhir merangkum hasil pekerjaan untuk Anda. Jika ada gambar atau berkas keluaran, hasilnya dapat disertakan sebagai pratinjau atau tautan. Pertanyaan yang langsung dijawab tanpa tool tidak selalu memiliki bagian Proses.'
        ]
      },
      {
        title: 'Menghentikan atau mengarahkan ulang pekerjaan',
        paragraphs: [
          'Gunakan tombol penghentian pada area pesan jika Anda ingin membatalkan proses aktif. Setelah itu, tuliskan arahan baru dan sebutkan bagian pekerjaan yang ingin dilanjutkan atau diubah. Perubahan yang sudah diterapkan pada berkas atau layanan tidak otomatis diurungkan.',
          'Pada percakapan panjang, konteks dapat diringkas agar pekerjaan dapat dilanjutkan. Gunakan nama berkas, lokasi, dan tujuan yang jelas ketika kembali membahas pekerjaan lama, terutama jika kondisi proyek sudah berubah.'
        ]
      }
    ],
    related: ['workspaces', 'agent', 'skills', 'permissions']
  },
  {
    id: 'workspaces',
    category: 'start',
    title: 'Sesi dan workspace',
    summary:
      'Sesi menyimpan percakapan untuk suatu pembahasan, sedangkan workspace menentukan folder yang menjadi konteks pekerjaan. Keduanya membantu Anda mengatur proyek dan melanjutkan pekerjaan sebelumnya.',
    keywords:
      'main thread percakapan umum tambah folder sidebar editor judul sesi hapus workspace @workspace',
    sections: [
      {
        title: 'Hubungan sesi dan workspace',
        paragraphs: [
          'Satu sesi berisi percakapan dan riwayat pekerjaan yang dapat dibuka kembali melalui Chat Studio. Beberapa sesi dapat memakai workspace yang sama, sehingga pembahasan proyek dapat dipisahkan tanpa harus memilih folder lain.',
          'Main Thread berada pada kelompok Percakapan Umum dan menggunakan Documents/Mark Workspace. Folder sesi utama ini tidak dapat diganti. Sesi lain dapat dikaitkan dengan folder proyek pilihan Anda; folder tersebut menjadi acuan kerja, tetapi bukan pembatas akses filesystem seperti sandbox.'
        ]
      },
      {
        title: 'Membuat dan mengatur percakapan',
        paragraphs: [
          'Gunakan Percakapan Baru untuk memulai sesi umum atau Tambah Workspace untuk memilih folder proyek. Tombol tambah pada kelompok workspace membuat sesi baru dengan folder yang sama. Berikan judul yang menggambarkan pekerjaan agar sesi mudah ditemukan kembali.',
          'Judul dan workspace sesi dapat diatur melalui pengaturan sesi. Simpan setelah mengubahnya. Workspace tidak dapat diganti ketika sesi sedang menjalankan pekerjaan, agar lokasi kerja tidak berpindah di tengah proses.'
        ],
        links: [
          {
            label: 'Buka Chat Studio',
            to: '/chat'
          }
        ]
      },
      {
        title: 'Mencari dan menghapus sesi',
        paragraphs: [
          'Sidebar menyediakan pencarian dan pengelompokan sesi. Anda dapat melipatnya ketika membutuhkan ruang lebih luas untuk percakapan atau Browser. Membuka panel Browser juga dapat membuat sidebar terlipat untuk menyesuaikan ruang yang tersedia.',
          'Penghapusan sesi memerlukan konfirmasi dan menghapus percakapan yang dipilih. Folder proyek serta berkas hasil pekerjaan tetap berada di disk. Jika Anda juga ingin menghapus berkas proyek, lakukan sebagai tindakan terpisah dengan target yang jelas.'
        ]
      }
    ],
    related: ['chat', 'files', 'browsers', 'privacy']
  },
  {
    id: 'agent',
    category: 'work',
    title: 'Cara kerja agen dan Super Effort',
    summary:
      'Mark bekerja sebagai agen yang dapat memilih tindakan, menjalankan tool, dan menilai hasilnya untuk menyelesaikan permintaan. Super Effort mengatur ketekunan kerja, sedangkan Auto Mode berkaitan dengan persetujuan tindakan.',
    keywords:
      'ReAct reasoning thought action observation read-tools routing auto mode rencana verifikasi',
    sections: [
      {
        title: 'Bagaimana Mark mengerjakan permintaan',
        paragraphs: [
          'Mark membaca instruksi dan konteks yang tersedia, lalu menentukan apakah pekerjaan memerlukan jawaban langsung atau tindakan melalui tool. Setelah tool selesai, hasilnya digunakan untuk memilih langkah berikutnya. Satu pekerjaan dapat melibatkan beberapa kali pembacaan, perubahan, dan pemeriksaan.',
          'Sebagai contoh, perbaikan aplikasi dapat dimulai dengan membaca kode, dilanjutkan perubahan berkas, lalu pengujian. Pesan kemajuan menjelaskan proses yang sedang berlangsung; keberhasilan pekerjaan perlu dilihat dari hasil dan pemeriksaan yang dilaporkan.'
        ]
      },
      {
        title: 'Memuat kemampuan yang diperlukan',
        paragraphs: [
          'Tool dikelompokkan berdasarkan fungsi agar Mark dapat memuat kemampuan yang sesuai dengan pekerjaan. Grup tambahan dimuat melalui read-tools ketika dibutuhkan. Menandai @grup atau @plugin membantu menunjukkan kemampuan yang Anda maksud.',
          'Layanan seperti Google Workspace atau MCP tetap memerlukan koneksi yang siap digunakan. Memuat definisi tool memberi Mark informasi cara memanggilnya, tetapi tidak menggantikan penyiapan layanan atau izin tindakan.'
        ]
      },
      {
        title: 'Super Effort dan Auto Mode',
        paragraphs: [
          'Super Effort mendorong Mark untuk melanjutkan pekerjaan dan memeriksa hasil sebelum menyatakan selesai. Pengaturannya tersedia melalui Pengaturan dan kontrol pada kolom pesan. Gunakan ketika pekerjaan membutuhkan penelusuran atau pemeriksaan yang lebih tekun.',
          'Auto Mode mengatur persetujuan tool pada sesi yang digunakan. Mode ini dapat membuat tindakan berjalan tanpa dialog izin baru sesuai aturan fitur. Mengaktifkan Auto Mode tidak sama dengan meningkatkan kemampuan model; pilih mode tersebut berdasarkan pekerjaan dan akses yang Anda percayakan.'
        ]
      },
      {
        title: 'Saat pekerjaan memerlukan bantuan',
        paragraphs: [
          'Mark dapat menemui kendala pada model, tool, koneksi, atau akses akun. Login, CAPTCHA, dan keputusan yang memerlukan informasi pribadi Anda dapat membuat pekerjaan menunggu bantuan. Baca keterangan yang diberikan sebelum menentukan tindakan berikutnya.',
          'Setelah membantu, jelaskan apa yang sudah Anda lakukan dan minta Mark memeriksa kondisi terbaru. Jika aksi sebelumnya sudah mengubah berkas atau halaman, hasilnya perlu diperiksa sebelum tindakan yang sama dicoba kembali.'
        ]
      }
    ],
    related: ['tools', 'workflows', 'subagents', 'permissions']
  },
  {
    id: 'tools',
    category: 'work',
    title: 'Referensi tool',
    summary:
      'Tool adalah fungsi yang digunakan Mark untuk melakukan tindakan, seperti membaca berkas, membuka halaman, atau mengakses layanan. Referensi ini membantu Anda memahami fungsi dan input yang tersedia.',
    keywords: 'registry schema parameter read-tools core builtin native tool action fungsi',
    sections: [
      {
        title: 'Membaca referensi tool',
        paragraphs: [
          'Anda dapat memberi instruksi kepada Mark dengan bahasa biasa tanpa menulis pemanggilan tool. Referensi ini berguna ketika Anda ingin memeriksa suatu kemampuan atau menyusun plugin dan skill yang membutuhkan format input tertentu.',
          'Cari berdasarkan nama atau fungsi, lalu buka detail tool untuk melihat deskripsi dan parameter. Daftar bawaan mengikuti definisi aplikasi, sementara grup aktif dan tool plugin dimuat saat referensi dibuka. Tool yang muncul dalam beberapa grup dihitung satu kali pada jumlah unik.',
          'Layanan pendukung tetap harus siap digunakan. Jika pemanggilan gagal, periksa koneksi dan izin layanan; keberadaan nama tool dalam daftar belum memastikan akun atau server sudah terhubung.'
        ]
      }
    ],
    related: ['agent', 'plugins', 'permissions']
  },
  {
    id: 'browsers',
    category: 'work',
    title: 'Pencarian web dan browser bawaan',
    summary:
      'Browser bawaan adalah browser milik Mark yang ditampilkan pada panel Chat Studio. Melalui grup browser_use, Mark dapat membuka situs, membaca konten, dan berinteraksi dengan halaman yang Anda perlukan.',
    keywords:
      'browser_use browser-search browser-fetch browser-navigate read click type scroll extract script screenshot download localhost login',
    sections: [
      {
        title: 'Pencarian dan pembacaan halaman',
        paragraphs: [
          'browser-search mencari judul dan alamat halaman, sedangkan browser-fetch mengambil teks tanpa membuka panel Browser. Keduanya digunakan saat pekerjaan hanya memerlukan pencarian sumber atau pembacaan informasi.',
          'Untuk halaman dinamis, formulir, atau login, Mark dapat menggunakan browser-navigate. Panel terbuka otomatis saat tindakan tersebut dijalankan; membuka ulang percakapan yang pernah menggunakan browser tidak menjadi permintaan baru untuk membuka panel.'
        ]
      },
      {
        title: 'Menggunakan panel Browser',
        paragraphs: [
          'Panel Browser menampilkan halaman yang sedang dikerjakan Mark dan dapat dibuka sendiri melalui tombol Browser. Anda dapat mengikuti navigasi atau membantu melalui halaman yang sama ketika pekerjaan memerlukan interaksi pengguna.',
          'Mark dapat membaca halaman, mengeklik, mengetik, menggulir, mengekstrak data, menjalankan JavaScript, mengambil screenshot, dan mengunduh berkas. Untuk aplikasi lokal, sertakan alamat localhost dan jelaskan bagian yang perlu diuji.'
        ],
        example:
          'Buka localhost proyek ini di browser bawaan, periksa formulir pendaftaran, lalu ambil screenshot hasilnya.'
      },
      {
        title: 'Login dan bantuan pengguna',
        paragraphs: [
          'Browser bawaan memiliki sesi yang terkait percakapan. Sesi Minibot dipisahkan dari agen lain. Login pada Chrome pribadi tidak otomatis tersedia; gunakan Chrome Bridge untuk bekerja pada tab Chrome yang sudah Anda pilih.',
          'Jika perlu login atau CAPTCHA, lakukan melalui halaman yang tersedia lalu beri tahu Mark. Minta pemeriksaan kondisi terbaru sebelum melanjutkan. Perubahan situs yang sudah dikirim tidak otomatis dibatalkan ketika pekerjaan dihentikan.'
        ]
      }
    ],
    related: ['chrome-bridge', 'workspaces', 'computer', 'permissions']
  },
  {
    id: 'computer',
    category: 'work',
    title: 'Kendali komputer Windows',
    summary:
      'Computer Use adalah fitur untuk mengoperasikan aplikasi Windows melalui pengamatan layar, mouse, dan keyboard. Mark menggunakan desktop Anda dalam sesi kendali yang memerlukan persetujuan.',
    keywords:
      'computer_use desktop Win32 daemon screenshot click drag hotkey batch windows Ctrl Shift R emergency overlay mouse terkunci',
    sections: [
      {
        title: 'Memulai sesi kendali',
        paragraphs: [
          'Mark meminta izin sebelum membuka sesi Computer Use. Setelah disetujui, mouse dikunci dan pointer Windows digantikan secara visual oleh cursor Mark. Overlay tetap terlihat selama sesi aktif, termasuk ketika Mark sedang menentukan tindakan berikutnya.',
          'Sesi berakhir ketika Mark menutupnya atau Anda membatalkan kendali. Mouse kemudian kembali tersedia dan overlay ditutup. Membuka sesi berikutnya memerlukan persetujuan baru.'
        ]
      },
      {
        title: 'Tindakan dan hasil pengamatan',
        paragraphs: [
          'Mark dapat mengambil screenshot, mengeklik, menyeret, menggulir, mengetik, dan menggunakan kombinasi tombol. Fitur ini juga menyediakan tindakan untuk membuka aplikasi, melihat daftar jendela, memfokuskan, dan memaksimalkan jendela.',
          'Setelah tindakan, Mark dapat menunggu beberapa detik sebelum menerima screenshot hasilnya. Jelaskan aplikasi, tujuan, dan batas pekerjaan agar kondisi layar yang diharapkan dapat diperiksa.'
        ],
        example:
          'Buka Notepad dan ketik daftar tugas berikut. Tampilkan hasilnya tanpa menyimpan berkas.'
      },
      {
        title: 'Membatalkan kendali',
        paragraphs: [
          'Tekan Ctrl+Shift+R untuk menghentikan Computer Use tanpa memfokuskan overlay. Pintasan melepas kunci mouse, memulihkan pointer, menutup overlay, dan memberi tahu Mark tentang pembatalan.',
          'Giliran yang dibatalkan tidak boleh melanjutkan aksi desktop. Periksa keadaan aplikasi dan berikan instruksi baru jika ingin melanjutkan. Pembatalan tidak mengurungkan tindakan yang sudah terjadi.'
        ]
      }
    ],
    related: ['browsers', 'files', 'voice-camera', 'permissions']
  },
  {
    id: 'files',
    category: 'work',
    title: 'Berkas, dokumen, coding, dan Git',
    summary:
      'Fitur berkas dan proyek memungkinkan Mark membaca dokumen, mencari informasi, mengubah kode, dan memeriksa hasil pekerjaan melalui tool filesystem, terminal, serta Git.',
    keywords:
      'read-file read-image write-file replace-content replace-lines delete-file list-dir find-files grep-search file-outline read-document PDF DOCX PowerShell git diff terminal artifact',
    sections: [
      {
        title: 'Menemukan dan membaca bahan',
        paragraphs: [
          'Mark dapat melihat isi folder, mencari nama berkas atau teks, membaca bagian berkas, dan melihat garis besar kode. Pilih workspace atau sebutkan lokasi agar pekerjaan diarahkan pada proyek yang sesuai.',
          'read-document menyediakan pembacaan teks dokumen seperti PDF dan DOCX. Analisis gambar memerlukan vision. Kemampuan membaca dokumen tidak selalu mencakup penyuntingan visual atau seluruh format aplikasi Office.'
        ]
      },
      {
        title: 'Mengubah dan memeriksa proyek',
        paragraphs: [
          'Tool berkas mendukung pembuatan, penulisan ulang, penggantian teks atau baris, dan penghapusan. Jelaskan perubahan perilaku yang diinginkan serta bagian yang harus dipertahankan sebelum meminta pengeditan.',
          'Mark dapat menjalankan PowerShell untuk build, pemeriksaan sintaks, dan pengujian yang tersedia. Minta penjelasan perubahan beserta hasil pemeriksaannya agar Anda mengetahui apa yang sudah berhasil diuji.'
        ],
        example:
          'Perbaiki validasi email pada halaman login di workspace ini, lalu jalankan pemeriksaan proyek dan jelaskan hasilnya.'
      },
      {
        title: 'Git dan proses latar belakang',
        paragraphs: [
          'Gunakan grup Git untuk memeriksa status dan diff, membuat commit, atau menjalankan revert. Tinjau perubahan sebelum menyimpannya ke riwayat; perubahan berkas kerja, commit, dan revert mempunyai dampak yang berbeda.',
          'run-task menjalankan proses lama di latar belakang, seperti server pengembangan atau build. Grup task_terminal menyediakan pembacaan output, daftar proses, dan penghentian. Proses terminal ini dikelola terpisah dari penugasan Minibot dan checklist workflow.'
        ]
      }
    ],
    related: ['workspaces', 'agent', 'workflows', 'permissions']
  },
  {
    id: 'subagents',
    category: 'work',
    title: 'Minibots',
    summary:
      'Minibots adalah agen pendamping yang menerima tugas dari Mark dan mengerjakannya secara terpisah di latar belakang. Setiap Minibot mempunyai peran, akses tool, dan riwayat penugasan sendiri, sehingga pekerjaan dapat dibagi dan laporannya ditinjau melalui Mark.',
    keywords:
      'Minibots Minibot sub agent sub-agent subagent paralel multi agent spawn_subagent message_agent send_message list_subagents report_to_lead kill_subagent topologi',
    sections: [
      {
        title: 'Kapan menggunakan Minibots?',
        paragraphs: [
          'Minibots berguna untuk pekerjaan yang dapat dibagi menjadi tugas mandiri. Pada riset, satu agen dapat membaca dokumentasi dan agen lain memeriksa contoh penerapan. Pada proyek kode, beberapa agen dapat meninjau modul berbeda dan mengirimkan temuan masing-masing.',
          'Mark memberikan tujuan dan batas tugas, lalu meninjau laporan untuk menyusun hasil bagi Anda. Pekerjaan berjalan pada server sehingga chat tetap dapat digunakan. Setiap Minibot mempunyai sesi browser terpisah.'
        ],
        example:
          'Gunakan dua Minibot: satu meninjau dokumentasi resmi, satu mencari contoh penerapan. Gabungkan temuan beserta sumbernya.'
      },
      {
        title: 'Membuat dan memantau agen',
        paragraphs: [
          'Halaman Minibots menyediakan pencarian nama, peran, atau tugas dan filter status. Pilih agen untuk membaca aktivitas serta detail penugasannya. Tampilan Topologi memperlihatkan hubungan agen dengan Mark.',
          'Gunakan Buat agen dan tentukan nama, peran opsional, serta tugas. Pekerjaan dimulai setelah agen dibuat. Sertakan bahan yang perlu digunakan, batas pekerjaan, dan bentuk laporan yang diharapkan.'
        ],
        links: [
          {
            label: 'Buka Minibots',
            to: '/subagents'
          }
        ]
      },
      {
        title: 'Arahan lanjutan dan penugasan',
        paragraphs: [
          'Pesan dapat dikirim ketika Minibot bekerja dan dibaca pada batas langkah yang aman. Gunakan Jadikan penugasan baru untuk pekerjaan dengan konteks terpisah. Beberapa Minibot dapat berjalan bersamaan, tetapi satu agen tetap mengerjakan satu penugasan aktif pada satu waktu.',
          'Pilih penugasan untuk membaca hasil atau menghentikannya. Menghapus agen ikut menghapus penugasannya setelah konfirmasi. Berkas workspace dapat dipakai bersama meskipun browser terpisah; bagilah tanggung jawab berkas agar perubahan tidak saling menimpa.'
        ]
      },
      {
        title: 'Laporan dan kelanjutan pekerjaan',
        paragraphs: [
          'Mark dapat meninjau kendala teknis dan memberi arahan kepada Minibot. Permintaan informasi pribadi atau persetujuan Anda dikumpulkan dalam Koordinasi Minibots pada chat asal, sehingga Anda dapat menjawab tanpa membuka setiap agen.',
          'Laporan disimpan di sesi asal dan ditanggapi ketika Mark tersedia untuk meninjaunya. Menutup antarmuka tidak menghentikan pekerjaan selama server masih hidup. Tindak lanjut laporan ketika UI tertutup menunggu sampai tersambung kembali; wait_subagents bersifat opsional untuk menunggu secara khusus.',
          'Jika pekerjaan terputus karena server berhenti, periksa langkah terakhir sebelum Lanjutkan pekerjaan. Gagal atau Dibatalkan menyediakan Coba lagi. Aksi yang hasilnya belum diketahui perlu diperiksa sebelum diulang. Minibot tidak membuat Minibot baru secara rekursif.'
        ]
      }
    ],
    related: ['agent', 'workflows', 'browsers', 'permissions']
  },
  {
    id: 'workflows',
    category: 'work',
    title: 'Task Workflow dan hasil bertahap',
    summary:
      'Task Workflow adalah rencana kerja tersimpan dalam bentuk checklist berurutan. Mark mengerjakan langkah aktif, memeriksa hasilnya, dan menyimpan ringkasan beserta bukti sebelum melanjutkan.',
    keywords:
      'agent workflows durable tasks task create_agent_task mark_done_task read_task update_task_plan checkpoint artifact /task',
    sections: [
      {
        title: 'Membuat rencana kerja',
        paragraphs: [
          'Gunakan /task atau minta rencana untuk pekerjaan bertahap. Mark membuat checklist terlebih dahulu lalu langsung mengerjakannya. Workflow juga dapat digunakan secara otomatis untuk tugas besar.',
          'Hanya langkah aktif yang dapat diselesaikan. Langkah gagal atau menunggu tidak menambah progres. Jika kebutuhan berubah, langkah mendatang dapat direvisi dengan alasan, sementara langkah aktif dan hasil yang sudah selesai dipertahankan.'
        ],
        example:
          '/task Petakan aplikasi ini, periksa masalah keamanan, lalu susun laporan temuan beserta bukti kode.'
      },
      {
        title: 'Memantau checklist',
        paragraphs: [
          'Kartu workflow menampilkan judul, status, dan jumlah langkah selesai. Buka langkah untuk melihat sasaran, hasil, bukti pemeriksaan, dan berkas jika ada. Aktivitas tool serta pemikiran tersedia pada Detail proses.',
          'Kartu terbuka selama pekerjaan berjalan dan dapat diringkas setelah selesai. Setiap langkah tidak wajib membuat dokumen. Pemeriksaan mengikuti pekerjaan: audit baca-saja dapat menggunakan rujukan kode tanpa build yang tidak berkaitan.'
        ]
      },
      {
        title: 'Melanjutkan atau menghentikan',
        paragraphs: [
          'Checkpoint dan sesi asal disimpan. Setelah restart, pekerjaan yang terputus dijeda agar keadaan terakhir dapat diperiksa sebelum dilanjutkan. Gunakan Lanjutkan atau Coba lagi sesuai status pada kartu.',
          'Hentikan membatalkan workflow pilihan dan penugasan Minibot terkait. Setelah seluruh langkah selesai, Mark menyusun jawaban penutup dari hasil tersimpan, terpisah dari catatan kemajuan setiap langkah.'
        ]
      }
    ],
    related: ['agent', 'subagents', 'files', 'skills']
  },
  {
    id: 'neural',
    category: 'personal',
    title: 'Memori dan Neural Core',
    summary:
      'Neural Core adalah halaman untuk meninjau karakter, memori, dan pengetahuan yang disimpan Mark. Informasi tersebut membantu Mark menggunakan konteks yang relevan dalam percakapan berikutnya.',
    keywords:
      'neural core memory vector RAG orama SQLite profile preference notes learn karakter warmth sarcasm trust energy obedience kepatuhan peta node daftar groom backup',
    sections: [
      {
        title: 'Cara memori digunakan',
        paragraphs: [
          'Mark menyimpan riwayat sesi, pasangan percakapan, arsip ringkasan, memori pengguna, dan skill yang dipelajari. Pencarian mempertimbangkan teks dan kemiripan makna untuk memilih informasi yang relevan.',
          'Tidak semua informasi tersimpan dimasukkan ke setiap jawaban. Jika konteks penting belum digunakan, sebutkan kembali informasi tersebut atau arahkan Mark ke berkas sumbernya.'
        ]
      },
      {
        title: 'Menjelajahi Neural Core',
        paragraphs: [
          'Ringkasan memberi akses ke karakter, memori, dan skill. Karakter menampilkan kehangatan, sarkasme, kepercayaan, energi, serta kepatuhan beserta informasi evaluasinya. Bagian Memori menyediakan peta node dan tampilan Daftar untuk pencarian teks.',
          'Skill dipelajari berisi prosedur yang disimpan Mark dan berbeda dari paket User Skills. Rapikan memori membantu pemeriksaan atau penggabungan informasi terkait. Buka Kelola data untuk cadangan, pemulihan, dan reset.'
        ],
        links: [
          {
            label: 'Buka Neural Core',
            to: '/neural-core'
          }
        ]
      },
      {
        title: 'Menghapus ingatan',
        paragraphs: [
          'Buka data yang ingin dihapus dan gunakan tindakan penghapusan. Baca konfirmasi untuk memastikan entri yang dipilih sebelum melanjutkan.',
          'Menghapus memori tidak otomatis menghapus salinan informasi dalam percakapan aktif, arsip lain, atau berkas proyek. Tinjau lokasi tersebut jika Anda juga ingin membersihkan informasi yang sama.'
        ]
      }
    ],
    related: ['awareness', 'skills', 'privacy', 'settings']
  },
  {
    id: 'awareness',
    category: 'personal',
    title: 'Avatar, karakter, dan Awareness',
    summary:
      'Avatar, karakter, dan Awareness mengatur cara Mark menampilkan aktivitas dan memulai interaksi. Avatar menunjukkan status, karakter memengaruhi gaya komunikasi, dan Awareness mengevaluasi aktivitas komputer untuk menentukan inisiatif.',
    keywords:
      'emosi mood neutral joy sadness anger fear disgust anxiety envy embarrassment ennui taktil pet bonk AFK idle proactive awareness',
    sections: [
      {
        title: 'Avatar dan perkembangan karakter',
        paragraphs: [
          'Avatar memperlihatkan keadaan seperti mendengarkan, berbicara, memproses, bekerja, atau memutar musik. Mood dan ekspresinya merupakan perilaku yang dimodelkan aplikasi untuk menyampaikan keadaan interaksi.',
          'Percakapan pada sesi utama dan interaksi avatar dapat dipertimbangkan dalam evaluasi relasi. Atur gaya bicara melalui Pengaturan dan tinjau sifat melalui Neural Core. Nilai kepercayaan karakter berbeda dari izin tool dan tidak memberikan akses tindakan baru.'
        ]
      },
      {
        title: 'Pengamatan Awareness',
        paragraphs: [
          'Awareness mengevaluasi aktivitas yang tersedia, seperti aplikasi atau judul jendela, kondisi idle, baterai, dan beban perangkat. Mark dapat menggunakan konteks tersebut untuk pengamatan singkat, sapaan, atau inisiatif melalui Minibot.',
          'Setelah Anda kembali dari kondisi tidak aktif, Mark dapat menilai apakah perlu menyapa. Pengamatan ini mempunyai jalur berbeda dari permintaan screenshot atau kamera.'
        ]
      },
      {
        title: 'Mengatur inisiatif',
        paragraphs: [
          'Buka Pengaturan > Perilaku untuk mengubah status Awareness Engine lalu simpan. Nonaktifkan bila Anda ingin mengurangi inisiatif yang berasal dari pengamatan aktivitas komputer.',
          'Chat biasa tetap tersedia ketika Awareness dimatikan. Mikrofon dan kamera mempunyai pengaturan serta izin terpisah, sehingga perlu ditinjau tersendiri jika Anda juga ingin mengubah akses perangkat.'
        ]
      }
    ],
    related: ['neural', 'settings', 'voice-camera', 'privacy']
  },
  {
    id: 'voice-camera',
    category: 'personal',
    title: 'Suara, mikrofon, kamera, dan vision',
    summary:
      'Fitur suara dan vision memungkinkan Anda berbicara dengan Mark serta meminta penjelasan tentang gambar, layar, atau kamera. Penggunaannya mengikuti izin perangkat dan dukungan model AI.',
    keywords:
      'STT speech recognition Web Speech wake word Hey Mark Halo Mark speak TTS Edge Ardi camera-look analyze-screen read-image screenshot microphone webcam',
    sections: [
      {
        title: 'Input dan balasan suara',
        paragraphs: [
          'Input suara antarmuka menggunakan Web Speech API pada Edge atau Chrome. Aktifkan mikrofon, berikan izin browser, lalu berbicara dengan jelas agar hasil pengenalan sesuai dengan ucapan Anda.',
          'Balasan suara dibuat melalui layanan TTS Mark. Dukungan browser, jaringan, dan perangkat audio dapat memengaruhi pengenalan atau pemutaran. Periksa volume dan keluaran audio jika balasan tidak terdengar.'
        ]
      },
      {
        title: 'Bahasa dan kata panggilan',
        paragraphs: [
          'Pengaturan > Suara menyediakan bahasa input dan kata panggilan tambahan. Panggilan bawaan mencakup Hey Mark, Halo Mark, dan Mark. Setelah mengubah pengaturan, uji panggilan untuk memeriksa apakah Mark mulai mendengarkan.',
          'Mikrofon mengikuti perangkat utama Windows. Pilih perangkat yang benar melalui pengaturan suara Windows dan pastikan browser memiliki izin. Bahasa atau perangkat yang tidak sesuai dapat mengurangi ketepatan pengenalan.'
        ]
      },
      {
        title: 'Menyiapkan kamera',
        paragraphs: [
          'Buka Pengaturan > Kamera, pilih perangkat, lalu mulai pratinjau untuk memastikan sumber gambar benar. Berikan izin browser ketika diminta.',
          'Hentikan pratinjau atau pindah bagian untuk mematikan aliran pratinjau. Simpan jika Anda mengubah perangkat atau izin penggunaan kamera.'
        ]
      },
      {
        title: 'Sumber gambar dan vision',
        paragraphs: [
          'Gunakan lampiran untuk berkas gambar, analyze-screen untuk desktop, atau camera-look untuk kamera. Screenshot browser berasal dari halaman atau tab yang dikendalikan.',
          'Analisis memerlukan model dan provider yang mendukung vision. Berikan pertanyaan spesifik mengenai gambar agar Mark mengetahui teks, objek, atau kondisi yang perlu diperiksa.'
        ],
        example:
          'Jelaskan pesan error pada screenshot ini dan berikan langkah pemeriksaannya tanpa mengubah berkas.'
      }
    ],
    related: ['getting-started', 'computer', 'settings', 'privacy']
  },
  {
    id: 'media',
    category: 'personal',
    title: 'YouTube dan pemutar musik',
    summary:
      'Fitur YouTube dan musik membantu Mark mencari video, merangkum transkrip, dan mengatur pemutaran lagu melalui chat serta kontrol pemutar.',
    keywords:
      'yt-search yt-summary youtube music-play music-toggle music-next music-prev playlist queue antrean pause volume',
    sections: [
      {
        title: 'Pencarian dan ringkasan video',
        paragraphs: [
          'Berikan judul, kata kunci, atau tautan video. yt-search membantu menemukan video dan yt-summary memproses transkrip yang tersedia. Anda dapat meminta poin utama atau penjelasan bagian tertentu.',
          'Jika transkrip tidak tersedia, berikan teksnya sendiri atau gunakan sumber lain. Ringkasan transkrip tidak memastikan seluruh informasi visual video sudah diperiksa.'
        ],
        example:
          'Ringkas video ini berdasarkan transkripnya dan jelaskan pertanyaan yang belum terjawab.'
      },
      {
        title: 'Mengatur musik',
        paragraphs: [
          'Sebutkan judul, artis, atau jenis musik untuk memulai pemutaran. Mark menyediakan kontrol putar, jeda atau lanjutkan, lagu berikutnya, dan sebelumnya. Pemutar antarmuka juga menampilkan kontrol dan antrean.',
          'Pemutaran YouTube memerlukan internet dan mengikuti ketersediaan konten. Jika hasil tidak sesuai, berikan judul atau artis yang lebih spesifik.'
        ],
        example: 'Putarkan musik instrumental untuk bekerja, lalu jeda ketika saya meminta.'
      },
      {
        title: 'Mengirim hasil media',
        paragraphs: [
          'Pengiriman berkas atau hasil media melalui Telegram memerlukan bot yang terhubung dan penerima yang diizinkan. Jelaskan berkas dan tujuan agar Mark memilih hasil yang benar.',
          'Kemampuan unduhan mengikuti tool serta respons layanan. Berhasil memutar video tidak selalu berarti berkasnya tersedia untuk diunduh atau dikirim.'
        ]
      }
    ],
    related: ['telegram', 'voice-camera', 'tools', 'faq']
  },
  {
    id: 'addons',
    category: 'extend',
    title: 'Memilih dan memasang add-on',
    summary:
      'Add-ons adalah integrasi bawaan yang menghubungkan Mark dengan layanan tertentu. Halaman ini menyediakan penjelasan kemampuan, status, dan langkah penyiapan Chrome Bridge, Google Workspace, serta Telegram.',
    keywords: 'addons add-ons install uninstall connect connected status layanan katalog',
    sections: [
      {
        title: 'Memilih dan menyiapkan integrasi',
        paragraphs: [
          'Buka Add-ons untuk melihat layanan yang tersedia, lalu pilih integrasi yang ingin digunakan. Halaman detail menjelaskan kemampuan, langkah penyiapan, dan tindakan untuk memasang atau menghubungkan layanan.',
          'Contoh permintaan pada halaman detail dapat dipilih untuk menyiapkan pesan chat. Pesan tersebut belum dikirim secara otomatis, sehingga Anda dapat menyesuaikannya sebelum meminta Mark bekerja.'
        ],
        links: [
          {
            label: 'Buka Add-ons',
            to: '/addons'
          }
        ]
      },
      {
        title: 'Membaca status layanan',
        paragraphs: [
          'Setiap integrasi mempunyai kebutuhan berbeda. Chrome Bridge memerlukan engine, ekstensi, dan tab pilihan; Google Workspace memerlukan pemberian akses akun; Telegram memerlukan token bot dan admin yang diizinkan.',
          'Status terpasang belum selalu berarti layanan siap digunakan. Buka detail untuk memeriksa koneksi atau kendala. Setelah penyiapan selesai, uji dengan permintaan sederhana yang sesuai dengan layanan.'
        ]
      },
      {
        title: 'Hubungan add-on, plugin, dan skill',
        paragraphs: [
          'Add-on menyediakan alur penyiapan integrasi bawaan. Plugin Hub mengelola plugin lokal dan server MCP yang menyediakan tool tambahan. Skill berisi petunjuk tentang cara Mark menangani suatu jenis pekerjaan.',
          'Sebuah add-on dapat membawa plugin sebagai engine, seperti Chrome Bridge dengan chrome-use. Karena itu, plugin engine dapat terlihat di Plugin Hub meskipun pemasangan dan pengelolaannya dilakukan melalui add-on terkait.'
        ]
      }
    ],
    related: ['chrome-bridge', 'google', 'telegram', 'plugins', 'skills']
  },
  {
    id: 'chrome-bridge',
    category: 'extend',
    title: 'Chrome Bridge dan Mark Agent Bridge',
    summary:
      'Chrome Bridge adalah add-on untuk menghubungkan Mark ke tab Google Chrome yang Anda pilih. Ekstensi Mark Agent Bridge menyediakan koneksi tersebut sehingga Mark dapat bekerja pada halaman dengan sesi login Chrome Anda.',
    keywords:
      'chrome-use extension ekstensi Load unpacked Developer mode tab bridge chrome-navigate chrome-read chrome-click chrome-type chrome-extract chrome-script chrome-scroll chrome-screenshot chrome-ask-user chrome-close',
    sections: [
      {
        title: 'Memilih Chrome Bridge',
        paragraphs: [
          'Gunakan Chrome Bridge ketika ingin Mark mengoperasikan tab Chrome pribadi, termasuk halaman yang sudah login. Sebutkan Chrome saya dalam permintaan agar tujuannya jelas. Untuk permintaan browser umum, Mark menggunakan browser bawaannya.',
          'Chrome Bridge merupakan nama add-on, sedangkan Mark Agent Bridge adalah ekstensi Chrome. Engine plugin dan grup tool tetap bernama chrome-use. Nama tersebut dapat muncul ketika Anda melihat daftar tool atau plugin.'
        ]
      },
      {
        title: 'Memasang dan memilih tab',
        paragraphs: [
          'Pasang add-on dari halaman detail, lalu ikuti penyiapan ekstensi di Chrome. Folder ekstensi disediakan oleh Mark; Anda dapat membuka folder atau menyalin lokasinya dari halaman yang sama.',
          'Setelah ekstensi dimuat, buka halaman yang ingin dikendalikan dan pilih Hubungkan tab ini melalui popup Mark Agent Bridge. Periksa status koneksi sebelum meminta Mark melakukan tindakan.'
        ],
        steps: [
          'Buka Add-ons > Chrome Bridge dan pilih Install. Tinjau konfirmasi jika plugin lama perlu diganti.',
          'Buka chrome://extensions di Chrome dan aktifkan Developer mode.',
          'Pilih Load unpacked dan arahkan ke folder ekstensi yang disediakan Mark.',
          'Buka tab target, lalu gunakan Hubungkan tab ini di popup ekstensi.'
        ],
        links: [
          {
            label: 'Buka Chrome Bridge',
            to: '/addons/chrome-bridge'
          }
        ]
      },
      {
        title: 'Mengatur kendali tab',
        paragraphs: [
          'Kendali tetap terikat pada tab pilihan meskipun Anda berpindah fokus ke tab lain. Popup memperlihatkan tab tersebut dan menyediakan Jeda atau Lanjutkan, Putuskan, serta Hubungkan ulang. Menutup tab pilihan melepas kendalinya.',
          'Setelah Chrome dimulai ulang, pilih tab kembali melalui ekstensi. Mark dapat menggunakan sepuluh tool chrome-* untuk navigasi, pembacaan, interaksi, pengambilan data, JavaScript, screenshot, bantuan pengguna, dan penutupan tab.'
        ]
      },
      {
        title: 'Pembaruan dan penghapusan',
        paragraphs: [
          'Muat ulang ekstensi melalui halaman ekstensi Chrome setelah paketnya diperbarui. Jika koneksi gagal karena konflik port lokal, selesaikan penyebabnya lalu gunakan Hubungkan ulang.',
          'Menghapus add-on melalui Mark tidak menggantikan penghapusan ekstensi melalui Chrome. Hapus ekstensi dari Chrome jika Anda tidak lagi ingin menggunakannya.'
        ]
      }
    ],
    related: ['browsers', 'addons', 'plugins', 'faq']
  },
  {
    id: 'plugins',
    category: 'extend',
    title: 'Plugin Hub dan editor plugin',
    summary:
      'Plugin Hub adalah tempat mengelola kemampuan tambahan Mark yang berbentuk tool. Daftarnya mencakup plugin lokal dan MCP server, dengan pengaturan yang mengikuti jenis masing-masing.',
    keywords:
      'plugin.json index.js editable false true managed addon chrome-use Monaco actions dependencies NPM triggerHint',
    sections: [
      {
        title: 'Melihat dan menggunakan plugin',
        paragraphs: [
          'Gunakan pencarian pada Plugin Hub untuk menemukan plugin berdasarkan nama atau kemampuan. Buka detail untuk melihat deskripsi, daftar aksi atau tool, dan pengaturan yang tersedia. MCP ditandai sebagai jenis tersendiri dengan status koneksi.',
          'Ketik @ pada chat untuk memilih plugin atau grup tool aktif. Mark dapat memuat definisinya saat diperlukan. Plugin yang dinonaktifkan tidak disediakan sebagai kemampuan aktif kepada agen.'
        ],
        links: [
          {
            label: 'Buka Plugin Hub',
            to: '/plugins'
          }
        ]
      },
      {
        title: 'Menambahkan kemampuan baru',
        paragraphs: [
          'Tombol Tambah plugin menyediakan tiga pilihan: Buat plugin manual, Buat plugin dengan Mark, dan Tambahkan custom MCP server. Pilih berdasarkan bahan yang Anda miliki: kode lokal, kebutuhan yang ingin dibahas dengan Mark, atau konfigurasi server MCP.',
          'Plugin lokal disimpan di Documents/Mark Plugins dan menggunakan plugin.json serta handler index.js. Editor menyediakan definisi aksi dan kode handler. Setelah menyimpan, uji pada data yang sesuai agar hasilnya dapat diperiksa.'
        ],
        steps: [
          'Pilih Tambah plugin lalu tentukan cara pembuatan.',
          'Untuk plugin lokal, lengkapi identitas, deskripsi, dependensi bila diperlukan, dan daftar aksi.',
          'Lengkapi handler melalui editor atau bantuan Mark, simpan, lalu uji fungsi yang dibuat.'
        ]
      },
      {
        title: 'Plugin yang dikelola dan tidak dapat diedit',
        paragraphs: [
          'Properti editable: false pada plugin.json menonaktifkan penyuntingan definisi melalui editor. Jika tidak dicantumkan, editable dianggap true. Plugin yang dibawa add-on mengikuti pengelolaan add-on terkait.',
          'Engine chrome-use tetap dapat terlihat, dipakai, dan ditandai, sementara penyiapannya dilakukan melalui Chrome Bridge. Buka pengelola yang ditunjukkan di detail plugin untuk mengubah konfigurasi integrasinya.'
        ]
      },
      {
        title: 'Akses plugin lokal',
        paragraphs: [
          'Plugin lokal berisi kode yang dapat dijalankan Mark. Tinjau sumber, dependensi, dan tindakan yang disediakan sebelum memasangnya. Dependensi npm dapat membutuhkan internet dan pemasangan kode tambahan.',
          'Jangan memasukkan token atau kata sandi dalam contoh kode maupun pesan chat. Untuk menggunakan layanan yang memiliki server MCP, baca artikel MCP agar konfigurasi koneksi dan autentikasi disiapkan melalui alur yang sesuai.'
        ]
      }
    ],
    related: ['mcp', 'addons', 'skills', 'tools', 'permissions']
  },
  {
    id: 'mcp',
    category: 'extend',
    title: 'MCP server',
    summary:
      'MCP adalah protokol yang menghubungkan Mark dengan server penyedia tool. Melalui Plugin Hub, Anda dapat menambahkan server lokal atau remote lalu memilih kemampuan yang boleh digunakan Mark dan Minibot.',
    keywords:
      'MCP server stdio Streamable HTTP OAuth token npx mcpServers JSON plugin tools koneksi',
    sections: [
      {
        title: 'Memahami MCP dalam Mark',
        paragraphs: [
          'Satu MCP server tampil sebagai satu entri pada Plugin Hub dan menyediakan satu grup tool. Server dapat menawarkan fungsi untuk dokumen, data, atau layanan lain sesuai implementasinya. Mark mempelajari nama, deskripsi, dan parameter tool dari server tersebut.',
          'Pilih MCP jika layanan yang ingin digunakan sudah menyediakan server yang sesuai. Anda tidak perlu membuat ulang fungsi tersebut sebagai plugin lokal, tetapi tetap perlu menyiapkan command atau alamat server dan autentikasi yang diminta.'
        ]
      },
      {
        title: 'Menambahkan server lokal atau remote',
        paragraphs: [
          'Buka Plugin Hub > Tambah plugin > Tambahkan custom MCP server. Isi nama dan deskripsi agar koneksi mudah dikenali. Untuk lokal, pilih stdio lalu isi command, argumen berbentuk array JSON, dan environment bila diperlukan. Untuk remote, pilih Streamable HTTP dan isi URL server.',
          'Jika penyedia memberikan konfigurasi mcpServers, buka Tempel JSON konfigurasi, tinjau isinya, dan pilih server yang ingin ditambahkan. Semua server menggunakan ikon MCP yang sama. Mark tidak menjalankan instalasi paket otomatis; command seperti npx yang Anda masukkan dapat mengunduh paket ketika dijalankan, sehingga perlu ditinjau sebelum disetujui.'
        ],
        links: [
          {
            label: 'Buka Plugin Hub',
            to: '/plugins'
          }
        ]
      },
      {
        title: 'Autentikasi dan menghubungkan server',
        paragraphs: [
          'Server remote dapat menggunakan tanpa autentikasi, token manual, atau OAuth. Masukkan token pada formulir bila diminta, atau lanjutkan login OAuth melalui tautan pada detail. Kebutuhan login mengikuti server dan discovery yang didukung; token manual dapat dipakai jika penyedia menyediakannya.',
          'Setelah menyimpan, buka detail dan pilih Hubungkan. Tinjau tujuan atau command pada konfirmasi kepercayaan. Selama proses berlangsung, status Menghubungkan menunjukkan bahwa Mark menunggu respons dan daftar tool. Jika gagal, periksa konfigurasi dan kredensial sebelum mencoba lagi.'
        ]
      },
      {
        title: 'Memilih tool dan menggunakannya',
        paragraphs: [
          'Tool yang ditemukan aktif secara default. Buka detail MCP untuk membaca deskripsi dan menonaktifkan tool satu per satu. Ketik @ dan pilih nama server pada chat untuk menunjukkan grup yang ingin dipakai. Jika ada nama yang sama, gunakan pilihan unik pada saran.',
          'Pemanggilan mengikuti izin tool dan Auto Mode. Status aktif membuat tool tersedia tetapi tidak mengubah aturan persetujuan. Minibot juga mengikuti batas akses tool yang diberikan kepadanya. Hasil teks dan gambar dapat ditampilkan; jenis hasil lain akan diberi keterangan jika belum didukung.'
        ]
      },
      {
        title: 'Mengelola koneksi dan kredensial',
        paragraphs: [
          'Gunakan Hubungkan ulang untuk memperbarui koneksi, Edit untuk mengubah konfigurasi, dan Hapus jika server tidak lagi diperlukan. Setelah Mark dimulai ulang, buka detail dan hubungkan server kembali. Saat add-on MCP dinonaktifkan atau dihapus, koneksinya dihentikan.',
          'Token dan nilai environment rahasia disimpan terpisah dengan perlindungan kredensial Windows. Backup Mark memuat metadata konfigurasi tanpa kredensial MCP; setelah restore, masukkan ulang rahasia atau login kembali. Resources dan prompts MCP belum mempunyai antarmuka tersendiri pada versi ini.'
        ]
      }
    ],
    related: ['plugins', 'tools', 'permissions', 'privacy']
  },
  {
    id: 'skills',
    category: 'extend',
    title: 'User Skills dan skill yang dipelajari',
    summary:
      'Skill adalah panduan kerja yang dibaca Mark untuk menangani suatu jenis tugas. Skill menyimpan instruksi, tahapan, dan bahan pendukung agar pendekatan yang sama dapat digunakan kembali melalui percakapan.',
    keywords:
      'skill SKILL.md markdown upload zip export editor create-plugin setup-google-workspace task learn',
    sections: [
      {
        title: 'Membuat dan memasang User Skills',
        paragraphs: [
          'Halaman User Skills menyediakan pembuatan, pembukaan, penyegaran daftar, dan pemasangan paket ZIP. Editor memungkinkan Anda mengubah instruksi serta mengelola berkas dan folder pendukung.',
          'Skill umumnya memiliki SKILL.md pada folder ~/.agents/skills. Tulis nama, deskripsi, langkah kerja, dan batas penggunaan yang jelas agar Mark memahami kapan panduan perlu diterapkan.'
        ],
        links: [
          {
            label: 'Buka User Skills',
            to: '/skills'
          }
        ]
      },
      {
        title: 'Menggunakan skill dalam chat',
        paragraphs: [
          'Ketik / dan pilih skill dari saran, lalu tulis kebutuhan Anda. Skill bawaan yang tersedia mencakup /task, /setup-google-workspace, dan /create-plugin. Daftar pada aplikasi menjadi acuan skill yang dapat dipilih.',
          'Mark memperoleh nama, deskripsi, sumber, dan lokasi skill dari katalog. Isi lengkap dibaca ketika digunakan, beserta direktori dasar untuk mencari referensi atau skrip pendukung. Penanda Menggunakan pada jawaban menunjukkan sumber dan referensi yang dipakai. Skill yang hanya mengizinkan pemanggilan eksplisit tidak dipilih otomatis.'
        ],
        example:
          '/create-plugin Buat plugin untuk membaca ringkasan penggunaan penyimpanan pada folder yang saya tentukan.'
      },
      {
        title: 'Migrasi dan skill yang dipelajari',
        paragraphs: [
          'Gunakan Migrasi skill lama untuk memindahkan paket dari Documents/Mark Skills ke ~/.agents/skills. Folder dan bahan pendukung dipindahkan tanpa menimpa nama yang sudah ada. Perubahan pada folder bersama juga dapat terlihat oleh agen lain yang membacanya.',
          'Mark dapat menyimpan prosedur yang dipelajari melalui tool learn. Hasilnya tersedia di Neural Core > Skill dipelajari dan dikelola terpisah dari paket User Skills. Tidak setiap percakapan atau percobaan otomatis disimpan sebagai skill.'
        ]
      },
      {
        title: 'Hubungan skill dan tool',
        paragraphs: [
          'Skill memberi petunjuk cara bekerja, sedangkan tool menjalankan tindakan. Panduan membuat dokumen, misalnya, tetap memerlukan tool yang mampu membaca atau membuat berkas terkait.',
          'Mengimpor skill tidak otomatis memasang aplikasi, menghubungkan akun, atau memberi izin tindakan. Instruksi skill tetap mengikuti permintaan Anda serta akses yang tersedia.'
        ]
      }
    ],
    related: ['plugins', 'workflows', 'google', 'neural']
  },
  {
    id: 'google',
    category: 'extend',
    title: 'Google Workspace',
    summary:
      'Google Workspace adalah integrasi akun Google untuk mengakses Drive, Calendar, dan Gmail dari Mark. Koneksi menggunakan OAuth, sehingga akun perlu memberikan akses pada layanan yang akan dipakai.',
    keywords:
      'google OAuth client id secret consent Drive Calendar Gmail gdrive gcalendar gmail email agenda dokumen login install',
    sections: [
      {
        title: 'Menghubungkan akun',
        paragraphs: [
          'Buka Add-ons > Google Workspace untuk memulai penyiapan. Panduan /setup-google-workspace membantu menyiapkan proyek OAuth, mengaktifkan API, dan memberikan akses melalui akun Google.',
          'Setelah penyiapan, periksa status koneksi dan coba tindakan baca seperti melihat agenda. Jika gagal, periksa pesan kendala sebelum mengulang login atau mengubah konfigurasi.'
        ],
        links: [
          {
            label: 'Buka Google Workspace',
            to: '/addons/google-workspace'
          }
        ]
      },
      {
        title: 'Bekerja dengan Drive',
        paragraphs: [
          'Mark dapat mencari dan menampilkan daftar berkas, membaca konten yang didukung, mengunggah atau membuat berkas, memindahkan, menyalin, melihat metadata, dan mengatur pembagian akses. Sebutkan nama, lokasi, atau tujuan agar berkas yang dipilih sesuai.',
          'Pembacaan Google Docs atau Sheets mengikuti format yang tersedia melalui tool. Integrasi ini tidak menyediakan seluruh kemampuan editor visual aplikasi Google. Jelaskan jenis perubahan atau keluaran yang Anda butuhkan sebelum meminta pekerjaan.'
        ]
      },
      {
        title: 'Calendar dan Gmail',
        paragraphs: [
          'Calendar menyediakan pembacaan agenda serta pembuatan dan penghapusan event. Gmail menyediakan pencarian, daftar pesan, pembacaan, pengiriman, dan penandaan email sebagai telah dibaca.',
          'Sebutkan tanggal, penerima, atau topik yang dimaksud. Jika hanya ingin pemeriksaan, tulis bahwa Mark belum perlu membuat event atau mengirim email.'
        ],
        example:
          'Ringkas agenda besok dan email terkait rapat. Jangan membuat event atau mengirim email dulu.'
      },
      {
        title: 'Memeriksa masalah akses',
        paragraphs: [
          'Koneksi dapat gagal karena akses dibatalkan, API belum aktif, izin akun tidak sesuai, atau kebijakan organisasi. Status terhubung tidak memastikan seluruh API sudah diberi akses.',
          'Gunakan pesan kegagalan untuk menentukan layanan yang perlu diperiksa. Bila koneksi memerlukan login kembali, lakukan melalui alur Google Workspace dan hindari membagikan token melalui chat.'
        ]
      }
    ],
    related: ['addons', 'skills', 'permissions', 'privacy']
  },
  {
    id: 'telegram',
    category: 'extend',
    title: 'Bot Telegram',
    summary:
      'Bot Telegram adalah penghubung untuk mengirim instruksi dan menerima hasil Mark melalui Telegram. Komputer yang menjalankan Mark tetap memproses pekerjaan, sementara bot menjadi jalur percakapannya.',
    keywords:
      'telegram bot BotFather token admin id accept reject session always screenshot-to-tg tg-send log disconnect',
    sections: [
      {
        title: 'Menyiapkan bot',
        paragraphs: [
          'Buat bot melalui BotFather, lalu simpan tokennya secara pribadi. Buka Add-ons > Telegram untuk memasukkan token dan ID admin yang boleh mengakses Mark.',
          'Setelah tersambung, kirim pesan percobaan ke bot dan periksa balasannya. Halaman log membantu mengikuti percakapan yang masuk melalui jalur Telegram.'
        ],
        links: [
          {
            label: 'Atur Telegram',
            to: '/addons/telegram'
          },
          {
            label: 'Buka log bot',
            to: '/telegram-bot'
          }
        ]
      },
      {
        title: 'Menggunakan Mark dari jarak jauh',
        paragraphs: [
          'Bot dapat meneruskan permintaan kepada Mark dan mengirim balasan, notifikasi, screenshot, atau hasil yang didukung tool. Gunakan instruksi yang jelas mengenai pekerjaan dan berkas yang ingin dikirim.',
          'Komputer, proses Mark, dan koneksi internet harus tetap aktif. Menutup Telegram tidak menghentikan server Mark, tetapi mematikan komputer membuat layanan tidak dapat melanjutkan pekerjaan.'
        ]
      },
      {
        title: 'Persetujuan dan pengelolaan koneksi',
        paragraphs: [
          'ID admin menentukan pengguna yang boleh memberi instruksi melalui bot. Saat tindakan memerlukan persetujuan, bot dapat menampilkan pilihan /accept, /session, /always, atau /reject sesuai alur yang tersedia.',
          'Kelola atau putuskan koneksi melalui detail add-on. Gunakan halaman log untuk pemantauan pesan dan jangan membagikan token bot dalam chat atau screenshot.'
        ]
      }
    ],
    related: ['addons', 'permissions', 'media', 'privacy']
  },
  {
    id: 'settings',
    category: 'manage',
    title: 'Pengaturan Mark',
    summary:
      'Pengaturan Mark adalah halaman untuk menyesuaikan model AI, perilaku, perangkat, pintasan, dan izin tersimpan. Perubahan diterapkan melalui tombol Simpan perubahan setelah Anda selesai mengisi konfigurasi.',
    keywords:
      'configuration simpan batalkan provider model temperature kepribadian awareness super effort microphone kamera shortcut permission',
    sections: [
      {
        title: 'Menemukan pengaturan yang diperlukan',
        paragraphs: [
          'Bagian AI mengatur provider, model, endpoint, dan kredensial. Bagian Perilaku mengatur gaya bicara, kreativitas jawaban, Awareness Engine, serta Super Effort. Gunakan kedua bagian ini untuk menyesuaikan cara Mark memahami dan mengerjakan permintaan.',
          'Suara mengatur bahasa input dan kata panggilan, sedangkan Kamera menyediakan pilihan perangkat dan pratinjau. Pintasan mengatur kombinasi tombol untuk memanggil Mark. Izin akses menampilkan folder atau perintah yang sudah diizinkan secara permanen.'
        ],
        links: [
          {
            label: 'Buka Pengaturan',
            to: '/config'
          }
        ]
      },
      {
        title: 'Menyimpan atau membatalkan perubahan',
        paragraphs: [
          'Isian yang belum disimpan tetap tersedia ketika Anda berpindah bagian dalam formulir. Setelah selesai, pilih Simpan perubahan pada bagian bawah halaman agar konfigurasi diterapkan.',
          'Pilih Batalkan untuk mengembalikan perubahan yang belum disimpan. Penghapusan izin dan perubahan pintasan juga perlu disimpan sebelum berlaku.'
        ]
      },
      {
        title: 'Pintasan dan izin perangkat',
        paragraphs: [
          'Fokuskan kolom pintasan lalu tekan kombinasi tombol, atau gunakan pilihan yang disediakan. Tekan Esc jika ingin membatalkan perekaman tombol. Pintasan lintas aplikasi mengikuti dukungan sistem dan mode launcher.',
          'Izin mikrofon atau kamera browser perlu diberikan selain pengaturan aplikasi. Jika perangkat tidak dapat digunakan, periksa pilihan perangkat Windows dan izin pada browser yang membuka Mark.'
        ]
      }
    ],
    related: ['getting-started', 'awareness', 'voice-camera', 'permissions']
  },
  {
    id: 'permissions',
    category: 'manage',
    title: 'Persetujuan dan akses tool',
    summary:
      'Persetujuan tool adalah mekanisme untuk menentukan apakah Mark boleh menjalankan suatu tindakan. Anda dapat memberi izin sekali, selama sesi, atau secara permanen, serta mengatur Auto Mode sesuai pekerjaan yang dipercayakan.',
    keywords:
      'approval keamanan izin whitelist auto mode bypass sandbox shell hapus file delete risk',
    sections: [
      {
        title: 'Memilih durasi izin',
        paragraphs: [
          'Baca tindakan, target, dan input yang ditampilkan sebelum memberi persetujuan. Izinkan Sekali berlaku untuk permintaan tersebut. Izinkan Sesi Ini mengingat pilihan pada sesi yang sesuai, sedangkan Izinkan Selamanya menyimpan izin untuk target atau perintah yang dikenali.',
          'Tolak mencegah permintaan yang sedang menunggu dilanjutkan. Setelah menolak, Anda dapat memberi arahan lain, misalnya mengganti target atau meminta Mark menjelaskan tindakan terlebih dahulu.'
        ]
      },
      {
        title: 'Auto Mode dan izin yang sudah diberikan',
        paragraphs: [
          'Auto Mode, izin sesi, dan izin permanen dapat membuat permintaan yang cocok berjalan tanpa dialog baru. MCP mengikuti pengaturan persetujuan tool yang sama, sehingga izin aktif dapat berlaku pada pemanggilannya.',
          'Beberapa fitur mempunyai aturan khusus. Membuka sesi Computer Use tetap memerlukan persetujuan baru. Pilih durasi izin berdasarkan jenis pekerjaan serta akses yang ingin Anda berikan.'
        ]
      },
      {
        title: 'Meninjau dan mencabut izin',
        paragraphs: [
          'Buka Pengaturan > Izin akses, hapus entri yang tidak diperlukan, lalu simpan perubahan. Tindakan berikutnya yang membutuhkan izin tersebut dapat kembali meminta persetujuan.',
          'Pencabutan tidak mengurungkan pekerjaan sebelumnya. Mark tetap merupakan layanan lokal dengan akses berkas dan otomasi komputer; pemilihan workspace serta dialog persetujuan tidak membentuk sandbox sistem operasi.'
        ]
      }
    ],
    related: ['settings', 'plugins', 'computer', 'privacy']
  },
  {
    id: 'privacy',
    category: 'manage',
    title: 'Data lokal, cadangan, dan pemulihan',
    summary:
      'Data Mark disimpan pada komputer pengguna, sementara pemrosesan AI dan layanan tertentu mengikuti konfigurasi yang dipilih. Artikel ini menjelaskan lokasi data, penggunaan layanan eksternal, serta cara membuat cadangan dan memulihkannya.',
    keywords:
      'privasi privacy local cloud backup JSON restore reset export SQLite database config Documents Mark Workspace Mark Plugins Mark Skills',
    sections: [
      {
        title: 'Lokasi data dan berkas',
        paragraphs: [
          'Database utama mark.db dan konfigurasi berada pada folder pengguna .config/mark-agent. Workspace umum menggunakan Documents/Mark Workspace, plugin lokal berada pada Documents/Mark Plugins, dan User Skills berada pada ~/.agents/skills.',
          'Keluaran tugas dan unggahan dapat mempunyai lokasi tersendiri. Gunakan tautan atau tombol folder hasil untuk menemukan berkasnya. Paket skill lama dari Documents/Mark Skills dapat dipindahkan melalui migrasi pada halaman Skills.'
        ]
      },
      {
        title: 'Pemrosesan lokal dan layanan eksternal',
        paragraphs: [
          'Riwayat serta memori disimpan lokal, tetapi konteks yang diperlukan dikirim ke provider AI yang Anda gunakan. Memilih provider online dapat melibatkan isi pesan, bahan yang dibaca, atau konteks lain yang diperlukan untuk jawaban.',
          'Model lokal membantu pemrosesan AI berlangsung lokal. Fitur jaringan seperti Google, Telegram, pencarian web, YouTube, dan layanan pengenalan suara tetap dapat menggunakan layanan eksternal. Periksa layanan yang diperlukan ketika memilih cara kerja sesuai kebutuhan data Anda.'
        ]
      },
      {
        title: 'Cadangan dan pemulihan',
        paragraphs: [
          'Buka Neural Core > Kelola data lalu pilih Unduh JSON untuk membuat salinan data. Simpan cadangan di tempat yang Anda percayai karena isinya dapat mencakup percakapan dan konfigurasi sensitif.',
          'Untuk memulihkan, pilih berkas JSON dan baca konfirmasi penggantian data. Kredensial MCP disimpan terpisah dan tidak disertakan dalam backup; setelah restore, masukkan kembali kredensial atau login untuk menghubungkannya.'
        ],
        links: [
          {
            label: 'Kelola data Mark',
            to: '/neural-core?tab=data'
          }
        ]
      },
      {
        title: 'Reset data Mark',
        paragraphs: [
          'Reset memerlukan dua tahap konfirmasi dan teks RESET MARK. Dialog menjelaskan data AI yang akan dihapus, termasuk riwayat, memori, skill dipelajari, perkembangan karakter, dan tugas. Konfigurasi sistem dipertahankan.',
          'Reset database tidak menghapus seluruh berkas workspace atau paket plugin pada disk. Buat cadangan terlebih dahulu jika masih ada data yang ingin digunakan kembali.'
        ]
      }
    ],
    related: ['permissions', 'settings', 'neural', 'runtime']
  },
  {
    id: 'runtime',
    category: 'manage',
    title: 'Menjalankan Mark dan pembaruan',
    summary:
      'Mark berjalan melalui server lokal Node.js dan antarmuka web. Launcher menghubungkan keduanya, sementara monitor terminal menyediakan informasi layanan dan kontrol selama aplikasi berjalan.',
    keywords:
      'Windows Node Edge Chrome app mode CLI launcher monitor update npm start dev no-launch headless no-ui version port localhost restart',
    sections: [
      {
        title: 'Memahami proses aplikasi',
        paragraphs: [
          'Pada Windows, launcher dapat membuka antarmuka melalui Edge App Mode. Anda juga dapat menggunakan browser untuk membuka layanan Mark. Server menangani penyimpanan, tool, dan pekerjaan latar belakang.',
          'Menutup halaman antarmuka belum tentu menghentikan server. Periksa terminal atau launcher ketika ingin mengetahui apakah Mark masih berjalan. Jika tidak merespons, lihat pesan startup dan alamat layanan yang digunakan.'
        ]
      },
      {
        title: 'Menggunakan monitor terminal',
        paragraphs: [
          'Monitor CLI menampilkan kondisi layanan dan aktivitas. Dalam terminal interaktif, u membuka antarmuka, p menampilkan informasi pembaruan, c membersihkan tampilan, dan q keluar.',
          'Jika port awal sedang digunakan, layanan dapat memilih port berikutnya. Ikuti alamat yang ditampilkan launcher agar antarmuka terhubung ke proses yang benar.'
        ]
      },
      {
        title: 'Memperbarui dan memeriksa kebutuhan fitur',
        paragraphs: [
          'Ikuti informasi versi serta petunjuk pembaruan yang tersedia untuk metode instalasi Anda, kemudian mulai ulang Mark. Cadangkan data sebelum mengganti instalasi. Ekstensi Chrome Bridge juga perlu dimuat ulang di Chrome setelah paketnya diperbarui.',
          'Model lokal memerlukan server model dan sumber daya komputer. Browser, Computer Use, kamera, mikrofon, serta integrasi akun memerlukan aplikasi, perangkat, atau izin pendukung. Jika fitur gagal, periksa kebutuhan tersebut melalui pesan kendala dan panduan fitur terkait.'
        ]
      }
    ],
    related: ['getting-started', 'privacy', 'chrome-bridge', 'faq']
  },
  {
    id: 'faq',
    category: 'manage',
    title: 'Kendala dan pertanyaan umum',
    summary:
      'Bagian bantuan mengumpulkan pertanyaan umum dan langkah pemeriksaan ketika fitur Mark tidak berjalan sesuai harapan. Gunakan gejala dan pesan kesalahan untuk menentukan konfigurasi atau layanan yang perlu ditinjau.',
    keywords: 'FAQ bantuan troubleshoot error gagal lambat kosong tersambung stop token login',
    sections: [
      {
        title: 'Menentukan titik pemeriksaan',
        paragraphs: [
          'Catat pekerjaan yang diminta, fitur yang digunakan, dan pesan kesalahan yang muncul. Periksa koneksi provider untuk kegagalan jawaban AI, izin perangkat untuk suara atau kamera, serta status layanan untuk masalah integrasi.',
          'Pertanyaan umum di bagian ini melengkapi artikel fitur. Jika masalah muncul setelah perubahan konfigurasi, bandingkan pengaturan terbaru dan uji dengan permintaan sederhana sebelum melanjutkan pekerjaan yang lebih besar.'
        ]
      }
    ]
  }
]

const legacySections = {
  pengantar: 'overview',
  carakerja: 'agent',
  emosi: 'awareness',
  plugin: 'plugins',
  tips: 'faq'
}
export function guideArticleId(value) {
  const id = legacySections[value] || value
  return guideArticles.some((article) => article.id === id) ? id : 'overview'
}

export function searchGuide(query, { toolText = '', faqText = '' } = {}) {
  const words = query
    .trim()
    .toLocaleLowerCase('id-ID')
    .split(/\s+/)
    .map((word) => word.replace(/^[@/]/, ''))
    .filter(Boolean)
  if (!words.length) return guideArticles
  return guideArticles.filter((article) => {
    const text = [
      article.title,
      article.summary,
      article.keywords,
      ...article.sections.flatMap((section) => [
        section.title,
        ...(section.paragraphs || []),
        ...(section.steps || []),
        ...(section.bullets || []),
        section.example
      ]),
      article.id === 'tools' ? toolText : '',
      article.id === 'faq' ? faqText : ''
    ]
      .join(' ')
      .toLocaleLowerCase('id-ID')
    return words.every((word) => text.includes(word))
  })
}
