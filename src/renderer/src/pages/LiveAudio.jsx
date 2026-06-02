import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { getAllConfig } from '../api/db'
import { transcribeAudioGroq } from '../api/groq'

const LiveAudio = () => {
  const {
    chatData,
    setChatData,
    isAction,
    setIsAction,
    isLoading,
    isSpeak,
    setIsSpeak,
    message,
    setMessage,
    handleSubmit,
    handleAIResponse,
    config
  } = useChat()
  const chatEndRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const timeoutsRef = useRef(null)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const prevChatLengthRef = useRef(chatData.length)
  
  const [toastMessage, setToastMessage] = useState('')

  // Local Whisper STT Refs (Now used for Audio Context VAD)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const audioChunksRef = useRef([])
  const silenceTimerRef = useRef(null)
  
  // Inisialisasi dengan pesan terakhir agar saat LiveAudio dibuka, tidak memutar ulang pesan lama
  const lastSpokenMessageContentRef = useRef(
    chatData.length > 0 && chatData[chatData.length - 1].role === 'ai'
      ? chatData[chatData.length - 1].content
      : null
  )

  const stopRecordingCleanup = () => {
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
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }
    isSpeakingRef.current = false
    audioChunksRef.current = []
  }

  // Bersihkan mic saat unmount
  useEffect(() => {
    return () => stopRecordingCleanup()
  }, [])

  // Auto-start dari Global Shortcut / System Tray
  useEffect(() => {
    if (location.state?.autoStart) {
      if (!isActive) {
        handleMicToggle()
      }
      // Hapus state dari React Router secara benar agar tidak loop
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, isActive, navigate])

  // Refs untuk mengatasi stale closure pada event listener STT
  const isActiveRef = useRef(isActive)
  const statusRef = useRef(status)

  useEffect(() => {
    isActiveRef.current = isActive
    statusRef.current = status
  }, [isActive, status])

  // Pastikan isSpeak dari ChatContext dimatikan agar tidak double playback
  // karena LiveAudio menghandle playback-nya sendiri
  useEffect(() => {
    setIsSpeak(false)
  }, [setIsSpeak])

  const isStartingRef = useRef(false)

  const handleMicToggle = async () => {
    if (isActive) {
      stopRecordingCleanup()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setIsActive(false)
      setStatus('idle')
    } else {
      if (isStartingRef.current) return
      isStartingRef.current = true

      try {
        stopRecordingCleanup()
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const AudioContext = window.AudioContext || window.webkitAudioContext
        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        const gainNode = audioContext.createGain()
        gainNode.gain.value = 0 // Mute output to speakers

        source.connect(processor)
        processor.connect(gainNode)
        gainNode.connect(audioContext.destination)

        processor.onaudioprocess = (e) => {
          // Jika AI sedang berbicara atau berpikir, kita pause VAD (kecuali untuk barge-in)
          if (statusRef.current === 'speaking' || statusRef.current === 'thinking') {
            const input = e.inputBuffer.getChannelData(0)
            let sum = 0
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
            const rms = Math.sqrt(sum / input.length)
            
            // Barge-in threshold: jika user teriak / bicara keras saat Mark bicara
            if (statusRef.current === 'speaking' && rms > 0.05) {
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current = null
              }
              setStatus('listening')
            }
            return
          }

          const input = e.inputBuffer.getChannelData(0)
          let sum = 0
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
          const rms = Math.sqrt(sum / input.length)

          // Threshold suara (VAD sederhana)
          if (rms > 0.015) {
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true
              audioChunksRef.current = []
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            
            silenceTimerRef.current = setTimeout(() => {
              isSpeakingRef.current = false
              
              const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
              // Minimal 0.5 detik audio untuk dikirim ke Whisper (8000 samples @ 16kHz)
              if (totalLength < 8000) {
                 return // Abaikan noise singkat
              }
              
              const merged = new Float32Array(totalLength)
              let offset = 0
              for (let arr of audioChunksRef.current) {
                merged.set(arr, offset)
                offset += arr.length
              }
              
              setStatus('thinking')
              
              // Transkripsi ke Groq Cloud API
              transcribeAudioGroq(merged)
                .then(text => {
                  if (text && text.trim() !== '') {
                    setMessage(text.trim())
                    handleAIResponse(text.trim())
                    setMessage('')
                  } else {
                    setStatus('listening')
                  }
                })
                .catch(err => {
                  console.error('Groq Error:', err)
                  if (err.message.includes('Key')) {
                    setToastMessage(err.message)
                    setTimeout(() => setToastMessage(''), 5000)
                  }
                  setStatus('listening')
                })
              
            }, 1200) // Diam 1.2 detik = kirim ke Groq
          }

          if (isSpeakingRef.current) {
            audioChunksRef.current.push(new Float32Array(input))
          }
        }

        setIsActive(true)
        setStatus('listening')
        isStartingRef.current = false
      } catch (error) {
        console.error('Error starting mic:', error)
        alert('Gagal mengakses mikrofon. Pastikan Anda telah memberikan izin.')
        setIsActive(false)
        setStatus('idle')
        isStartingRef.current = false
      }
    }
  }

  // Memantau chatData untuk auto-play respons TTS
  useEffect(() => {
    if (!isActive) return
    
    if (chatData.length > 0) {
      const lastMsg = chatData[chatData.length - 1]
      // Jika pesan terakhir dari AI dan bukan status 'thinking'
      if (lastMsg && lastMsg.role === 'ai' && !lastMsg.isThinking && !lastMsg.isSearching && !lastMsg.isSummarizing && !lastMsg.isSearchingMusic) {
        // Cek apakah pesan ini sudah diucapkan agar tidak dobel
        if (lastSpokenMessageContentRef.current !== lastMsg.content) {
          lastSpokenMessageContentRef.current = lastMsg.content
          playAIResponse(lastMsg.content)
        }
      }
    }
  }, [chatData, isActive, status])

  const playAIResponse = async (text) => {
    try {
      setStatus('speaking')
      const configList = await getAllConfig()
      const rate = configList[0]?.ttsRate ?? 0
      const pitch = configList[0]?.ttsPitch ?? 0
      
      const audioBase64 = await window.api.textToSpeech(text, rate, pitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audioRef.current = audio
        
        audio.onended = () => {
          setStatus('listening')
        }
        audio.play()
      } else {
        setStatus('listening')
      }
    } catch(e) {
      console.error(e)
      setStatus('listening')
    }
  }

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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-base-300 via-base-100 to-base-300">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl transition-all duration-1000 ${isActive ? 'scale-110 bg-primary/10' : 'scale-100'}`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-success/5 blur-3xl transition-all duration-1000 delay-200 ${isActive ? 'scale-125 bg-success/10' : 'scale-100'}`}
        />
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 btn btn-ghost btn-sm gap-2 z-20 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1.2em"
          height="1.2em"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali
      </button>

      {/* Header */}
      <div className="relative z-10 text-center mb-8 select-none">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.3em"
              height="1.3em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-primary"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M17 11a1 1 0 0 1 1 1 6 6 0 0 1-12 0 1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 1-1Z" />
              <path d="M12 19a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
            </svg>
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
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 active:scale-95 ${
            isActive
              ? 'bg-error shadow-lg hover:bg-error/90'
              : 'bg-primary shadow-lg hover:bg-primary/90'
          }`}
        >
          {isActive ? (
            /* Stop icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.8em"
              height="1.8em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-white"
            >
              <path d="M7 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Z" />
            </svg>
          ) : (
            /* Mic icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.8em"
              height="1.8em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-white"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M17 11a1 1 0 0 1 1 1 6 6 0 0 1-12 0 1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 1-1Z" />
              <path d="M12 19a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
            </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveAudio
