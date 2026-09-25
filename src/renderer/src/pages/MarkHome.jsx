import { useEffect, useState, useRef, memo } from 'react'
import { useChat } from '../contexts/ChatContext'
import Avatar from '../components/core/Avatar'
import InputBar from '../components/core/InputBar'
import ResponseArea from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import ToolClustersDeck from '../components/core/ToolClustersDeck'
import { MessageSquare, Sparkles, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import musicCoverFallback from '../assets/music-cover.png'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { db, setSessionWorkspace, getAllConfig } from '../api/db'

/**
 * Komponen waveform bar terisolasi (direct ref style update)
 * Tidak pernah memicu re-render pada MarkHome induk saat ada event intensitas audio
 */
const LiveWaveformBars = memo(() => {
  const barsRef = useRef([])

  useEffect(() => {
    const handleIntensity = (e) => {
      const intensity = typeof e.detail === 'number' ? e.detail : 0
      const bars = barsRef.current
      if (!bars || bars.length === 0) return

      for (let i = 0; i < 6; i++) {
        const el = bars[i]
        if (!el) continue
        const mult = i % 2 === 0 ? 7 : 4
        const height = Math.max(2, Math.min(10, intensity * mult + 2))
        el.style.height = `${height}px`
      }
    }

    window.addEventListener('mark-intensity', handleIntensity)
    return () => window.removeEventListener('mark-intensity', handleIntensity)
  }, [])

  return (
    <div className="flex items-center gap-0.5 h-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          ref={(el) => (barsRef.current[i] = el)}
          className="w-0.5 bg-primary/70 rounded-full"
          style={{ height: '2px' }}
        />
      ))}
    </div>
  )
})
LiveWaveformBars.displayName = 'LiveWaveformBars'

const MarkHome = () => {
  const navigate = useNavigate()
  const chatContext = useChat()
  const {
    chatData,
    message,
    isLoading,
    isAgentBusy,
    runningSessionIds = [],
    isSpeak,
    setIsSpeak,
    handlePlanningCommand,
    orbStatus,
    setOrbStatus,
    notifications,
    activeProcesses,
    dismissProcess,
    inputSource,
    handleStop,
    isBooting,
    isRecording,
    isProcessing,
    audioIntensity,
    startRecording,
    stopRecording,
    toastMessage,
    setCurrentActiveSessionId
  } = chatContext
  const { isPlaying, currentTrack } = useYoutubeMusic()
  useMemoryGroomer(false)

  const isMainLoading =
    (runningSessionIds && runningSessionIds.map(String).includes('1')) || isLoading

  const [currentResponse, setCurrentResponse] = useState(null)
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false)
  const [workspaceRoot, setWorkspaceRoot] = useState(null)
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(65)
  const [thought, setThought] = useState('')

  // Listener untuk event batin Thought Ticker dari Awareness Engine
  useEffect(() => {
    const handleThoughtEvent = (e) => {
      if (e.detail?.thought) {
        setThought(e.detail.thought)
      }
    }
    window.addEventListener('mark:thought', handleThoughtEvent)
    return () => window.removeEventListener('mark:thought', handleThoughtEvent)
  }, [])

  // Pastikan sesi aktif MarkHome selalu Main Thread (Sesi 1)
  useEffect(() => {
    if (typeof setCurrentActiveSessionId === 'function') {
      setCurrentActiveSessionId('1')
    }
  }, [setCurrentActiveSessionId])

  // Muat konfigurasi workspace & overlay opacity dari database
  useEffect(() => {
    db.sessions
      .get(1)
      .then((s) => {
        if (s?.workspaceRoot) setWorkspaceRoot(s.workspaceRoot)
      })
      .catch(() => {})

    getAllConfig()
      .then((cfgList) => {
        if (cfgList && cfgList.length > 0 && cfgList[0].bgOverlayOpacity !== undefined) {
          setBgOverlayOpacity(Number(cfgList[0].bgOverlayOpacity))
        }
      })
      .catch(() => {})

    const handleConfigUpdated = (e) => {
      if (e.detail?.bgOverlayOpacity !== undefined) {
        setBgOverlayOpacity(Number(e.detail.bgOverlayOpacity))
      }
    }
    const handleWorkspaceUpdated = (e) => {
      if (String(e.detail?.sessionId) === '1') {
        setWorkspaceRoot(e.detail?.workspaceRoot || null)
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)
    window.addEventListener('session-workspace-updated', handleWorkspaceUpdated)
    return () => {
      window.removeEventListener('config-updated', handleConfigUpdated)
      window.removeEventListener('session-workspace-updated', handleWorkspaceUpdated)
    }
  }, [])

  const handleSelectWorkspace = async () => {
    if (window.api && window.api.selectDirectory) {
      const selected = await window.api.selectDirectory()
      if (selected) {
        await setSessionWorkspace(1, selected)
        setWorkspaceRoot(selected)
      }
    }
  }

  useEffect(() => {
    let lastSpeaking = false
    const handleTtsIntensity = () => {
      const isSpeaking = Boolean(window.isMarkSpeaking)
      if (isSpeaking !== lastSpeaking) {
        lastSpeaking = isSpeaking
        setOrbStatus(isSpeaking ? 'speaking' : 'idle')
      }
    }
    window.addEventListener('mark-intensity', handleTtsIntensity)
    return () => window.removeEventListener('mark-intensity', handleTtsIntensity)
  }, [setOrbStatus])

  // Handle music widget exit animation
  useEffect(() => {
    const hasTrack = isPlaying && currentTrack?.title
    if (hasTrack) {
      setIsMusicAnimatingOut(false)
      setShowMusicWidget(true)
    } else {
      if (showMusicWidget) {
        setIsMusicAnimatingOut(true)
        const timer = setTimeout(() => {
          setShowMusicWidget(false)
          setIsMusicAnimatingOut(false)
        }, 400)
        return () => clearTimeout(timer)
      }
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget])

  // Sync orb status
  useEffect(() => {
    if (typeof setOrbStatus !== 'function') return
    if (isRecording) {
      setOrbStatus('listening')
    } else if (isProcessing || isMainLoading) {
      setOrbStatus('thinking')
    } else if (!window.isMarkSpeaking) {
      setOrbStatus('idle')
    }
  }, [isMainLoading, chatData, isRecording, isProcessing, setOrbStatus])

  // Derived currentResponse from chatData
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const lastItem = chatData[chatData.length - 1]

      if (lastItem.role === 'ai') {
        if (lastItem.isThinking || lastItem.isSearching) {
          setCurrentResponse({
            text: lastItem.content || 'Memproses instruksi...',
            type: 'short',
            isThinking: true,
            mood: lastItem.mood || 'neutral'
          })
        } else {
          setCurrentResponse({
            text: lastItem.content,
            type:
              lastItem.content?.length > 200 || lastItem.content?.includes('\n') ? 'long' : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood
          })
        }
      } else {
        if (isMainLoading) {
          setCurrentResponse({
            text: 'Memproses...',
            type: 'short',
            isThinking: true
          })
        } else {
          setCurrentResponse({
            text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
            type: 'short'
          })
        }
      }
    } else {
      setCurrentResponse({
        text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
        type: 'short'
      })
    }
  }, [chatData, isMainLoading, isSpeak])

  const handleSubmit = (e, text, opts = {}) => {
    if (typeof chatContext?.handleSubmit === 'function') {
      chatContext.handleSubmit(e, text, opts)
    } else {
      const sendText = typeof text === 'string' && text.trim() ? text.trim() : message.trim()
      if (sendText && typeof handlePlanningCommand === 'function') {
        handlePlanningCommand(sendText, null, false, opts)
      }
    }
  }

  const mood = currentResponse?.mood || 'neutral'

  const handleAvatarInteract = (type, detail = {}) => {
    // Dispatch event untuk sistem pertumbuhan relasi 4D
    window.dispatchEvent(
      new CustomEvent('mark-tactile-interaction', {
        detail: { type, ...detail }
      })
    )
  }

  // Sinkronisasi status operasional AI secara komprehensif
  const computedAvatarStatus = isRecording
    ? 'listening'
    : isSpeak || window.isMarkSpeaking
      ? 'speaking'
      : isMainLoading
        ? 'thinking'
        : isProcessing
          ? 'processing'
          : isPlaying
            ? 'music_groove'
            : orbStatus || 'idle'

  return (
    <div className="h-screen w-screen text-white overflow-hidden relative bg-[#060a08]">
      {/* ── 1. BACKGROUND: Clean Minimalist Deep Dark (#060a08) ── */}

      {/* ── 2. LAYER 2: Dynamic Background Overlay Tint ── */}
      <div
        className="absolute inset-0 z-5 pointer-events-none transition-colors duration-300"
        style={{
          backgroundColor: `rgba(6, 10, 8, ${bgOverlayOpacity / 100})`
        }}
      />

      {isBooting && (
        <div className="fixed inset-0 bg-base-300 flex flex-col items-center justify-center gap-5 z-[999]">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
            Membangunkan Mark...
          </p>
        </div>
      )}

      {/* ── 3. TOP BAR HUD (Sleek, Clean, No Overlapping) ── */}
      <header className="absolute top-0 inset-x-0 h-14 px-6 z-40 flex items-center justify-between">
        {/* Left: Menu & Studio */}
        <div className="flex items-center gap-2.5">
          <FloatingMenu />
          <button
            onClick={() => navigate('/chat')}
            className="h-8 px-3 bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-2 transition-all text-white/80 hover:text-white rounded-xl cursor-pointer text-xs font-mono font-semibold relative"
            title="Buka Chat Studio"
          >
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
            <span className="hidden md:inline">Studio</span>
            {isAgentBusy && !isMainLoading && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Global Notifications & Telemetry Popups */}
      <StatusIndicator notifications={notifications} />

      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg text-xs font-mono">
          {toastMessage}
        </div>
      )}

      {/* ── 4. CENTER AVATAR (2.5D Cyber-Droid Companion) ── */}
      <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center pointer-events-none select-none">
        <div className="scale-115 md:scale-140 lg:scale-165 xl:scale-180 pointer-events-auto cursor-pointer transition-transform duration-300">
          <Avatar
            status={computedAvatarStatus}
            intensity={audioIntensity}
            mood={mood}
            onInteract={handleAvatarInteract}
          />
        </div>
      </div>

      {/* ── 5. LEFT PANEL: TOOL CLUSTER DECK (Docked Left, In-Place Process Panel & Plugins) ── */}
      <ToolClustersDeck activeProcesses={activeProcesses} dismissProcess={dismissProcess} />

      {/* ── 6. RIGHT PANEL: ACTIVE STREAM FEED (Docked Right, Clean Minimalist Glass) ── */}
      <aside className="absolute right-6 top-18 bottom-24 w-80 lg:w-92 z-20 flex flex-col gap-2.5 pointer-events-auto">
        <div className="flex-1 bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-3.5 shadow-2xl flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex flex-col gap-2 pb-2 mb-2 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                  LIVE RESPONSE
                </h3>
              </div>
              <span className="text-[10px] font-mono text-primary uppercase">
                {isMainLoading ? 'Streaming' : 'Ready'}
              </span>
            </div>

            {/* Voice / Intent Telemetry Bar */}
            <div className="flex items-center justify-between bg-black/40 border border-white/5 px-2.5 py-1 rounded-lg">
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRecording
                      ? 'bg-error animate-ping'
                      : orbStatus === 'speaking'
                        ? 'bg-secondary animate-pulse'
                        : isProcessing
                          ? 'bg-warning animate-spin'
                          : 'bg-primary'
                  }`}
                />
                <span className="text-[9px] font-mono tracking-wider uppercase text-white/70">
                  {orbStatus === 'speaking'
                    ? 'TRANSMITTING'
                    : isRecording
                      ? 'LISTENING MIC'
                      : isProcessing
                        ? 'PROCESSING'
                        : 'STANDBY'}
                </span>
              </div>

              {/* Audio Waveform */}
              <LiveWaveformBars />
            </div>
          </div>

          {/* Stream Response Area */}
          <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col justify-start">
            {currentResponse ? (
              <ResponseArea currentResponse={currentResponse} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/30 font-mono text-xs">
                <Sparkles className="w-5 h-5 mb-2 opacity-30 text-primary" />
                <p>Belum ada respons aktif.</p>
              </div>
            )}
          </div>

          {/* Now Playing Widget */}
          {showMusicWidget && (
            <div
              className={`mt-2 bg-black/60 border border-white/5 rounded-xl p-2.5 flex items-center gap-3 ${
                isMusicAnimatingOut
                  ? 'animate-[holo-dismiss_0.3s_ease-in_forwards]'
                  : 'animate-[holo-project-in_0.3s_ease-out_forwards]'
              }`}
            >
              <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/5 shrink-0">
                {currentTrack?.thumbnail ? (
                  <img
                    src={currentTrack.thumbnail}
                    alt="Album Art"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null
                      e.target.src = musicCoverFallback
                    }}
                  />
                ) : (
                  <img
                    src={musicCoverFallback}
                    alt="Default Album Art"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex flex-col min-w-0 pr-1">
                <span className="text-[8px] font-mono uppercase tracking-wider text-primary font-bold">
                  NOW PLAYING
                </span>
                <h4 className="text-xs font-bold font-mono text-white truncate max-w-50">
                  {currentTrack?.title}
                </h4>
                <p className="text-[10px] font-mono text-white/40 truncate max-w-50">
                  {currentTrack?.artist}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── 7. BOTTOM DOCKED INPUT BAR & SIMPLE THOUGHT TICKER ── */}
      <footer className="absolute inset-x-0 bottom-0 z-40 pointer-events-auto flex flex-col items-center">
        {thought && (
          <div className="w-full max-w-2xl px-4 pb-1 flex items-center justify-center gap-2 pointer-events-none select-none transition-opacity duration-500 animate-[fade-in_0.3s_ease-out]">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse shrink-0" />
            <span className="text-[11px] font-mono italic text-white/45 truncate max-w-lg">
              {thought}
            </span>
          </div>
        )}
        <div className="w-full">
          <InputBar
            sessionId="1"
            onSubmit={(prompt, sendOptions = {}) => {
              setIsSpeak(false)
              handleSubmit(null, prompt, sendOptions)
            }}
            isLoading={isMainLoading}
            isRecording={isRecording}
            isProcessing={isProcessing}
            audioIntensity={audioIntensity}
            onStartRecord={startRecording}
            onStopRecord={stopRecording}
            onStop={() => handleStop(1)}
            source={inputSource}
            workspaceRoot={workspaceRoot}
            onSelectWorkspace={handleSelectWorkspace}
          />
        </div>
      </footer>
    </div>
  )
}

export default MarkHome
