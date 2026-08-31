/**
 * Group Tools Definition & OpenAPI Function Schema untuk MARK V5.
 * Seluruh nama tool mempertahankan format kebab-case (100% valid sesuai regex OpenAPI ^[a-zA-Z0-9_-]{1,64}$).
 */

export const GROUP_TOOLS_SCHEMA = {
  advanced_browser: {
    description: 'Tool untuk navigasi dan kontrol elemen fisik browser web secara detail.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'browser-navigate',
          description: 'Buka URL di browser fisik. Mengembalikan daftar elemen interaktif bernomor (ID).',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL lengkap website tujuan' }
            },
            required: ['url'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-read',
          description: 'Scan ulang elemen halaman browser saat ini.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-click',
          description: 'Klik elemen pada halaman browser berdasarkan ID numerik.',
          parameters: {
            type: 'object',
            properties: {
              element_id: { type: 'number', description: 'ID numerik elemen interaktif' }
            },
            required: ['element_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-type',
          description: 'Ketik teks ke kolom input formulir web berdasarkan ID elemen.',
          parameters: {
            type: 'object',
            properties: {
              element_id: { type: 'number', description: 'ID elemen input' },
              text: { type: 'string', description: 'Teks yang akan diketikkan' }
            },
            required: ['element_id', 'text'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-scroll',
          description: 'Scroll halaman browser ke atas atau ke bawah.',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['up', 'down'], description: 'Arah scroll' }
            },
            required: ['direction'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-extract',
          description: 'Ekstrak teks atau data dari web via CSS Selector.',
          parameters: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS Selector target' }
            },
            required: ['selector'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-script',
          description: 'Eksekusi JavaScript langsung pada halaman browser web.',
          parameters: {
            type: 'object',
            properties: {
              script: { type: 'string', description: 'Kode JavaScript yang akan dieksekusi' }
            },
            required: ['script'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-screenshot',
          description: 'Mengambil screenshot halaman browser web dan menyimpannya.',
          parameters: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: 'Nama berkas gambar screenshot (.png)' }
            },
            required: ['filename'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-download',
          description: 'Mengunduh berkas dari web ke komputer.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL berkas yang akan diunduh' },
              filename: { type: 'string', description: 'Nama berkas yang disimpan' }
            },
            required: ['url', 'filename'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-ask-user',
          description: 'Minta bantuan user untuk menyelesaikan CAPTCHA, 2FA, verifikasi Cloudflare, atau login manual pada halaman browser. Jendela browser akan otomatis ditampilkan dan interaksi user di-unblock sementara hingga user menekan tombol Resume.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Pesan arahan untuk user (misal: "Silakan selesaikan Cloudflare Turnstile / Login Google terlebih dahulu")'
              }
            },
            required: ['prompt'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-close',
          description: 'Menutup sesi browser fisik yang sedang aktif.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      }
    ]
  },
  pc_automation: {
    description: 'Tool untuk interaksi fisik dengan desktop OS Windows, mouse click, keyboard typing, dan window management.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'os-control-open',
          description: 'WAJIB DIPANGGIL PERTAMA KALI sebelum memulai rangkaian tugas otomatisasi PC. Mengunci sesi dan memunculkan overlay pengunci PC.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-control-close',
          description: 'WAJIB DIPANGGIL TERAKHIR setelah semua tugas otomatisasi PC selesai.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-read',
          description: 'Membaca elemen GUI desktop.',
          parameters: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['all', 'focus'], description: '"all" untuk scan seluruh layar atau "focus" untuk membaca 1 elemen aktif' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-click',
          description: 'Klik mouse pada elemen GUI desktop berdasarkan ID elemen atau koordinat x||y.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'ID elemen dari os-read atau koordinat "x||y"' }
            },
            required: ['target'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-double-click',
          description: 'Double click mouse pada elemen GUI desktop berdasarkan ID elemen atau koordinat x||y.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'ID elemen dari os-read atau koordinat "x||y"' }
            },
            required: ['target'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-type',
          description: 'Ketik teks ke aplikasi Windows yang sedang aktif.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Teks yang akan diketikkan' }
            },
            required: ['text'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-key',
          description: 'Tekan kombinasi tombol keyboard shortcut (misal: ctrl+c, alt+tab, enter).',
          parameters: {
            type: 'object',
            properties: {
              combo: { type: 'string', description: 'Kombinasi tombol keyboard' }
            },
            required: ['combo'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-scroll',
          description: 'Scroll mouse wheel di aplikasi aktif.',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['up', 'down'], description: 'Arah scroll' },
              amount: { type: 'number', description: 'Jumlah baris scroll' }
            },
            required: ['direction'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-delay',
          description: 'Menunggu beberapa milidetik (jeda) saat menjalankan otomatisasi UI.',
          parameters: {
            type: 'object',
            properties: {
              ms: { type: 'number', description: 'Durasi jeda dalam milidetik (contoh: 1000)' }
            },
            required: ['ms'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-search',
          description: 'Mencari aplikasi di Start Menu Windows dengan tombol Windows.',
          parameters: {
            type: 'object',
            properties: {
              keyword: { type: 'string', description: 'Kata kunci nama aplikasi' }
            },
            required: ['keyword'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-list-windows',
          description: 'Menampilkan daftar semua window aplikasi yang terbuka beserta judulnya.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'os-focus-window',
          description: 'Fokus sebuah window aplikasi berdasarkan judul yang ada di os-list-windows.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Judul window aplikasi persis' }
            },
            required: ['title'],
            additionalProperties: false
          }
        }
      }
    ]
  },
  youtube_music: {
    description: 'Integrasi pencarian YouTube dan pemutar musik lokal.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'yt-search',
          description: 'Mencari video di YouTube.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Kata kunci pencarian YouTube' }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'yt-summary',
          description: 'Merangkum isi video YouTube.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL video YouTube' }
            },
            required: ['url'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'music-play',
          description: 'Memutar lagu di YouTube Music. Masukkan judul atau genre/mood lagu pada parameter title.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Judul lagu, nama artis, atau kata kunci pencarian lagu yang ingin diputar (contoh: "Bohemian Rhapsody", "Lagu Pop Santai")' }
            },
            required: ['title'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'music-toggle',
          description: 'Pause atau lanjut memutar musik.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'music-next',
          description: 'Memutar lagu berikutnya di daftar antrean pemutar musik.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'music-prev',
          description: 'Memutar lagu sebelumnya di daftar antrean pemutar musik.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      }
    ]
  },
  google_drive: {
    description: 'Manajemen penyimpanan dan berkas Google Drive (Docs, Sheets, TXT, Upload, Search).',
    tools: [
      {
        type: 'function',
        function: {
          name: 'gdrive-info',
          description: 'Mengecek kapasitas sisa penyimpanan dan informasi akun Google Drive.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-search',
          description: 'Mencari berkas di Google Drive berdasarkan nama atau konten.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Kata kunci pencarian berkas' },
              pagination: { type: 'string', description: 'Rentang hasil pagination (contoh: "0-10")' }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-list',
          description: 'Melihat daftar berkas di Google Drive (atau folder tertentu).',
          parameters: {
            type: 'object',
            properties: {
              folder_id: { type: 'string', description: 'ID folder target (opsional, kosongkan untuk root)' },
              pagination: { type: 'string', description: 'Rentang hasil pagination (contoh: "0-10")' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-read',
          description: 'Membaca dan mengekstrak teks dari Google Docs, Sheets, atau TXT berdasarkan file ID.',
          parameters: {
            type: 'object',
            properties: {
              file_id: { type: 'string', description: 'ID berkas Google Drive yang akan dibaca' }
            },
            required: ['file_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-upload',
          description: 'Mengunggah file teks baru ke Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nama berkas baru (misal: "laporan.txt")' },
              content: { type: 'string', description: 'Konten teks berkas' }
            },
            required: ['name', 'content'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-create',
          description: 'Membuat dokumen kosong baru atau folder di Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nama dokumen atau folder baru' },
              type: { type: 'string', enum: ['doc', 'sheet', 'folder'], description: 'Tipe yang dibuat' }
            },
            required: ['name'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-move',
          description: 'Memindahkan berkas ke folder lain di Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              file_id: { type: 'string', description: 'ID berkas yang akan dipindah' },
              folder_id: { type: 'string', description: 'ID folder tujuan' }
            },
            required: ['file_id', 'folder_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-copy',
          description: 'Menduplikasi berkas di Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              file_id: { type: 'string', description: 'ID berkas yang akan disalin' },
              new_name: { type: 'string', description: 'Nama baru berkas duplikat' }
            },
            required: ['file_id', 'new_name'],
            additionalProperties: false
          }
        }
      }
    ]
  },
  google_calendar: {
    description: 'Manajemen jadwal agenda dan event di Google Calendar.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'gcalendar-list',
          description: 'Melihat daftar agenda atau jadwal acara mendatang dari Google Calendar.',
          parameters: {
            type: 'object',
            properties: {
              pagination: { type: 'string', description: 'Rentang data (contoh: "0-10")' },
              time_min: { type: 'string', description: 'Waktu mulai filter dalam ISO string (contoh: "2026-08-28T00:00:00Z")' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gcalendar-create',
          description: 'Membuat jadwal atau agenda pertemuan baru di Google Calendar.',
          parameters: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Judul kegiatan atau event' },
              description: { type: 'string', description: 'Deskripsi lengkap kegiatan' },
              start_time: { type: 'string', description: 'Waktu mulai dalam format ISO 8601 (contoh: "2026-08-28T14:00:00+07:00")' },
              end_time: { type: 'string', description: 'Waktu selesai dalam format ISO 8601 (contoh: "2026-08-28T15:00:00+07:00")' }
            },
            required: ['summary', 'start_time', 'end_time'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gcalendar-delete',
          description: 'Menghapus jadwal kegiatan di Google Calendar berdasarkan Event ID.',
          parameters: {
            type: 'object',
            properties: {
              event_id: { type: 'string', description: 'ID event kalender yang akan dihapus' }
            },
            required: ['event_id'],
            additionalProperties: false
          }
        }
      }
    ]
  },
  google_gmail: {
    description: 'Manajemen membaca, mencari, dan mengirim email melalui akun Gmail.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'gmail-search',
          description: 'Mencari email di Gmail berdasarkan kata kunci atau filter query Gmail (misal: "is:unread", "from:someone@gmail.com").',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Query pencarian Gmail' },
              pagination: { type: 'string', description: 'Rentang data (contoh: "0-10")' }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail-list',
          description: 'Melihat daftar email terbaru di kotak masuk (inbox).',
          parameters: {
            type: 'object',
            properties: {
              pagination: { type: 'string', description: 'Rentang data (contoh: "0-10")' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail-read',
          description: 'Membaca detail isi pesan email berdasarkan Message ID.',
          parameters: {
            type: 'object',
            properties: {
              message_id: { type: 'string', description: 'ID pesan email' }
            },
            required: ['message_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail-send',
          description: 'Mengirim email baru ke penerima melalui akun Gmail yang terhubung.',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Alamat email tujuan' },
              subject: { type: 'string', description: 'Subjek email' },
              body: { type: 'string', description: 'Isi pesan email' }
            },
            required: ['to', 'subject', 'body'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail-mark-read',
          description: 'Menandai pesan email sebagai sudah dibaca (read) berdasarkan Message ID.',
          parameters: {
            type: 'object',
            properties: {
              message_id: { type: 'string', description: 'ID pesan email' }
            },
            required: ['message_id'],
            additionalProperties: false
          }
        }
      }
    ]
  },
  system_vision_tg: {
    description: 'Integrasi sistem vision layar desktop, webcam, output suara lisan (TTS), dan integrasi perpesanan Telegram Bot.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'analyze-screen',
          description: 'Mengambil screenshot seluruh monitor/layar Windows saat ini dan menganalisis tampilan visual antarmuka/aplikasi menggunakan AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat atau analisis dari layar pengguna'
              }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'camera-look',
          description: 'Mengambil frame gambar dari webcam/kamera laptop/PC pengguna dan menganalisis apa yang terlihat di depan kamera secara real-time menggunakan AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat dari kamera'
              }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'screenshot-to-tg',
          description: 'Mengambil screenshot layar PC dan langsung mengirimkannya ke Telegram admin.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'tg-send',
          description: 'Mengirim pesan teks atau file ke chat Telegram.',
          parameters: {
            type: 'object',
            properties: {
              chat_id: { type: 'string', description: 'ID Chat Telegram tujuan' },
              type: { type: 'string', enum: ['text', 'file'], description: 'Tipe kiriman' },
              content: { type: 'string', description: 'Isi teks pesan atau path berkas yang dikirim' }
            },
            required: ['chat_id', 'type', 'content'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'speak',
          description: 'Mengeluarkan suara lisan (Text-to-Speech) lewat speaker komputer secara langsung.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Teks yang ingin diucapkan secara lisan' }
            },
            required: ['text'],
            additionalProperties: false
          }
        }
      }
    ]
  },
  git_vcs: {
    description: 'Manajemen version control Git untuk repositori proyek.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'git-status',
          description: 'Melihat status modifikasi berkas di repositori git.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path folder repositori' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git-diff',
          description: 'Melihat detail perubahan baris kode (git diff).',
          parameters: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Nama berkas spesifik' }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git-commit',
          description: 'Membuat checkpoint commit git.',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Pesan commit' }
            },
            required: ['message'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git-revert',
          description: 'Me-rollback perubahan berkas yang belum di-commit.',
          parameters: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Nama berkas yang akan di-revert' }
            },
            additionalProperties: false
          }
        }
      }
    ]
  },
  task_terminal: {
    description: 'Terminal runner latar belakang (non-blocking) untuk menjalankan server dev, unit test, dan proses jangka panjang.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'run-task',
          description: 'Menjalankan server atau proses terminal background.',
          parameters: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'ID penanda task' },
              command: { type: 'string', description: 'Perintah shell terminal' }
            },
            required: ['task_id', 'command'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read-task-output',
          description: 'Membaca log output terbaru dari background terminal task.',
          parameters: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'ID penanda task' },
              lines: { type: 'number', description: 'Jumlah baris log terbaru' }
            },
            required: ['task_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'kill-task',
          description: 'Menghentikan proses background terminal yang sedang berjalan.',
          parameters: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'ID penanda task yang akan dihentikan' }
            },
            required: ['task_id'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list-tasks',
          description: 'Melihat seluruh background tasks yang sedang berjalan.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      }
    ]
  }
}

// Legacy dictionary representation for backwards-compatibility
export const GROUP_TOOLS_DEFINITION = Object.entries(GROUP_TOOLS_SCHEMA).reduce((acc, [groupKey, group]) => {
  acc[groupKey] = {
    description: group.description,
    tools: group.tools.reduce((tAcc, t) => {
      tAcc[t.function.name] = t.function.description
      return tAcc
    }, {})
  }
  return acc
}, {})

export const group_tools = async () => {
  return GROUP_TOOLS_DEFINITION
}

export const group_tools_flat = {}
for (const group of Object.values(GROUP_TOOLS_DEFINITION)) {
  Object.assign(group_tools_flat, group.tools)
}
