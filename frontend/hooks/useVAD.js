import { useState, useRef, useEffect } from 'react'
import { transcribeAudioLocal } from '../api/localWhisper'
import { transcribeAudioGroq } from '../api/groq'
import { getAllConfig } from '../api/db'

export const useVAD = ({
  onTranscript // Function to call when STT finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const audioChunksRef = useRef([])
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const silenceFramesRef = useRef(0)
  const isProcessingSpeechRef = useRef(false)

  const stopVADCleanup = () => {
    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)

    // Jika ada pending audio saat user menekan stop manual
    let pendingAudio = null
    if (totalLength >= 8000) {
      pendingAudio = new Float32Array(totalLength)
      let offset = 0
      for (let arr of audioChunksRef.current) {
        pendingAudio.set(arr, offset)
        offset += arr.length
      }
    }

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    isSpeakingRef.current = false
    audioChunksRef.current = []
    isRecordingRef.current = false
    setIsRecording(false)
    isStartingRef.current = false
    silenceFramesRef.current = 0
    isProcessingSpeechRef.current = false

    return pendingAudio
  }

  const finishSpeechAndTranscribe = () => {
    if (isProcessingSpeechRef.current) return
    isProcessingSpeechRef.current = true

    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
    if (totalLength < 8000) {
      stopVADCleanup()
      return
    }

    const merged = new Float32Array(totalLength)
    let offset = 0
    for (let arr of audioChunksRef.current) {
      merged.set(arr, offset)
      offset += arr.length
    }

    // Hapus pemotongan silence agresif. Whisper bisa menangani sedikit silence di akhir.
    // Menyimpan sedikit silence di akhir justru mencegah plosif terakhir terpotong.
    const trimmedAudio = merged

    stopVADCleanup()
    setIsProcessing(true)

    // Beri waktu 150ms agar React sempat me-render state (mis. mematikan lampu indikator)
    // sebelum thread diblokir oleh eksekusi ONNX WebAssembly
    setTimeout(async () => {
      try {
        const config = await getAllConfig()
        const sttEngine = config[0]?.localWhisperModel || 'whisper-small'
        let text = ''

        if (sttEngine === 'groq-whisper') {
          setToastMessage('Mentranskrip via Groq API...')
          text = await transcribeAudioGroq(trimmedAudio)
          setToastMessage('')
        } else {
          text = await transcribeAudioLocal(trimmedAudio, (progressData) => {
            if (progressData && progressData.progress !== undefined) {
              setToastMessage(`Mengunduh model AI Suara... ${Math.round(progressData.progress)}%`)
              if (progressData.progress >= 100) {
                setTimeout(() => setToastMessage(''), 2000)
              }
            }
          })
        }

        setIsProcessing(false)
        if (text && text.trim() !== '') {
          const cleanText = text.replace(
            /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
            'Mark'
          )
          onTranscript(cleanText.trim())
        }
      } catch (err) {
        setIsProcessing(false)
        console.error('[VAD] STT Error:', err)
        setToastMessage(`Gagal memproses STT: ${err.message}`)
        setTimeout(() => setToastMessage(''), 5000)
      }
    }, 150)
  }

  const startVADRecording = async () => {
    if (isStartingRef.current || isRecordingRef.current) return
    isStartingRef.current = true

    let isActive = true
    const currentStopVAD = stopVADCleanup

    try {
      stopVADCleanup()
      isStartingRef.current = true

      const config = await getAllConfig()
      if (!isActive || !isStartingRef.current) return

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
      if (!isActive || !isStartingRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0 // Mute output

      source.connect(processor)
      processor.connect(gainNode)
      gainNode.connect(audioContext.destination)

      isRecordingRef.current = true
      setIsRecording(true)
      silenceFramesRef.current = 0

      // Each buffer is 4096 samples at 16000Hz = 0.256s (256ms)
      // 8 frames silence = ~2.0s silence (memberi waktu jeda nafas/berpikir sedikit)
      const MAX_SILENCE_FRAMES = 8
      const RMS_THRESHOLD = 0.01 // Diturunkan agar suara pelan/ujung kata tidak dianggap silence

      processor.onaudioprocess = (e) => {
        if (window.isMarkSpeaking || isProcessingSpeechRef.current) return

        const input = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)

        // Normalisasi RMS untuk visualisasi (RMS biasanya berkisar antara 0.01 - 0.15)
        const normalized = Math.min(1, (rms - RMS_THRESHOLD) * 15)
        setAudioIntensity(Math.max(0, normalized))

        if (rms > RMS_THRESHOLD) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true
            audioChunksRef.current = []
          }
          silenceFramesRef.current = 0
          audioChunksRef.current.push(new Float32Array(input))
        } else if (isSpeakingRef.current) {
          // Push low audio chunk so end of word isn't clipped
          audioChunksRef.current.push(new Float32Array(input))
          silenceFramesRef.current += 1

          // Total recording length check (hard max 15 seconds)
          const totalSamples = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
          if (silenceFramesRef.current >= MAX_SILENCE_FRAMES || totalSamples >= 240000) {
            finishSpeechAndTranscribe()
          }
        }
      }
      isStartingRef.current = false
    } catch (error) {
      console.error('[VAD] Error starting mic:', error)
      currentStopVAD()
      setToastMessage('Gagal mengakses mikrofon.')
      setTimeout(() => setToastMessage(''), 5000)
    }
  }

  useEffect(() => {
    window.isVADRecording = isRecording
  }, [isRecording])

  const toggleRecording = () => {
    if (isRecordingRef.current) {
      const pendingAudio = stopVADCleanup()

      if (pendingAudio) {
        // Jika user secara eksplisit mematikan mic saat ngomong, transkrip!
        setIsProcessing(true)
        setTimeout(async () => {
          try {
            const config = await getAllConfig()
            const sttEngine = config[0]?.localWhisperModel || 'whisper-small'
            let text = ''

            if (sttEngine === 'groq-whisper') {
              setToastMessage('Mentranskrip via Groq API...')
              text = await transcribeAudioGroq(pendingAudio)
              setToastMessage('')
            } else {
              text = await transcribeAudioLocal(pendingAudio, (progressData) => {
                if (progressData && progressData.progress !== undefined) {
                  setToastMessage(
                    `Mengunduh model AI Suara... ${Math.round(progressData.progress)}%`
                  )
                  if (progressData.progress >= 100) {
                    setTimeout(() => setToastMessage(''), 2000)
                  }
                }
              })
            }

            setIsProcessing(false)
            if (text && text.trim() !== '') {
              const cleanText = text.replace(
                /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
                'Mark'
              )
              onTranscript(cleanText.trim())
            }
          } catch (err) {
            setIsProcessing(false)
            console.error('[VAD] STT Error:', err)
            setToastMessage(`Gagal memproses STT: ${err.message}`)
            setTimeout(() => setToastMessage(''), 5000)
          }
        }, 150)
      }
    } else {
      startVADRecording()
    }
  }

  useEffect(() => {
    return () => stopVADCleanup()
  }, [])

  return {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording: startVADRecording,
    stopRecording: finishSpeechAndTranscribe,
    toastMessage
  }
}
