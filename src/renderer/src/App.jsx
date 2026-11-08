import { webApi } from './api/web-bridge.js'
import { useState, useEffect } from 'react'
import MarkHome from './pages/MarkHome'
import Configuration from './pages/Configuration'
import TelegramBot from './pages/TelegramBot'
import Plugins from './pages/Plugins'
import McpAddonDetail from './pages/McpAddonDetail'
import Skills from './pages/Skills'
import SkillEditor from './pages/SkillEditor'
import Guidebook from './pages/Guidebook'
import NeuralCore from './pages/NeuralCore'
import AddonDetailRoute from './pages/AddonDetailRoute'
import Addons from './pages/Addons'
import Subagents from './pages/Subagents'
import ChatStudio from './pages/ChatStudio'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { isMainSession } from '@shared/workspaces.js'
import {
  readInterfaceState,
  saveInterfaceState,
  queueWorkspaceRequest
} from './api/interfaceState.js'
import { useChat } from './contexts/ChatContext'
import { useApproval } from './contexts/ApprovalContext'
import FloatingMenu from './components/core/FloatingMenu'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig } from './api/db'
import { pauseStaleAgentTasks } from './api/taskStore'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    let currentShortcut = 'CommandOrControl+Alt+M'
    let unsubTg = null

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
      window.dispatchEvent(new CustomEvent('mark:wake-personal'))
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
      if (
        actualKey === expectedKey ||
        actualCode === `KEY${expectedKey}` ||
        actualCode === expectedKey
      )
        return true

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
  const navigate = useNavigate()
  const {
    chatData = [],
    runningSessionIds = [],
    setCurrentActiveSessionId,
    toastMessage
  } = useChat()
  const { activeApproval } = useApproval()
  const isPersonal = location.pathname === '/'
  const isAgent = location.pathname === '/chat'
  const isChatMode = isPersonal || isAgent
  const [agentMounted, setAgentMounted] = useState(isAgent)
  const [unread, setUnread] = useState({})
  const [initialMode] = useState(() => readInterfaceState().mode)
  const [lastRoute, setLastRoute] = useState(location.pathname)
  if (lastRoute !== location.pathname) {
    setLastRoute(location.pathname)
    if (isAgent) setAgentMounted(true)
    if (isPersonal || isAgent)
      setUnread((current) => ({ ...current, [isPersonal ? 'personal' : 'agent']: null }))
  }

  useEffect(() => {
    if (
      initialMode === 'agent' &&
      location.pathname === '/' &&
      !window.location.hash &&
      !location.state?.personalRequested
    )
      navigate('/chat', { replace: true })
  }, [])
  useEffect(() => {
    if (isPersonal || isAgent) {
      saveInterfaceState({ mode: isPersonal ? 'personal' : 'agent' })
    }
    if (isPersonal) setCurrentActiveSessionId('1')
  }, [isAgent, isPersonal, setCurrentActiveSessionId])

  useEffect(() => {
    const open = (event) => {
      const id = String(event.detail?.sessionId || '1')
      navigate(isMainSession(id) ? '/' : '/chat?session=' + encodeURIComponent(id), {
        state: { personalRequested: true }
      })
    }
    const wake = () => navigate('/', { state: { personalRequested: true } })
    const coding = (event) => {
      if (event.detail?.sessionId) {
        queueWorkspaceRequest(event.detail)
        open(event)
      }
    }
    const browser = webApi.onBrowserPanel('open-request', (event) => {
      const id = event?.sessionId === 'main' ? '1' : event?.sessionId?.replace(/^workspace-/, '')
      if (id) {
        queueWorkspaceRequest({ sessionId: id, type: 'browser' })
        const mode = isMainSession(id) ? 'personal' : 'agent'
        if (isMainSession(id) ? !isPersonal : !isAgent)
          setUnread((current) => ({ ...current, [mode]: id }))
      }
    })
    const updated = (event) => {
      const id = String(event.detail?.sessionId || '')
      if (!id) return
      const mode = isMainSession(id) ? 'personal' : 'agent'
      if ((mode === 'personal' && isPersonal) || (mode === 'agent' && isAgent)) return
      const last = event.detail?.data?.at(-1)
      if (last && !last.isThinking) setUnread((current) => ({ ...current, [mode]: id }))
    }
    window.addEventListener('mark:open-session', open)
    window.addEventListener('mark:wake-personal', wake)
    window.addEventListener('coding-panel-open', coding)
    window.addEventListener('session-updated', updated)
    return () => {
      browser()
      window.removeEventListener('mark:open-session', open)
      window.removeEventListener('mark:wake-personal', wake)
      window.removeEventListener('coding-panel-open', coding)
      window.removeEventListener('session-updated', updated)
    }
  }, [navigate, isPersonal, isAgent])

  const lastPersonal = chatData.at(-1)
  const personalKey = JSON.stringify([
    lastPersonal?.id,
    lastPersonal?.content,
    lastPersonal?.isThinking
  ])
  const [seenPersonal, setSeenPersonal] = useState(personalKey)
  if (seenPersonal !== personalKey) {
    setSeenPersonal(personalKey)
    if (
      seenPersonal !== '[null,null,null]' &&
      !isPersonal &&
      lastPersonal &&
      !lastPersonal.isThinking
    )
      setUnread((current) => ({ ...current, personal: '1' }))
  }
  const chooseMode = (personal) => {
    const id = unread[personal ? 'personal' : 'agent']
    navigate(personal ? '/' : id ? '/chat?session=' + encodeURIComponent(id) : '/chat', {
      state: { personalRequested: true }
    })
  }
  const approvalSession =
    activeApproval?.meta?.sessionId || activeApproval?.meta?.owner?.codingSessionId
  return (
    <div className="mark-shell">
      {isChatMode && (
        <header className="mark-mode-header">
          <div className="mark-shell-brand">
            <FloatingMenu />
            <span>Mark</span>
          </div>
          <nav aria-label="Mode Mark" className="mark-mode-tabs">
            {[
              ['Personal', true],
              ['Agent', false]
            ].map(([label, personal]) => {
              const running = runningSessionIds.some((id) => isMainSession(id) === personal)
              const newResult = unread[personal ? 'personal' : 'agent']
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={personal ? isPersonal : isAgent}
                  onClick={() => chooseMode(personal)}
                >
                  {label}
                  {(running || newResult) && (
                    <span
                      className="mark-mode-indicator"
                      aria-label={running ? 'Pekerjaan berjalan' : 'Hasil baru'}
                    />
                  )}
                </button>
              )
            })}
          </nav>
          <div className="mark-mode-attention">
            {approvalSession && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  navigate(
                    isMainSession(approvalSession)
                      ? '/'
                      : '/chat?session=' + encodeURIComponent(approvalSession),
                    { state: { personalRequested: true } }
                  )
                }
              >
                Buka permintaan bantuan
              </button>
            )}
          </div>
        </header>
      )}
      <main className="mark-mode-content">
        <section className="mark-mode-view" hidden={!isPersonal} inert={!isPersonal}>
          <MarkHome isHome={isPersonal} />
        </section>
        {agentMounted && (
          <section className="mark-mode-view" hidden={!isAgent} inert={!isAgent}>
            <ChatStudio isOpen={isAgent} />
          </section>
        )}
        {!isChatMode && (
          <section className="mark-mode-view">
            <Routes>
              <Route path="/config" element={<Configuration />} />
              <Route path="/plugins" element={<Plugins />} />
              <Route path="/plugins/:pluginName" element={<Plugins />} />
              <Route path="/plugins/mcp/:id" element={<McpAddonDetail />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/skill-editor/:id" element={<SkillEditor />} />
              <Route path="/telegram-bot" element={<TelegramBot />} />
              <Route path="/addons" element={<Addons />} />
              <Route path="/addons/:addonId" element={<AddonDetailRoute />} />
              <Route
                path="/google-workspace"
                element={<Navigate to="/addons/google-workspace" replace />}
              />
              <Route path="/knowledge" element={<Navigate to="/" replace />} />
              <Route path="/guidebook" element={<Guidebook />} />
              <Route path="/neural-core" element={<NeuralCore />} />
              <Route path="/subagents" element={<Subagents />} />
              <Route path="/subagents/:agentId" element={<Subagents />} />
            </Routes>
          </section>
        )}
      </main>
      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10000] max-w-[calc(100%-32px)] rounded-xl border border-white/10 bg-base-200 px-4 py-3 text-sm shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRecovery(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const checkConfig = async () => {
      // 0. Cek konfigurasi terlebih dahulu: jika fresh install / DB kosong, langsung buka Configuration tanpa loading berat
      try {
        const data = await getAllConfig()
        if (!data || data.length === 0) {
          setHasConfig(false)
          setIsChecking(false)
          return
        }
        setHasConfig(true)
        if (window.api && window.api.syncConfig) {
          window.api.syncConfig(data[0])
        }
      } catch (err) {
        console.error('[App] Failed to check initial config:', err)
      }

      await pauseStaleAgentTasks('app_restart').catch((error) => {
        console.warn('[App] Gagal memulihkan status workflow:', error.message)
      })
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
            Membangunkan Mark…
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

  const isStandalone =
    window.location.hash.includes('telegram-bot') ||
    window.location.hash.includes('/addons/telegram')

  return (
    <HashRouter>
      <ApprovalProvider>
        <YoutubeMusicProvider>
          <ChatProvider>
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
          </ChatProvider>
        </YoutubeMusicProvider>
      </ApprovalProvider>
    </HashRouter>
  )
}

export default App
