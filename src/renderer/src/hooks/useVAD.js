import { useState, useRef, useEffect, useCallback } from 'react'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported
} from '../api/webSpeech'
import { detectWakeWord, cleanSpokenCommand } from '../api/wakeWord'
import { getAllConfig } from '../api/db'

/**
 * Memainkan suara beep/chime konfirmasi sci-fi lembut ("tutt-ting")
 * menggunakan Web Audio API murni tanpa load aset eksternal.
 */
let sharedAudioContext = null

export async function playWakeChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx()
    }
    if (sharedAudioContext.state === 'suspended') {
      await sharedAudioContext.resume()
    }

    const ctx = sharedAudioContext
    const now = ctx.currentTime

    // Tone 1 (587.33 Hz - D5)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.12)

    // Tone 2 (880.00 Hz - A5, lebih tinggi dan manis)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880.0, now + 0.08)
    gain2.gain.setValueAtTime(0, now + 0.08)
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.26)
  } catch (_) {}
}

export const useVAD = ({
  onTranscript // Function to call when STT finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const isRecordingRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isWakeListeningRef = useRef(false)
  const wakeRecognitionRef = useRef(null)
  const manualRecognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const currentConfigRef = useRef({})
  const onTranscriptRef = useRef(onTranscript)

  // Real-time Web Audio Analyser references
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  // Muat konfigurasi terbaru
  const refreshConfig = async () => {
    try {
      const data = await getAllConfig()
      if (data && data.length > 0) {
        currentConfigRef.current = data[0] || {}
      }
    } catch (_) {}
  }

  useEffect(() => {
    refreshConfig()

    const handleConfigUpdated = (e) => {
      if (e?.detail) {
        currentConfigRef.current = { ...currentConfigRef.current, ...e.detail }
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)
    return () => window.removeEventListener('config-updated', handleConfigUpdated)
  }, [])

  /**
   * Menghentikan audio visualizer stream & context
   */
  const stopAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (_) {}
      audioContextRef.current = null
    }
    setAudioIntensity(0)
  }, [])

  /**
   * Memulai audio visualizer stream menggunakan Web Audio API AnalyserNode
   */
  const startAudioAnalyser = useCallback(async () => {
    try {
      stopAudioAnalyser()

      const micId = currentConfigRef.current?.micDeviceId
      const constraints = {
        audio:
          micId && micId !== 'default'
            ? {
                deviceId: { exact: micId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (!isRecordingRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      mediaStreamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.4
      analyserRef.current = analyser

      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateIntensity = () => {
        if (!isRecordingRef.current || !analyserRef.current) {
          setAudioIntensity(0)
          return
        }

        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength
        // Normalisasi 0 - 255 menjadi 0.0 - 1.0 dengan kurva sensitif untuk percakapan
        const normalized = Math.min(1, Math.max(0, (avg - 8) / 60))
        setAudioIntensity(normalized)

        animFrameRef.current = requestAnimationFrame(updateIntensity)
      }

      updateIntensity()
    } catch (err) {
      console.warn('[VAD] Audio visualizer analyser failed:', err.message)
      // Fallback tetap memberi sedikit visual bernafas jika mic analyser terblokir
      setAudioIntensity(0.3)
    }
  }, [stopAudioAnalyser])

  /**
   * Menghentikan rekognisi manual secara bersih
   */
  const stopManualRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    isRecordingRef.current = false
    setIsRecording(false)
    stopAudioAnalyser()
    stopWebSpeechRecognition()
    manualRecognitionRef.current = null
  }, [stopAudioAnalyser])

  /**
   * Memulai perekaman manual suara (Push-to-Talk / Klik Tombol Mic / Shortcut)
   */
  const startManualRecording = useCallback(async () => {
    if (!isWebSpeechSupported()) {
      setToastMessage('Web Speech API tidak didukung di browser ini.')
      setTimeout(() => setToastMessage(''), 4000)
      return
    }

    // Jika wake word background listener sedang aktif, stop sementara
    if (wakeRecognitionRef.current || isWakeListeningRef.current) {
      stopWebSpeechRecognition()
      wakeRecognitionRef.current = null
      isWakeListeningRef.current = false
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    await refreshConfig()
    const lang = currentConfigRef.current?.speechLanguage || 'id-ID'
    const customWakeWords = currentConfigRef.current?.customWakeWords || ''

    isRecordingRef.current = true
    setIsRecording(true)
    setIsProcessing(false)

    // Bunyikan chime feedback setiap mic manual mulai aktif
    playWakeChime()

    // Aktifkan visualizer amplitude mic seketika
    startAudioAnalyser()

    let accumulatedFinal = ''
    let latestInterim = ''

    // Buffer jeda hening (1800ms) sebelum rekaman otomatis diselesaikan
    const resetSilenceTimeout = (delayMs = 1800) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
      }
      silenceTimerRef.current = setTimeout(() => {
        if (!isRecordingRef.current) return
        const textToProcess = (accumulatedFinal || latestInterim || '').trim()
        if (textToProcess) {
          stopManualRecording()
          const cleanText = cleanSpokenCommand(textToProcess, customWakeWords)
          const textToSend = cleanText || textToProcess
          if (textToSend) {
            onTranscriptRef.current(textToSend, { isWakeWord: false, wakePhrase: null })
          }
        }
      }, delayMs)
    }

    // Pasang timeout awal (8 detik) jika pengguna belum mulai berbicara
    resetSilenceTimeout(8000)

    const rec = await startWebSpeechRecognition({
      lang,
      continuous: true,
      onInterim: (interim) => {
        if (!isRecordingRef.current) return
        latestInterim = interim
        // Reset jeda hening saat pengguna sedang berbicara
        resetSilenceTimeout(1800)
      },
      onResult: (finalText) => {
        if (!isRecordingRef.current) return
        if (finalText && finalText.trim()) {
          accumulatedFinal = finalText.trim()
          latestInterim = ''
          // Reset jeda hening setelah potongan kalimat selesai
          resetSilenceTimeout(1800)
        }
      },
      onError: (err) => {
        console.warn('[VAD] Speech recognition error:', err.message)
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        stopManualRecording()
      },
      onEnd: () => {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        if (isRecordingRef.current) {
          stopManualRecording()
          const textToProcess = (accumulatedFinal || latestInterim || '').trim()
          if (textToProcess) {
            const cleanText = cleanSpokenCommand(textToProcess, customWakeWords)
            const textToSend = cleanText || textToProcess
            if (textToSend) {
              onTranscriptRef.current(textToSend, { isWakeWord: false, wakePhrase: null })
            }
          }
        }
      }
    })

    manualRecognitionRef.current = rec
  }, [startAudioAnalyser, stopManualRecording])

  /**
   * Toggle manual voice recording
   */
  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopManualRecording()
    } else {
      startManualRecording()
    }
  }, [startManualRecording, stopManualRecording])

  /**
   * Background Wake Word Listener Watchdog Loop
   * Berjalan terus-menerus selama component mounted.
   * Secara otomatis mengaktifkan kembali wake word recognition setelah manual mic selesai,
   * setelah Mark selesai berbicara TTS, atau setelah recognition session terputus/cycling.
   */
  useEffect(() => {
    let isMounted = true
    let isStartingWake = false

    const checkAndEnsureWakeListener = async () => {
      if (!isMounted || isStartingWake) return

      await refreshConfig()
      const wakeEnabled = currentConfigRef.current?.wakeWordEnabled !== false

      // Jangan jalankan jika: fitur dimatikan, sedang manual recording, Mark sedang bicara TTS, atau tidak didukung
      if (!wakeEnabled || isRecordingRef.current || window.isMarkSpeaking || !isWebSpeechSupported()) {
        if (isWakeListeningRef.current) {
          console.log('[WakeWord] ⏸️ Menjeda deteksi wake word latar belakang...')
          isWakeListeningRef.current = false
          stopWebSpeechRecognition()
          wakeRecognitionRef.current = null
        }
        return
      }

      // Jika sudah mendengarkan dengan baik, biarkan
      if (isWakeListeningRef.current) return

      isStartingWake = true
      isWakeListeningRef.current = true

      const lang = currentConfigRef.current?.speechLanguage || 'id-ID'
      const customWakeWords = currentConfigRef.current?.customWakeWords || ''

      console.log('[WakeWord] 🎙️ Standby mendengarkan kata pemicu ("Hey Mark" / "Mark")...', { lang, customWakeWords })

      try {
        const rec = await startWebSpeechRecognition({
          lang,
          continuous: true,
          onInterim: (interim) => {
            if (!interim || window.isMarkSpeaking || isRecordingRef.current) return
            console.log('[WakeWord] Hearing (interim):', interim)
            const check = detectWakeWord(interim, customWakeWords)
            if (check.detected) {
              console.log('[WakeWord] ⚡ Wake word terdeteksi pada interim!', check)
              if (check.command) {
                stopWebSpeechRecognition()
                isWakeListeningRef.current = false
                playWakeChime()
                console.log('[WakeWord] 🚀 Menjalankan perintah suara langsung:', check.command)
                onTranscriptRef.current(check.command, {
                  isWakeWord: true,
                  wakePhrase: check.wakePhrase || 'Mark'
                })
              }
            }
          },
          onResult: (finalText) => {
            if (!finalText || window.isMarkSpeaking || isRecordingRef.current) return
            console.log('[WakeWord] Heard (final):', finalText)
            const check = detectWakeWord(finalText, customWakeWords)
            if (check.detected) {
              console.log('[WakeWord] ⚡ Wake word terdeteksi pada final text!', check)
              stopWebSpeechRecognition()
              isWakeListeningRef.current = false
              playWakeChime()
              if (check.command) {
                console.log('[WakeWord] 🚀 Menjalankan perintah suara langsung:', check.command)
                onTranscriptRef.current(check.command, {
                  isWakeWord: true,
                  wakePhrase: check.wakePhrase || 'Mark'
                })
              } else {
                console.log('[WakeWord] 🔔 Nama dipanggil tanpa perintah, otomatis menyalakan mic manual...')
                startManualRecording()
              }
            }
          },
          onError: (err) => {
            console.warn('[WakeWord] Session warning:', err?.message || err)
            isWakeListeningRef.current = false
          },
          onEnd: () => {
            isWakeListeningRef.current = false
            wakeRecognitionRef.current = null
          }
        })
        wakeRecognitionRef.current = rec
      } catch (err) {
        console.warn('[WakeWord] Gagal mengaktifkan session:', err?.message || err)
        isWakeListeningRef.current = false
        wakeRecognitionRef.current = null
      } finally {
        isStartingWake = false
      }
    }

    // Polling Watchdog: memeriksa kondisi setiap 600ms
    const watchdogInterval = setInterval(() => {
      checkAndEnsureWakeListener()
    }, 600)

    // Panggil langsung pada start
    checkAndEnsureWakeListener()

    return () => {
      isMounted = false
      clearInterval(watchdogInterval)
      if (wakeRecognitionRef.current || isWakeListeningRef.current) {
        console.log('[WakeWord] Mematikan background listener on unmount...')
        isWakeListeningRef.current = false
        stopWebSpeechRecognition()
        wakeRecognitionRef.current = null
      }
    }
  }, [startManualRecording])

  useEffect(() => {
    window.isVADRecording = isRecording
  }, [isRecording])

  useEffect(() => {
    return () => {
      stopAudioAnalyser()
    }
  }, [stopAudioAnalyser])

  return {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording: startManualRecording,
    stopRecording: stopManualRecording,
    toastMessage
  }
}
