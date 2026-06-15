import React, { useRef, useEffect } from 'react'
import { useWhatsappBot } from '../hooks/whatsapp/useWhatsappBot'
import { FaWhatsapp, FaQrcode, FaPlug, FaSignOutAlt } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from '../components/Chat/CodeBlock'

const WhatsappBot = () => {
  const { status, qrCode, messages, isThinking, currentSender, startBot, logout } = useWhatsappBot()

  const messagesEndRef = useRef(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 150)
    return () => clearTimeout(timeout)
  }, [messages, isThinking])

  return (
    <div className="relative w-full h-full flex flex-col bg-base-100/50">
      {/* Header */}
      <div className="navbar bg-base-300/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-0">
        <div className="flex-1">
          <div className="flex items-center gap-3 px-4">
            <div className="avatar">
              <div className="w-10 rounded-full bg-success/20 p-2 text-success flex items-center justify-center">
                <FaWhatsapp size={24} />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-lg text-base-content">WhatsApp Bot Monitor</h1>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <div
                  className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'qr' ? 'bg-warning' : 'bg-error'}`}
                ></div>
                <span className="capitalize">{status}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-none gap-2 px-4">
          {status === 'disconnected' && (
            <button onClick={startBot} className="btn btn-sm btn-success">
              <FaPlug /> Connect
            </button>
          )}
          {status === 'connected' && (
            <button onClick={logout} className="btn btn-sm btn-outline btn-error">
              <FaSignOutAlt /> Logout
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto p-4 flex flex-col gap-4">
        {status === 'qr' && qrCode && (
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
            <div className="card bg-base-200 shadow-xl border border-white/10 max-w-sm w-full">
              <div className="card-body items-center text-center">
                <h2 className="card-title text-warning mb-2">
                  <FaQrcode /> Scan QR Code
                </h2>
                <div className="bg-white p-4 rounded-2xl shadow-lg mb-4">
                  <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                </div>
                <p className="text-sm opacity-70">
                  Buka WhatsApp di HP kamu, tap menu titik tiga, pilih Perangkat Tertaut, lalu scan
                  QR Code ini.
                </p>
              </div>
            </div>
          </div>
        )}

        {status === 'connected' && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40 select-none">
            <FaWhatsapp className="text-6xl mb-4" />
            <p className="text-lg font-semibold">Menunggu Pesan Masuk</p>
            <p className="text-sm">Pantau aktivitas bot WhatsApp di sini.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat ${msg.type === 'outgoing' ? 'chat-end' : 'chat-start'} animate-fade-in`}
          >
            <div className="chat-header opacity-50 text-xs mb-1">
              {msg.chatTitle} {msg.isGroup ? `(${msg.sender})` : ''}
              <time className="text-xs ml-2">{msg.time}</time>
            </div>
            <div
              className={`chat-bubble flex flex-col gap-1 ${msg.type === 'outgoing' ? 'chat-bubble-success text-success-content' : 'bg-base-300 text-base-content'}`}
            >
              {msg.quotedText && (
                <div className="bg-black/10 mt-1 mb-2 rounded-xl dark:bg-white/10 border-l-4 border-white/30 px-2 py-1 rounded text-[10px] italic max-w-[250px] truncate opacity-80">
                  {msg.quotedText}
                </div>
              )}
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
              </div>
            </div>
            {msg.type === 'outgoing' && (
              <div className="chat-footer opacity-50 text-xs mt-1 max-w-[200px] truncate">
                Merespons: "{msg.text}"
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="chat chat-end animate-fade-in">
            <div className="chat-header opacity-50 text-xs mb-1">
              Memproses pesan {currentSender}...
            </div>
            <div className="chat-bubble chat-bubble-success bg-success/20 text-success border border-success/30">
              <span className="loading loading-dots loading-sm"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

export default WhatsappBot
