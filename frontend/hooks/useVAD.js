import { useState, useRef, useEffect, useCallback } from 'react'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported,
  DEFAULT_LANGUAGE
} from '../api/webSpeech'
import { getAllConfig } from '../api/db'

export const useVAD = ({
  onTranscript // Function to call when speech recognition finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [sttLang, setSttLang] = useState(DEFAULT_LANGUAGE)

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isProcessingSpeechRef = useRef(false)
  const lastTranscriptRef = useRef('')
  const silenceTimerRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const onTranscriptRef = useRef(onTranscript)
  const sttLangRef = useRef(sttLang)

  // Durasi jeda hening sebelum auto-submit (2.8 detik untuk jeda bicara alami yang nyaman)
  const POST_SPEECH_SILENCE_MS = 2800
  // Durasi inaktivitas jika belum ada suara sama sekali (12 detik)
  const INACTIVITY_TIMEOUT_MS = 12000

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    sttLangRef.current = sttLang
  }, [sttLang])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }, [])

  const stopVADCleanup = useCallback((shouldSubmitPending = false) => {
    clearTimers()

    const pendingText = lastTranscriptRef.current ? lastTranscriptRef.current.trim() : ''
    lastTranscriptRef.current = ''

    stopWebSpeechRecognition()

    if (processorRef.current) {
      try {
        processorRef.current.disconnect()
      } catch (_) {}
      processorRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (_) {}
      audioContextRef.current = null
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop())
      } catch (_) {}
      streamRef.current = null
    }

    isRecordingRef.current = false
    isProcessingSpeechRef.current = false
    window.isVADRecording = false
    setIsRecording(false)
    isStartingRef.current = false
    setIsProcessing(false)
    setAudioIntensity(0)

    if (shouldSubmitPending && pendingText && pendingText.length >= 1) {
      if (onTranscriptRef.current) {
        console.log('[VAD] Submitting spoken transcript:', pendingText)
        onTranscriptRef.current(pendingText)
      }
    }
  }, [clearTimers])

  const restartRecognition = useCallback(async () => {
    if (!isRecordingRef.current) return
    if (window.isMarkSpeaking || isProcessingSpeechRef.current) return

    if (isWebSpeechSupported()) {
      const ok = await startWebSpeechRecognition({
        lang: sttLangRef.current || DEFAULT_LANGUAGE,
        continuous: true,
        onInterim: (interim) => {
          if (!interim || !interim.trim()) return

          const clean = interim.trim()
          lastTranscriptRef.current = clean

          // Batalkan timer inaktivitas karena user sedang aktif berbicara
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current)
            inactivityTimerRef.current = null
          }

          // Reset silence timer: beri jeda 2.8 detik hening setelah user berhenti berbicara
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (isRecordingRef.current && lastTranscriptRef.current) {
              console.log('[VAD] Silence window reached (2.8s). Auto-submitting transcript...')
              stopVADCleanup(true)
            }
          }, POST_SPEECH_SILENCE_MS)
        },
        onResult: (finalText) => {
          if (!finalText || !finalText.trim()) return

          const clean = finalText.trim()
          lastTranscriptRef.current = clean

          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current)
            inactivityTimerRef.current = null
          }

          // Jangan langsung matikan mic saat jeda klausa, beri waktu jeda bicara 2.8 detik
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (isRecordingRef.current && lastTranscriptRef.current) {
              console.log('[VAD] Speech sentence finalized with silence. Submitting...')
              stopVADCleanup(true)
            }
          }, POST_SPEECH_SILENCE_MS)
        },
        onError: (err) => {
          if (err.message !== 'no-speech' && err.message !== 'aborted') {
            console.warn('[VAD] Web Speech error:', err.message)
          }
        },
        onEnd: () => {
          // Jika recognition selesai oleh OS timeout dan user masih dalam mode record, hidupkan kembali
          if (
            isRecordingRef.current &&
            !window.isMarkSpeaking &&
            !isProcessingSpeechRef.current
          ) {
            setTimeout(() => {
              if (
                isRecordingRef.current &&
                !window.isMarkSpeaking &&
                !isProcessingSpeechRef.current
              ) {
                restartRecognition()
              }
            }, 300)
          }
        }
      })

      if (!ok && isRecordingRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && !lastTranscriptRef.current) {
            stopVADCleanup(false)
          }
        }, 4000)
      }
    }
  }, [stopVADCleanup])

  const startVADRecording = useCallback(async () => {
    if (isStartingRef.current || isRecordingRef.current) return
    isStartingRef.current = true

    try {
      window.dispatchEvent(new CustomEvent('interactive-mic-starting'))
      stopVADCleanup(false)
      isStartingRef.current = true
      lastTranscriptRef.current = ''
      window.isVADRecording = true

      await new Promise((resolve) => setTimeout(resolve, 200))

      const config = await getAllConfig().catch(() => [])
      const micId = config[0]?.micDeviceId
      const configuredLang = config[0]?.sttLanguage || DEFAULT_LANGUAGE
      sttLangRef.current = configuredLang
      setSttLang(configuredLang)

      const audioSettings = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }

      const constraints = {
        audio:
          micId && micId !== 'default'
            ? { deviceId: { exact: micId }, ...audioSettings }
            : audioSettings
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0 // Mute output

      source.connect(processor)
      processor.connect(gainNode)
      gainNode.connect(audioContext.destination)

      isRecordingRef.current = true
      isProcessingSpeechRef.current = false
      setIsRecording(true)

      const RMS_THRESHOLD = 0.01
      processor.onaudioprocess = (e) => {
        if (window.isMarkSpeaking) {
          setAudioIntensity(0)
          return
        }

        const input = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)

        const normalized = Math.min(1, (rms - RMS_THRESHOLD) * 15)
        setAudioIntensity(Math.max(0, normalized))
      }

      // Mulai Inactivity Watchdog Timer: 12 detik jika tidak ada suara sama sekali, tutup mic otomatis
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current && !lastTranscriptRef.current) {
          console.log('[VAD] Inactivity timeout (no speech detected for 12s). Auto-closing mic...')
          stopVADCleanup(false)
        }
      }, INACTIVITY_TIMEOUT_MS)

      // Mulai recognition
      restartRecognition()

      isStartingRef.current = false
    } catch (error) {
      console.error('[VAD] Error starting mic:', error)
      stopVADCleanup(false)
    }
  }, [stopVADCleanup, restartRecognition])

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      // Jika user klik tombol mic atau shortcut untuk mematikan, kirim ucapan yang tertangkap
      stopVADCleanup(true)
    } else {
      startVADRecording()
    }
  }, [stopVADCleanup, startVADRecording])

  useEffect(() => {
    return () => stopVADCleanup(false)
  }, [stopVADCleanup])

  return {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording: startVADRecording,
    stopRecording: () => stopVADCleanup(true),
    sttLang,
    setSttLang
  }
}
