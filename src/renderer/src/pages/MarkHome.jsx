import React, { useEffect, useState } from 'react'
import { useChat } from '../contexts/ChatContext'
import OrbVisualizer, { getMoodColor } from '../components/core/OrbVisualizer'
import InputBar from '../components/core/InputBar'
import ResponseArea from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import ToolClustersDeck from '../components/core/ToolClustersDeck'
import { SolarSystemCanvas } from '../components/core/SolarSystemCanvas'
import BrowserPreviewWidget from '../components/core/BrowserPreviewWidget'
import { ChatStudioModal } from '../components/core/ChatStudioModal'
import {
  MessageSquare,
  Sparkles,
  Terminal,
  Brain
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import musicCoverFallback from '../assets/music-cover.png'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useVAD } from '../hooks/useVAD'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { db, setSessionWorkspace, getAllConfig } from '../api/db'

const MarkHome = () => {
  const navigate = useNavigate()
  const chatContext = useChat()
  const {
    chatData,
    message,
    setMessage,
    isLoading,
    isAgentBusy,
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
    requestCameraCaptureRef
  } = chatContext
  const { isPlaying, currentTrack } = useYoutubeMusic()
  useMemoryGroomer(true)

  const [isChatStudioOpen, setIsChatStudioOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false)
  const [ttsIntensity, setTtsIntensity] = useState(0)
  const [workspaceRoot, setWorkspaceRoot] = useState(null)
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(65)

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
    window.addEventListener('config-updated', handleConfigUpdated)
    return () => window.removeEventListener('config-updated', handleConfigUpdated)
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
    const handleTtsIntensity = (e) => {
      setTtsIntensity(e.detail || 0)
      if (window.isMarkSpeaking) {
        setOrbStatus('speaking')
      } else {
        setOrbStatus((prev) => (prev === 'speaking' ? 'idle' : prev))
      }
    }
    window.addEventListener('mark-intensity', handleTtsIntensity)
    return () => window.removeEventListener('mark-intensity', handleTtsIntensity)
  }, [setOrbStatus])

  useEffect(() => {
    const handleOpenMap = () => navigate('/neural-core?tab=synaptic')
    const handleOpenChat = () => setIsChatStudioOpen(true)

    window.addEventListener('open-memory-map', handleOpenMap)
    window.addEventListener('open-chat-studio', handleOpenChat)

    return () => {
      window.removeEventListener('open-memory-map', handleOpenMap)
      window.removeEventListener('open-chat-studio', handleOpenChat)
    }
  }, [navigate])

  const handleVoiceTranscript = (text, meta = {}) => {
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
    toastMessage
  } = useVAD({
    onTranscript: handleVoiceTranscript
  })

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
    if (isRecording) {
      setOrbStatus('listening')
    } else if (isProcessing) {
      setOrbStatus('thinking')
    } else if (isLoading) {
      const lastMsg = chatData[chatData.length - 1]
      if (
        lastMsg?.isThinking ||
        lastMsg?.isSearching ||
        (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin'))
      ) {
        setOrbStatus('thinking')
      } else {
        setOrbStatus('listening')
      }
    } else {
      setOrbStatus('idle')
    }
  }, [isLoading, chatData, isRecording, isProcessing, setOrbStatus])

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
            type: lastItem.content?.length > 200 || lastItem.content?.includes('\n') ? 'long' : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood
          })
        }
      } else {
        if (isLoading) {
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
  }, [chatData, isLoading, isSpeak, setOrbStatus])

  const handleSubmit = (e, text) => {
    if (chatContext.handleSubmit) {
      chatContext.handleSubmit(e, text)
    } else {
      const sendText = typeof text === 'string' && text.trim() ? text.trim() : message.trim()
      if (sendText) {
        handlePlanningCommand(sendText)
      }
    }
  }

  const mood = currentResponse?.mood || 'neutral'
  const { hex: bgGlowColor } = getMoodColor(mood, orbStatus)

  return (
    <div className="h-screen w-screen text-white overflow-hidden relative bg-[#060a08]">
      {/* ── 1. LAYER 1: Deep Cosmos Solar System Canvas (Pusat di width/2, height/2) ── */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
        <SolarSystemCanvas
          processes={activeProcesses}
          moodColor={bgGlowColor}
          orbStatus={orbStatus}
          className="w-full h-full"
        />
      </div>

      {/* ── 2. LAYER 2: Dynamic Background Overlay Tint ── */}
      <div
        className="absolute inset-0 z-5 pointer-events-none transition-colors duration-300 backdrop-blur-[1px]"
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
            onClick={() => setIsChatStudioOpen(true)}
            className="h-8 px-3 bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-2 transition-all text-white/80 hover:text-white rounded-xl cursor-pointer text-xs font-mono font-semibold"
            title="Buka Chat Studio"
          >
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
            <span className="hidden md:inline">Studio</span>
          </button>
        </div>
      </header>

      {/* Global Notifications & Telemetry Popups */}
      <StatusIndicator notifications={notifications} />
      <BrowserPreviewWidget />

      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg text-xs font-mono">
          {toastMessage}
        </div>
      )}

      {/* ── 4. CENTER AVATAR (Diletakkan Tepat di Pusat 50% Layar = Pusat Sun Tata Surya) ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center pointer-events-none select-none">
        {/* Orb Visualizer (Compact and centered) */}
        <div className="scale-75 md:scale-80 lg:scale-85 pointer-events-auto cursor-pointer transition-transform duration-300">
          <OrbVisualizer
            status={orbStatus}
            intensity={orbStatus === 'speaking' ? ttsIntensity : 0}
            mood={mood}
          />
        </div>
      </div>

      {/* ── 5. LEFT PANEL: TOOL CLUSTER DECK (Docked Left, In-Place Process Panel & Plugins) ── */}
      <ToolClustersDeck
        activeProcesses={activeProcesses}
        dismissProcess={dismissProcess}
      />

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
                {isLoading ? 'Streaming' : 'Ready'}
              </span>
            </div>

            {/* Live Audio / Intent Telemetry Bar */}
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
              <div className="flex items-center gap-0.5 h-2.5">
                {Array.from({ length: 6 }).map((_, i) => {
                  const val =
                    orbStatus === 'speaking'
                      ? Math.sin(Date.now() * 0.01 + i) * ttsIntensity * 8
                      : isRecording
                        ? audioIntensity * (i % 2 === 0 ? 8 : 4)
                        : 1.5
                  return (
                    <span
                      key={i}
                      className="w-0.5 bg-primary/70 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(2, Math.min(10, val + 2))}px` }}
                    />
                  )
                })}
              </div>
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

      {/* ── 7. BOTTOM DOCKED INPUT BAR ── */}
      <footer className="absolute inset-x-0 bottom-0 z-40 pointer-events-auto">
        <InputBar
          onSubmit={(prompt) => {
            setIsSpeak(false)
            handleSubmit(prompt)
          }}
          isLoading={isLoading || isAgentBusy}
          isRecording={isRecording}
          isProcessing={isProcessing}
          audioIntensity={audioIntensity}
          onStartRecord={startRecording}
          onStopRecord={stopRecording}
          onStop={handleStop}
          source={inputSource}
          workspaceRoot={workspaceRoot}
          onSelectWorkspace={handleSelectWorkspace}
        />
      </footer>

      {/* Modals */}
      <ChatStudioModal
        isOpen={isChatStudioOpen}
        onClose={() => setIsChatStudioOpen(false)}
        chatContext={chatContext}
      />
    </div>
  )
}

export default MarkHome
