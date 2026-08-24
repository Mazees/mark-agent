import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { getAllConfig } from '../api/db'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported
} from '../api/webSpeech'
import { playVoice } from '../api/ai/utils'
import { FaChevronLeft, FaMicrophone, FaStop, FaExclamationTriangle } from 'react-icons/fa'

const LiveAudio = () => {
  const {
    chatData,
    setChatData,
    isLoading,
    isSpeak,
    setIsSpeak,
    message,
    setMessage,
    handlePlanningCommand,
    abortControllerRef,
    config
  } = useChat()
  const chatEndRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)

  const lastSpokenMessageContentRef = useRef(
    chatData.length > 0 && chatData[chatData.length - 1].role === 'ai'
      ? chatData[chatData.length - 1].content
      : null
  )

  const stopRecordingCleanup = useCallback(() => {
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

    setIsActive(false)
    setStatus('idle')
    setAudioIntensity(0)
  }, [])

  useEffect(() => {
    return () => stopRecordingCleanup()
  }, [stopRecordingCleanup])

  useEffect(() => {
    if (location.state?.autoStart) {
      if (!isActive) {
        handleMicToggle()
      }
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, isActive, navigate])

  useEffect(() => {
    setIsSpeak(false)
  }, [setIsSpeak])

  const isStartingRef = useRef(false)

  const handleMicToggle = async () => {
    if (isActive) {
      stopRecordingCleanup()
    } else {
      if (isStartingRef.current) return
      isStartingRef.current = true

      try {
        stopRecordingCleanup()

        const micId = config[0]?.micDeviceId
        const audioConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }

        if (micId && micId !== 'default') {
          audioConstraints.deviceId = { exact: micId }
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
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

        processor.onaudioprocess = (e) => {
          if (window.isMarkSpeaking) {
            setAudioIntensity(0)
            return
          }

          const input = e.inputBuffer.getChannelData(0)
          let sum = 0
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
          const rms = Math.sqrt(sum / input.length)

          const normalized = Math.min(1, (rms - 0.01) * 15)
          setAudioIntensity(Math.max(0, normalized))
        }

        if (isWebSpeechSupported()) {
          startWebSpeechRecognition({
            lang: 'id-ID',
            onInterim: (interim) => {
              if (interim && interim.trim()) {
                setToastMessage(`"${interim}"`)
              }
            },
            onResult: (finalText) => {
              setToastMessage('')
              if (finalText && finalText.trim()) {
                const cleanText = finalText.replace(
                  /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
                  'Mark'
                )
                setStatus('thinking')
                setMessage(`(Mikrofon) ${cleanText.trim()}`)
                handlePlanningCommand(`(Mikrofon) ${cleanText.trim()}`, null, false, null, {
                  forceSpeak: true
                })
              }
            },
            onError: (err) => {
              console.warn('[LiveAudio] Web Speech error:', err)
            },
            onEnd: () => {
              if (isActive && !window.isMarkSpeaking) {
                setTimeout(() => {
                  if (isActive && !window.isMarkSpeaking) {
                    startWebSpeechRecognition({
                      lang: 'id-ID',
                      onInterim: (interim) => {
                        if (interim && interim.trim()) setToastMessage(`"${interim}"`)
                      },
                      onResult: (finalText) => {
                        setToastMessage('')
                        if (finalText && finalText.trim()) {
                          const cleanText = finalText.replace(
                            /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
                            'Mark'
                          )
                          setStatus('thinking')
                          setMessage(`(Mikrofon) ${cleanText.trim()}`)
                          handlePlanningCommand(
                            `(Mikrofon) ${cleanText.trim()}`,
                            null,
                            false,
                            null,
                            { forceSpeak: true }
                          )
                        }
                      }
                    })
                  }
                }, 200)
              }
            }
          })
        }

        setIsActive(true)
        setStatus('listening')
        isStartingRef.current = false
      } catch (error) {
        console.error('Error starting mic:', error)
        stopRecordingCleanup()
        setToastMessage('Gagal mengakses mikrofon.')
        isStartingRef.current = false
      }
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatData])

  return (
    <div className="flex flex-col h-screen bg-base-300 select-none overflow-hidden relative">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-base-100/40 backdrop-blur-md border-b border-base-content/5 z-10">
        <button
          onClick={() => navigate('/')}
          className="btn btn-circle btn-ghost btn-sm text-base-content/70 hover:text-base-content"
          title="Kembali ke Beranda"
        >
          <FaChevronLeft className="text-lg" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <h1 className="text-sm font-semibold tracking-wider uppercase text-base-content/80">
              Live Audio Hub
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isActive
                    ? status === 'speaking'
                      ? 'bg-secondary animate-pulse'
                      : status === 'thinking'
                        ? 'bg-warning animate-ping'
                        : 'bg-primary animate-pulse'
                    : 'bg-base-content/20'
                }`}
              />
              <span className="text-[11px] font-medium opacity-60">
                {isActive
                  ? status === 'speaking'
                    ? 'Mark Sedang Berbicara...'
                    : status === 'thinking'
                      ? 'Mark Sedang Berpikir...'
                      : 'Mendengarkan (Edge Speech)...'
                  : 'Mikrofon Nonaktif'}
              </span>
            </div>
          </div>
        </div>

        <div className="w-8" />
      </div>

      {/* Main Visualizer Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {/* Visual Pulse Orb */}
        <div className="relative flex items-center justify-center">
          <div
            className={`w-44 h-44 rounded-full transition-all duration-300 flex items-center justify-center ${
              isActive
                ? status === 'speaking'
                  ? 'bg-secondary/20 shadow-[0_0_80px_rgba(236,72,153,0.4)]'
                  : status === 'thinking'
                    ? 'bg-warning/20 shadow-[0_0_80px_rgba(234,179,8,0.4)]'
                    : 'bg-primary/20 shadow-[0_0_80px_rgba(16,185,129,0.4)]'
                : 'bg-base-200/50'
            }`}
            style={{
              transform: `scale(${1 + audioIntensity * 0.35})`
            }}
          >
            <div
              className={`w-32 h-32 rounded-full transition-all duration-200 flex items-center justify-center ${
                isActive
                  ? status === 'speaking'
                    ? 'bg-secondary/40'
                    : status === 'thinking'
                      ? 'bg-warning/40'
                      : 'bg-primary/40'
                  : 'bg-base-200'
              }`}
            >
              <button
                onClick={handleMicToggle}
                className={`btn btn-circle btn-lg w-20 h-20 shadow-xl border-none transition-transform active:scale-95 ${
                  isActive
                    ? status === 'speaking'
                      ? 'btn-secondary text-secondary-content'
                      : status === 'thinking'
                        ? 'btn-warning text-warning-content'
                        : 'btn-primary text-primary-content'
                    : 'btn-neutral text-base-content/60'
                }`}
              >
                {isActive ? <FaStop className="text-2xl" /> : <FaMicrophone className="text-2xl" />}
              </button>
            </div>
          </div>
        </div>

        {/* Live Subtitle / Interim Transcript */}
        <div className="mt-8 text-center max-w-lg min-h-[3rem] flex items-center justify-center">
          {toastMessage ? (
            <p className="text-sm font-medium text-primary/90 bg-base-100/60 backdrop-blur-md px-4 py-2 rounded-full border border-primary/20 animate-pulse">
              {toastMessage}
            </p>
          ) : (
            <p className="text-xs opacity-40 font-mono">
              {isActive ? 'Bicara sekarang, Mark mendengarkan...' : 'Tekan tombol mic untuk mulai'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Mini Chat Preview */}
      <div className="h-44 bg-base-100/40 backdrop-blur-md border-t border-base-content/5 p-4 flex flex-col justify-end">
        <div className="overflow-y-auto space-y-2 pr-2">
          {chatData.slice(-4).map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-1.5 rounded-2xl text-xs ${
                  item.role === 'user'
                    ? 'bg-primary text-primary-content rounded-br-none'
                    : 'bg-base-200 text-base-content rounded-bl-none'
                }`}
              >
                {item.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  )
}

export default LiveAudio
