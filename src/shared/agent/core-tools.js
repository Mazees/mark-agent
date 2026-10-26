/**
 * Core Built-in Tools Schema untuk MARK V5 (OpenAI-compatible OpenAPI Function Definition).
 * Seluruh nama tool mempertahankan format kebab-case (100% valid sesuai regex OpenAI ^[a-zA-Z0-9_-]{1,64}$).
 */
export const core_tools_schema = [
  {
    type: 'function',
    function: {
      name: 'browser-search',
      description:
        'HANYA untuk mencari dan menemukan URL / link website yang relevan dengan kata kunci (bukan untuk membaca isi artikel lengkap). Mengembalikan daftar judul & URL. Untuk membaca isi konten lengkap dari URL yang ditemukan, gunakan tool "browser-fetch".',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Kata kunci pencarian web (misal: "gpt 6 astra", "kebakaran kalimantan 2026")'
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
      name: 'browser-fetch',
      description:
        'Membaca dan mengambil (curl/fetch) isi konten teks/artikel dari suatu URL secara instan tanpa perlu membuka jendela browser fisik. Sangat cepat untuk membaca isi berita, dokumentasi, atau artikel web.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL web yang ingin dibaca isinya (misal: "https://example.com/artikel")'
          },
          max_chars: {
            type: 'number',
            description:
              'Batas maksimal karakter teks yang diekstrak (default 4000, maksimal 12000)'
          }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read-tools',
      description:
        'WAJIB dipanggil jika kamu membutuhkan dokumentasi atau fungsi tambahan dari grup tool tertentu sebelum mengeksekusinya.',
      parameters: {
        type: 'object',
        properties: {
          group_name: {
            type: 'string',
            description: 'Nama grup tool bawaan atau plugin yang ingin dibaca.'
          }
        },
        required: ['group_name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage-memory',
      description:
        'Menyimpan, memperbarui, atau menghapus fakta profil, preferensi user, atau catatan penting ke memori jangka panjang.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['insert', 'update', 'delete'],
            description: 'Aksi database memori'
          },
          type: {
            type: 'string',
            enum: ['profile', 'preference', 'notes'],
            description: 'Kategori memori'
          },
          summary: {
            type: 'string',
            description: 'Ringkasan singkat memori'
          },
          detail: {
            type: 'string',
            description: 'Detail konten fakta atau catatan yang disimpan'
          }
        },
        required: ['action', 'type', 'summary', 'detail'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update-working-memory',
      description:
        'Menyimpan atau memperbarui catatan ringkas progres koding, lokasi baris/fungsi yang telah dipetakan ke .mark/working-memory.json.',
      parameters: {
        type: 'object',
        properties: {
          notes: {
            type: 'string',
            description: 'Catatan progres koding atau rencana kerja teknis'
          }
        },
        required: ['notes'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory-search',
      description:
        'Mencari ingatan masa lalu, preferensi/catatan user, solusi historis, dan riwayat chat percakapan asli.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Kata kunci pencarian memori'
          },
          threshold: {
            type: 'number',
            description: 'Tingkat kemiripan (0.1 - 0.9, default 0.5)'
          },
          limit: {
            type: 'number',
            description: 'Jumlah maksimal data yang diambil (default 5)'
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
      name: 'read-file',
      description: 'Membaca isi berkas teks dari workspace atau sistem operasi.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path absolut atau relatif berkas yang akan dibaca'
          },
          start_line: {
            type: 'number',
            description: 'Nomor baris awal (opsional)'
          },
          end_line: {
            type: 'number',
            description: 'Nomor baris akhir (opsional)'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read-image',
      description:
        'Membaca berkas gambar lokal (.png, .jpg, .jpeg, .webp, .gif, dll.) dari workspace atau sistem operasi di luar chat. DILARANG menggunakan tool ini jika gambar sudah dilampirkan langsung di chat (temp-uploads), karena sudah terlihat langsung di visual context.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path absolut atau relatif berkas gambar yang akan dibaca'
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
      name: 'write-file',
      description: 'Membuat berkas baru atau menulis ulang berkas dari nol.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas tujuan'
          },
          content: {
            type: 'string',
            description: 'Konten teks lengkap berkas'
          }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replace-content',
      description:
        'Mengedit berkas kode dengan mencocokkan teks lama dan menggantinya secara presisi.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas yang akan diedit'
          },
          target_content: {
            type: 'string',
            description: 'Teks lama yang akan diganti'
          },
          replacement_content: {
            type: 'string',
            description: 'Teks baru pengganti'
          }
        },
        required: ['path', 'target_content', 'replacement_content'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replace-lines',
      description: 'Mengedit baris tertentu pada berkas berdasarkan nomor baris.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas yang akan diedit'
          },
          start_line: {
            type: 'number',
            description: 'Nomor baris awal'
          },
          end_line: {
            type: 'number',
            description: 'Nomor baris akhir'
          },
          new_code: {
            type: 'string',
            description: 'Kode baru pengganti'
          }
        },
        required: ['path', 'start_line', 'end_line', 'new_code'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete-file',
      description: 'Menghapus berkas dari sistem operasi.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas yang akan dihapus'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list-dir',
      description: 'Melihat daftar isi folder langsung (1 level).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path folder (kosongkan untuk root workspace)'
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find-files',
      description:
        'Mencari berkas di seluruh subfolder secara rekursif dengan filter nama/ekstensi glob.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Pola glob pencarian (misal: "*.jsx" atau "*.ts")'
          },
          subfolder: {
            type: 'string',
            description: 'Subfolder target pencarian'
          }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep-search',
      description:
        'Mencari kata kunci atau regex di dalam satu berkas spesifik maupun seluruh berkas dalam folder secara rekursif. Mengembalikan nomor baris dan cuplikan kode yang cocok.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Kata kunci teks atau pola yang dicari'
          },
          path: {
            type: 'string',
            description:
              'Path berkas spesifik (misal: "minecraft_2d.html") ATAU folder target (kosongkan untuk root workspace)'
          }
        },
        required: ['keyword'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file-outline',
      description:
        'Melihat peta dan struktur berkas (fungsi, class, heading) tanpa membaca seluruh isi.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas kode'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read-document',
      description: 'Membaca dan mencari isi dokumen teks, PDF, atau DOCX.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path berkas dokumen'
          },
          keyword: {
            type: 'string',
            description: 'Kata kunci pencarian spesifik di dalam dokumen'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read-skill',
      description:
        'Membaca file pedoman skill untuk memuat instruksi dan workflow khusus sebelum eksekusi aksi.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'Nama skill yang ingin dibaca (misal: "speedrunner", "git-commit")'
          }
        },
        required: ['skill_name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'learn',
      description:
        'Mengelola learned skill MARK secara langsung atas permintaan pengguna. Sintesis otomatis tetap menangani pembelajaran dari tugas bermakna yang selesai. Pilih insert untuk skill baru atau update untuk merevisi skill yang sudah ada.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama skill yang stabil dan mudah dikenali.' },
          description: {
            type: 'string',
            description: 'Ringkasan tujuan skill dan kapan perlu dipakai.'
          },
          content: { type: 'string', description: 'Panduan langkah demi langkah yang teruji.' },
          method: {
            type: 'string',
            enum: ['insert', 'update'],
            description: 'insert membuat skill baru; update mengganti isi skill bernama sama.'
          }
        },
        required: ['name', 'description', 'content', 'method'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open',
      description:
        'Membuka aplikasi Windows via shell execute atau membuka URL di browser default.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Nama executable/path atau URL web'
          }
        },
        required: ['target'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run-powershell',
      description: 'Menjalankan perintah terminal PowerShell Windows.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Perintah PowerShell satu baris'
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use',
      description:
        'Kendali desktop Windows berbasis sesi. Argumen wajib objek JSON. WAJIB mulai dengan {"action":"open_session","reason":"Meminta izin kendali desktop"} dan tunggu izin pengguna. Teks "open_session" dan pembungkus query ditolak. Setelah diizinkan, mouse dikunci dan overlay tetap tampil sepanjang sesi, termasuk saat kamu memeriksa hasil atau berpikir. open_session mengembalikan screenshot awal. Gunakan observation_id terbaru dan koordinat 1280x720 dari gambar itu. Aksi dengan wait_ms:5000 menjalankan input, menunggu lima detik, lalu mengembalikan screenshot dalam hasil yang sama. Setelah tugas selesai atau kendali tidak diperlukan, WAJIB action:close untuk melepas mouse dan menutup overlay. Ctrl+Shift+R membatalkan sesi; jika cancelledBy:user atau izin ditolak, sampaikan dan tunggu instruksi baru tanpa mencoba jalur pengganti. Batch berhenti pada error. executed berarti input dijalankan, bukan tujuan terverifikasi; periksa gambar hasilnya.',
      parameters: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            description:
              '1 hingga 30 aksi berurutan. Hanya gabungkan aksi yang targetnya sudah diketahui. delay_after_ms mengatur jeda antaraksi; wait_ms di root mengatur jeda sebelum screenshot akhir. Jangan lanjutkan aksi yang membutuhkan hasil visual yang belum diperiksa.',
            minItems: 1,
            maxItems: 30,
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
                    'list_windows',
                    'focus_window',
                    'maximize_window',
                    'open_app',
                    'wait',
                    'close'
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
                window_id: {
                  type: 'string',
                  description: 'ID jendela dari list_windows untuk memilih target secara unik.'
                },
                target: {
                  type: 'string',
                  description: 'Judul window (focus_window) atau path/nama program (open_app)'
                },
                maximize: {
                  type: 'boolean',
                  description: 'Maksimalkan jendela saat dipilih (default: false).'
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
                wait_ms: {
                  type: 'integer',
                  description:
                    'Kompatibilitas: hanya wait_ms pada aksi terakhir dipakai jika wait_ms di root tidak diberikan. Gunakan delay_after_ms untuk jeda antaraksi.'
                },
                delay_after_ms: {
                  type: 'integer',
                  description:
                    'Jeda sebelum aksi berikutnya, 0 hingga 10000 ms. Tidak menambah jeda screenshot akhir.'
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
              'list_windows',
              'focus_window',
              'maximize_window',
              'open_app',
              'wait',
              'open_session',
              'close'
            ],
            description:
              '(Alternatif single action) Jenis aksi tunggal jika tidak menggunakan array actions'
          },
          coordinate: {
            type: 'array',
            items: { type: 'integer' },
            description: '(Alternatif single action) [x, y] kanvas kanonikal 1280x720'
          },
          observation_id: {
            type: 'string',
            description:
              'observation.id dari hasil screenshot terbaru pada sesi ini. Observasi lama ditolak.'
          },
          window_id: {
            type: 'string',
            description: 'ID jendela dari list_windows untuk focus_window/maximize_window.'
          },
          start_coordinate: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 2,
            maxItems: 2,
            description: 'Koordinat awal drag pada screenshot 1280x720.'
          },
          end_coordinate: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 2,
            maxItems: 2,
            description: 'Koordinat akhir drag pada screenshot 1280x720.'
          },
          duration_ms: {
            type: 'integer',
            minimum: 0,
            maximum: 10000,
            description: 'Durasi wait, drag, atau key_down.'
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
              '(Alternatif single action) Maksimalkan jendela saat dipilih (default: false).'
          },
          wait_ms: {
            type: 'integer',
            minimum: 0,
            maximum: 10000,
            description:
              'Jeda setelah aksi terakhir sebelum screenshot dikembalikan pada hasil tool yang sama. 5000 berarti lima detik; default 300 ms, 0 tanpa jeda tambahan.'
          }
        },
        oneOf: [{ required: ['action'] }, { required: ['actions'] }],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        'Mendelegasikan tugas ke Minibot baru yang bekerja mandiri di background secara non-blocking. Minibot akan mengeksekusi misi dan melapor kembali secara otomatis via push notification tanpa Lead Agent perlu memanggil wait_subagents.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nama Minibot spesialis (misal: "Developer", "Mr Tester", "Researcher")'
          },
          role: { type: 'string', description: 'Peran Minibot' },
          goal: { type: 'string', description: 'Tujuan utama Minibot' },
          initial_message: {
            type: 'string',
            description: 'Pesan instruksi awal tugas yang didelegasikan'
          },
          tools: {
            type: 'string',
            description: 'Daftar tool yang diizinkan (dipisah koma, atau "*")'
          }
        },
        required: ['name', 'role', 'goal', 'initial_message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'message_agent',
      description:
        'Mengirim pesan melalui kotak masuk. Hasil langsung adalah tanda diterima, bukan jawaban. Gunakan kind question untuk meminta jawaban, atau kind reply dan reply_to untuk membalas. Penugasan baru hanya melalui Mark.',
      parameters: {
        type: 'object',
        properties: {
          target_agent: {
            type: 'string',
            description:
              'Nama atau ID Minibot tujuan (misal: "Developer", "Mr Tester", atau "sub_xxx")'
          },
          message: { type: 'string', description: 'Pesan, instruksi, atau pertanyaan teknis' },
          job_id: {
            type: 'string',
            description: 'ID penugasan penerima; wajib bila target ambigu'
          },
          kind: { type: 'string', enum: ['info', 'question', 'reply'] },
          reply_to: { type: 'string', description: 'ID pertanyaan yang dijawab' }
        },
        required: ['target_agent', 'message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Mengirim instruksi ke kotak masuk pekerjaan aktif; untuk agent yang sudah selesai membuat penugasan lanjutan baru. Mengembalikan ID pekerjaan, bukan jawaban langsung.',
      parameters: {
        type: 'object',
        properties: {
          subagent_id: { type: 'string', description: 'ID Minibot tujuan' },
          message: { type: 'string', description: 'Pesan instruksi' }
        },
        required: ['subagent_id', 'message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_subagents',
      description:
        'Melihat daftar seluruh Minibot yang sedang aktif atau sudah selesai beserta statusnya.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description:
              'Filter status: running, queued, waiting_peer, waiting_user, interrupted, completed, failed, cancelled, idle'
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'report_to_lead',
      description:
        'Melaporkan hasil akhir misi, rangkuman eksekusi, atau temuan penting langsung ke Lead Agent (Mark) dan memicu push notification di chat utama.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Rangkuman lengkap hasil pekerjaan yang telah selesai'
          },
          artifact: {
            type: 'string',
            description: 'Path berkas atau artefak yang berhasil dibuat/dimodifikasi jika ada'
          }
        },
        required: ['summary'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_agent_task',
      description:
        'Membuat dan mengaktifkan rencana alur kerja tugas multi-tahap (Task Workflow) terstruktur dengan sasaran utama dan target deliverable per tahap.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul tugas utama' },
          objective: {
            type: 'string',
            description: 'Tujuan akhir penyelesaian tugas secara menyeluruh'
          },
          steps: {
            type: 'array',
            description: 'Daftar langkah/tahapan pengerjaan terstruktur',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'ID unik tahap (misal: "step-1")' },
                title: { type: 'string', description: 'Nama tahapan' },
                objective: {
                  type: 'string',
                  description: 'Sasaran khusus yang harus dicapai pada langkah ini'
                },
                deliverable: {
                  type: 'string',
                  description: 'Hasil yang diharapkan; berkas hanya jika pekerjaan memerlukannya'
                },
                requiredArtifact: {
                  type: 'boolean',
                  description:
                    'Benar jika tugas ini memang mewajibkan berkas hasil pada langkah ini.'
                },
                acceptanceCriteria: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Kriteria kelayakan selesainya tahap ini'
                }
              },
              required: ['id', 'title', 'objective', 'deliverable']
            }
          }
        },
        required: ['title', 'objective', 'steps'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_done_task',
      description:
        'Selesaikan hanya langkah aktif setelah hasil diperiksa. Ringkasan hasil dan bukti wajib. Berkas opsional; kegagalan berkas wajib menghalangi penyelesaian. Tidak menyelesaikan langkah lain.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string'
          },
          stepIndex: {
            type: 'integer',
            description: 'Nomor langkah aktif, mulai dari 1.'
          },
          planVersion: {
            type: 'integer',
            description: 'Versi rencana dari snapshot terakhir.'
          },
          summary: {
            type: 'string',
            description: 'Hasil langkah ini, bukan jawaban penutup seluruh tugas.'
          },
          verificationProof: {
            type: 'string',
            description:
              'Bukti konkret sesuai pekerjaan: sumber/baris yang dibaca untuk audit, pemeriksaan relevan untuk coding, atau rujukan hasil langkah sebelumnya untuk kesimpulan. Nyatakan batas pemeriksaan.'
          },
          artifactContent: {
            type: 'string',
            description: 'Dokumen Markdown hanya jika diperlukan tugas.'
          },
          artifactPath: {
            type: 'string',
            description:
              'Path berkas hasil nyata yang sudah dibuat; server memeriksa keberadaannya.'
          }
        },
        required: ['stepIndex', 'summary', 'verificationProof'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kill_subagent',
      description: 'Menghentikan paksa eksekusi Minibot yang sedang berjalan.',
      parameters: {
        type: 'object',
        properties: {
          subagent_id: { type: 'string', description: 'ID Minibot yang akan dihentikan' },
          reason: { type: 'string', description: 'Alasan penghentian' }
        },
        required: ['subagent_id'],
        additionalProperties: false
      }
    }
  }
]

// Injeksi parameter reason ke seluruh core tools agar model selalu memberikan alasan natural
core_tools_schema.push(
  {
    type: 'function',
    function: {
      name: 'wait_subagents',
      description:
        'Opsional jika pengguna secara khusus meminta menunggu Minibot. Delegasi biasa berjalan tanpa tool ini: lanjutkan percakapan, laporan akan memicu tanggapan Mark otomatis. Timeout tidak berarti pekerjaan selesai; hasil menyertakan status dan ID pekerjaan.',
      parameters: {
        type: 'object',
        properties: {
          targets: {
            type: 'string',
            description: 'ID agent dipisah koma, atau all untuk sesi ini'
          },
          timeout: { type: 'number', description: 'Batas tunggu 1–60 detik; default 40' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_lead_input',
      description:
        'Minibot meminta keputusan, informasi pengguna, atau penugasan tambahan melalui Mark. Menangguhkan pekerjaan tanpa menandainya selesai.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
        additionalProperties: false
      }
    }
  }
)

core_tools_schema.push({
  type: 'function',
  function: {
    name: 'read_task',
    description:
      'Membaca status checklist, sasaran, hasil, bukti pemeriksaan, dan lokasi berkas. Gunakan read-file jika membutuhkan isi berkas hasil.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID workflow yang ingin dibaca.' },
        stepIndex: {
          type: 'integer',
          description: 'Nomor langkah mulai 1. Jika kosong membaca seluruh ringkasan workflow.'
        }
      },
      required: ['taskId'],
      additionalProperties: false
    }
  }
})

core_tools_schema.push({
  type: 'function',
  function: {
    name: 'update_task_plan',
    description:
      'Revisi langkah mendatang yang belum dimulai. Langkah aktif dan selesai dipertahankan; sampaikan alasan singkat kepada pengguna.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        planVersion: { type: 'integer' },
        explanation: { type: 'string' },
        steps: {
          type: 'array',
          description:
            'Seluruh daftar langkah mendatang pengganti; jangan sertakan langkah aktif/selesai. ID lama hanya untuk langkah pending yang dipertahankan.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              objective: { type: 'string' },
              deliverable: { type: 'string' },
              requiredArtifact: { type: 'boolean' },
              acceptanceCriteria: { type: 'array', items: { type: 'string' } }
            },
            required: ['title', 'objective'],
            additionalProperties: false
          }
        }
      },
      required: ['taskId', 'planVersion', 'explanation', 'steps'],
      additionalProperties: false
    }
  }
})

for (const t of core_tools_schema) {
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

// Legacy dictionary representation for backwards-compatibility
export const core_tools = core_tools_schema.reduce((acc, t) => {
  acc[t.function.name] = t.function.description
  return acc
}, {})
