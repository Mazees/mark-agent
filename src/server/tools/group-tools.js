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
          name: 'browser-search',
          description:
            'HANYA untuk mencari dan menemukan URL / link website yang relevan dengan kata kunci (bukan untuk membaca isi artikel lengkap). Mengembalikan daftar judul & URL. Untuk membaca isi konten lengkap dari URL yang ditemukan, gunakan tool lainnya seperti "browser-fetch".',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Kata kunci pencarian web' }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-fetch',
          description:
            'Membaca dan mengambil (curl/fetch) isi konten teks/artikel dari suatu URL secara instan tanpa perlu membuka jendela browser fisik.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL lengkap website tujuan' },
              max_chars: { type: 'number', description: 'Batas karakter teks (default 4000)' }
            },
            required: ['url'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser-navigate',
          description:
            'Buka URL di browser fisik. Mengembalikan daftar elemen interaktif bernomor (ID).',
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
          description:
            'Mengambil tangkapan layar (screenshot) halaman browser web Puppeteer. Jika parameter query disertakan, tampilan visual halaman web akan langsung dianalisis oleh AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Nama berkas tujuan screenshot (.png, opsional)'
              },
              query: {
                type: 'string',
                description:
                  'Instruksi atau pertanyaan analisis visual terhadap tampilan halaman web (opsional)'
              }
            },
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
          description:
            'Minta bantuan user untuk menyelesaikan CAPTCHA, 2FA, verifikasi Cloudflare, atau login manual pada halaman browser. Jendela browser akan otomatis ditampilkan dan interaksi user di-unblock sementara hingga user menekan tombol Resume.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'Pesan arahan untuk user (misal: "Silakan selesaikan Cloudflare Turnstile / Login Google terlebih dahulu")'
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
  computer_use: {
    description:
      'Tool kendali visual tingkat OS (Visual Computer Use / VLA) dan otomasi desktop Windows melalui screenshot layar kanonikal 1280x720, injeksi mouse click, drag, keyboard typing, shortcut, dan window management.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'computer_use',
          description:
            'Kendali visual tingkat OS untuk otomasi desktop Windows melalui screenshot layar kanonikal 1280x720 dan injeksi keyboard/mouse presisi tinggi. Mendukung satu aksi tunggal maupun rangkaian aksi berurutan (batch).',
          parameters: {
            type: 'object',
            properties: {
              actions: {
                type: 'array',
                description:
                  'Daftar satu atau lebih aksi computer use yang akan dieksekusi berurutan (contoh untuk 1 aksi: [{ action: "click", coordinate: [500, 300] }]).',
                items: {
                  type: 'object',
                  properties: {
                    action: {
                      type: 'string',
                      enum: [
                        'screenshot',
                        'click',
                        'double_click',
                        'right_click',
                        'middle_click',
                        'mouse_down',
                        'mouse_up',
                        'move',
                        'drag',
                        'burst_click',
                        'type',
                        'key',
                        'key_down',
                        'key_up',
                        'hotkey',
                        'scroll',
                        'wait',
                        'list_windows',
                        'focus_window',
                        'maximize_window',
                        'open_app'
                      ],
                      description: 'Jenis aksi yang akan dieksekusi'
                    },
                    coordinate: {
                      type: 'array',
                      items: { type: 'integer' },
                      description:
                        '[x, y] koordinat kanvas kanonikal 1280x720 (untuk click/move/mouse_down)'
                    },
                    start_coordinate: {
                      type: 'array',
                      items: { type: 'integer' },
                      description: '[x, y] koordinat awal untuk aksi drag'
                    },
                    end_coordinate: {
                      type: 'array',
                      items: { type: 'integer' },
                      description: '[x, y] koordinat akhir untuk aksi drag'
                    },
                    text: {
                      type: 'string',
                      description: 'Teks yang akan diketikkan (action: type)'
                    },
                    key: {
                      type: 'string',
                      description: 'Tombol keyboard (Return, Space, Tab, Escape, dll)'
                    },
                    modifiers: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Tombol modifikasi untuk hotkey (ctrl, shift, alt, win)'
                    },
                    title: {
                      type: 'string',
                      description: 'Judul window untuk focus_window atau maximize_window'
                    },
                    target: {
                      type: 'string',
                      description: 'Judul window (focus_window) atau path/nama program (open_app)'
                    },
                    maximize: {
                      type: 'boolean',
                      description:
                        'Apakah window otomatis dimaksimalkan ke fullscreen saat difokuskan (default: true)'
                    },
                    count: {
                      type: 'integer',
                      description: 'Jumlah repetisi untuk burst_click'
                    },
                    interval_ms: {
                      type: 'integer',
                      description: 'Jeda antar klik pada burst_click (ms)'
                    },
                    duration_ms: {
                      type: 'integer',
                      description: 'Durasi tahanan tombol atau delay (ms)'
                    },
                    delay_after_ms: {
                      type: 'integer',
                      description:
                        'Jeda waktu setelah aksi ini selesai sebelum lanjut ke aksi berikutnya (ms)'
                    }
                  },
                  required: ['action']
                }
              },
              action: {
                type: 'string',
                enum: [
                  'screenshot',
                  'click',
                  'double_click',
                  'right_click',
                  'middle_click',
                  'mouse_down',
                  'mouse_up',
                  'move',
                  'drag',
                  'burst_click',
                  'type',
                  'key',
                  'key_down',
                  'key_up',
                  'hotkey',
                  'scroll',
                  'wait',
                  'list_windows',
                  'focus_window',
                  'maximize_window',
                  'open_app'
                ],
                description:
                  '(Alternatif single action) Jenis aksi tunggal jika tidak menggunakan array actions'
              },
              coordinate: {
                type: 'array',
                items: { type: 'integer' },
                description: '(Alternatif single action) [x, y] kanvas kanonikal 1280x720'
              },
              text: {
                type: 'string',
                description: '(Alternatif single action) Teks untuk pengetikan (action: type)'
              },
              key: {
                type: 'string',
                description: '(Alternatif single action) Tombol keyboard'
              },
              title: {
                type: 'string',
                description: '(Alternatif single action) Judul window'
              },
              target: {
                type: 'string',
                description: '(Alternatif single action) Judul window atau path program'
              },
              maximize: {
                type: 'boolean',
                description:
                  '(Alternatif single action) Apakah otomatis dimaksimalkan (default: true)'
              }
            }
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
          description:
            'Memutar lagu di YouTube Music. Masukkan judul atau genre/mood lagu pada parameter title.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description:
                  'Judul lagu, nama artis, atau kata kunci pencarian lagu yang ingin diputar (contoh: "Bohemian Rhapsody", "Lagu Pop Santai")'
              }
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
    description:
      'Manajemen penyimpanan dan berkas Google Drive (Docs, Sheets, TXT, Upload, Search).',
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
              pagination: {
                type: 'string',
                description: 'Rentang hasil pagination (contoh: "0-10")'
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
          name: 'gdrive-list',
          description: 'Melihat daftar berkas di Google Drive (atau folder tertentu).',
          parameters: {
            type: 'object',
            properties: {
              folder_id: {
                type: 'string',
                description: 'ID folder target (opsional, kosongkan untuk root)'
              },
              pagination: {
                type: 'string',
                description: 'Rentang hasil pagination (contoh: "0-10")'
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-read',
          description:
            'Membaca dan mengekstrak teks dari Google Docs, Sheets, atau TXT berdasarkan file ID.',
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
          description:
            'Mengunggah berkas lokal (PDF, dokumen, gambar, zip, dll.) dari komputer ke Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description:
                  'Path absolut atau relatif berkas lokal yang akan diunggah (misal: "C:\\Users\\...\\laporan.pdf")'
              }
            },
            required: ['file_path'],
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
              type: {
                type: 'string',
                enum: ['doc', 'sheet', 'folder'],
                description: 'Tipe yang dibuat'
              }
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
      },
      {
        type: 'function',
        function: {
          name: 'gdrive-share',
          description:
            'Mengubah izin akses atau membagikan berkas di Google Drive (misal: publik siapa saja dengan tautan, atau email tertentu).',
          parameters: {
            type: 'object',
            properties: {
              file_id: {
                type: 'string',
                description: 'ID berkas Google Drive yang ingin dibagikan'
              },
              role: {
                type: 'string',
                enum: ['reader', 'commenter', 'writer'],
                description: 'Peran akses pengguna (default: "reader")'
              },
              type: {
                type: 'string',
                enum: ['anyone', 'user', 'group'],
                description:
                  'Cakupan akses: "anyone" (publik dengan tautan), "user" (spesifik email), atau "group" (default: "anyone")'
              },
              email: {
                type: 'string',
                description: 'Alamat email pengguna jika type adalah "user" atau "group"'
              }
            },
            required: ['file_id'],
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
              time_min: {
                type: 'string',
                description: 'Waktu mulai filter dalam ISO string (contoh: "2026-08-28T00:00:00Z")'
              }
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
              start_time: {
                type: 'string',
                description:
                  'Waktu mulai dalam format ISO 8601 (contoh: "2026-08-28T14:00:00+07:00")'
              },
              end_time: {
                type: 'string',
                description:
                  'Waktu selesai dalam format ISO 8601 (contoh: "2026-08-28T15:00:00+07:00")'
              }
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
          description:
            'Mencari email di Gmail berdasarkan kata kunci atau filter query Gmail (misal: "is:unread", "from:someone@gmail.com").',
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
    description:
      'Integrasi sistem vision layar desktop, webcam, output suara lisan (TTS), dan integrasi perpesanan Telegram Bot.',
    tools: [
      {
        type: 'function',
        function: {
          name: 'read-image',
          description:
            'Membaca berkas gambar lokal (.png, .jpg, .jpeg, .webp, .gif, dll.) dari workspace atau komputer pengguna dan menganalisis tampilan visualnya menggunakan AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path berkas gambar lokal (absolut atau relatif terhadap workspace)'
              },
              query: {
                type: 'string',
                description:
                  'Instruksi atau pertanyaan tentang apa yang ingin kamu analisis dari gambar (opsional)'
              }
            },
            required: ['file_path'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'analyze-screen',
          description:
            'Mengambil screenshot seluruh monitor/layar Windows saat ini dan menganalisis tampilan visual antarmuka/aplikasi menggunakan AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat atau analisis dari layar pengguna'
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
          description:
            'Mengambil frame gambar dari webcam/kamera laptop/PC pengguna dan menganalisis apa yang terlihat di depan kamera secara real-time menggunakan AI Vision.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat dari kamera'
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
          description:
            'Mengambil screenshot layar PC dan langsung mengirimkannya ke Telegram admin.',
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
          description:
            'Mengirim pesan teks, gambar/foto, atau berkas ke chat Telegram. Jika chat_id tidak diisi atau bernilai "admin", otomatis dikirim ke akun Telegram admin pemilik MARK.',
          parameters: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description:
                  'ID Chat Telegram tujuan. Bersifat opsional; jika dikosongkan atau diisi "admin", otomatis dikirim ke akun Telegram admin pemilik MARK.'
              },
              type: {
                type: 'string',
                enum: ['auto', 'text', 'photo', 'file'],
                description:
                  'Tipe kiriman: "auto" (otomatis deteksi), "text" (pesan teks), "photo" (gambar/foto yang dirender langsung di chat), atau "file" (dokumen berkas)'
              },
              content: {
                type: 'string',
                description:
                  'Isi teks pesan, path berkas lokal (contoh: "C:\\Users\\...\\image.png"), atau URL berkas yang ingin dikirim.'
              },
              caption: {
                type: 'string',
                description: 'Keterangan/caption opsional jika mengirim gambar atau berkas.'
              }
            },
            required: ['content'],
            additionalProperties: false
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'speak',
          description:
            'Mengeluarkan suara lisan (Text-to-Speech) lewat speaker komputer secara langsung.',
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
    description:
      'Terminal runner latar belakang (non-blocking) untuk menjalankan server dev, unit test, dan proses jangka panjang.',
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
  },
  custom_plugins: {
    description:
      'Custom plugin dan modul ekstensi JavaScript lokal buatan pengguna (Documents/Mark Plugins).',
    tools: [
      {
        type: 'function',
        function: {
          name: 'list-plugins',
          description:
            'Melihat daftar seluruh custom plugin lokal yang terinstall beserta action/sub-tool di dalamnya dan status aktifnya.',
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

export const GROUP_TOOL_GROUP_NAMES = Object.keys(GROUP_TOOLS_SCHEMA)

export const GROUP_TOOL_DESCRIPTIONS = Object.fromEntries(
  Object.entries(GROUP_TOOLS_SCHEMA).map(([key, group]) => [key, group.description])
)

// Injeksi parameter reason ke seluruh tool schema di GROUP_TOOLS_SCHEMA
for (const group of Object.values(GROUP_TOOLS_SCHEMA)) {
  if (Array.isArray(group.tools)) {
    for (const t of group.tools) {
      if (t.function?.parameters?.properties) {
        if (!t.function.parameters.properties.reason) {
          t.function.parameters.properties.reason = {
            type: 'string',
            description:
              'Penjelasan ringkas dalam bahasa manusia mengenai alasan atau tujuan aksi ini (contoh: "Membuka tab Instagram di browser").'
          }
        }
        if (Array.isArray(t.function.parameters.required)) {
          if (!t.function.parameters.required.includes('reason')) {
            t.function.parameters.required.push('reason')
          }
        } else {
          t.function.parameters.required = ['reason']
        }
      }
    }
  }
}

// Legacy dictionary representation for backwards-compatibility
export const GROUP_TOOLS_DEFINITION = Object.entries(GROUP_TOOLS_SCHEMA).reduce(
  (acc, [groupKey, group]) => {
    acc[groupKey] = {
      description: group.description,
      tools: group.tools.reduce((tAcc, t) => {
        tAcc[t.function.name] = t.function.description
        return tAcc
      }, {})
    }
    return acc
  },
  {}
)

export const group_tools = async () => {
  return GROUP_TOOLS_DEFINITION
}

export const group_tools_flat = {}
for (const group of Object.values(GROUP_TOOLS_DEFINITION)) {
  Object.assign(group_tools_flat, group.tools)
}
