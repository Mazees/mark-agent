// Web Speech API (Microsoft Edge Native STT in Tauri v2 / WebView2)

let currentRecognition = null
let isListening = false
let isStarting = false

export const DEFAULT_LANGUAGE = 'id-ID'

export function isWebSpeechSupported() {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

function getSpeechRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export async function startWebSpeechRecognition({
  onResult,
  onInterim,
  onError,
  onEnd,
  continuous = false,
  lang = 'id-ID'
} = {}) {
  if (!isWebSpeechSupported()) {
    if (onError) onError(new Error('Web Speech API tidak didukung di browser ini.'))
    return false
  }

  if (isStarting) {
    return false
  }
  isStarting = true

  // Hentikan instance aktif sebelumnya dan beri jeda untuk Windows Audio Session
  if (currentRecognition) {
    stopWebSpeechRecognition()
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  const SpeechClass = getSpeechRecognitionClass()
  try {
    const instance = new SpeechClass()
    instance.lang = lang || DEFAULT_LANGUAGE
    instance.continuous = continuous
    instance.interimResults = true
    instance.maxAlternatives = 1

    currentRecognition = instance

    instance.onresult = (event) => {
      if (currentRecognition !== instance) return

      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i]
        const transcript = item[0]?.transcript || ''
        if (item.isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      if (interimTranscript && onInterim) {
        onInterim(interimTranscript)
      }

      if (finalTranscript && onResult) {
        onResult(finalTranscript)
      }
    }

    instance.onerror = (event) => {
      if (currentRecognition !== instance) return

      if (event.error === 'no-speech' || event.error === 'aborted') {
        return
      }
      console.warn('[WebSpeech] Recognition error:', event.error)
      if (onError) {
        onError(new Error(event.error || 'Speech recognition error'))
      }
    }

    instance.onend = () => {
      if (currentRecognition === instance) {
        currentRecognition = null
        isListening = false
      }
      if (onEnd) {
        onEnd()
      }
    }

    // Coba start dengan proteksi retry jika Windows Audio masih melepaskan session sebelumnya
    try {
      instance.start()
    } catch (startErr) {
      if (startErr.name === 'InvalidStateError') {
        await new Promise((resolve) => setTimeout(resolve, 200))
        instance.start()
      } else {
        throw startErr
      }
    }

    isListening = true
    return true
  } catch (err) {
    console.warn('[WebSpeech] Start catch:', err.message || err)
    if (currentRecognition) {
      currentRecognition = null
    }
    isListening = false
    if (onError) onError(err)
    return false
  } finally {
    isStarting = false
  }
}

export function stopWebSpeechRecognition() {
  if (currentRecognition) {
    try {
      const target = currentRecognition
      currentRecognition = null
      target.onresult = null
      target.onerror = null
      target.onend = null
      target.abort()
    } catch (_) {}
  }
  isListening = false
  isStarting = false
}

export function abortWebSpeechRecognition() {
  stopWebSpeechRecognition()
}

export function isWebSpeechListening() {
  return isListening
}
