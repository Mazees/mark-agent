import { useState, useEffect } from 'react'
import MarkHome from './pages/MarkHome'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import TelegramBot from './pages/TelegramBot'
import Plugins from './pages/Plugins'
import Skills from './pages/Skills'
import SkillEditor from './pages/SkillEditor'
import Knowledge from './pages/Knowledge'
import Guidebook from './pages/Guidebook'
import NeuralCore from './pages/NeuralCore'
import GoogleWorkspace from './pages/GoogleWorkspace'
import Subagents from './pages/Subagents'
import ChatStudio from './pages/ChatStudio'
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig } from './api/db'
import { initOramaIndices, hydrateFromDb } from './api/oramaStore'
import { pauseStaleAgentTasks } from './api/taskStore'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    let currentShortcut = 'CommandOrControl+Alt+M'

    const updateConfig = async () => {
      try {
        const data = await getAllConfig()
        if (data && data[0]?.shortcutKey) {
          currentShortcut = data[0].shortcutKey
        }
      } catch (_) {}
    }
    updateConfig()

    const handleConfigUpdated = (e) => {
      if (e?.detail?.shortcutKey) {
        currentShortcut = e.detail.shortcutKey
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)

    const triggerMicShortcut = () => {
      // Dispatch custom event langsung agar didengar oleh useVAD / MarkHome seketika
      window.dispatchEvent(new CustomEvent('trigger-mic-toggle'))
      // Pastikan jika user sedang berada di sub-page atau drawer, kita juga arahkan view ke root Home
      navigate('/')
    }

    const matchesShortcut = (e, shortcutStr) => {
      if (!shortcutStr) return false
      const parts = shortcutStr.split('+').map((p) => p.trim())
      const reqCtrl = parts.some((p) => /^(commandorcontrol|ctrl|control|cmd|meta)$/i.test(p))
      const reqAlt = parts.some((p) => /^alt$/i.test(p))
      const reqShift = parts.some((p) => /^shift$/i.test(p))
      const keyPart = parts.find(
        (p) => !/^(commandorcontrol|ctrl|control|cmd|meta|alt|shift)$/i.test(p)
      )

      if (reqCtrl && !(e.ctrlKey || e.metaKey)) return false
      if (!reqCtrl && (e.ctrlKey || e.metaKey)) return false

      if (reqAlt && !e.altKey) return false
      if (!reqAlt && e.altKey) return false

      if (reqShift && !e.shiftKey) return false
      if (!reqShift && e.shiftKey) return false

      if (!keyPart) return false

      const expectedKey = keyPart.toUpperCase()
      const actualKey = e.key.toUpperCase()
      const actualCode = e.code.toUpperCase()

      if (expectedKey === 'SPACE' && (actualKey === ' ' || actualCode === 'SPACE')) return true
      if (actualKey === expectedKey || actualCode === `KEY${expectedKey}` || actualCode === expectedKey) return true

      return false
    }

    const handleKeyDown = (e) => {
      // Abaikan jika user sedang merekam shortcut di Configuration.jsx
      if (e.target && e.target.tagName === 'INPUT' && e.target.readOnly) return

      if (matchesShortcut(e, currentShortcut)) {
        e.preventDefault()
        e.stopPropagation()
        triggerMicShortcut()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    let unsubTg = null
    if (window.api?.onLiveAudioShortcut) {
      window.api.onLiveAudioShortcut(triggerMicShortcut)
    }

    if (window.api?.onTgRequestAgentExecution) {
      unsubTg = window.api.onTgRequestAgentExecution((data) => {
        window.dispatchEvent(new CustomEvent('tg-admin-message', { detail: data }))
      })
    }

    return () => {
      window.removeEventListener('config-updated', handleConfigUpdated)
      window.removeEventListener('keydown', handleKeyDown, true)
      if (typeof unsubTg === 'function') {
        unsubTg()
      }
      if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('route-to-config')
        window.electron.ipcRenderer.removeAllListeners('tg:request-agent-execution')
      }
    }
  }, [navigate])

  return null
}

const MainLayout = () => {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0f1715] text-[#cac9c9]">
      {/* Base Home Page - Always Mounted so AI Agent & Telegram Listeners Never Die */}
      <div className="h-full w-full">
        <MarkHome />
      </div>

      {/* Floating Glass Sub-page Overlay */}
      {!isHome && (
        <div className="fixed inset-0 z-50 flex flex-col animate-fade-in bg-transparent pointer-events-none">
          <div className="flex-1 pointer-events-auto h-full w-full flex flex-col min-h-0 overflow-hidden">
            <Routes>
              <Route path="/chat" element={<ChatStudio />} />
              <Route path="/config" element={<Configuration />} />
              <Route path="/plugins" element={<Plugins />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/skill-editor/:id" element={<SkillEditor />} />
              <Route path="/live-audio" element={<LiveAudio />} />
              <Route path="/telegram-bot" element={<TelegramBot />} />
              <Route path="/google-workspace" element={<GoogleWorkspace />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/guidebook" element={<Guidebook />} />
              <Route path="/neural-core" element={<NeuralCore />} />
              <Route path="/subagents" element={<Subagents />} />
            </Routes>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [loadingText, setLoadingText] = useState('Membangunkan Mark...')
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRecovery(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const checkConfig = async () => {
      // 1. Init Orama and Hydrate from Database
      try {
        setLoadingText('Memuat Knowledge Base...')
        await initOramaIndices()
        await hydrateFromDb((current, total) => {
          setLoadingText(`Mengindeks memori percakapan lama (${current}/${total})...`)
        })
        // Recovery saat boot: task yang terputus tidak boleh tetap berstatus running.
        const pausedTaskCount = await pauseStaleAgentTasks('app_restart')
        if (pausedTaskCount > 0) {
          console.log(`[App] ${pausedTaskCount} durable task dipause setelah restart.`)
        }
        console.log('[App] Orama indices ready!')
      } catch (e) {
        console.error('[App] Failed to init Orama:', e)
      }

      // 1.5 Load Embeddings Model
      try {
        setLoadingText('Memuat Memori Kognitif...')
        const { getExtractor } = await import('./api/vectorMemory')
        let memStats = {}
        await getExtractor((info) => {
          if (info.status === 'initiate') {
            memStats[info.file] = { loaded: 0, total: info.total || 0 }
          } else if (info.status === 'progress') {
            if (memStats[info.file]) {
              memStats[info.file].loaded = info.loaded
              memStats[info.file].total = info.total
            }
            const values = Object.values(memStats)
            const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
            const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
            if (totalBytes > 0) {
              const percent = Math.round((loadedBytes / totalBytes) * 100)
              const loadedMB = (loadedBytes / 1024 / 1024).toFixed(1)
              const totalMB = (totalBytes / 1024 / 1024).toFixed(1)
              setLoadingText(`Mengunduh Memori AI... ${percent}% (${loadedMB}MB / ${totalMB}MB)`)
            }
          } else if (info.status === 'done' || info.status === 'ready') {
            setLoadingText('Membangunkan Mark...')
          }
        })
      } catch (e) {
        console.error('[App] Failed to load Transformers:', e)
      }

      // 2. Load config
      const data = await getAllConfig()
      if (!data || data.length === 0) {
        setHasConfig(false)
      } else {
        setHasConfig(true)
        if (window.api && window.api.syncConfig) {
          window.api.syncConfig(data[0])
        }
      }
      setIsChecking(false)
    }
    checkConfig()
  }, [])

  if (isChecking) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-base-300 rounded-xl flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse text-center px-4">
            {loadingText}
          </p>
          {showRecovery && (
            <div className="absolute bottom-10 flex flex-col items-center animate-fade-in">
              <p className="text-xs text-white/40 mb-3 text-center max-w-xs">
                Proses pemuatan memakan waktu lebih lama dari biasanya. Jika terjebak, bersihkan
                cache model.
              </p>
              <button
                onClick={async () => {
                  try {
                    await caches.delete('transformers-cache')
                    console.log('Cache cleared')
                    window.location.reload()
                  } catch (e) {
                    console.error('Failed to clear cache', e)
                    window.location.reload()
                  }
                }}
                className="btn btn-outline btn-error btn-sm"
              >
                Hapus Cache Model & Muat Ulang
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!hasConfig) {
    return <Configuration isFirstSetup={true} onSetupComplete={() => window.location.reload()} />
  }

  const isStandalone = window.location.hash.includes('telegram-bot')

  return (
    <ApprovalProvider>
      <YoutubeMusicProvider>
        <ChatProvider>
          <HashRouter>
            <GlobalListener />
            <MainLayout />
            <div style={{ display: isStandalone ? 'none' : 'block' }}>
              <YoutubeMusicPlayer />
            </div>
            <GlobalCameraManager />
            <webview
              id="global-ai-search-webview"
              src="about:blank"
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
              style={{ display: 'none' }}
            />
          </HashRouter>
        </ChatProvider>
      </YoutubeMusicProvider>
    </ApprovalProvider>
  )
}

export default App
