// Web Speech API (Microsoft Edge Native STT in Tauri v2 / WebView2)

let recognition = null
let isListening = false
let isStarting = false
let activeCallbacks = {
  onResult: null,
  onInterim: null,
  onError: null,
  onEnd: null
}

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

  if (isStarting) return false
  isStarting = true

  // Jika sudah ada recognition aktif, hentikan dulu dan beri jeda untuk Windows Audio Session
  if (recognition) {
    stopWebSpeechRecognition()
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  const SpeechClass = getSpeechRecognitionClass()
  try {
    const instance = new SpeechClass()
    instance.lang = lang
    instance.continuous = continuous
    instance.interimResults = true
    instance.maxAlternatives = 1

    activeCallbacks = { onResult, onInterim, onError, onEnd }
    recognition = instance

    instance.onresult = (event) => {
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

      if (interimTranscript && activeCallbacks.onInterim) {
        activeCallbacks.onInterim(interimTranscript)
      }

      if (finalTranscript && activeCallbacks.onResult) {
        activeCallbacks.onResult(finalTranscript)
      }
    }

    instance.onerror = (event) => {
      // Abaikan error normal saat hening (no-speech) atau saat sengaja di-abort
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return
      }
      console.warn('[WebSpeech] Recognition error:', event.error)
      if (activeCallbacks.onError) {
        activeCallbacks.onError(new Error(event.error || 'Speech recognition error'))
      }
    }

    instance.onend = () => {
      if (recognition === instance) {
        recognition = null
        isListening = false
      }
      if (activeCallbacks.onEnd) {
        activeCallbacks.onEnd()
      }
    }

    instance.start()
    isListening = true
    isStarting = false
    return true
  } catch (err) {
    // Tangani WindowsError (0x8007139F - Invalid State) secara aman
    if (err.name !== 'InvalidStateError') {
      console.warn('[WebSpeech] Safe catch on start recognition:', err.message || err)
    }
    recognition = null
    isListening = false
    isStarting = false
    if (onError) onError(err)
    return false
  }
}

export function stopWebSpeechRecognition() {
  if (recognition) {
    try {
      const target = recognition
      recognition = null
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
