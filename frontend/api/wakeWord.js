// Wake Word Engine Pattern Matcher & Command Extractor

// Pola kata Mark dan variasinya dalam pengenalan suara bahasa Indonesia Edge STT
const MARK_NAMES = '(?:mark|marc|mbak|mak|mart|marg|makh|smart|marck)'
const GREETINGS = '(?:hey|hei|halo|hello|helo|hai|hi|woi|oi|bro)?'

export const WAKE_WORD_PRESETS = [
  {
    id: 'hey-mark',
    label: 'Hey Mark / Halo Mark / Mark (Rekomendasi)',
    pattern: new RegExp(`\\b${GREETINGS}\\s*${MARK_NAMES}\\b`, 'i')
  },
  {
    id: 'halo-mark',
    label: 'Halo Mark / Hey Mark',
    pattern: new RegExp(`\\b(?:halo|hello|helo|hey|hei|hai|hi)\\s*${MARK_NAMES}\\b`, 'i')
  },
  {
    id: 'mark-only',
    label: 'Mark (Hanya Nama)',
    pattern: new RegExp(`\\b${MARK_NAMES}\\b`, 'i')
  }
]

export function getWakeWordRegex(keywordSetting = 'hey-mark') {
  const preset = WAKE_WORD_PRESETS.find((p) => p.id === keywordSetting)
  if (preset) return preset.pattern

  // Jika kustom keyword
  if (keywordSetting && typeof keywordSetting === 'string' && keywordSetting.trim()) {
    const escaped = keywordSetting.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${GREETINGS}\\s*${escaped}\\b`, 'i')
  }

  return WAKE_WORD_PRESETS[0].pattern
}

export function detectWakeWord(transcript, keywordSetting = 'hey-mark') {
  if (!transcript || typeof transcript !== 'string') {
    return { detected: false, command: '', wakePhrase: '' }
  }

  const regex = getWakeWordRegex(keywordSetting)
  const match = transcript.match(regex)

  if (!match) {
    return { detected: false, command: '', wakePhrase: '' }
  }

  const wakePhrase = match[0]
  const matchIndex = match.index
  const matchLength = match[0].length

  // Ambil teks setelah kata pemicu (jika user langsung berbicara perintah dalam 1 tarikan nafas)
  const afterWakeText = transcript.substring(matchIndex + matchLength).trim()

  // Bersihkan tanda baca awal seperti koma, titik dua, tanda hubung
  const cleanCommand = afterWakeText.replace(/^[,:\-–—\s]+/, '').trim()

  return {
    detected: true,
    wakePhrase,
    command: cleanCommand
  }
}
