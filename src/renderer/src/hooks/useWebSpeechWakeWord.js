import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Hook untuk Passive Wake Word Detection menggunakan Web Speech API bawaan Microsoft Edge / Chromium.
 * Berjalan secara native dengan 0 MB RAM overhead model dan konsumsi CPU minimal.
 *
 * @param {object} params
 * @param {boolean} [params.enabled=true] Status aktif
 * @param {string} [params.wakeWord='mark'] Kata kunci pemicu
 * @param {Function} params.onWakeWord Callback saat kata kunci terdeteksi
 */
export function useWebSpeechWakeWord({
  enabled = true,
  wakeWord = 'mark',
  onWakeWord
}) {
  const [isListening, setIsListening] = useState(false)
  const [lastDetected, setLastDetected] = useState(null)
  const recognitionRef = useRef(null)
  const isEnabledRef = useRef(enabled)
  const restartTimeoutRef = useRef(null)

  isEnabledRef.current = enabled

  const startRecognition = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('[WakeWord] Web Speech API tidak didukung di browser ini.')
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch (_) {}
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'id-ID'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        console.log('[WakeWord] Mendengarkan wake word native (id-ID)...')
      }

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0]?.transcript?.trim().toLowerCase() || ''
          if (!transcript) continue

          const target = wakeWord.toLowerCase()
          const regex = new RegExp(`\\b(${target}|mak|makh|marg|mart|marck|marc)\\b`, 'i')

          if (regex.test(transcript)) {
            console.log(`[WakeWord] Kata kunci terdeteksi: "${transcript}"`)
            setLastDetected(Date.now())
            if (onWakeWord) {
              onWakeWord(transcript)
            }
          }
        }
      }

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('[WakeWord] Recognition error:', event.error)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
        // Auto-restart jika masih aktif (agar tetap mendengarkan secara kontinu)
        if (isEnabledRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
          restartTimeoutRef.current = setTimeout(() => {
            if (isEnabledRef.current) {
              startRecognition()
            }
          }, 300)
        }
      }

      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error('[WakeWord] Gagal memulai recognition:', err.message)
    }
  }, [wakeWord, onWakeWord])

  useEffect(() => {
    if (enabled) {
      startRecognition()
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (_) {}
      }
      setIsListening(false)
    }

    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (_) {}
      }
    }
  }, [enabled, startRecognition])

  return {
    isListening,
    lastDetected
  }
}
