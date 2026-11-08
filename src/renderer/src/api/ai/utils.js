export const getCurrentTimeInfo = (dateObj = new Date()) => {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
  return dateObj.toLocaleDateString('id-ID', options)
}

export { cleanTextForTTS, speechQueue, playVoice } from './speech.js'

// ==========================================
// TELEGRAM UTILS
// ==========================================
export const formatForTelegram = (text) => {
  if (!text) return ''
  return text.trim()
}

export const broadcastPersonalMessageToTelegram = async (text) => {
  const message = formatForTelegram(text)
  if (!message) return

  try {
    const result = await window.api?.tgBroadcastToAdmins?.(`*Mark (PC)*:\n${message}`)
    if (result?.success === false) throw new Error(result.error)
  } catch (error) {
    console.warn('[Telegram] Pesan Personal belum dapat diteruskan:', error.message)
  }
}

// ==========================================
// PLANNING (AGENTIC) FUNCTIONS
// ==========================================
