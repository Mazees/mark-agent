/**
 * Metadata for built-in MARK add-ons. Keep this file free of React and secrets so
 * both the UI and planning prompt can use the same catalog.
 */
export const ADDONS = [
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
    developer: 'Mazees'
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
    logRoute: '/telegram-bot'
  }
]

export const getAddon = (id) => ADDONS.find((addon) => addon.id === id) || null
