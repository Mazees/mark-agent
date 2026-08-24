import React, { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import OrbVisualizer from '../components/core/OrbVisualizer'
import InputBar from '../components/core/InputBar'
import ResponseArea from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import HistoryDrawer from '../components/core/HistoryDrawer'
import ProcessPanel from '../components/core/ProcessPanel'
import ThoughtNeuralFlow from '../components/core/ThoughtNeuralFlow'
import MemoryVisualizer from '../components/core/MemoryVisualizer'
import BrowserPreviewWidget from '../components/core/BrowserPreviewWidget'
import { ChatStudioModal } from '../components/core/ChatStudioModal'
import { MessageSquare } from 'lucide-react'
import musicCoverFallback from '../assets/music-cover.png'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useVAD } from '../hooks/useVAD'
import { useWakeWord } from '../hooks/useWakeWord'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { db, setSessionWorkspace } from '../api/db'
import { cleanSpokenCommand } from '../api/wakeWord'

const MarkHome = () => {
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
    requestCameraCaptureRef,
    config
  } = chatContext
  const { isPlaying, currentTrack, isPlayerOpen } = useYoutubeMusic()
  useMemoryGroomer(true) // Aktifkan Hippocampus Engine

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isChatStudioOpen, setIsChatStudioOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false)
  const [isMaxWindow, setIsMaxWindow] = useState(false)
  const [ttsIntensity, setTtsIntensity] = useState(0)
  const [workspaceRoot, setWorkspaceRoot] = useState(null)

  useEffect(() => {
    db.sessions
      .get(1)
      .then((s) => {
        if (s?.workspaceRoot) setWorkspaceRoot(s.workspaceRoot)
      })
      .catch(() => {})
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
    if (window.api?.onWindowMaximized) {
      window.api.onWindowMaximized((isMax) => {
        setIsMaxWindow(isMax)
      })
    }

    const handleOpenMap = () => setIsMemoryMapOpen(true)
    const handleOpenChat = () => setIsChatStudioOpen(true)

    window.addEventListener('open-memory-map', handleOpenMap)
    window.addEventListener('open-chat-studio', handleOpenChat)

    return () => {
      window.removeEventListener('open-memory-map', handleOpenMap)
      window.removeEventListener('open-chat-studio', handleOpenChat)
    }
  }, [])

  const handleVoiceTranscript = React.useCallback(
    (text) => {
      console.log('[MarkHome] handleVoiceTranscript called with text:', text)
      if (!text || !text.trim()) return
      const prefixedText = `(Mikrofon) ${text.trim()}`
      setMessage(prefixedText)
      setIsSpeak(true)
      handlePlanningCommand(prefixedText, null, false, null, { forceSpeak: true })
    },
    [handlePlanningCommand, setMessage, setIsSpeak]
  )

  const {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording,
    stopRecording,
    toastMessage,
    sttLang,
    setSttLang
  } = useVAD({
    onTranscript: handleVoiceTranscript
  })

  // Dengarkan shortcut global (Ctrl+Alt+M) untuk toggle mic manual
  useEffect(() => {
    if (window.api?.onTriggerLiveAudio) {
      const unlisten = window.api.onTriggerLiveAudio(() => {
        toggleRecording()
      })
      return () => {
        if (typeof unlisten === 'function') unlisten()
      }
    }
  }, [toggleRecording])

  // Dengarkan Emergency Stop PC Automation (Ctrl+Shift+S)
  useEffect(() => {
    if (window.api?.onPCEmergencyStop) {
      const unlisten = window.api.onPCEmergencyStop(() => {
        console.log('[MarkHome] Emergency Stop (Ctrl+Shift+S) triggered! Aborting agent plan...')
        handleStop()
      })
      return () => {
        if (typeof unlisten === 'function') unlisten()
      }
    }
  }, [handleStop])

  // Integrasi Panggilan Suara Wake Word ("Hey Mark" / "Halo Mark")
  const handleWakeWordTriggered = React.useCallback(
    ({ command, wakePhrase }) => {
      console.log('[MarkHome] Wake word detected:', wakePhrase, 'Command:', command)
      const cleanCmd = cleanSpokenCommand(command)
      if (cleanCmd && cleanCmd.length >= 2) {
        // Inline command: misal "Hey Mark, tolong putar musik"
        handleVoiceTranscript(cleanCmd)
      } else {
        // Panggilan nama saja: "Hey Mark" -> jeda sejenak untuk membersihkan sisa suara, lalu aktifkan mikrofon interaktif
        setTimeout(() => {
          startRecording()
        }, 250)
      }
    },
    [handleVoiceTranscript, startRecording]
  )

  const { isWakeWordRunning } = useWakeWord({
    isInteractiveMicActive: isRecording,
    isAgentBusy: isLoading || isAgentBusy,
    onWakeWordTriggered: handleWakeWordTriggered
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
        }, 500) // Match the holo-dismiss duration
        return () => clearTimeout(timer)
      }
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget])

  // Sync orb status based on isLoading, isRecording, and isProcessing
  useEffect(() => {
    if (isRecording) {
      setOrbStatus('listening')
    } else if (isProcessing) {
      setOrbStatus('thinking')
    } else if (isLoading) {
      // If last message is thinking, then thinking. Else speaking/executing
      const lastMsg = chatData[chatData.length - 1]
      if (lastMsg?.isThinking) {
        setOrbStatus('thinking')
      } else if (lastMsg?.isSearching) {
        setOrbStatus('thinking')
      } else if (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin')) {
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
          // It's a loading state, we might show a short text
          setCurrentResponse({
            text: lastItem.content || 'Memproses instruksi...',
            type: 'short',
            isThinking: true,
            mood: lastItem.mood || 'neutral'
          })
        } else {
          // Final response
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

          // State 'speaking' kini diatur otomatis oleh event mark-intensity
          // sehingga getaran & status sinkron 100% dengan durasi audio TTS sebenarnya.
        }
      } else {
        // User message, we can clear current response or show "Processing..."
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
      // Empty chat
      setCurrentResponse({
        text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
        type: 'short'
      })
    }
  }, [chatData, isLoading, isSpeak, setOrbStatus])

  const handleSubmit = (e, text) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    const sendText =
      typeof text === 'string' && text.trim()
        ? text.trim()
        : typeof e === 'string' && e.trim()
          ? e.trim()
          : message.trim()
    if (sendText) {
      handlePlanningCommand(sendText)
    }
  }
  const mood = currentResponse?.mood || 'neutral'
  let bgGlowColor = 'var(--color-primary)'
  if (orbStatus === 'error') {
    bgGlowColor = '#ef4444'
  } else {
    switch (mood) {
      case 'joy':
        bgGlowColor = '#facc15'
        break
      case 'sadness':
        bgGlowColor = '#3b82f6'
        break
      case 'fear':
        bgGlowColor = '#a855f7'
        break
      case 'anger':
        bgGlowColor = '#ef4444'
        break
      case 'disgust':
        bgGlowColor = '#84cc16'
        break
      case 'anxiety':
        bgGlowColor = '#f97316'
        break
      case 'envy':
        bgGlowColor = '#14b8a6'
        break
      case 'embarrassment':
        bgGlowColor = '#ec4899'
        break
      case 'ennui':
        bgGlowColor = '#6b7280'
        break
      default:
        bgGlowColor = 'var(--color-primary)'
        break
    }
  }

  return (
    <div
      className="h-screen text-white overflow-hidden relative transition-colors duration-1000 bg-transparent rounded-xl border border-white/5 shadow-2xl"
      style={{
        backgroundColor: `color-mix(in srgb, ${bgGlowColor} 12%, rgba(0,0,0,${config?.[0]?.windowOpacity ?? 0.85}))`
      }}
    >
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-slow-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
      `}</style>

      {/* Subtle Hologram Scanlines & Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-20 pointer-events-none mix-blend-overlay z-0" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03] pointer-events-none mix-blend-screen z-0" />

      {isBooting && (
        <div className="fixed inset-0 bg-base-300 flex flex-col items-center justify-center gap-5 z-[999]">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
            Membangunkan Mark...
          </p>
        </div>
      )}

      {/* Floating UI Elements */}
      <FloatingMenu onOpenHistory={() => setIsHistoryOpen(true)} />
      <button
        onClick={() => setIsChatStudioOpen(true)}
        className="fixed top-8 left-22 z-50 h-12 px-3.5 btn btn-outline bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] flex items-center gap-2 transition-all shadow-lg hover:shadow-[0_0_15px_oklch(var(--p)/0.3)] text-white/80 hover:text-white rounded-xl"
        title="Buka Chat Studio (Multi-Session Bubble Chat)"
      >
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold hidden md:inline">Studio</span>
      </button>
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />
      <BrowserPreviewWidget />

      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col md:flex-row w-full h-full px-4 lg:px-12 pb-[120px] overflow-hidden">
        {/* Left Panel: The Orb & Neural Flow (Fixed) */}
        <div className="w-full md:w-1/2 h-[40vh] md:h-full flex flex-col items-center justify-center relative">
          <div
            className="relative flex items-center justify-center w-full max-w-lg h-64 md:h-96"
            style={{
              transform: isMaxWindow ? 'scale(1)' : 'scale(0.6)',
              transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
              marginTop: isMaxWindow ? '0' : '-2rem'
            }}
          >
            {/* Jarvis-Style Holographic HUD centered around Orb */}
            <div className="absolute inset-0 m-auto flex items-center justify-center pointer-events-none mix-blend-screen opacity-50 z-0 scale-125">
              <svg viewBox="0 0 500 500" className="w-[500px] h-[500px] absolute">
                {/* Outer Ring */}
                <circle
                  cx="250"
                  cy="250"
                  r="230"
                  fill="none"
                  stroke={bgGlowColor}
                  strokeWidth="1"
                  strokeDasharray="2 10"
                  className="origin-center animate-[spin-slow_40s_linear_infinite]"
                />

                {/* Middle Segmented Ring */}
                <circle
                  cx="250"
                  cy="250"
                  r="180"
                  fill="none"
                  stroke={bgGlowColor}
                  strokeWidth="2"
                  strokeDasharray="80 20 10 20"
                  className="origin-center animate-[spin-slow-reverse_30s_linear_infinite]"
                />

                {/* Inner Ring */}
                <circle
                  cx="250"
                  cy="250"
                  r="140"
                  fill="none"
                  stroke={bgGlowColor}
                  strokeWidth="1"
                  strokeDasharray="5 15"
                  className="origin-center animate-[spin-slow_20s_linear_infinite]"
                />

                {/* Solid Inner Border */}
                <circle
                  cx="250"
                  cy="250"
                  r="125"
                  fill="none"
                  stroke={bgGlowColor}
                  strokeWidth="0.5"
                  className="opacity-50"
                />

                {/* Crosshairs */}
                <line
                  x1="250"
                  y1="0"
                  x2="250"
                  y2="110"
                  stroke={bgGlowColor}
                  strokeWidth="0.5"
                  className="opacity-40"
                />
                <line
                  x1="250"
                  y1="390"
                  x2="250"
                  y2="500"
                  stroke={bgGlowColor}
                  strokeWidth="0.5"
                  className="opacity-40"
                />
                <line
                  x1="0"
                  y1="250"
                  x2="110"
                  y2="250"
                  stroke={bgGlowColor}
                  strokeWidth="0.5"
                  className="opacity-40"
                />
                <line
                  x1="390"
                  y1="250"
                  x2="500"
                  y2="250"
                  stroke={bgGlowColor}
                  strokeWidth="0.5"
                  className="opacity-40"
                />

                {/* Decorative Tech Nodes */}
                <circle cx="250" cy="20" r="3" fill={bgGlowColor} />
                <circle cx="250" cy="480" r="3" fill={bgGlowColor} />
                <circle cx="20" cy="250" r="3" fill={bgGlowColor} />
                <circle cx="480" cy="250" r="3" fill={bgGlowColor} />
              </svg>
            </div>

            <ThoughtNeuralFlow processes={activeProcesses} />
            <div className="z-10 relative">
              <OrbVisualizer
                status={orbStatus}
                intensity={orbStatus === 'speaking' ? ttsIntensity : 0}
                mood={currentResponse?.mood || 'neutral'}
              />
            </div>
          </div>
        </div>

        {/* Right Panel: Dynamic Response Area (Scrollable) */}
        <div
          className="w-full md:w-1/2 h-full flex flex-col overflow-y-auto no-scrollbar md:pl-8 md:pr-4"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent, black 3rem, black calc(100% - 3rem), transparent)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent, black 3rem, black calc(100% - 3rem), transparent)'
          }}
        >
          <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-start transition-all duration-500 ease-in-out pt-[10vh] pb-20 min-h-full">
            {currentResponse && <ResponseArea currentResponse={currentResponse} />}

            {/* Centered Now Playing Info */}
            {showMusicWidget && (
              <div
                className={`mt-8 flex flex-col items-center ${isMusicAnimatingOut ? 'animate-[holo-dismiss_0.5s_ease-in_forwards]' : 'animate-[holo-project-in_0.5s_ease-out_forwards]'}`}
              >
                <div className="relative group w-48 h-48 mb-4 rounded-sm overflow-hidden border border-white/10 shadow-2xl shadow-primary/20">
                  {/* HUD Brackets */}
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/30 pointer-events-none z-10" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/30 pointer-events-none z-10" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/30 pointer-events-none z-10" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/30 pointer-events-none z-10" />
                  {currentTrack.thumbnail ? (
                    <img
                      src={currentTrack.thumbnail}
                      alt="Album Art"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.src = musicCoverFallback
                      }}
                    />
                  ) : (
                    <img
                      src={musicCoverFallback}
                      alt="Default Album Art"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  )}
                  {/* Audio visualizer overlay */}
                  {isPlaying && (
                    <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-4 gap-1">
                      <span
                        className="w-1.5 h-4 bg-primary rounded-t-full animate-[music-bar_1s_ease-in-out_infinite]"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <span
                        className="w-1.5 h-6 bg-primary rounded-t-full animate-[music-bar_1.2s_ease-in-out_infinite]"
                        style={{ animationDelay: '0.3s' }}
                      />
                      <span
                        className="w-1.5 h-3 bg-primary rounded-t-full animate-[music-bar_0.8s_ease-in-out_infinite]"
                        style={{ animationDelay: '0.2s' }}
                      />
                      <span
                        className="w-1.5 h-5 bg-primary rounded-t-full animate-[music-bar_1.1s_ease-in-out_infinite]"
                        style={{ animationDelay: '0.4s' }}
                      />
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white text-center max-w-md truncate">
                  {currentTrack.title}
                </h3>
                <p className="text-sm text-white/50 text-center max-w-sm truncate mt-1">
                  {currentTrack.artist}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Input Area */}
      <InputBar
        onSubmit={(prompt) => {
          setIsSpeak(false) // Typing submit disables voice auto-reply
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

      {/* Slide-out Drawers & Modals */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      <MemoryVisualizer isOpen={isMemoryMapOpen} onClose={() => setIsMemoryMapOpen(false)} />

      <ChatStudioModal
        isOpen={isChatStudioOpen}
        onClose={() => setIsChatStudioOpen(false)}
        chatContext={chatContext}
      />
    </div>
  )
}

export default MarkHome
