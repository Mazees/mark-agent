import React, { useRef, useEffect, useState } from 'react'
import { useTelegramBot } from '../hooks/telegram/useTelegramBot'
import { FaTelegram, FaPlug, FaStop, FaCog, FaSave, FaTimes } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from '../components/Chat/CodeBlock'
import { useNavigate } from 'react-router-dom'
import { getAllConfig, saveConfiguration } from '../api/db'
import { webApi } from '../api/web-bridge'

const TelegramBot = () => {
  const { status, messages, isThinking, currentSender, startBot, stopBot } = useTelegramBot()
  const navigate = useNavigate()

  const [tokenInput, setTokenInput] = useState('')
  const [adminIdsInput, setAdminIdsInput] = useState('')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const messagesEndRef = useRef(null)
  const hasAutoConnectedRef = useRef(false)

  const loadConfigData = async () => {
    try {
      const configs = await getAllConfig()
      const config = configs[0] || {}
      if (config.tgBotToken) {
        setTokenInput(config.tgBotToken)
      }
      if (config.tgAdminIds) {
        setAdminIdsInput(config.tgAdminIds)
      }
      return config
    } catch (err) {
      console.error('[TelegramBot] Error loading config:', err)
      return {}
    }
  }

  useEffect(() => {
    loadConfigData().then(async (config) => {
      if (config.tgBotToken && !hasAutoConnectedRef.current) {
        hasAutoConnectedRef.current = true
        const res = await webApi.tgGetStatus()
        if (!res || res.status === 'disconnected') {
          startBot(config.tgBotToken)
        }
      }
    })
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 150)
    return () => clearTimeout(timeout)
  }, [messages, isThinking])

  const handleSaveConfigAndConnect = async () => {
    const token = tokenInput.trim()
    const adminIds = adminIdsInput.trim()

    if (!token) {
      alert('Silakan masukkan Telegram Bot Token terlebih dahulu.')
      return
    }

    try {
      const configs = await getAllConfig()
      const currentCfg = configs[0] || {}
      const newCfg = { ...currentCfg, tgBotToken: token, tgAdminIds: adminIds }
      await saveConfiguration(newCfg)
      await webApi.syncConfig(newCfg)
      setShowConfigModal(false)
      startBot(token)
    } catch (e) {
      console.error('[TelegramBot] Gagal simpan pengaturan Telegram:', e)
      alert('Gagal menyimpan pengaturan: ' + e.message)
    }
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar flex flex-col">
        <div className="max-w-4xl mx-auto px-4 py-8 pb-32 space-y-6 w-full flex-1 flex flex-col">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
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
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold">Telegram Bot Monitor</h1>
                  <div className="flex items-center gap-1.5 text-xs bg-base-200/80 px-2.5 py-0.5 rounded-full border border-base-content/10 font-mono">
                    <div
                      className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-error'}`}
                    />
                    <span className="capitalize text-xs">{status}</span>
                  </div>
                </div>
                <p className="opacity-50 text-sm mt-1">Kelola dan pantau interaksi Mark via Telegram.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  loadConfigData()
                  setShowConfigModal(true)
                }}
                className="btn btn-sm btn-ghost gap-2 border border-base-content/10"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Buka Pengaturan Telegram Token & Admin"
              >
                <FaCog /> Pengaturan
              </button>
              {status === 'disconnected' && (
                <button
                  type="button"
                  onClick={handleSaveConfigAndConnect}
                  className="btn btn-sm btn-info text-white gap-1.5"
                  style={{ WebkitAppRegion: 'no-drag' }}
                >
                  <FaPlug /> Connect
                </button>
              )}
              {(status === 'connected' || status === 'connecting') && (
                <button
                  type="button"
                  onClick={stopBot}
                  className="btn btn-sm btn-outline btn-error gap-1.5"
                  style={{ WebkitAppRegion: 'no-drag' }}
                >
                  <FaStop /> Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto w-full flex flex-col gap-4">
        {status === 'disconnected' && (
          <div className="card bg-base-200 shadow-xl border border-white/10 p-6 max-w-md mx-auto my-auto text-center space-y-4">
            <FaTelegram className="text-6xl text-info mx-auto" />
            <h2 className="text-xl font-bold">Sambungkan Telegram Bot</h2>
            <p className="text-sm opacity-70">
              Masukkan API Bot Token dari <b>@BotFather</b> di Telegram.
            </p>
            <div className="space-y-3 text-left">
              <div>
                <label className="text-xs font-semibold opacity-70 block mb-1">Bot Token</label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="input input-bordered w-full font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold opacity-70 block mb-1">
                  Telegram Admin Usernames
                </label>
                <input
                  type="text"
                  placeholder="@username1, @username2"
                  value={adminIdsInput}
                  onChange={(e) => setAdminIdsInput(e.target.value)}
                  className="input input-bordered w-full font-mono text-sm"
                />
                <span className="text-[10px] opacity-60 block mt-1">
                  Masukkan username Telegram (@username). Pisahkan dengan koma jika lebih dari satu.
                </span>
              </div>
            </div>
            <button onClick={handleSaveConfigAndConnect} className="btn btn-info text-white w-full">
              <FaPlug /> Simpan & Hubungkan Bot
            </button>
          </div>
        )}

        {status === 'connected' && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40 select-none">
            <FaTelegram className="text-6xl mb-4 text-info" />
            <p className="text-lg font-semibold">Menunggu Pesan Masuk</p>
            <p className="text-sm">Bot terhubung. Pantau aktivitas Telegram di sini.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat ${msg.type === 'outgoing' ? 'chat-end' : 'chat-start'} animate-fade-in`}
          >
            <div className="chat-header opacity-50 text-xs mb-1">
              {msg.sender}
              <time className="text-xs ml-2">{msg.time}</time>
            </div>
            <div
              className={`chat-bubble flex flex-col gap-1 ${msg.type === 'outgoing' ? 'chat-bubble-info text-info-content' : 'bg-base-300 text-base-content'}`}
            >
              <div className="text-sm custom-markdown overflow-x-hidden">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
                  ]}
                  components={{
                    code: CodeBlock
                  }}
                >
                  {msg.type === 'outgoing' ? msg.reply : msg.text}
                </Markdown>
                {msg.type === 'outgoing' && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {msg.toolsUsed.map((tool, i) => (
                      <span
                        key={i}
                        className="badge badge-sm text-white badge-accent badge-outline text-[10px] font-mono ml-auto"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="chat chat-end animate-fade-in">
            <div className="chat-header opacity-50 text-xs mb-1">
              Mark sedang memproses pesan {currentSender}...
            </div>
            <div className="chat-bubble chat-bubble-info bg-info/20 text-info border border-info/30">
              <span className="loading loading-dots loading-sm"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Telegram Configuration Modal */}
      {showConfigModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-200 border border-white/10 max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2 text-info">
                <FaTelegram /> Pengaturan Telegram Bot
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="btn btn-sm btn-circle btn-ghost"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-semibold">Telegram Bot Token</span>
                </label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="input input-bordered w-full font-mono text-sm"
                />
                <span className="text-xs opacity-60 mt-1">
                  Dapatkan token dari akun resmi <b>@BotFather</b> di Telegram.
                </span>
              </div>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-semibold">Telegram Admin Usernames</span>
                </label>
                <input
                  type="text"
                  placeholder="@username1, @username2"
                  value={adminIdsInput}
                  onChange={(e) => setAdminIdsInput(e.target.value)}
                  className="input input-bordered w-full font-mono text-sm"
                />
                <span className="text-xs opacity-60 mt-1">
                  Daftar username Telegram (@username) yang diizinkan mengontrol Mark. Pisahkan dengan koma.
                </span>
              </div>

              <div className="alert alert-info bg-info/10 border-info/30 text-xs text-white">
                <span>
                  Buka aplikasi Telegram & ketik <b>/start</b> ke bot kamu setidaknya 1x agar bot
                  bisa mencatat Chat ID kamu untuk mengirim balasan & notifikasi dari PC.
                </span>
              </div>
            </div>

            <div className="modal-action mt-6">
              <button onClick={() => setShowConfigModal(false)} className="btn btn-ghost">
                Batal
              </button>
              <button
                onClick={handleSaveConfigAndConnect}
                className="btn btn-info text-white gap-2"
              >
                <FaSave /> Simpan & Hubungkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TelegramBot
