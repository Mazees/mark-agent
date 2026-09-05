// Wake Word Engine Pattern Matcher & Command Extractor
// Mendukung pola default "Hey Mark", "Halo Mark", "Mark" serta kata pemicu kustom pengguna

// Pola kata Mark dan variasinya dalam pengenalan suara bahasa Indonesia Edge STT
const DEFAULT_MARK_NAMES = '(?:mark|marc|mak|mart|marg|makh|smart|marck)'
const GREETINGS = '(?:hey|hei|halo|hello|helo|hai|hi|woi|oi|bro)'

/**
 * Membuat Regex matcher dinamis dari kata pemicu default + custom wake words
 */
export function getWakeWordRegex(customWakeWords = '') {
  const parts = [DEFAULT_MARK_NAMES]

  if (customWakeWords) {
    const rawList = Array.isArray(customWakeWords)
      ? customWakeWords
      : String(customWakeWords).split(/[,|\n]+/)

    for (const item of rawList) {
      const clean = item.trim()
      if (clean) {
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        parts.push(escaped)
      }
    }
  }

  const combinedNames = `(?:${parts.join('|')})`
  return new RegExp(`(?:\\b${GREETINGS}[,\\s]+)?\\b${combinedNames}\\b`, 'i')
}

/**
 * Mendeteksi keberadaan wake word dalam teks transkrip dan memisahkan perintah
 */
export function detectWakeWord(transcript, customWakeWords = '') {
  if (!transcript || typeof transcript !== 'string') {
    return { detected: false, command: '', wakePhrase: '' }
  }

  const regex = getWakeWordRegex(customWakeWords)
  const match = transcript.match(regex)

  if (!match) {
    return { detected: false, command: '', wakePhrase: '' }
  }

  const wakePhrase = match[0]
  const matchIndex = match.index
  const matchLength = match[0].length

  // Ambil teks setelah kata pemicu (jika user langsung mengucapkan perintah dalam 1 tarikan napas)
  const afterWakeText = transcript.substring(matchIndex + matchLength).trim()

  // Bersihkan tanda baca awal seperti koma, titik dua, tanda hubung
  const cleanCommand = cleanSpokenCommand(afterWakeText, customWakeWords)

  return {
    detected: true,
    wakePhrase,
    command: cleanCommand
  }
}

/**
 * Membersihkan awalan sapaan / nama pemicu dari perintah yang diucapkan
 */
export function cleanSpokenCommand(text, customWakeWords = '') {
  if (!text || typeof text !== 'string') return ''

  const parts = [DEFAULT_MARK_NAMES]

  if (customWakeWords) {
    const rawList = Array.isArray(customWakeWords)
      ? customWakeWords
      : String(customWakeWords).split(/[,|\n]+/)

    for (const item of rawList) {
      const clean = item.trim()
      if (clean) {
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        parts.push(escaped)
      }
    }
  }

  const combinedNames = `(?:${parts.join('|')})`
  const prefixRegex = new RegExp(`^\\s*(?:${GREETINGS}[,\\s]+)?${combinedNames}\\b`, 'gi')

  let stripped = text
    .replace(/^[,.:;!\-–—\s]+/, '')
    .replace(prefixRegex, '')
    .replace(/^[,.:;!\-–—\s]+/, '')
    .trim()

  // Jika setelah dibersihkan hanya berisi tanda baca atau simbol tanpa huruf/angka, kosongkan
  if (/^[^a-zA-Z0-9]+$/.test(stripped)) {
    return ''
  }

  return stripped
}
