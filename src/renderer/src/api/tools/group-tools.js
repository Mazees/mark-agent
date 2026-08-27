export const GROUP_TOOLS_DEFINITION = {
  advanced_browser: {
    description: 'Tool untuk navigasi dan kontrol elemen fisik browser web secara detail, gunakan ini untuk melakukan pencarian di browser/web jangan gunakan powershell.',
    tools: {
      'browser-navigate':
        'Buka URL di browser fisik. Query: URL lengkap. Mengembalikan daftar elemen interaktif bernomor (ID).',
      'browser-read': 'Scan ulang elemen halaman saat ini. Gunakan setelah menunggu loading.',
      'browser-click': 'Klik elemen. Query: ID angka. Mengembalikan DOM terbaru setelah klik.',
      'browser-type': 'Ketik teks di kolom input. Query: ID||teks. Mengembalikan DOM terbaru.',
      'browser-scroll': 'Scroll halaman. Query: "up" atau "down".',
      'browser-extract': 'Ekstrak teks/data via CSS Selector. Kembalikan JSON. Query: selector CSS (misal: ".product-price").',
      'browser-script': 'Eksekusi custom Javascript di browser (Bisa untuk manipulasi DOM / bypass). Query: script JS murni.',
      'browser-screenshot': 'Ambil screenshot web utuh dan simpan ke OS. Query: namafile.png.',
      'browser-download': 'Download URL secara fisik ke OS. Query: URL||namafile.ext.',
      'browser-ask-user':
        'JIKA terhalang form login/CAPTCHA, BUKAKAN HALAMANNYA DULU (misal klik tombol \'Login\' hingga form muncul), lalu GUNAKAN TOOL INI. Query: Instruksi/Pesan untuk user (misal: "Tolong isi email dan password"). Pesanmu akan muncul di layar popup. Setelah user selesai, kamu akan langsung mendapat DOM terbaru untuk MELANJUTKAN misimu. Jangan berhenti!',
      'browser-close': 'Menutup browser fisik.'
    }
  },
  pc_automation: {
    description:
      'Tool untuk <inter></inter>aksi fisik dengan desktop OS Windows. [SPEEDRUNNER BATCH MODE]: Kamu BISA mengeksekusi BATCH ACTIONS (mengirim ARRAY aksi) dalam 1 giliran untuk menghindari loading lama. Contoh: [{"tool":"os-click","query":"5"}, {"tool":"os-delay","query":"1000"}, {"tool":"os-type","query":"Teks"}]. Gunakan os-click secara bebas, tetapi KELOMPOKKAN aksimu ke dalam array jika urutannya sudah jelas, jangan satu per satu!',
    tools: {
      'os-control-open':
        'WAJIB DIPANGGIL PERTAMA KALI sebelum memulai rangkaian tugas otomatisasi PC. Mengunci sesi dan memunculkan overlay pengunci PC. PENTING: Jika tool ini sudah mengembalikan status success, ITU BERARTI USER SUDAH MEMBERIKAN IZIN DI POPUP! Kamu WAJIB LANGSUNG meneruskan eksekusi langkah berikutnya (os-read/os-click/os-type/dll) di loop yang sama TANPA berhenti atau menyuruh user klik tombol izinkan lagi! Query: KOSONG.',
      'os-control-close':
        'WAJIB DIPANGGIL TERAKHIR setelah semua tugas otomatisasi PC selesai. Menutup sesi dan overlay. Query: KOSONG.',
      'os-read':
        'Membaca elemen GUI desktop. Query: Kosongkan untuk scan seluruh layar (LAMBAT, 1-3 detik), atau isi dengan kata "focus" untuk HANYA membaca 1 elemen yang saat ini sedang aktif/tersorot (INSTAN, 1 ms). Gunakan query "focus" setelah kamu menekan tombol TAB/Panah untuk memverifikasi posisimu dengan cepat!',
      'os-click':
        'Klik mouse pada elemen GUI desktop. Query: ID elemen dari os-read atau x||y koordinat absolut.',
      'os-type':
        'Ketik teks ke elemen input di aplikasi Windows. Query: ID||teks atau teks langsung. PENTING: DILARANG KERAS MENGETIKKAN EMOJI! DILARANG KERAS menggunakan format markdown link seperti [teks](url) saat mengetik URL! Ketik raw teks saja.',
      'os-key':
        'Tekan kombinasi tombol keyboard shortcut. Query: combo (misal: ctrl+c, alt+tab, win+e, ctrl+s, enter).',
      'os-scroll':
        'Scroll mouse wheel di aplikasi aktif. Query: direction||amount (misal: down||5 atau up||3).',

      'os-search':
        'Mensimulasikan user mencari APLIKASI di Start Menu dengan tombol Windows. Query: kata kunci (misal: Chrome). PENTING: Tool ini HANYA mengetik di Start Menu. Untuk membuka aplikasinya, kamu WAJIB memanggil BATCH ACTION: os-search -> os-delay (1000) -> os-key (enter). JANGAN panggil os-open/os-double-click setelah os-search!',
      'os-double-click':
        'Klik ganda (double click) mouse pada elemen GUI desktop. Query: ID elemen dari os-read atau x||y koordinat absolut. Bisa digunakan untuk memilih file saat input file dari browser atau explorer.',
      'os-list-windows': 'Menampilkan daftar semua window aplikasi yang terbuka beserta judulnya.',
      'os-focus-window':
        'Fokus sebuah window aplikasi berdasarkan judul. JANGAN MENEBAK JUDUL! WAJIB gunakan os-list-windows terlebih dahulu, lalu gunakan teks judul yang persis ada di daftar tersebut. Query: judul window.'
    }
  },
  youtube_music: {
    description: 'Integrasi pencarian YouTube dan pemutar musik lokal.',
    tools: {
      'yt-search':
        'Alat pencari video di YouTube. Gunakan ini jika kamu merasa informasi lebih baik didapat dari video/tutorial visual.',
      'yt-summary':
        'Merangkum isi video YouTube. Sangat berguna untuk mengekstrak informasi/pembelajaran dari video panjang.',
      'music-play': 'Memutar lagu di YouTube Music.',
      'music-toggle': 'Pause/lanjut memutar lagu.',
      'music-search': 'Mencari lagu spesifik di YT Music.',
      'music-next': 'Mengganti lagu ke track selanjutnya.',
      'music-prev': 'Mengganti lagu ke track sebelumnya.'
    }
  },
  google_drive: {
    description: 'Akses layanan Google Drive (Manajemen file dan storage).',
    tools: {
      'gdrive-info': 'Cek kapasitas/storage sisa Google Drive. Query: "all"',
      'gdrive-search':
        'Cari file di Google Drive. Query: "kata kunci||start-end" (Contoh: "dokumen||10-20" untuk paging)',
      'gdrive-list':
        'List file di Drive. Query: "folderId||start-end" (Contoh: "root||10-20" untuk paging)',
      'gdrive-read': 'Ekstrak isi teks dari Google Docs, Sheets, atau TXT. Query: fileId.',
      'gdrive-upload': 'Upload file teks (Butuh persetujuan user). Query: nama_file||isi_teks.',
      'gdrive-create': 'Membuat dokumen/folder baru. Query: nama_file||doc/sheet/folder.',
      'gdrive-move': 'Memindahkan file. Query: fileId||folderId.',
      'gdrive-copy': 'Menduplikasi file. Query: fileId||nama_baru.'
    }
  },
  google_calendar: {
    description: 'Akses layanan Google Calendar (Manajemen jadwal dan event).',
    tools: {
      'gcalendar-list':
        'Lihat jadwal/event (PENTING: Jika belum connect, beri tahu user). Query: "start-end||YYYY-MM-DDTHH:mm:ssZ" (Contoh: "10-20||2023-10-01T00:00:00Z" atau "10||" untuk paging)',
      'gcalendar-create':
        'Membuat jadwal baru (Butuh persetujuan user). Query: Judul||Deskripsi||Waktu_Mulai(ISO)||Waktu_Selesai(ISO).',
      'gcalendar-delete': 'Menghapus jadwal. Query: eventId.'
    }
  },
  google_gmail: {
    description: 'Akses layanan Google Gmail (Membaca dan mengirim pesan email).',
    tools: {
      'gmail-search': 'Mencari email. Query: query_gmail||start-end (Contoh: "is:unread||10-20").',
      'gmail-list': 'Baca email masuk (Inbox). Query: "start-end" (Contoh: "0-10" untuk paging).',
      'gmail-read': 'Membaca isi pesan email tertentu. Query: messageId.',
      'gmail-send':
        'Mengirim email baru (Butuh persetujuan user). Query: email_tujuan||Subjek||Isi_pesan.',
      'gmail-mark-read': 'Menandai email sebagai sudah dibaca. Query: messageId.'
    }
  },
  system_vision_tg: {
    description: 'Akses screenshot layar, webcam (Vision), Text-to-Speech lisan, dan Telegram.',
    tools: {
      'analyze-screen':
        'Mengambil screenshot LAYAR LAPTOP saat ini untuk dianalisis oleh "Mata AI" (Vision). ATURAN MUTLAK: DILARANG KERAS menggunakan tool ini JIKA user SUDAH melampirkan file gambar di pesan (karena kamu sudah bisa melihat gambar terlampir tersebut secara langsung!). Gunakan tool ini HANYA jika kamu perlu melihat tampilan layar monitor/aplikasi yang sedang aktif di PC user. Query: Isi dengan prompt instruksi visual spesifikmu (misal: "Tolong bacakan teks error di layar" atau "Cari tombol warna biru").',
      'camera-look':
        'Mengaktifkan kamera webcam untuk melihat dunia nyata di depan user. Gunakan tool ini JIKA user meminta kamu melihat sesuatu secara fisik (bukan layar), ATAU jika kamu menerima instruksi dari sistem (autonomous_prompt) untuk mengecek kondisi user secara visual. Query: Isi dengan prompt instruksi visual spesifikmu (misal: "Apa objek yang dipegang user?" atau "Baca tulisan di kertas ini").',
      'screenshot-to-tg':
        'Mengambil screenshot layar komputer dan MENGIRIMNYA SECARA FISIK ke Telegram user (Hanya jika chat berasal dari Telegram). Query: KOSONGKAN SAJA.',
      'tg-send':
        'Mengirim pesan teks ATAU file fisik ke Telegram. Format query: chatId||tipe(text/file)||konten. Jika tipe="text", konten=isi pesan. Jika tipe="file", konten=path absolute file. WAJIB MENGGUNAKAN DOUBLE PIPE (||) SEBAGAI PEMISAH, JANGAN PERNAH GUNAKAN SINGLE PIPE (|)!!! Contoh benar: "1234567||text||Halo!" atau "1234567||file||C:\\Data.xlsx".',
      speak:
        'Bicarakan teks secara lisan (Text-to-Speech) lewat speaker komputer user. Query: "Teks yang ingin kamu ucapkan". Gunakan ini jika kamu ingin memanggil user atau berbicara langsung.'
    }
  },
  git_vcs: {
    description: 'Manajemen version control Git untuk repositori proyek (Status, Diff, Commit, Revert).',
    tools: {
      'git-status': 'Melihat status modifikasi berkas di repositori git (git status --short). Query: kosongkan atau masukkan path folder.',
      'git-diff': 'Melihat detail baris kode yang berubah sebelum di-commit (git diff). Query: kosongkan untuk semua berkas, atau spesifik nama_berkas.',
      'git-commit': 'Membuat checkpoint commit git secara otomatis. Query: pesan_commit||path_folder (path opsional). (Butuh persetujuan user).',
      'git-revert': 'Me-rollback perubahan berkas yang belum di-commit ke HEAD. Query: nama_berkas (atau kosongkan untuk reset --hard seluruh repo). (Butuh persetujuan user).'
    }
  },
  task_terminal: {
    description: 'Terminal runner latar belakang (non-blocking) untuk menjalankan server dev, unit test, dan proses jangka panjang.',
    tools: {
      'run-task': 'Menjalankan server atau proses background terminal (misal: dev-server, build, test). Query: taskId||perintah (contoh: "dev-server||npm run dev" atau "test||pytest"). (Perlu persetujuan user jika perintah berisiko).',
      'read-task-output': 'Membaca log output terbaru dari background terminal task. Query: taskId||jumlah_baris (contoh: "dev-server||40").',
      'kill-task': 'Menghentikan proses background terminal yang sedang berjalan. Query: taskId (contoh: "dev-server").',
      'list-tasks': 'Melihat seluruh background tasks yang sedang berjalan beserta PID dan statusnya. Query: kosongkan.'
    }
  }
}

export const group_tools = async () => {
  const dynamicGroups = { ...GROUP_TOOLS_DEFINITION }

  try {
    const plugins = await window.api.getPlugins()
    if (plugins && plugins.length > 0) {
      plugins.forEach((plugin) => {
        if (plugin.isEnabled !== false && plugin.actions) {
          const toolMap = {}
          plugin.actions.forEach((act) => {
            let paramDocs = ''
            if (act.parameters) {
              paramDocs = ` (Params: ${Object.entries(act.parameters)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')})`
            }
            toolMap[act.name] = `${act.description}${paramDocs}`
          })

          dynamicGroups[plugin.name] = {
            description: plugin.description || 'Plugin Eksternal Tambahan',
            tools: toolMap
          }
        }
      })
    }
  } catch (err) {
    console.error('Gagal meload external plugin', err)
  }

  return dynamicGroups
}

// Generate flat map sekali aja buat fast O(1) lookup
export const group_tools_flat = {}
for (const group of Object.values(GROUP_TOOLS_DEFINITION)) {
  Object.assign(group_tools_flat, group.tools)
}
