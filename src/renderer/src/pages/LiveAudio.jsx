import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { useVAD } from '../hooks/useVAD'
import OrbVisualizer, { getMoodColor } from '../components/core/OrbVisualizer'
import {
  FaChevronLeft,
  FaMicrophone,
  FaStop,
  FaExclamationTriangle
} from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from '../components/Chat/CodeBlock'

/**
 * LiveAudio Page - MARK V5
 * Halaman percakapan suara real-time murni dengan Mark OS.
 * Didukung oleh useVAD (Web Speech API + Wake Word Watchdog + Web Audio Analyser)
 * dan sintesis suara Edge-TTS streaming tanpa jeda.
 */
const LiveAudio = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    chatData,
    isLoading,
    isAgentBusy,
    setIsSpeak,
    setMessage,
    handlePlanningCommand,
    orbStatus,
    setOrbStatus
  } = useChat()

  const [ttsIntensity, setTtsIntensity] = useState(0)

  // Tangkap event mark-intensity untuk sinkronisasi visualizer saat Mark berbicara
  useEffect(() => {
    const handleTtsIntensity = (e) => {
      const intensity = e.detail || 0
      setTtsIntensity(intensity)
      if (window.isMarkSpeaking) {
        setOrbStatus('speaking')
      } else {
        setOrbStatus((prev) => (prev === 'speaking' ? 'idle' : prev))
      }
    }
    window.addEventListener('mark-intensity', handleTtsIntensity)
    return () => window.removeEventListener('mark-intensity', handleTtsIntensity)
  }, [setOrbStatus])

  // Handler saat transkrip suara pengguna selesai dideteksi oleh useVAD
  const handleVoiceTranscript = (text, meta = {}) => {
    if (!text || !text.trim()) return
    const wakePrefix = meta?.isWakeWord && meta?.wakePhrase ? `${meta.wakePhrase} ` : ''
    const prefixedText = `(Mikrofon) ${wakePrefix}${text}`.trim()
    setMessage(prefixedText)
    setIsSpeak(true)
    handlePlanningCommand(prefixedText, null, false, null, { forceSpeak: true })
  }

  const {
    isRecording,
    isProcessing,
    audioIntensity,
    startRecording,
    stopRecording,
    toggleRecording,
    toastMessage
  } = useVAD({
    onTranscript: handleVoiceTranscript
  })

  // Sinkronisasi status Orb dengan status perekaman VAD & eksekusi AI
  useEffect(() => {
    if (isRecording) {
      setOrbStatus('listening')
    } else if (isProcessing || isLoading || isAgentBusy) {
      setOrbStatus('thinking')
    } else if (window.isMarkSpeaking) {
      setOrbStatus('speaking')
    } else {
      setOrbStatus('idle')
    }
  }, [isRecording, isProcessing, isLoading, isAgentBusy, setOrbStatus])

  // Auto-start mikrofon jika diarahkan dari shortcut atau state eksternal
  useEffect(() => {
    if (location.state?.autoStart) {
      if (!isRecording) {
        startRecording()
      }
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, isRecording, navigate, startRecording])

  // Ambil respons dan percakapan terakhir untuk ditampilkan secara live di layar
  const latestInteraction = useMemo(() => {
    if (!chatData || chatData.length === 0) return null

    let lastAiMsg = null
    let lastUserMsg = null

    for (let i = chatData.length - 1; i >= 0; i--) {
      const msg = chatData[i]
      if (!lastAiMsg && msg.role === 'ai') {
        lastAiMsg = msg
      }
      if (!lastUserMsg && msg.role === 'user') {
        lastUserMsg = msg
      }
      if (lastAiMsg && lastUserMsg) break
    }

    return {
      user: lastUserMsg,
      ai: lastAiMsg
    }
  }, [chatData])

  const currentMood = latestInteraction?.ai?.mood || 'neutral'
  const { hex: moodHex } = getMoodColor(currentMood, orbStatus)

  const handleBack = () => {
    if (isRecording) {
      stopRecording()
    }
    setOrbStatus('idle')
    navigate('/')
  }

  const getStatusText = () => {
    if (orbStatus === 'speaking') return 'Mark sedang berbicara...'
    if (isRecording) return 'Mendengarkan...'
    if (isProcessing || isLoading || isAgentBusy) return 'Mark sedang memproses...'
    return 'Standby - Siap mendengarkan'
  }

  const getStatusSubtext = () => {
    if (orbStatus === 'speaking') return 'Tekan tombol mikrofon untuk menyela ucapan Mark (barge-in)'
    if (isRecording) return 'Silakan bicara secara natural, Mark akan merespon setelah jeda hening'
    if (isProcessing || isLoading || isAgentBusy) return 'Menyusun analisis dan jawaban...'
    return 'Ucapkan kata pemicu ("Mark" / "Hey Mark") atau tekan tombol mic di bawah'
  }

  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      return !inline ? (
        <CodeBlock match={match} children={children} />
      ) : (
        <code className={`px-1.5 py-0.5 rounded bg-white/10 text-primary font-mono text-xs ${className || ''}`} {...props}>
          {children}
        </code>
      )
    },
    a: ({ node, ...props }) => {
      let url = props.href || '#'
      if (url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      return (
        <a
          {...props}
          className="text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault()
            if (window.api && window.api.openExternal && url !== '#') {
              window.api.openExternal(url)
            }
          }}
        />
      )
    }
  }

  return (
    <div className="h-screen w-screen bg-[#060a08] text-white overflow-hidden relative select-none font-['Poppins',sans-serif] flex flex-col justify-between p-6">
      {/* ── Background Deep Holographic Glow ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,35,28,0.6)_0%,#060a08_75%)] pointer-events-none z-0" />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-175 h-175 rounded-full blur-[120px] pointer-events-none transition-all duration-700 z-0"
        style={{
          backgroundColor:
            orbStatus === 'speaking'
              ? `${moodHex}25`
              : isRecording
                ? 'rgba(0, 255, 204, 0.15)'
                : 'rgba(31, 184, 84, 0.08)'
        }}
      />

      {/* ── Top Navigation & HUD Header ── */}
      <header className="relative z-20 flex items-center justify-between w-full">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all text-xs font-mono cursor-pointer"
        >
          <FaChevronLeft size={12} />
          <span>Kembali ke Utama</span>
        </button>

        {/* Live Audio Telemetry Capsule */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md">
          <span
            className={`w-2 h-2 rounded-full ${
              isRecording
                ? 'bg-error animate-ping'
                : orbStatus === 'speaking'
                  ? 'bg-secondary animate-pulse'
                  : isProcessing || isLoading
                    ? 'bg-warning animate-spin'
                    : 'bg-primary'
            }`}
          />
          <span className="text-[11px] font-mono tracking-wider uppercase text-white/80">
            {orbStatus === 'speaking'
              ? 'TRANSMITTING'
              : isRecording
                ? 'LISTENING MIC'
                : isProcessing || isLoading
                  ? 'PROCESSING'
                  : 'STANDBY'}
          </span>
        </div>
      </header>

      {/* ── Center Content: Sentient Orb Avatar & Audio Reactive Waveform ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center my-auto min-h-0">
        <div className="relative flex flex-col items-center justify-center">
          {/* Animated Visualizer Halo Rings saat aktif */}
          {(isRecording || orbStatus === 'speaking') && (
            <>
              <div
                className="absolute w-80 h-80 rounded-full border border-primary/20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] pointer-events-none"
                style={{
                  borderColor: orbStatus === 'speaking' ? moodHex : '#00ffcc'
                }}
              />
              <div
                className="absolute w-96 h-96 rounded-full border border-primary/10 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite] pointer-events-none"
                style={{
                  animationDelay: '1s',
                  borderColor: orbStatus === 'speaking' ? moodHex : '#00ffcc'
                }}
              />
            </>
          )}

          {/* Mark Sentient Core Orb Visualizer */}
          <div className="cursor-pointer transition-transform duration-300 active:scale-95" onClick={toggleRecording}>
            <OrbVisualizer
              status={orbStatus}
              intensity={orbStatus === 'speaking' ? ttsIntensity : audioIntensity}
              mood={currentMood}
            />
          </div>

          {/* Real-time Voice Waveform Visualizer */}
          <div className="flex items-center gap-1 mt-4 h-6 px-4 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
            {Array.from({ length: 12 }).map((_, i) => {
              const val =
                orbStatus === 'speaking'
                  ? Math.sin(Date.now() * 0.01 + i) * ttsIntensity * 16
                  : isRecording
                    ? audioIntensity * (i % 2 === 0 ? 16 : 8)
                    : 2
              return (
                <span
                  key={i}
                  className="w-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(3, Math.min(20, val + 3))}px`,
                    backgroundColor:
                      orbStatus === 'speaking'
                        ? moodHex
                        : isRecording
                          ? '#00ffcc'
                          : 'rgba(255, 255, 255, 0.2)'
                  }}
                />
              )
            })}
          </div>

          {/* Dynamic Status Text */}
          <div className="text-center mt-3 select-none max-w-md">
            <h2 className="text-sm font-semibold font-mono tracking-wide text-white">
              {getStatusText()}
            </h2>
            <p className="text-xs text-white/50 font-mono mt-1">
              {getStatusSubtext()}
            </p>
          </div>
        </div>

        {/* ── Live Conversation Subtitle Box (Jika ada percakapan) ── */}
        {latestInteraction?.ai && (
          <div className="mt-6 w-full max-w-xl bg-black/40 border border-white/10 rounded-2xl p-4 backdrop-blur-xl max-h-36 overflow-y-auto no-scrollbar shadow-2xl animate-[holo-project-in_0.2s_ease-out_forwards]">
            {latestInteraction.user && (
              <div className="text-xs text-primary/80 font-mono mb-1.5 flex items-center gap-1.5 truncate">
                <FaMicrophone size={10} />
                <span className="truncate">
                  {typeof latestInteraction.user.content === 'string'
                    ? latestInteraction.user.content.replace(/^\(Mikrofon\)\s*/, '')
                    : 'Perintah Suara'}
                </span>
              </div>
            )}
            <div className="text-xs md:text-sm font-mono text-white/90 leading-relaxed">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
                components={markdownComponents}
              >
                {latestInteraction.ai.content}
              </Markdown>
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom Controls: Giant Sci-Fi Mic Trigger & Hint ── */}
      <footer className="relative z-20 flex flex-col items-center justify-center gap-3 pb-2">
        <div className="relative flex items-center justify-center">
          {/* Active Glowing Rings */}
          {isRecording && (
            <div className="absolute w-20 h-20 rounded-full border-2 border-error/60 animate-ping pointer-events-none" />
          )}

          <button
            type="button"
            onClick={toggleRecording}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 cursor-pointer shadow-2xl ${
              isRecording
                ? 'bg-error text-white shadow-[0_0_25px_rgba(239,68,68,0.5)] hover:bg-error/90'
                : 'bg-primary text-black shadow-[0_0_25px_rgba(0,255,204,0.4)] hover:bg-primary/90'
            }`}
            title={isRecording ? 'Hentikan Mendengarkan' : 'Mulai Bicara'}
          >
            {isRecording ? <FaStop size={20} /> : <FaMicrophone size={22} />}
          </button>
        </div>

        <span className="text-[11px] font-mono text-white/40 tracking-wider">
          {isRecording ? 'TEKAN UNTUK SELESAI BICARA' : 'TEKAN TOMBOL ATAU UCAPKAN "MARK" UNTUK BICARA'}
        </span>
      </footer>

      {/* ── Toast Message ── */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-2xl text-xs font-mono flex items-center gap-2 animate-bounce">
          <FaExclamationTriangle size={14} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}

export default LiveAudio
