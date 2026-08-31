import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { getAllConfig } from '../api/db'
import { webApi } from '../api/web-bridge'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported
} from '../api/webSpeech'
import { detectWakeWord, cleanSpokenCommand } from '../api/wakeWord'
import { FaChevronLeft, FaMicrophone, FaStop, FaExclamationTriangle } from 'react-icons/fa'

const LiveAudio = () => {
  const {
    chatData,
    setIsSpeak,
    setMessage,
    handlePlanningCommand
  } = useChat()

  const navigate = useNavigate()
  const location = useLocation()
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [toastMessage, setToastMessage] = useState('')

  const isActiveRef = useRef(false)
  const statusRef = useRef(status)
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)
  const currentConfigRef = useRef({})

  // Inisialisasi dengan pesan terakhir agar saat LiveAudio dibuka tidak memutar ulang pesan lama
  const lastSpokenMessageContentRef = useRef(
    chatData.length > 0 && chatData[chatData.length - 1].role === 'ai'
      ? chatData[chatData.length - 1].content
      : null
  )

  useEffect(() => {
    isActiveRef.current = isActive
    window.isLiveAudioActive = isActive
  }, [isActive])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Pastikan isSpeak dari ChatContext dimatikan agar tidak double playback
  useEffect(() => {
    setIsSpeak(false)
  }, [setIsSpeak])

  // Muat konfigurasi
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
  }, [])

  const stopRecognitionCleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.isMarkSpeaking = false
    stopWebSpeechRecognition()
    recognitionRef.current = null
  }, [])

  // Bersihkan rekognisi saat unmount
  useEffect(() => {
    return () => {
      window.isLiveAudioActive = false
      window.isMarkSpeaking = false
      stopRecognitionCleanup()
    }
  }, [stopRecognitionCleanup])

  const startListeningSession = useCallback(async () => {
    if (!isWebSpeechSupported()) {
      setToastMessage('Web Speech API tidak didukung di peramban ini.')
      setTimeout(() => setToastMessage(''), 4000)
      setIsActive(false)
      setStatus('idle')
      return
    }

    await refreshConfig()
    const lang = currentConfigRef.current?.speechLanguage || 'id-ID'
    const customWakeWords = currentConfigRef.current?.customWakeWords || ''

    stopRecognitionCleanup()

    try {
      const rec = await startWebSpeechRecognition({
        lang,
        continuous: true,
        onInterim: (_interim) => {
          // Barge-in: jika user mulai bicara saat AI sedang bicara, hentikan suara AI seketika
          if (statusRef.current === 'speaking' && audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
            window.isMarkSpeaking = false
            setStatus('listening')
          }
        },
        onResult: (finalText) => {
          if (!finalText || !finalText.trim()) return

          // Hentikan suara AI jika sedang bersuara (barge-in)
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
            window.isMarkSpeaking = false
          }

          const rawText = finalText.trim()
          const check = detectWakeWord(rawText, customWakeWords)
          const wakePrefix = check.detected && check.wakePhrase ? `${check.wakePhrase} ` : ''
          const cleanText = cleanSpokenCommand(rawText, customWakeWords)
          const commandToRun = cleanText || rawText

          if (commandToRun) {
            setStatus('thinking')
            const fullMessage = `(Mikrofon) ${wakePrefix}${commandToRun}`.trim()
            setMessage(fullMessage)
            handlePlanningCommand(fullMessage)
          }
        },
        onError: (err) => {
          console.warn('[LiveAudio] Web Speech Error:', err.message)
        },
        onEnd: () => {
          if (isActiveRef.current && statusRef.current !== 'thinking') {
            // Restart listening jika masih aktif
            setTimeout(() => {
              if (isActiveRef.current && statusRef.current !== 'thinking') {
                startListeningSession()
              }
            }, 300)
          }
        }
      })

      recognitionRef.current = rec
      setStatus('listening')
    } catch (err) {
      console.error('[LiveAudio] Failed to start recognition:', err)
      setToastMessage('Gagal memulai mikrofon.')
      setTimeout(() => setToastMessage(''), 4000)
      setIsActive(false)
      setStatus('idle')
    }
  }, [handlePlanningCommand, setMessage, stopRecognitionCleanup])

  const handleMicToggle = useCallback(async () => {
    if (isActive) {
      setIsActive(false)
      setStatus('idle')
      stopRecognitionCleanup()
    } else {
      setIsActive(true)
      await startListeningSession()
    }
  }, [isActive, startListeningSession, stopRecognitionCleanup])

  // Auto-start dari Global Shortcut / System Tray
  useEffect(() => {
    if (location.state?.autoStart) {
      if (!isActive) {
        handleMicToggle()
      }
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, isActive, navigate, handleMicToggle])

  const playAIResponse = useCallback(async (text) => {
    try {
      setStatus('speaking')
      window.isMarkSpeaking = true

      const configList = await getAllConfig()
      const rate = configList[0]?.ttsRate ?? 0
      const pitch = configList[0]?.ttsPitch ?? 0
      const voice = configList[0]?.ttsVoice || 'id-ID-ArdiNeural'

      const audioSrc = await webApi.textToSpeech(text, rate, pitch, voice)
      if (audioSrc) {
        const audio = new Audio(audioSrc)
        audio.crossOrigin = 'anonymous'
        audioRef.current = audio

        audio.onended = () => {
          audioRef.current = null
          window.isMarkSpeaking = false
          if (isActiveRef.current) {
            setStatus('listening')
            startListeningSession()
          } else {
            setStatus('idle')
          }
        }
        audio.onerror = () => {
          audioRef.current = null
          window.isMarkSpeaking = false
          if (isActiveRef.current) {
            setStatus('listening')
            startListeningSession()
          } else {
            setStatus('idle')
          }
        }
        await audio.play()
      } else {
        window.isMarkSpeaking = false
        if (isActiveRef.current) {
          setStatus('listening')
          startListeningSession()
        } else {
          setStatus('idle')
        }
      }
    } catch (e) {
      console.error('[LiveAudio] TTS Error:', e)
      window.isMarkSpeaking = false
      if (isActiveRef.current) {
        setStatus('listening')
        startListeningSession()
      } else {
        setStatus('idle')
      }
    }
  }, [startListeningSession])

  // Memantau chatData untuk auto-play respons TTS
  useEffect(() => {
    if (!isActive) return

    if (chatData.length > 0) {
      const lastMsg = chatData[chatData.length - 1]
      // Jika pesan terakhir dari AI dan bukan status 'thinking'
      if (
        lastMsg &&
        lastMsg.role === 'ai' &&
        !lastMsg.isThinking &&
        !lastMsg.isSearching &&
        !lastMsg.isSummarizing &&
        !lastMsg.isSearchingMusic
      ) {
        if (lastSpokenMessageContentRef.current !== lastMsg.content) {
          lastSpokenMessageContentRef.current = lastMsg.content
          playAIResponse(lastMsg.content)
        }
      }
    }
  }, [chatData, isActive, playAIResponse])

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Tap untuk mulai bicara'
      case 'listening':
        return 'Mendengarkan...'
      case 'thinking':
        return 'Mark sedang memikirkan balasan...'
      case 'speaking':
        return 'Mark sedang berbicara...'
      default:
        return 'Tap untuk mulai bicara'
    }
  }

  const getStatusSubtext = () => {
    switch (status) {
      case 'idle':
        return 'Tekan tombol mikrofon untuk memulai percakapan live dengan Mark'
      case 'listening':
        return 'Silakan bicara, Mark sedang mendengarkan'
      case 'thinking':
        return 'Tunggu sebentar, Mark sedang memproses ucapanmu'
      case 'speaking':
        return 'Tunggu sebentar, Mark sedang merespon'
      default:
        return ''
    }
  }

  const handleBack = () => {
    stopRecognitionCleanup()
    setIsActive(false)
    setStatus('idle')
    navigate('/')
  }

  return (
    <div className="h-screen bg-base-300 text-white overflow-hidden relative font-['Poppins',sans-serif] flex flex-col items-center justify-center">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl transition-all duration-1000 ${isActive ? 'scale-110 bg-primary/10' : 'scale-100'}`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-success/5 blur-3xl transition-all duration-1000 delay-200 ${isActive ? 'scale-125 bg-success/10' : 'scale-100'}`}
        />
      </div>

      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="absolute top-8 left-6 btn btn-ghost btn-sm gap-2 z-50 text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer select-none"
      >
        <FaChevronLeft size={14} />
        <span>Kembali</span>
      </button>

      {/* Header */}
      <div className="relative z-10 text-center mb-8 select-none">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <FaMicrophone className="text-primary" size={20} />
          </div>
          <h1 className="text-2xl font-bold">Live Audio</h1>
        </div>
        <p className="text-sm opacity-50">Percakapan suara real-time dengan Mark</p>
      </div>

      {/* Audio Visualizer Circle */}
      <div className="relative z-10 flex items-center justify-center mb-10">
        {/* Outer pulse rings */}
        {isActive && (
          <>
            <div className="absolute w-64 h-64 rounded-full border border-primary/20 audio-pulse-ring" />
            <div
              className="absolute w-72 h-72 rounded-full border border-primary/10 audio-pulse-ring"
              style={{ animationDelay: '0.5s' }}
            />
            <div
              className="absolute w-80 h-80 rounded-full border border-primary/5 audio-pulse-ring"
              style={{ animationDelay: '1s' }}
            />
          </>
        )}

        {/* Main visualizer circle */}
        <div
          className={`relative w-52 h-52 rounded-full flex items-center justify-center transition-all duration-700 ${
            isActive
              ? status === 'speaking'
                ? 'audio-glow-speaking'
                : 'audio-glow-listening'
              : 'audio-glow-idle'
          }`}
        >
          {/* Inner gradient ring */}
          <div
            className={`absolute inset-0 rounded-full transition-all duration-500 ${
              isActive
                ? 'bg-linear-to-br from-primary/30 via-success/20 to-primary/30'
                : 'bg-linear-to-br from-base-200/60 via-base-300/40 to-base-200/60'
            }`}
          />

          {/* Inner circle with waveform placeholder */}
          <div
            className={`relative w-40 h-40 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-500 ${
              isActive
                ? 'bg-base-100/40 border border-primary/30'
                : 'bg-base-100/20 border border-white/5'
            }`}
          >
            {/* Animated bars (audio waveform placeholder) */}
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    isActive
                      ? status === 'speaking'
                        ? 'bg-success audio-bar-speaking'
                        : 'bg-primary audio-bar-listening'
                      : 'bg-white/20 h-4'
                  }`}
                  style={{
                    animationDelay: `${i * 0.15}s`
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status text */}
      <div className="relative z-10 text-center mb-12 select-none">
        <p
          className={`text-lg font-semibold mb-1 transition-colors duration-300 ${
            status === 'listening'
              ? 'text-primary'
              : status === 'speaking'
                ? 'text-success'
                : 'text-white/60'
          }`}
        >
          {getStatusText()}
        </p>
        <p className="text-sm opacity-40 max-w-xs">{getStatusSubtext()}</p>
      </div>

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center">
        <button
          onClick={handleMicToggle}
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 active:scale-95 cursor-pointer shadow-xl ${
            isActive
              ? 'bg-error shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-error/90'
              : 'bg-primary shadow-[0_0_20px_rgba(31,184,84,0.4)] hover:bg-primary/90'
          }`}
        >
          {isActive ? (
            <FaStop className="text-white" size={24} />
          ) : (
            <FaMicrophone className="text-white" size={24} />
          )}
        </button>

        {/* Active ring animation around mic button */}
        {isActive && (
          <div className="absolute top-0 w-18 h-18 rounded-full border-2 border-error/50 audio-pulse-ring pointer-events-none" />
        )}
      </div>

      {/* Bottom hint */}
      <p className="relative z-10 mt-8 text-xs opacity-30 select-none">
        {isActive ? 'Tekan tombol untuk menghentikan' : 'Pastikan mikrofon sudah tersambung'}
      </p>

      {/* Floating Toast Error */}
      {toastMessage && (
        <div className="toast toast-top toast-center z-50 animate-bounce">
          <div className="alert alert-error text-sm font-semibold shadow-2xl flex gap-2 items-center">
            <FaExclamationTriangle size={18} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveAudio
