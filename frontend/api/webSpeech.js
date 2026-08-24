// Web Speech API (Microsoft Edge Native STT in Tauri v2)

let recognition = null
let isListening = false
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

export function startWebSpeechRecognition({
  onResult,
  onInterim,
  onError,
  onEnd,
  lang = 'id-ID'
} = {}) {
  if (!isWebSpeechSupported()) {
    if (onError) onError(new Error('Web Speech API tidak didukung di browser ini.'))
    return false
  }

  stopWebSpeechRecognition()

  const SpeechClass = getSpeechRecognitionClass()
  try {
    recognition = new SpeechClass()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    activeCallbacks = { onResult, onInterim, onError, onEnd }
    isListening = true

    recognition.onresult = (event) => {
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

    recognition.onerror = (event) => {
      console.warn('[WebSpeech] Recognition error:', event.error)
      if (activeCallbacks.onError) {
        activeCallbacks.onError(new Error(event.error || 'Speech recognition error'))
      }
    }

    recognition.onend = () => {
      isListening = false
      if (activeCallbacks.onEnd) {
        activeCallbacks.onEnd()
      }
    }

    recognition.start()
    return true
  } catch (err) {
    console.error('[WebSpeech] Failed to start recognition:', err)
    isListening = false
    if (onError) onError(err)
    return false
  }
}

export function stopWebSpeechRecognition() {
  if (recognition) {
    try {
      recognition.stop()
    } catch (_) {}
    recognition = null
  }
  isListening = false
}

export function abortWebSpeechRecognition() {
  if (recognition) {
    try {
      recognition.abort()
    } catch (_) {}
    recognition = null
  }
  isListening = false
}

export function isWebSpeechListening() {
  return isListening
}
