/**
 * Core Built-in Tools Schema untuk MARK V5 (OpenAI-compatible OpenAPI Function Definition).
 * Seluruh nama tool mempertahankan format kebab-case (100% valid sesuai regex OpenAI ^[a-zA-Z0-9_-]{1,64}$).
 */
export const core_tools_schema = [
  {
    type: 'function',
    function: {
      name: 'read-tools',
      description: 'WAJIB dipanggil jika kamu membutuhkan dokumentasi atau fungsi tambahan dari grup tool tertentu sebelum mengeksekusinya.',
      parameters: {
        type: 'object',
        properties: {
          group_name: {
            type: 'string',
            description: 'Nama grup tool yang ingin dibaca (misal: "advanced_browser", "pc_automation", "youtube_music", "git_vcs", "task_terminal")'
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
      description: 'Menyimpan, memperbarui, atau menghapus fakta profil, preferensi user, atau catatan penting ke memori jangka panjang.',
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
      description: 'Menyimpan atau memperbarui catatan ringkas progres koding, lokasi baris/fungsi yang telah dipetakan ke .mark/working-memory.json.',
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
      description: 'Mencari ingatan masa lalu, preferensi/catatan user, solusi historis, dan riwayat chat percakapan asli.',
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
      description: 'Mengedit berkas kode dengan mencocokkan teks lama dan menggantinya secara presisi.',
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
      description: 'Mencari berkas di seluruh subfolder secara rekursif dengan filter nama/ekstensi glob.',
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
      description: 'Mencari kata kunci atau potongan kode dalam seluruh berkas di folder.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Kata kunci atau regex pencarian'
          },
          path: {
            type: 'string',
            description: 'Folder path target (default root)'
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
      description: 'Melihat peta dan struktur berkas (fungsi, class, heading) tanpa membaca seluruh isi.',
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
      description: 'Membaca file pedoman skill untuk memuat instruksi dan workflow khusus sebelum eksekusi aksi.',
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
      name: 'analyze-screen',
      description: 'Mengambil screenshot seluruh monitor/layar Windows saat ini dan menganalisis tampilan visual antarmuka/aplikasi menggunakan AI Vision.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat atau analisis dari layar pengguna (contoh: "Analisis layout halaman ini", "Apa error yang muncul di layar?")'
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
            description: 'Instruksi atau pertanyaan tentang apa yang ingin kamu lihat dari kamera (contoh: "Jelaskan apa yang terlihat di depan kamera", "Apakah user sedang duduk di depan layar?")'
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
      name: 'open',
      description: 'Membuka aplikasi Windows via shell execute atau membuka URL di browser default.',
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
      name: 'spawn_subagent',
      description: 'Mendelegasikan tugas ke sub-agent baru yang bekerja di background.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama sub-agent' },
          role: { type: 'string', description: 'Peran sub-agent' },
          goal: { type: 'string', description: 'Tujuan utama sub-agent' },
          initial_message: { type: 'string', description: 'Pesan instruksi awal' },
          tools: { type: 'string', description: 'Daftar tool yang diizinkan (dipisah koma)' }
        },
        required: ['name', 'role', 'goal', 'initial_message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Mengirim pesan instruksi atau evaluasi ke Sub-Agent aktif.',
      parameters: {
        type: 'object',
        properties: {
          subagent_id: { type: 'string', description: 'ID sub-agent tujuan' },
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
      description: 'Melihat daftar seluruh sub-agent yang sedang aktif atau sudah selesai beserta statusnya.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter status (running/idle/completed)' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wait_subagents',
      description: 'Menunggu dan mengumpulkan laporan hasil eksekusi dari sub-agent yang sedang berjalan.',
      parameters: {
        type: 'object',
        properties: {
          targets: { type: 'string', description: '"all" atau daftar ID dipisah koma' },
          timeout: { type: 'number', description: 'Batas waktu tunggu dalam detik' }
        },
        required: ['targets'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kill_subagent',
      description: 'Menghentikan paksa eksekusi sub-agent yang sedang berjalan.',
      parameters: {
        type: 'object',
        properties: {
          subagent_id: { type: 'string', description: 'ID sub-agent yang akan dihentikan' },
          reason: { type: 'string', description: 'Alasan penghentian' }
        },
        required: ['subagent_id'],
        additionalProperties: false
      }
    }
  }
]

// Legacy dictionary representation for backwards-compatibility
export const core_tools = core_tools_schema.reduce((acc, t) => {
  acc[t.function.name] = t.function.description
  return acc
}, {})
