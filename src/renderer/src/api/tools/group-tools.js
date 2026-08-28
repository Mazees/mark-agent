/**
 * Group Tools Definition & OpenAPI Function Schema untuk MARK V5.
 * Format penamaan kebab-case dipertahankan.
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
      },
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
