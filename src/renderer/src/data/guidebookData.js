export const guideCategories = [
  { id: 'start', title: 'Mulai menggunakan Mark' },
  { id: 'work', title: 'Pekerjaan dan otomasi' },
  { id: 'personal', title: 'Interaksi dan memori' },
  { id: 'extend', title: 'Add-ons dan ekstensi' },
  { id: 'manage', title: 'Pengaturan dan bantuan' }
]

export const guideArticles = [
  {
    id: 'overview',
    category: 'start',
    title: 'Mengenal Mark',
    summary: 'Asisten AI di komputer Anda untuk percakapan, pekerjaan, dan otomasi.',
    keywords: 'beranda avatar companion menu studio fitur kemampuan',
    sections: [
      {
        title: 'Beranda dan Chat Studio',
        paragraphs: [
          'Beranda menampilkan avatar Mark, respons langsung, aktivitas tool, dan kontrol percakapan. Chat Studio menyediakan riwayat yang lebih luas, daftar sesi, workspace, dan panel Browser. Keduanya memakai mesin AI dan penyimpanan yang sama.'
        ],
        links: [{ label: 'Buka Chat Studio', to: '/chat' }]
      },
      {
        title: 'Kemampuan utama',
        bullets: [
          'Menjawab pertanyaan, membantu menulis, membaca dokumen, dan menelusuri web.',
          'Membaca serta mengubah berkas, menjalankan perintah, membantu coding, dan memeriksa Git.',
          'Mengoperasikan browser bawaan, tab Chrome pilihan, atau aplikasi Windows.',
          'Membagi pekerjaan ke Minibots dan menyusun pekerjaan bertahap dengan Task Workflow.',
          'Mengelola memori dan skill, memakai suara atau kamera, memutar musik, serta terhubung ke Google Workspace dan Telegram.'
        ]
      },
      {
        title: 'Kebutuhan setiap fitur',
        paragraphs: [
          'Sebagian fitur bekerja dengan layanan lokal. Pencarian web, provider online, musik YouTube, dan integrasi layanan memerlukan internet. Hasil kerja bergantung pada kemampuan model, izin, perangkat, serta layanan yang sudah dihubungkan. Mark dapat salah; periksa hasil sebelum digunakan.'
        ]
      }
    ],
    related: ['getting-started', 'chat', 'tools', 'privacy']
  },
  {
    id: 'getting-started',
    category: 'start',
    title: 'Pengaturan awal dan provider AI',
    summary: 'Pilih Gemini Web, DeepSeek Web, LM Studio, atau endpoint API sendiri.',
    keywords: 'instalasi setup model custom API key localhost internet offline',
    sections: [
      {
        title: 'Mulai dari provider AI',
        steps: [
          'Buka Pengaturan Mark, lalu pilih bagian AI.',
          'Pilih provider dan lengkapi kolom yang muncul.',
          'Simpan pengaturan, lalu kirim pertanyaan singkat untuk memeriksa koneksi.'
        ],
        links: [{ label: 'Buka Pengaturan', to: '/config' }]
      },
      {
        title: 'Pilihan yang tersedia',
        bullets: [
          'Gemini Web: pilih model dari daftar. Jalur ini tidak meminta API key, memerlukan internet, dan saat ini tidak mendukung input gambar.',
          'DeepSeek Web: masukkan user token sesuai petunjuk di Pengaturan. Integrasi memakai sesi web, bukan API resmi; akses dapat dibatasi layanan.',
          'LM Studio: jalankan server lokal dan muat model yang akan digunakan, lalu isi nama model di Mark.',
          'Custom API: isi URL lengkap berakhiran /chat/completions, ID model, serta API key jika diperlukan. Endpoint dapat berupa layanan lokal atau online yang kompatibel.'
        ]
      },
      {
        title: 'Dukungan gambar',
        paragraphs: [
          'Kemampuan membaca gambar mengikuti model dan provider yang dipakai. Memilih model teks saja tidak mengaktifkan vision. Jika gambar tidak dapat dianalisis, gunakan model yang mendukungnya atau kirim teks yang perlu diperiksa.'
        ]
      }
    ],
    related: ['settings', 'voice-camera', 'privacy', 'faq']
  },
  {
    id: 'chat',
    category: 'start',
    title: 'Percakapan, lampiran, dan konteks',
    summary: 'Kirim instruksi, sertakan berkas, dan pilih konteks yang tepat.',
    keywords:
      'chat studio pesan proses aktivitas pemikiran lampiran paste drag drop mention tag @ file slash stop context token',
    sections: [
      {
        title: 'Tujuan dan hasil yang diinginkan',
        paragraphs: [
          'Jelaskan pekerjaan, lokasi berkas, batasan, dan bentuk hasil yang Anda butuhkan. Untuk tugas besar, sebutkan cara memeriksa keberhasilannya. Anda dapat memberi arahan tambahan saat pekerjaan berlangsung.'
        ],
        example:
          'Periksa proyek pada workspace ini. Temukan penyebab build gagal, perbaiki, lalu jalankan build untuk memeriksa hasilnya.'
      },
      {
        title: 'Lampiran dan penandaan',
        bullets: [
          'Gunakan tombol lampiran atau seret berkas ke kolom pesan. Gambar dari clipboard juga dapat ditempelkan.',
          'Ketik @ untuk mencari berkas workspace atau memilih grup tool dan plugin aktif. Pilih saran yang muncul agar konteksnya dikenali.',
          'Ketik / untuk memilih skill. Skill memberi petunjuk kerja kepada AI; kemampuan mengeksekusi tetap berasal dari tool yang tersedia.'
        ]
      },
      {
        title: 'Membaca proses pekerjaan',
        paragraphs: [
          'Bagian Proses memuat pesan kemajuan dan Aktivitas yang dapat dibuka untuk melihat pemanggilan tool. Detail Pemikiran tersedia jika respons model menyertakannya. Jawaban yang hanya berisi hasil akhir tidak memerlukan daftar langkah. Hasil visual atau berkas dapat ditampilkan sebagai pratinjau atau tautan artifact.'
        ]
      },
      {
        title: 'Menghentikan dan melanjutkan',
        paragraphs: [
          'Gunakan tombol penghentian pada area pesan untuk membatalkan proses aktif, lalu berikan arahan baru. Penghentian tidak membatalkan perubahan yang sudah terjadi pada berkas, halaman web, atau layanan lain. Konteks dapat diringkas ketika percakapan panjang; gunakan berkas dan sasaran yang jelas untuk melanjutkan pekerjaan.'
        ]
      }
    ],
    related: ['workspaces', 'agent', 'skills', 'permissions']
  },
  {
    id: 'workspaces',
    category: 'start',
    title: 'Sesi dan workspace',
    summary: 'Pisahkan percakapan umum dan pekerjaan berdasarkan folder proyek.',
    keywords:
      'main thread percakapan umum tambah folder sidebar editor judul sesi hapus workspace @workspace',
    sections: [
      {
        title: 'Percakapan umum dan folder proyek',
        paragraphs: [
          'Main Thread memakai folder Documents/Mark Workspace dan selalu berada dalam kelompok Percakapan Umum. Folder Main Thread tidak dapat diganti. Sesi lain dapat memakai folder proyek sendiri sehingga pencarian berkas dan tool mengikuti lokasi kerja sesi tersebut. Workspace memberi konteks kerja, bukan pembatas akses filesystem seperti sandbox.'
        ]
      },
      {
        title: 'Membuat dan mengatur sesi',
        steps: [
          'Buka Chat Studio. Gunakan Percakapan Baru untuk sesi umum, atau Tambah Workspace untuk memilih folder dan membuat sesi di dalamnya.',
          'Gunakan tombol tambah pada sebuah kelompok untuk membuat sesi dengan folder yang sama.',
          'Buka pengaturan sesi untuk mengubah judul atau workspace, lalu Simpan. Workspace tidak dapat diganti ketika sesi sedang berjalan.'
        ],
        links: [{ label: 'Buka Chat Studio', to: '/chat' }]
      },
      {
        title: 'Sidebar dan penghapusan',
        paragraphs: [
          'Sidebar dapat dilipat dan memiliki pencarian sesi. Membuka panel Browser memberi lebih banyak ruang dengan melipat sidebar. Menghapus sesi melalui konfirmasi hanya menghapus percakapan tersebut; folder proyek dan berkas di dalamnya tidak ikut dihapus.'
        ]
      }
    ],
    related: ['chat', 'files', 'browsers', 'privacy']
  },
  {
    id: 'agent',
    category: 'work',
    title: 'Cara kerja agen dan Super Effort',
    summary: 'Pahami hubungan instruksi, tool, hasil pemeriksaan, dan jawaban akhir.',
    keywords:
      'ReAct reasoning thought action observation read-tools routing auto mode rencana verifikasi',
    sections: [
      {
        title: 'Dari instruksi ke tindakan',
        paragraphs: [
          'Mark menyusun langkah, memilih tool, membaca hasilnya, dan menentukan tindakan berikutnya. Satu permintaan dapat membutuhkan beberapa aksi. Pesan kemajuan belum berarti tugas berhasil; lihat hasil tool, berkas keluaran, dan pemeriksaan yang dilaporkan.'
        ]
      },
      {
        title: 'Grup tool dimuat sesuai kebutuhan',
        paragraphs: [
          'Tool inti tersedia untuk pekerjaan dasar. Mark dapat memuat grup tambahan melalui read-tools; penandaan @grup atau @plugin membantu memilih kemampuan yang dimaksud. Tidak semua tool dimasukkan ke setiap permintaan model sekaligus.'
        ]
      },
      {
        title: 'Super Effort dan mode otomatis',
        paragraphs: [
          'Super Effort menekankan kelanjutan pekerjaan dan pemeriksaan hasil sebelum selesai. Pengaturan ini tersedia di Pengaturan serta kontrol pada kolom pesan. Mode otomatis pada sesi berkaitan dengan persetujuan tool; fungsinya berbeda dari Super Effort dan dapat melewati dialog izin pada sesi tersebut. Aktifkan sesuai pekerjaan yang Anda percayakan.'
        ]
      },
      {
        title: 'Menangani kendala',
        paragraphs: [
          'Jika model, layanan, atau tool gagal, baca pesan kendalanya dan tentukan langkah berikutnya. Login, CAPTCHA, keputusan pengguna, atau akses yang belum tersedia dapat memerlukan bantuan Anda.'
        ]
      }
    ],
    related: ['tools', 'workflows', 'subagents', 'permissions']
  },
  {
    id: 'tools',
    category: 'work',
    title: 'Referensi tool',
    summary: 'Nama, fungsi, grup, dan parameter tool yang dikenali Mark.',
    keywords: 'registry schema parameter read-tools core builtin native tool action fungsi',
    sections: [
      {
        title: 'Cara memakai referensi ini',
        paragraphs: [
          'Anda tidak perlu menulis parameter tool untuk memakai Mark. Berikan instruksi melalui chat. Referensi ini membantu memeriksa kemampuan dan format input saat menyusun plugin, skill, atau instruksi teknis.'
        ],
        bullets: [
          'Daftar bawaan mengikuti schema aplikasi, bukan daftar nama yang ditulis ulang secara manual.',
          'Grup aktif dan tool plugin dimuat dari Mark ketika referensi dibuka. Layanan terhubung tetap menjadi syarat penggunaan tool integrasi.',
          'Nama tool dapat muncul dalam lebih dari satu grup. Jumlah tool unik dihitung tanpa duplikasi.',
          'Persetujuan mengikuti aksi, sesi, dan izin tersimpan. Tool tanpa dialog pada suatu kondisi tidak otomatis berarti aman untuk semua penggunaan.'
        ]
      }
    ],
    related: ['agent', 'plugins', 'permissions']
  },
  {
    id: 'browsers',
    category: 'work',
    title: 'Pencarian web dan browser bawaan',
    summary: 'Cari sumber, baca artikel, dan operasikan halaman di panel Browser.',
    keywords:
      'browser_use browser-search browser-fetch browser-navigate read click type scroll extract script screenshot download localhost login',
    sections: [
      {
        title: 'Pencarian dan pembacaan cepat',
        paragraphs: [
          'browser-search mencari judul dan URL. browser-fetch mengambil isi teks tanpa membuka panel Browser. Untuk halaman dinamis, formulir, login, atau interaksi, Mark dapat membuka browser bawaan. Hasil pencarian dan isi website tetap perlu diperiksa sebelum dijadikan kesimpulan.'
        ]
      },
      {
        title: 'Panel Browser dalam Chat Studio',
        paragraphs: [
          'Browser bawaan adalah pilihan untuk permintaan browser umum, termasuk membuka localhost. Panel mendukung pembacaan halaman, klik, pengetikan, scroll, ekstraksi data, JavaScript, tangkapan layar, unduhan, serta penutupan sesi. Anda dapat mengikuti halaman dari dalam Mark.'
        ],
        example:
          'Buka localhost proyek ini di browser bawaan, periksa formulirnya, lalu ambil screenshot hasil pengujian.'
      },
      {
        title: 'Login dan sesi',
        paragraphs: [
          'Browser bawaan memakai sesi browser yang terkait percakapan; sesi Minibot dipisahkan dari agen lain. Login atau cookie di Chrome pribadi tidak otomatis tersedia di browser bawaan. Untuk memakai tab Chrome yang sudah login, gunakan Chrome Bridge.'
        ]
      },
      {
        title: 'Bantuan pengguna',
        paragraphs: [
          'CAPTCHA, verifikasi akun, atau pilihan sensitif dapat membutuhkan tindakan Anda. Jangan mengirim password atau token ke dalam pesan. Pembatalan aksi tidak mengembalikan perubahan situs yang sudah terlanjur dikirim.'
        ]
      }
    ],
    related: ['chrome-bridge', 'workspaces', 'computer', 'permissions']
  },
  {
    id: 'computer',
    category: 'work',
    title: 'Kendali komputer Windows',
    summary: 'Operasikan aplikasi desktop melalui screenshot, mouse, keyboard, dan jendela.',
    keywords:
      'computer_use desktop Win32 daemon screenshot click drag hotkey batch windows Ctrl Shift R emergency overlay mouse terkunci',
    sections: [
      {
        title: 'Aksi yang didukung',
        bullets: [
          'Mengambil tangkapan layar dan membaca kondisi desktop.',
          'Klik biasa, ganda, kanan, tengah, gerakan mouse, tahan atau lepas tombol, drag, dan scroll.',
          'Mengetik teks, menekan tombol, mengirim kombinasi keyboard, serta menjalankan rangkaian aksi.',
          'Membuka aplikasi, melihat daftar jendela, memfokuskan, dan memaksimalkan jendela.'
        ]
      },
      {
        title: 'Desktop yang digunakan',
        paragraphs: [
          'Mark meminta izin sebelum membuka sesi Computer Use. Setelah diizinkan, mouse dikunci dan pointer Windows digantikan secara visual oleh cursor Mark. Overlay terus muncul selama sesi aktif, termasuk saat Mark berpikir. Ketika Mark menutup sesi, mouse kembali tersedia dan overlay ditutup. Izin baru diperlukan untuk sesi berikutnya.',
          'Mark dapat mengklik lalu menunggu beberapa detik sebelum melihat hasil. Screenshot dikembalikan bersama hasil aksi, sehingga Mark tidak perlu mengambil gambar lagi hanya untuk memeriksa aksi tersebut. Gunakan browser bawaan untuk tugas web yang tidak perlu mengendalikan desktop.'
        ],
        example:
          'Buka Notepad, ketik daftar tugas berikut, lalu perlihatkan hasilnya tanpa menyimpan file.'
      },
      {
        title: 'Menghentikan kendali',
        paragraphs: [
          'Tekan Ctrl+Shift+R untuk membatalkan Computer Use. Pintasan ini bekerja tanpa memfokuskan overlay: kendali mouse dilepas, pointer dipulihkan, overlay ditutup, dan Mark menerima alasan pembatalan. Mark tidak boleh melanjutkan kendali desktop dalam giliran yang dibatalkan. Berikan instruksi baru jika ingin melanjutkan. Aksi yang sudah terjadi tidak otomatis diurungkan.'
        ]
      }
    ],
    related: ['browsers', 'files', 'voice-camera', 'permissions']
  },
  {
    id: 'files',
    category: 'work',
    title: 'Berkas, dokumen, coding, dan Git',
    summary: 'Cari dan ubah berkas, baca dokumen, jalankan perintah, dan periksa repositori.',
    keywords:
      'read-file read-image write-file replace-content replace-lines delete-file list-dir find-files grep-search file-outline read-document PDF DOCX PowerShell git diff terminal artifact',
    sections: [
      {
        title: 'Menemukan dan membaca informasi',
        paragraphs: [
          'Mark dapat melihat isi folder, mencari nama berkas atau teks, membaca bagian berkas, dan melihat garis besar kode. read-document menyediakan pembacaan teks dokumen, termasuk PDF dan DOCX. Pembacaan gambar mengikuti dukungan vision. Format lain bergantung pada pembaca yang tersedia; jangan menganggap semua format Office didukung penuh.'
        ]
      },
      {
        title: 'Mengubah proyek dan memeriksa hasil',
        paragraphs: [
          'Tool berkas mendukung pembuatan, penulisan ulang, penggantian teks atau baris, dan penghapusan. Mark juga dapat menjalankan PowerShell untuk build, pemeriksaan sintaks, atau test. Sebutkan folder target dan hasil yang diharapkan agar perubahan tidak dilakukan pada proyek yang salah.'
        ],
        example:
          'Cari komponen halaman login di workspace ini, perbaiki validasi email, lalu jalankan pemeriksaan proyek yang tersedia.'
      },
      {
        title: 'Git dan hasil perubahan',
        paragraphs: [
          'Grup Git menyediakan status repositori, diff, commit, dan revert. Minta pemeriksaan diff sebelum menyimpan perubahan ke riwayat Git. Pratinjau berkas dan perubahan pada chat membantu meninjau hasil; perubahan berkas, commit, dan revert memiliki dampak berbeda.'
        ]
      },
      {
        title: 'Pekerjaan terminal yang lama',
        paragraphs: [
          'run-task menjalankan proses di latar belakang, misalnya server pengembangan atau build panjang. Mark dapat membaca output, melihat daftar proses, dan menghentikannya melalui grup task_terminal. Proses latar belakang berbeda dari Minibots maupun daftar tahapan Task Workflow.'
        ]
      }
    ],
    related: ['workspaces', 'agent', 'workflows', 'permissions']
  },
  {
    id: 'subagents',
    category: 'work',
    title: 'Minibots',
    summary: 'Bagi pekerjaan ke agen terpisah dan pantau aktivitasnya.',
    keywords:
      'Minibots Minibot sub agent sub-agent subagent paralel multi agent spawn_subagent message_agent send_message list_subagents report_to_lead kill_subagent topologi',
    sections: [
      {
        title: 'Kapan memakai Minibot?',
        paragraphs: [
          'Gunakan untuk pekerjaan yang dapat dibagi menjadi tugas mandiri, misalnya riset beberapa topik atau pemeriksaan modul berbeda. Mark dapat membuat Minibot dan menggabungkan hasilnya. Profil agent menyimpan identitas dan akses tool. Setiap penugasan memiliki konteks, riwayat, hasil, dan percobaan eksekusi sendiri. Pekerjaan dijalankan oleh server dengan sesi browser terpisah.'
        ],
        example:
          'Bagi riset ini ke dua Minibot: satu memeriksa dokumentasi API, satu memeriksa contoh implementasi. Gabungkan temuan beserta sumbernya.'
      },
      {
        title: 'Menggunakan Minibots',
        steps: [
          'Buka Minibots untuk mencari agen menurut nama, peran, atau tugas dan memfilter statusnya.',
          'Gunakan Buat agen untuk menentukan nama, peran opsional, dan tugas. Pekerjaan dimulai setelah agen dibuat.',
          'Pilih agen untuk membaca Aktivitas atau Detail agen. Tampilan Topologi memperlihatkan hubungan agen dengan Mark.'
        ],
        links: [{ label: 'Buka Minibots', to: '/subagents' }]
      },
      {
        title: 'Instruksi lanjutan dan penghentian',
        paragraphs: [
          'Pesan dapat dikirim ketika agent masih bekerja dan dibaca pada batas langkah yang aman. Pilih Jadikan penugasan baru untuk memasukkan pekerjaan dengan konteks terpisah ke antrean. Semua agent dapat bekerja bersamaan tanpa batas jumlah dari scheduler. Satu agent tetap mengerjakan satu pekerjaan pada satu waktu. Pilih penugasan untuk meninjau aktivitas dan hasilnya. Hentikan membatalkan pekerjaan yang dipilih. Riwayat dipertahankan sebagai checkpoint; menghapus agent melalui konfirmasi juga menghapus penugasannya.'
        ]
      },
      {
        title: 'Menunggu, melanjutkan, dan pelaporan',
        paragraphs: [
          'Mark meninjau kendala teknis Minibot dan memberikan arahan secara otomatis. Pilihan pribadi, informasi Anda, atau persetujuan khusus dikumpulkan di bagian Koordinasi Minibots pada chat asal. Anda dapat menyetujui, menolak, atau mengirim arahan tanpa membuka agent satu per satu. Penulisan berkas biasa di workspace dapat ditinjau Mark; izin sensitif tetap mengikuti persetujuan Anda atau izin tersimpan.',
          'Agent dapat menunggu kolega, persetujuan tindakan, atau informasi pengguna. Mark menetapkan penugasan; agent bertukar informasi melalui kotak masuk tanpa menjalankan executor kolega. Pertanyaan yang tidak terjawab dalam 120 detik meminta peninjauan. Status Terputus memerlukan pemeriksaan langkah terakhir sebelum Lanjutkan pekerjaan. Status Gagal atau Dibatalkan menyediakan Coba lagi; aksi yang hasilnya tidak diketahui tidak otomatis diulang.',
          'Menutup atau memuat ulang UI tidak menghentikan pekerjaan selama server Mark hidup. Jika server berhenti, pekerjaan belum selesai menunggu peninjauan saat startup berikutnya. Laporan tersimpan di sesi asal sebelum notifikasi dikirim, termasuk ketika chat sedang sibuk atau UI tertutup. Laporan akhir baru otomatis ditinjau dan ditanggapi Mark saat Mark tidak sibuk, tanpa meminta pengguna mengetik perintah lanjutan. Jika UI tertutup, laporan menunggu sampai UI tersambung kembali. wait_subagents hanya opsional jika Anda khusus meminta menunggu.'
        ]
      },
      {
        title: 'Batas pemisahan agen',
        paragraphs: [
          'Sesi browser agen dipisahkan, tetapi berkas workspace dapat tetap dipakai bersama. Berikan bagian pekerjaan atau berkas yang berbeda agar perubahan tidak saling menimpa. Minibot tidak diberi orkestrasi rekursif untuk membuat Minibot baru.'
        ]
      }
    ],
    related: ['agent', 'workflows', 'browsers', 'permissions']
  },
  {
    id: 'workflows',
    category: 'work',
    title: 'Task Workflow dan hasil bertahap',
    summary: 'Susun pekerjaan panjang menjadi tahapan dengan hasil dan bukti pemeriksaan.',
    keywords:
      'agent workflows durable tasks task create_agent_task mark_done_task read_task update_task_plan checkpoint artifact /task',
    sections: [
      {
        title: 'Tahapan yang bisa diperiksa',
        paragraphs: [
          'Aktifkan dengan /task atau permintaan jelas membuat rencana kerja. Mark juga menggunakannya untuk tugas besar. Checklist dibuat terlebih dahulu, lalu Mark langsung mengerjakan poin aktif: kerjakan, periksa hasil, tandai selesai, lanjutkan. Server hanya menerima penyelesaian langkah aktif; langkah gagal atau menunggu tidak dihitung selesai. Pekerjaan sederhana dapat diselesaikan langsung.'
        ],
        example:
          '/task Susun laporan audit aplikasi ini: inventaris fitur, temukan masalah, lakukan perbaikan, lalu buat laporan pengujian.'
      },
      {
        title: 'Memantau hasil di chat',
        paragraphs: [
          'Kartu menampilkan judul, status, dan jumlah langkah yang benar-benar selesai. Klik langkah untuk membuka sasaran, hasil, bukti pemeriksaan, dan berkas jika tersedia. Aktivitas tool dan pemikiran berada di Detail proses yang tertutup secara default. Kartu terbuka selama berjalan dan otomatis ringkas setelah selesai; Anda dapat membukanya kembali. Audit baca-saja tidak wajib menghasilkan dokumen atau menjalankan build. Berkas dan folder hanya ditampilkan jika ada keluaran nyata.'
        ]
      },
      {
        title: 'Penyimpanan dan kelanjutan eksekusi',
        paragraphs: [
          'Checkpoint dan sesi asal disimpan. Setelah restart, pekerjaan yang terputus dijeda: pilih Lanjutkan pada kartu untuk memeriksa kondisi terakhir sebelum meneruskan. Coba lagi tersedia untuk kegagalan; Hentikan membatalkan workflow yang dipilih beserta penugasan Minibot terkait, tanpa mengganggu tugas lain. Mark dapat merevisi langkah yang belum dimulai dengan alasan singkat; langkah aktif dan selesai tetap dipertahankan. Minibot dapat bekerja di latar belakang sementara chat tetap digunakan; laporan melanjutkan workflow yang sesuai. Setelah semua poin selesai, satu jawaban penutup disusun dari hasil tersimpan, terpisah dari ringkasan checkpoint.'
        ]
      }
    ],
    related: ['agent', 'subagents', 'files', 'skills']
  },
  {
    id: 'neural',
    category: 'personal',
    title: 'Memori dan Neural Core',
    summary: 'Tinjau karakter, ingatan, arsip percakapan, dan skill yang dipelajari.',
    keywords:
      'neural core memory vector RAG orama SQLite profile preference notes learn karakter warmth sarcasm trust energy obedience kepatuhan peta node daftar groom backup',
    sections: [
      {
        title: 'Informasi yang disimpan',
        paragraphs: [
          'Mark menyimpan riwayat sesi, pasangan percakapan, arsip ringkasan, memori pengguna, dan skill yang dipelajari. Pencarian memori menggabungkan informasi teks dan kemiripan makna. Penyimpanan lokal tidak berarti AI selalu mengingat setiap detail; ingatan yang relevan dipilih untuk konteks saat itu.'
        ]
      },
      {
        title: 'Menjelajahi Neural Core',
        bullets: [
          'Ringkasan memberi pintasan ke karakter, memori, dan skill.',
          'Karakter menampilkan kehangatan, sarkasme, kepercayaan, energi, dan kepatuhan, beserta data evaluasinya.',
          'Memori membuka peta node secara default. Gunakan Daftar untuk mencari, memfilter, dan membuka data melalui teks.',
          'Skill dipelajari berisi panduan yang berhasil disimpan. Ini berbeda dari paket User Skills yang dipanggil dengan slash command.',
          'Rapikan memori menjalankan pemeriksaan atau penggabungan memori yang relevan. Kelola data menyediakan cadangan, pemulihan, dan reset.'
        ],
        links: [{ label: 'Buka Neural Core', to: '/neural-core' }]
      },
      {
        title: 'Menghapus ingatan',
        paragraphs: [
          'Buka data yang dimaksud dan gunakan tindakan penghapusan melalui konfirmasi. Menghapus memori tidak otomatis menghapus teks yang masih ada pada percakapan aktif, arsip lain, atau berkas proyek.'
        ]
      }
    ],
    related: ['awareness', 'skills', 'privacy', 'settings']
  },
  {
    id: 'awareness',
    category: 'personal',
    title: 'Avatar, karakter, dan Awareness',
    summary: 'Pahami status avatar dan inisiatif Mark berdasarkan aktivitas komputer.',
    keywords:
      'emosi mood neutral joy sadness anger fear disgust anxiety envy embarrassment ennui taktil pet bonk AFK idle proactive awareness',
    sections: [
      {
        title: 'Status dan ekspresi avatar',
        paragraphs: [
          'Avatar menampilkan keadaan seperti mendengarkan, berbicara, memproses, bekerja, dan memutar musik. Label mood mencakup netral serta sembilan kategori ekspresi lain. Interaksi sentuhan pada avatar juga dapat memengaruhi nilai relasi. Ini adalah perilaku yang dimodelkan perangkat lunak, bukan bukti kesadaran atau perasaan manusia.'
        ]
      },
      {
        title: 'Karakter mengikuti interaksi',
        paragraphs: [
          'Evaluasi relasi mempertimbangkan percakapan di sesi utama dan interaksi avatar. Anda dapat mengatur gaya bicara di Pengaturan dan meninjau sifat pada Neural Core. Memberi izin akses tool tidak sama dengan mengatur tingkat kepercayaan karakter.'
        ]
      },
      {
        title: 'Apa yang diperhatikan Awareness?',
        paragraphs: [
          'Awareness memeriksa aktivitas aplikasi atau judul jendela dan telemetri seperti keadaan idle, baterai, serta beban perangkat yang tersedia. Hasilnya dapat berupa pengamatan singkat, sapaan, atau inisiatif melalui Minibot. Setelah kembali dari kondisi AFK, Mark dapat mengevaluasi apakah sapaan diperlukan. Awareness berbeda dari permintaan screenshot atau penggunaan webcam.'
        ]
      },
      {
        title: 'Mengatur inisiatif',
        paragraphs: [
          'Buka Pengaturan > Perilaku untuk mematikan Awareness Engine, lalu Simpan. Fitur itu tidak perlu aktif untuk mengirim chat biasa. Mematikan Awareness tidak otomatis mematikan mikrofon atau mencabut izin kamera browser.'
        ]
      }
    ],
    related: ['neural', 'settings', 'voice-camera', 'privacy']
  },
  {
    id: 'voice-camera',
    category: 'personal',
    title: 'Suara, mikrofon, kamera, dan vision',
    summary: 'Berbicara dengan Mark dan menganalisis gambar, layar, atau kamera.',
    keywords:
      'STT speech recognition Web Speech wake word Hey Mark Halo Mark speak TTS Edge Ardi camera-look analyze-screen read-image screenshot microphone webcam',
    sections: [
      {
        title: 'Input dan balasan suara',
        paragraphs: [
          'Jalur input suara antarmuka memakai Web Speech API pada Edge atau Chrome. Aktifkan mikrofon dan berikan izin ketika diminta. Pengenalan suara mengikuti dukungan browser dan dapat memakai layanan online. Balasan suara memakai jalur TTS Mark; ketersediaan jaringan dan audio perangkat dapat memengaruhi hasilnya.'
        ]
      },
      {
        title: 'Bahasa dan kata panggilan',
        paragraphs: [
          'Pengaturan > Suara menyediakan bahasa input dan kata panggilan tambahan. Panggilan bawaan mencakup Hey Mark, Halo Mark, dan Mark. Mikrofon mengikuti perangkat utama Windows; tombol pengaturan suara membantu mengganti perangkat utama.'
        ]
      },
      {
        title: 'Kamera dengan pratinjau',
        steps: [
          'Buka Pengaturan > Kamera dan pilih perangkat yang digunakan.',
          'Tekan Mulai pratinjau untuk menyalakan kamera dan memeriksa hasilnya. Berikan izin akses melalui browser bila diminta.',
          'Hentikan pratinjau atau pindah bagian untuk mematikan aliran pratinjau. Simpan jika Anda mengubah pilihan atau izin penggunaan kamera.'
        ]
      },
      {
        title: 'Sumber gambar',
        bullets: [
          'read-image membaca berkas gambar.',
          'analyze-screen mengambil dan menganalisis tampilan desktop.',
          'camera-look memakai kamera untuk permintaan pengamatan fisik.',
          'Screenshot browser berasal dari halaman atau tab yang dikendalikan. Semua analisis gambar tetap bergantung pada provider vision yang digunakan.'
        ],
        example:
          'Lihat screenshot yang saya lampirkan dan jelaskan pesan errornya. Jangan mengubah berkas dulu.'
      }
    ],
    related: ['getting-started', 'computer', 'settings', 'privacy']
  },
  {
    id: 'media',
    category: 'personal',
    title: 'YouTube dan pemutar musik',
    summary: 'Cari video, rangkum transkrip, dan atur pemutaran musik.',
    keywords:
      'yt-search yt-summary youtube music-play music-toggle music-next music-prev playlist queue antrean pause volume',
    sections: [
      {
        title: 'Mencari dan merangkum video',
        paragraphs: [
          'yt-search mencari video, sedangkan yt-summary memproses isi transkrip yang tersedia. Tidak semua video menyediakan transkrip yang dapat diambil. Jika gagal, berikan transkrip sendiri atau minta Mark memakai sumber lain; jangan menganggap video sudah ditonton penuh.'
        ],
        example:
          'Ringkas video YouTube ini berdasarkan transkripnya. Pisahkan poin utama dan hal yang perlu diperiksa lagi.'
      },
      {
        title: 'Mengendalikan musik',
        paragraphs: [
          'Minta judul atau nama artis untuk memutar musik. Tool musik menyediakan putar, jeda atau lanjutkan, berikutnya, dan sebelumnya. Pemutar pada antarmuka memberi kontrol pemutaran serta antrean sesuai lagu yang tersedia. Pemutaran YouTube memerlukan internet dan mengikuti ketersediaan kontennya.'
        ],
        example: 'Putarkan musik instrumental untuk bekerja, lalu jeda setelah saya minta.'
      },
      {
        title: 'Pengiriman media',
        paragraphs: [
          'Pengiriman berkas atau hasil media melalui Telegram memerlukan bot yang terhubung dan penerima yang diizinkan. Kemampuan unduhan mengikuti tool yang tersedia serta respons layanan; pemutar musik tidak otomatis membuat semua video dapat diunduh.'
        ]
      }
    ],
    related: ['telegram', 'voice-camera', 'tools', 'faq']
  },
  {
    id: 'addons',
    category: 'extend',
    title: 'Memilih dan memasang add-on',
    summary: 'Hubungkan Chrome Bridge, Google Workspace, dan Telegram.',
    keywords: 'addons add-ons install uninstall connect connected status layanan katalog',
    sections: [
      {
        title: 'Add-on menghubungkan layanan',
        paragraphs: [
          'Katalog Add-ons menampilkan integrasi bawaan, penjelasan kemampuan, status, contoh permintaan, serta tindakan pemasangan atau pengelolaan. Memilih contoh permintaan menyiapkan pesan; contoh itu tidak langsung dikirim atau dijalankan.'
        ],
        links: [{ label: 'Buka Add-ons', to: '/addons' }]
      },
      {
        title: 'Status setiap integrasi berbeda',
        bullets: [
          'Chrome Bridge memerlukan engine terpasang, ekstensi tersambung, dan satu tab yang dipilih.',
          'Google Workspace memerlukan kredensial OAuth dan pemberian akses untuk API yang digunakan.',
          'Telegram memerlukan bot token, proses bot aktif, dan konfigurasi admin.'
        ],
        paragraphs: [
          'Status terpasang tidak selalu berarti layanan siap dipakai. Buka detail add-on untuk melihat langkah koneksi atau kendala yang dilaporkan.'
        ]
      },
      {
        title: 'Add-on, plugin, dan skill',
        paragraphs: [
          'Add-on menyediakan integrasi dan alur pengelolaannya. Plugin menyediakan tool berupa kode yang dijalankan Mark. Skill berisi petunjuk kerja untuk AI. Sebuah add-on dapat membawa plugin, seperti Chrome Bridge yang menggunakan engine chrome-use.'
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
      'Gunakan satu tab Chrome pribadi yang Anda pilih, termasuk sesi login yang sudah aktif.',
    keywords:
      'chrome-use extension ekstensi Load unpacked Developer mode tab bridge chrome-navigate chrome-read chrome-click chrome-type chrome-extract chrome-script chrome-scroll chrome-screenshot chrome-ask-user chrome-close',
    sections: [
      {
        title: 'Nama dan perannya',
        paragraphs: [
          'Chrome Bridge adalah nama add-on di Mark. Mark Agent Bridge adalah nama ekstensi Google Chrome. Engine dan grup tool tetap bernama chrome-use. Untuk permintaan browser umum, Mark memakai browser bawaan; sebutkan Chrome saya jika Anda ingin memakai integrasi ini.'
        ]
      },
      {
        title: 'Pemasangan',
        steps: [
          'Buka Add-ons > Chrome Bridge, lalu pilih Install. Jika ada plugin lama yang perlu diganti, periksa konfirmasi penggantian.',
          'Gunakan Buka folder ekstensi atau Salin lokasi pada detail add-on.',
          'Di Chrome, buka chrome://extensions, aktifkan Developer mode, pilih Load unpacked, lalu pilih folder ekstensi tersebut.',
          'Buka halaman target, buka popup Mark Agent Bridge, lalu pilih Hubungkan tab ini.'
        ],
        links: [{ label: 'Buka Chrome Bridge', to: '/addons/chrome-bridge' }]
      },
      {
        title: 'Satu tab yang dikunci',
        paragraphs: [
          'Berpindah fokus ke tab lain tidak memindahkan kendali. Popup menunjukkan tab pilihan dan menyediakan Jeda atau Lanjutkan, Putuskan, serta Hubungkan ulang. Setelah Chrome dimulai ulang, pilih tab kembali. Menutup tab pilihan melepas kendalinya.'
        ]
      },
      {
        title: 'Kemampuan dan pemeliharaan',
        paragraphs: [
          'Sepuluh tool chrome-* mendukung navigasi, pembacaan, klik, pengetikan, ekstraksi, JavaScript, scroll, screenshot, bantuan pengguna, dan penutupan tab. Screenshot dikembalikan sebagai artifact chat. Setelah pembaruan paket ekstensi, muat ulang ekstensi melalui Chrome. Melepas add-on di Mark perlu dilengkapi dengan menghapus ekstensi dari Chrome. Konflik port lokal ditampilkan sebagai kendala; gunakan Hubungkan ulang setelah penyebabnya selesai.'
        ]
      }
    ],
    related: ['browsers', 'addons', 'plugins', 'faq']
  },
  {
    id: 'plugins',
    category: 'extend',
    title: 'Plugin Hub dan editor plugin',
    summary: 'Kelola tool tambahan dan buat plugin lokal melalui Mark atau editor.',
    keywords:
      'plugin.json index.js editable false true managed addon chrome-use Monaco actions dependencies NPM triggerHint',
    sections: [
      {
        title: 'Mengelola plugin',
        paragraphs: [
          'Plugin Hub menyediakan daftar dan pencarian plugin, detail aksi, status aktif, muat ulang, serta akses folder. Plugin aktif dapat ditandai dengan @nama-plugin dan dimuat sebagai grup tool. Plugin nonaktif tidak disediakan sebagai kemampuan aktif kepada agen.'
        ],
        links: [{ label: 'Buka Plugin Hub', to: '/plugins' }]
      },
      {
        title: 'Membuat plugin',
        steps: [
          'Pilih Buat dengan Mark untuk meminta bantuan menyusun plugin, atau Buat Manual untuk mengisi definisinya sendiri.',
          'Tentukan nama, deskripsi, versi, dependency bila diperlukan, dan daftar aksi.',
          'Pada editor, lengkapi nama aksi, deskripsi, petunjuk pemicu, serta kode handler. Simpan, lalu minta Mark menguji aksi pada data percobaan yang sesuai.'
        ],
        paragraphs: [
          'Paket plugin lokal berada di Documents/Mark Plugins. Plugin memakai plugin.json dan handler index.js. Dependency npm dapat membutuhkan internet dan pemasangan kode tambahan; plugin bukan sekadar teks instruksi.'
        ]
      },
      {
        title: 'MCP server di Plugin Hub',
        paragraphs: [
          'Pada Plugin Hub, pilih Tambah plugin lalu Tambahkan custom MCP server untuk membuat koneksi MCP lokal atau remote. Anda dapat mengisi formulir atau menempel konfigurasi mcpServers dalam JSON. Periksa server dan command sebelum menghubungkan. Semua server MCP memakai ikon yang sama; formulir tidak menyediakan unggahan ikon.',
          'Tool yang ditemukan aktif secara default dan dapat dinonaktifkan satu per satu pada halaman detail. Pemanggilan mengikuti pengaturan persetujuan tool dan Auto Mode. Kredensial disimpan terpisah dan perlu dimasukkan kembali setelah memulihkan backup.'
        ]
      },
      {
        title: 'Plugin yang tidak dapat diedit',
        paragraphs: [
          'editable: false pada plugin.json menonaktifkan perubahan definisi melalui editor. Jika properti editable tidak ada, nilainya dianggap true. Plugin yang dikelola add-on mengikuti kontrol add-on tersebut. chrome-use tetap terlihat dan dapat dipakai atau ditandai, sementara pengelolaannya melalui Chrome Bridge.'
        ]
      },
      {
        title: 'Kode plugin memiliki akses nyata',
        paragraphs: [
          'Pasang plugin dari sumber yang Anda percayai dan periksa tindakan yang disediakannya. Deskripsi atau status aktif tidak menjamin semua aksi plugin aman. Jangan menyimpan token atau password dalam contoh kode maupun pesan chat.'
        ]
      }
    ],
    related: ['addons', 'skills', 'tools', 'permissions']
  },
  {
    id: 'skills',
    category: 'extend',
    title: 'User Skills dan skill yang dipelajari',
    summary: 'Simpan petunjuk kerja yang dapat dipanggil kembali dengan slash command.',
    keywords:
      'skill SKILL.md markdown upload zip export editor create-plugin setup-google-workspace task learn',
    sections: [
      {
        title: 'User Skills',
        paragraphs: [
          'Halaman User Skills digunakan untuk membuat, membuka, memperbarui daftar, dan memasang paket skill ZIP. Edit petunjuk serta berkas pendukung melalui editor skill, termasuk penambahan folder, penggantian nama, dan penghapusan item. Skill memakai petunjuk Markdown, biasanya melalui SKILL.md dalam ~/.agents/skills. Gunakan tombol Migrasi skill lama di halaman Skills untuk memindahkan skill dari Documents/Mark Skills. Folder beserta file pendukung dipindahkan tanpa menimpa nama yang sudah ada. Perubahan di folder bersama juga terlihat oleh agent lain yang membacanya. Isi nama, deskripsi, tahapan, serta batasan yang jelas agar Mark memahami kapan dan bagaimana menggunakannya.'
        ],
        links: [{ label: 'Buka User Skills', to: '/skills' }]
      },
      {
        title: 'Memanggil skill',
        paragraphs: [
          'Ketik / pada pesan, pilih skill yang tersedia, lalu tambahkan permintaan. Skill bawaan saat ini mencakup /task, /setup-google-workspace, dan /create-plugin. Skill dipilih dari katalog yang memuat nama, deskripsi, sumber, serta lokasi SKILL.md. Isi lengkap dimuat ketika skill digunakan; Mark memperoleh direktori dasarnya untuk membaca references, scripts, atau assets sesuai kebutuhan. Penanda Menggunakan pada jawaban menampilkan sumber dan file referensi. Skill dengan kebijakan hanya eksplisit tidak dipilih otomatis. Instruksi skill tetap mengikuti izin dan batas tugas yang berlaku. Slash command yang hanya disebut dokumentasi lama belum tentu tersedia; ikuti daftar yang muncul pada aplikasi.'
        ],
        example:
          '/create-plugin Buat plugin untuk membaca ringkasan penggunaan penyimpanan pada folder yang saya tentukan.'
      },
      {
        title: 'Skill yang dipelajari Mark',
        paragraphs: [
          'Tool learn dapat menyimpan prosedur atau solusi yang sudah dipelajari. Panduan tersebut ditampilkan pada Neural Core > Skill dipelajari. Tidak setiap jawaban atau percobaan otomatis menjadi skill, dan skill tersimpan tetap memerlukan tool serta akses yang sesuai ketika digunakan lagi.'
        ]
      },
      {
        title: 'Perbedaan dengan plugin',
        paragraphs: [
          'Skill memberi instruksi; plugin menambah fungsi eksekusi. Mengimpor skill tidak otomatis memasang aplikasi, memberi kredensial layanan, atau mengizinkan tindakan di luar permintaan Anda.'
        ]
      }
    ],
    related: ['plugins', 'workflows', 'google', 'neural']
  },
  {
    id: 'google',
    category: 'extend',
    title: 'Google Workspace',
    summary: 'Hubungkan Drive, Calendar, dan Gmail melalui OAuth.',
    keywords:
      'google OAuth client id secret consent Drive Calendar Gmail gdrive gcalendar gmail email agenda dokumen login install',
    sections: [
      {
        title: 'Menyiapkan koneksi',
        steps: [
          'Buka Add-ons > Google Workspace dan gunakan tindakan pemasangan atau penyiapan yang tersedia.',
          'Ikuti panduan /setup-google-workspace untuk menyiapkan proyek OAuth, mengaktifkan API yang diperlukan, dan memberi akses melalui akun Google.',
          'Periksa status koneksi. Uji dengan aksi baca, misalnya melihat agenda, sebelum melakukan perubahan.'
        ],
        links: [{ label: 'Buka Google Workspace', to: '/addons/google-workspace' }]
      },
      {
        title: 'Google Drive',
        paragraphs: [
          'Cari dan lihat daftar berkas, baca konten yang didukung, unggah atau buat berkas, pindahkan, salin, periksa metadata, serta atur pembagian akses. Isi Google Docs atau Sheets mengikuti format yang dapat dibaca oleh tool; jangan menganggap Mark memiliki editor visual penuh semua aplikasi Google.'
        ]
      },
      {
        title: 'Calendar dan Gmail',
        bullets: [
          'Calendar menyediakan daftar agenda serta pembuatan dan penghapusan event.',
          'Gmail menyediakan pencarian, daftar, pembacaan, pengiriman, dan penandaan email sebagai telah dibaca.'
        ],
        example:
          'Lihat agenda besok dan ringkas email terbaru yang berkaitan dengan rapat. Jangan membuat event atau mengirim email dulu.'
      },
      {
        title: 'Kendala akses',
        paragraphs: [
          'Akses dapat gagal karena consent dibatalkan, API belum aktif, scope tidak sesuai, atau kebijakan akun organisasi. Periksa pesan kegagalan sebelum mengulang. Token tersedia atau status terhubung tidak menjamin setiap API sudah dapat digunakan.'
        ]
      }
    ],
    related: ['addons', 'skills', 'permissions', 'privacy']
  },
  {
    id: 'telegram',
    category: 'extend',
    title: 'Bot Telegram',
    summary: 'Terima instruksi dan kirim hasil melalui bot yang Anda hubungkan.',
    keywords:
      'telegram bot BotFather token admin id accept reject session always screenshot-to-tg tg-send log disconnect',
    sections: [
      {
        title: 'Menghubungkan bot',
        steps: [
          'Buat bot melalui BotFather di Telegram dan simpan tokennya secara pribadi.',
          'Buka Add-ons > Telegram. Isi Bot Token serta ID admin yang diizinkan, lalu gunakan tindakan koneksi.',
          'Periksa status, kirim pesan ke bot, dan gunakan halaman log untuk melihat percakapannya.'
        ],
        links: [
          { label: 'Atur add-on Telegram', to: '/addons/telegram' },
          { label: 'Buka log bot', to: '/telegram-bot' }
        ]
      },
      {
        title: 'Penggunaan jarak jauh',
        paragraphs: [
          'Bot dapat meneruskan permintaan ke Mark, mengirim balasan atau notifikasi, serta mengirim tangkapan layar dan hasil yang didukung tool. Komputer dan proses Mark harus tetap berjalan serta terhubung ke internet. Bot bukan layanan yang berjalan sendiri setelah komputer dimatikan.'
        ]
      },
      {
        title: 'Persetujuan dan admin',
        paragraphs: [
          'Konfigurasikan ID admin agar akses sesuai pengguna yang Anda izinkan. Jika permintaan tool memerlukan persetujuan, bot dapat meneruskan informasi dan pilihan /accept, /session, /always, atau /reject. Periksa target dan dampak aksi sebelum memberi izin yang berlaku lebih lama.'
        ]
      },
      {
        title: 'Memutus koneksi',
        paragraphs: [
          'Kelola koneksi melalui detail add-on. Halaman log berfungsi untuk pemantauan pesan, bukan tempat utama memasukkan token. Jangan membagikan bot token melalui percakapan atau screenshot.'
        ]
      }
    ],
    related: ['addons', 'permissions', 'media', 'privacy']
  },
  {
    id: 'settings',
    category: 'manage',
    title: 'Pengaturan Mark',
    summary: 'Atur AI, perilaku, suara, kamera, pintasan, dan izin akses.',
    keywords:
      'configuration simpan batalkan provider model temperature kepribadian awareness super effort microphone kamera shortcut permission',
    sections: [
      {
        title: 'Enam bagian pengaturan',
        bullets: [
          'AI: provider, model, endpoint, dan kredensial yang diperlukan.',
          'Perilaku: gaya bicara, kreativitas jawaban, Awareness Engine, dan Super Effort.',
          'Suara: kata panggilan tambahan, bahasa input, dan akses pengaturan mikrofon Windows.',
          'Kamera: izin penggunaan, pilihan perangkat, dan pratinjau yang diaktifkan lewat tombol.',
          'Pintasan: kombinasi tombol untuk memanggil Mark dan pilihan kombinasi yang disediakan.',
          'Izin akses: daftar folder atau perintah yang telah diizinkan secara permanen.'
        ],
        links: [{ label: 'Buka Pengaturan', to: '/config' }]
      },
      {
        title: 'Simpan setelah selesai',
        paragraphs: [
          'Perubahan formulir tetap ada saat Anda berpindah bagian. Tombol Simpan perubahan berada di bagian bawah halaman. Batalkan mengembalikan perubahan yang belum disimpan. Penghapusan izin dan perubahan pintasan di halaman ini juga diterapkan setelah disimpan.'
        ]
      },
      {
        title: 'Pintasan dan izin perangkat',
        paragraphs: [
          'Fokuskan kolom pintasan dan tekan kombinasi tombol, atau pilih salah satu pilihan yang disediakan. Esc membatalkan perekaman tombol. Ketersediaan pintasan lintas aplikasi mengikuti mode launcher dan dukungan sistem. Izin mikrofon atau kamera dari browser tetap perlu diberikan terpisah.'
        ]
      }
    ],
    related: ['getting-started', 'awareness', 'voice-camera', 'permissions']
  },
  {
    id: 'permissions',
    category: 'manage',
    title: 'Persetujuan dan akses tool',
    summary: 'Pahami izin sekali, sesi, permanen, serta mode otomatis.',
    keywords:
      'approval keamanan izin whitelist auto mode bypass sandbox shell hapus file delete risk',
    sections: [
      {
        title: 'Pilihan persetujuan',
        bullets: [
          'Izinkan sekali berlaku untuk permintaan tersebut.',
          'Izinkan untuk sesi mengingat pilihan pada sesi yang sesuai.',
          'Izinkan Selamanya menyimpan izin menurut folder atau perintah yang dikenali.',
          'Tolak mencegah permintaan yang sedang menunggu persetujuan dilanjutkan.'
        ]
      },
      {
        title: 'Kapan dialog tidak muncul?',
        paragraphs: [
          'Mode otomatis sesi, izin untuk sesi, atau izin permanen dapat membuat permintaan yang cocok berjalan tanpa dialog baru. Tidak semua jalur tool memakai mekanisme persetujuan yang sama. Karena itu Guidebook tidak memberi label bebas atau aman berdasarkan nama tool saja.'
        ]
      },
      {
        title: 'Mengubah izin tersimpan',
        paragraphs: [
          'Buka Pengaturan > Izin akses, hapus entri yang tidak diperlukan, lalu Simpan. Mencabut izin tidak mengurungkan pekerjaan sebelumnya. Periksa isi instruksi, perintah shell, penerima pesan, dan target berkas ketika mempercayakan pekerjaan pada agen.'
        ]
      },
      {
        title: 'Batas perlindungan',
        paragraphs: [
          'Mark adalah layanan lokal dengan akses berkas dan otomasi komputer. Pemilihan workspace dan dialog client bukan sandbox OS. Jalankan pada komputer serta jaringan yang Anda percayai; kode plugin juga harus diperlakukan sebagai kode yang memiliki akses nyata.'
        ]
      }
    ],
    related: ['settings', 'plugins', 'computer', 'privacy']
  },
  {
    id: 'privacy',
    category: 'manage',
    title: 'Data lokal, cadangan, dan pemulihan',
    summary: 'Ketahui tempat penyimpanan dan kapan data dikirim ke layanan lain.',
    keywords:
      'privasi privacy local cloud backup JSON restore reset export SQLite database config Documents Mark Workspace Mark Plugins Mark Skills',
    sections: [
      {
        title: 'Lokasi penyimpanan',
        bullets: [
          'Data utama dan konfigurasi berada di folder pengguna .config/mark-agent. Database utama menggunakan mark.db.',
          'Folder umum untuk pekerjaan adalah Documents/Mark Workspace. Plugin berada di Documents/Mark Plugins dan skill di ~/.agents/skills. Skill dari Documents/Mark Skills dapat dipindahkan melalui tombol migrasi di halaman Skills.',
          'Artifact tugas serta unggahan sementara dapat memiliki lokasi tersendiri. Gunakan tautan atau folder hasil yang ditampilkan oleh pekerjaan tersebut.'
        ]
      },
      {
        title: 'Konteks yang dikirim ke provider',
        paragraphs: [
          'Riwayat dan memori disimpan lokal, tetapi bagian konteks yang diperlukan dikirim ke provider AI yang Anda pilih. Provider online, layanan pengenalan suara, Google, Telegram, pencarian web, dan YouTube melibatkan layanan eksternal. Memakai model lokal tidak membuat semua fitur jaringan menjadi offline. Jangan memasukkan rahasia yang tidak diperlukan dalam pesan atau lampiran.'
        ]
      },
      {
        title: 'Membuat dan memulihkan cadangan',
        steps: [
          'Buka Neural Core > Kelola data, lalu Unduh JSON untuk menyimpan cadangan.',
          'Simpan cadangan di tempat yang Anda percayai karena dapat berisi percakapan, konfigurasi, dan kredensial.',
          'Untuk pemulihan, pilih berkas JSON yang sesuai dan baca konfirmasi penggantian database sebelum melanjutkan.'
        ],
        links: [{ label: 'Kelola data Mark', to: '/neural-core?tab=data' }]
      },
      {
        title: 'Reset data',
        paragraphs: [
          'Reset memerlukan dua tahap konfirmasi dan teks RESET MARK. Operasi itu menghapus data AI yang tercantum pada dialog, termasuk riwayat, memori, skill dipelajari, serta perkembangan karakter dan tugas. Konfigurasi sistem dipertahankan. Reset database tidak sama dengan menghapus seluruh berkas workspace atau paket plugin di disk.'
        ]
      }
    ],
    related: ['permissions', 'settings', 'neural', 'runtime']
  },
  {
    id: 'runtime',
    category: 'manage',
    title: 'Menjalankan Mark dan pembaruan',
    summary: 'Pahami server lokal, antarmuka browser, monitor CLI, dan kebutuhan runtime.',
    keywords:
      'Windows Node Edge Chrome app mode CLI launcher monitor update npm start dev no-launch headless no-ui version port localhost restart',
    sections: [
      {
        title: 'Aplikasi dan server lokal',
        paragraphs: [
          'Mark menggunakan server Node.js dan antarmuka web. Di Windows, launcher dapat membuka Edge App Mode; antarmuka juga dapat berjalan di browser. Menutup sebuah halaman antarmuka belum tentu menghentikan server atau proses latar belakang. Perhatikan launcher atau terminal yang menjalankan Mark.'
        ]
      },
      {
        title: 'Monitor terminal',
        paragraphs: [
          'Monitor CLI menampilkan kondisi layanan dan aktivitas. Saat dijalankan melalui terminal interaktif, pintasan u membuka UI, p menampilkan informasi pembaruan, c membersihkan tampilan, dan q keluar. Ikuti informasi launcher jika port layanan berubah karena port sebelumnya sudah digunakan.'
        ]
      },
      {
        title: 'Pembaruan',
        paragraphs: [
          'Periksa informasi versi atau notifikasi pembaruan yang tersedia. Ikuti perintah pembaruan yang ditampilkan untuk cara instalasi Anda, lalu mulai ulang Mark. Berkas ekstensi Chrome Bridge juga perlu dimuat ulang di Chrome setelah paketnya diperbarui. Cadangkan data sebelum mengganti instalasi.'
        ]
      },
      {
        title: 'Kebutuhan fitur tambahan',
        paragraphs: [
          'Model lokal memerlukan server model dan sumber daya komputer yang memadai. Fitur Windows, browser automation, kamera, mikrofon, atau integrasi akun memerlukan perangkat, aplikasi, dan izin yang sesuai. Paket tambahan tidak otomatis menjadi kemampuan aktif hanya karena tercantum sebagai dependency proyek.'
        ]
      }
    ],
    related: ['getting-started', 'privacy', 'chrome-bridge', 'faq']
  },
  {
    id: 'faq',
    category: 'manage',
    title: 'Kendala dan pertanyaan umum',
    summary: 'Langkah pemeriksaan untuk koneksi AI, perangkat, integrasi, dan hasil pekerjaan.',
    keywords: 'FAQ bantuan troubleshoot error gagal lambat kosong tersambung stop token login',
    sections: []
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
