// Web Speech API (Microsoft Edge / Chrome Native STT)

export const DEFAULT_LANGUAGE = 'id-ID'

let currentRecognition = null
let currentSessionId = 0
let isListening = false
let isStarting = false

/**
 * Memeriksa apakah browser / Webview mendukung Web Speech API
 */
export function isWebSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  )
}

/**
 * Mengambil constructor SpeechRecognition yang tersedia
 */
export function getSpeechRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/**
 * Memulai pengenalan suara menggunakan Web Speech API
 * @param {Object} options
 * @param {Function} options.onStart - Callback saat perekaman benar-benar aktif
 * @param {Function} options.onResult - Callback saat hasil final diterima (transcript: string)
 * @param {Function} options.onInterim - Callback saat hasil sementara (interim) diterima (transcript: string)
 * @param {Function} options.onError - Callback saat error (error: Error)
 * @param {Function} options.onEnd - Callback saat sesi rekognisi selesai
 * @param {boolean} options.continuous - Mode perekaman kontinu (default: false)
 * @param {string} options.lang - Bahasa rekognisi (default: 'id-ID')
 */
export async function startWebSpeechRecognition({
  onStart,
  onResult,
  onInterim,
  onError,
  onEnd,
  continuous = false,
  lang = DEFAULT_LANGUAGE
} = {}) {
  const SpeechRec = getSpeechRecognitionClass()
  if (!SpeechRec) {
    const err = new Error('Web Speech API tidak didukung di browser ini.')
    if (onError) onError(err)
    return null
  }

  if (isStarting) return currentRecognition

  // Hentikan instance sebelumnya jika ada
  if (currentRecognition) {
    stopWebSpeechRecognition()
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  isStarting = true
  const sessionId = ++currentSessionId

  try {
    const recognition = new SpeechRec()
    recognition.lang = lang || DEFAULT_LANGUAGE
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (sessionId !== currentSessionId) return
      isListening = true
      if (onStart) onStart()
    }

    recognition.onresult = (event) => {
      if (sessionId !== currentSessionId) return
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i]
        const transcriptPart = item[0]?.transcript || ''
        if (item.isFinal) {
          finalTranscript += transcriptPart
        } else {
          interimTranscript += transcriptPart
        }
      }

      if (interimTranscript && onInterim) {
        onInterim(interimTranscript.trim())
      }
      if (finalTranscript && onResult) {
        onResult(finalTranscript.trim())
      }
    }

    recognition.onerror = (event) => {
      if (sessionId !== currentSessionId) return
      // Abaikan error umum seperti 'no-speech' atau 'aborted'
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return
      }
      console.error('[WebSpeech] Recognition Error:', event.error)
      if (onError) onError(new Error(event.error))
    }

    recognition.onend = () => {
      if (sessionId !== currentSessionId) return
      isListening = false
      if (currentRecognition === recognition) {
        currentRecognition = null
      }
      if (onEnd) onEnd()
    }

    currentRecognition = recognition
    isListening = true

    try {
      recognition.start()
    } catch (startErr) {
      if (startErr.name === 'InvalidStateError') {
        await new Promise((resolve) => setTimeout(resolve, 150))
        if (sessionId === currentSessionId) {
          recognition.start()
        }
      } else {
        throw startErr
      }
    }

    return recognition
  } catch (err) {
    if (sessionId === currentSessionId) {
      isListening = false
      currentRecognition = null
      if (onError) onError(err)
    }
    return null
  } finally {
    isStarting = false
  }
}

/**
 * Menghentikan pengenalan suara secara bersih
 * @param {boolean} [triggerOnEnd=false] Jika true, callback onend tetap dijalankan
 */
export function stopWebSpeechRecognition() {
  if (currentRecognition) {
    try {
      const rec = currentRecognition
      currentRecognition = null
      rec.abort()
    } catch (_) {}
  }
  isListening = false
  isStarting = false
}

/**
 * Membatalkan sesi pengenalan suara yang sedang berjalan
 */
export function abortWebSpeechRecognition() {
  stopWebSpeechRecognition()
}

/**
 * Mengecek status aktif pengenalan suara
 */
export function isWebSpeechListening() {
  return isListening
}
