import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import WhatsappBot from './pages/WhatsappBot'
import Plugins from './pages/Plugins'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { getAllConfig } from './api/db'
import { runWhatsappAgent } from './api/waAutonomous'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = () => {
      // Force autoStart dengan timestamp agar state selalu unik dan termakan useEffect
      navigate('/live-audio', { state: { autoStart: Date.now() } })
    }

    if (window.api?.onLiveAudioShortcut) {
      window.api.onLiveAudioShortcut(handleShortcut)
    }

    if (window.api?.onWaAdminRequest) {
      window.api.onWaAdminRequest(async (data) => {
        // Simpan ke DB agar Configuration.jsx bisa membaca
        const { getAllConfig, saveConfiguration } = await import('./api/db')
        const configs = await getAllConfig()
        if (configs && configs[0]) {
          const cfg = configs[0]
          const pending = cfg.waPendingAdmins || []
          const existingIdx = pending.findIndex(p => p.id === data.id)
          if (existingIdx !== -1) {
            pending[existingIdx] = data
          } else {
            pending.push(data)
          }
          await saveConfiguration({ ...cfg, waPendingAdmins: pending })
        }
      })
    }

    const handleRouteToConfig = () => {
      navigate('/config', { state: { highlightAdmin: true } })
    }

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('route-to-config', handleRouteToConfig)
    }

    if (window.api?.onWaRequestAgentExecution) {
      window.api.onWaRequestAgentExecution(async (data) => {
        const { text, isAdmin, senderName, jid, isGroup, msgId, chatSession } = data
        const result = await runWhatsappAgent(text, isAdmin, senderName, jid, isGroup, msgId, chatSession)
        window.api.sendWaAgentExecutionDone({ jid, result, msgId })
      })
    }

    if (window.api?.onWaRequestWebSearch) {
      window.api.onWaRequestWebSearch(async ({ id, query }) => {
        console.log('WA Web Search Requested (Global):', query)
        const webview = document.getElementById('global-ai-search-webview')
        if (!webview) {
          window.api.sendWaSearchResult(id, null)
          return
        }
        
        try {
          const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
          webview.src = googleUrl
          
          await new Promise((resolve) => {
            let timeoutId
            const loadStop = () => {
              clearTimeout(timeoutId)
              webview.removeEventListener('dom-ready', loadStop)
              resolve()
            }
            timeoutId = setTimeout(loadStop, 10000)
            webview.addEventListener('dom-ready', loadStop)
          })

          const waitForLoad = (wv) => {
            return new Promise((resolve) => {
              let tId
              const onDone = () => {
                clearTimeout(tId)
                wv.removeEventListener('dom-ready', onDone)
                resolve()
              }
              tId = setTimeout(onDone, 10000)
              wv.addEventListener('dom-ready', onDone)
            })
          }

          const { scrapeGoogle, deepSearch } = await import('./api/scraping.js')
          // onCaptcha dilempar dummy console log karena berjalan di background
          const source = await scrapeGoogle(webview, googleUrl, (isCaptcha) => {
            if(isCaptcha) console.log('WA Web Search: Captcha Detected!')
          })

          const links = []
          for (const urlItem of source) {
            let link = null
            if (urlItem.title === 'AI Google Summary') {
              link = { source: urlItem.title, url: urlItem.link, text: urlItem.snippet }
            } else {
              webview.src = urlItem.link
              await waitForLoad(webview)
              link = await deepSearch(webview, urlItem)
            }
            if (link) links.push(link)
          }

          console.log('WA Web Search Result:', links)
          window.api.sendWaSearchResult(id, links)
        } catch (e) {
          console.error('WA Web Search Error:', e)
          window.api.sendWaSearchResult(id, null)
        }
      })
    }

    return () => {
      if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }
    }
  }, [navigate])

  return null
}

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkConfig = async () => {
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
      <div className="h-screen w-screen bg-base-300 flex flex-col items-center justify-center gap-5">
        <span className="loading loading-infinity w-16 text-primary"></span>
        <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
          Membangunkan Mark...
        </p>
      </div>
    )
  }

  if (!hasConfig) {
    return (
      <Configuration 
        isFirstSetup={true} 
        onSetupComplete={() => setHasConfig(true)} 
      />
    )
  }

  const isStandalone = window.location.hash.includes('whatsapp-bot')

  return (
    <YoutubeMusicProvider>
      <ChatProvider>
        <HashRouter>
          <GlobalListener />
          <div className="h-screen flex flex-col overflow-hidden">
            {!isStandalone && <Navbar />}
            <div className={!isStandalone ? "h-[calc(100vh-4rem)] mt-16" : "h-screen w-full"}>
              <Routes>
                <Route path="/" element={<Chat />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/plugins" element={<Plugins />} />
                <Route path="/live-audio" element={<LiveAudio />} />
                <Route path="/whatsapp-bot" element={<WhatsappBot />} />
              </Routes>
            </div>
          </div>
          <div style={{ display: isStandalone ? 'none' : 'block' }}>
            <YoutubeMusicPlayer />
          </div>
          <webview 
            id="global-ai-search-webview" 
            src="about:blank" 
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            style={{ display: 'none' }} 
          />
        </HashRouter>
      </ChatProvider>
    </YoutubeMusicProvider>
  )
}

export default App
