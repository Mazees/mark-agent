import { useState, useRef, useEffect, useCallback } from 'react'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported
} from '../api/webSpeech'
import { getAllConfig } from '../api/db'

export const useVAD = ({
  onTranscript // Function to call when speech recognition finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isProcessingSpeechRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const stopVADCleanup = useCallback(() => {
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
    setIsRecording(false)
    isStartingRef.current = false
    setIsProcessing(false)
    setAudioIntensity(0)
    setToastMessage('')
  }, [])

  const restartRecognition = useCallback(() => {
    if (!isRecordingRef.current) return
    if (window.isMarkSpeaking || isProcessingSpeechRef.current) return

    if (isWebSpeechSupported()) {
      startWebSpeechRecognition({
        lang: 'id-ID',
        continuous: false,
        onInterim: (interim) => {
          if (interim && interim.trim()) {
            setToastMessage(`Mendengarkan: "${interim}"`)
          }
        },
        onResult: (finalText) => {
          if (finalText && finalText.trim()) {
            // Bersihkan panggilan nama Mark di awal kalimat
            const stripped = finalText.replace(
              /^\s*(?:hey|hei|halo|hello|helo|hai|hi|woi|oi|bro)?\s*(?:mbak|mak|makh|marg|mart|marck|marc|mac|mag|mark|smart)\b/gi,
              ''
            ).replace(/^[,:\-–—\s]+/, '').trim()

            // Jika user hanya mengucapkan "Mark" / "Halo Mark" tanpa perintah lanjutan, jangan matikan mic dan jangan kirim prompt kosong
            if (!stripped || stripped.length < 2) {
              console.log('[VAD] Ignored solo wake word in interactive mic:', finalText)
              return
            }

            const cleanText = finalText.replace(
              /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
              'Mark'
            )

            // Matikan mikrofon interaktif seketika setelah kalimat perintah valid selesai terucap
            stopVADCleanup()

            if (onTranscriptRef.current) {
              onTranscriptRef.current(cleanText.trim())
            }
          }
        },
        onError: (err) => {
          if (err.message !== 'no-speech' && err.message !== 'aborted') {
            console.warn('[VAD] Web Speech error:', err.message)
          }
        },
        onEnd: () => {
          // Jika recognition mati secara alami oleh timeout Edge, restart jika user masih dalam mode record
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
    }
  }, [stopVADCleanup])

  const startVADRecording = useCallback(async () => {
    if (isStartingRef.current || isRecordingRef.current) return
    isStartingRef.current = true

    try {
      stopVADCleanup()
      isStartingRef.current = true

      const config = await getAllConfig()
      const micId = config[0]?.micDeviceId
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

      // Mulai recognition
      restartRecognition()

      isStartingRef.current = false
    } catch (error) {
      console.error('[VAD] Error starting mic:', error)
      stopVADCleanup()
      setToastMessage('Gagal mengakses mikrofon.')
      setTimeout(() => setToastMessage(''), 5000)
    }
  }, [stopVADCleanup, restartRecognition])

  useEffect(() => {
    window.isVADRecording = isRecording
  }, [isRecording])

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopVADCleanup()
    } else {
      startVADRecording()
    }
  }, [stopVADCleanup, startVADRecording])

  useEffect(() => {
    return () => stopVADCleanup()
  }, [stopVADCleanup])

  return {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording: startVADRecording,
    stopRecording: stopVADCleanup,
    toastMessage
  }
}
