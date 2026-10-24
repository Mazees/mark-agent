/**
 * Metadata for built-in MARK add-ons. Keep this file free of React and secrets so
 * both the UI and planning prompt can use the same catalog.
 */
export const ADDONS = [
  {
    id: 'chrome-bridge',
    name: 'Chrome Bridge',
    description: 'Kendalikan satu tab pilihan di Chrome milikmu',
    capabilities: [
      'Baca dan kendalikan tab Chrome yang dipilih pengguna',
      'Isi formulir, jalankan JavaScript, dan ambil screenshot tab pilihan'
    ],
    detailRenderer: 'chrome-bridge',
    icon: 'chrome',
    statusProvider: 'chrome-bridge',
    developer: 'MARK',
    examples: [
      'Gunakan Chrome saya untuk membaca halaman ini dan merangkum isinya.',
      'Bantu isi formulir pada tab Chrome yang saya pilih.',
      'Ambil tangkapan layar dari tab Chrome saya.'
    ]
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Drive, Calendar, dan Gmail',
    capabilities: [
      'Cari, baca, dan kelola file di Google Drive',
      'Lihat agenda dan buat jadwal',
      'Cari email dan bantu menulis balasan'
    ],
    detailRenderer: 'google-workspace',
    icon: 'google',
    statusProvider: 'google',
    developer: 'Mazees',
    examples: [
      'Ringkas email masuk terbaru dan tandai yang perlu aku tindak lanjuti.',
      'Cari dokumen proyek di Google Drive dan rangkum isinya.',
      'Lihat agenda besok dan bantu cari waktu yang kosong.'
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Hubungkan bot dan pantau percakapan Telegram',
    capabilities: [
      'Menerima permintaan melalui bot Telegram',
      'Mengirim balasan dan notifikasi',
      'Melihat log pesan bot'
    ],
    detailRenderer: 'telegram',
    icon: 'telegram',
    statusProvider: 'telegram',
    developer: 'MARK',
    logRoute: '/telegram-bot',
    examples: [
      'Bantu hubungkan bot Telegram saya ke Mark.',
      'Periksa apakah bot Telegram sudah terhubung.',
      'Tampilkan log percakapan bot Telegram.'
    ]
  }
]

export const getAddon = (id) => ADDONS.find((addon) => addon.id === id) || null
