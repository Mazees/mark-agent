import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { FaTelegram } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { preprocessLaTeX, mathRemarkPlugins, mathRehypePlugins } from '../utils/latexHelper'
import { CodeBlock } from '../components/Chat/CodeBlock'
import { useTelegramBot } from '../hooks/telegram/useTelegramBot'

const TelegramBot = () => {
  const { status, messages, isThinking, currentSender } = useTelegramBot()
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 150)
    return () => clearTimeout(timeout)
  }, [messages, isThinking])

  const statusLabel =
    status === 'connected' ? 'Terhubung' : status === 'connecting' ? 'Menghubungkan' : 'Terputus'

  return (
    <main className="h-screen overflow-hidden bg-base-300 font-['Poppins',sans-serif] text-base-content">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <Link
              to="/addons/telegram"
              aria-label="Kembali ke detail Telegram"
              className="btn btn-ghost btn-sm btn-circle"
            >
              <ArrowLeft size={18} />
            </Link>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-[#2aabee]">
              <FaTelegram size={24} aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-semibold text-white">Log Telegram</h1>
                <span className="flex items-center gap-2 text-xs text-white/55">
                  <span
                    className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'animate-pulse bg-warning' : 'bg-error'}`}
                  />
                  {statusLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/45">Riwayat pesan masuk dan balasan Mark.</p>
            </div>
          </div>
        </header>

        <section
          aria-label="Riwayat pesan Telegram"
          className="custom-scrollbar flex-1 space-y-4 overflow-y-auto py-6"
        >
          {status === 'disconnected' && messages.length === 0 && (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
              <FaTelegram className="text-4xl text-[#2aabee]" aria-hidden="true" />
              <h2 className="text-lg font-medium text-white">Bot belum terhubung</h2>
              <p className="text-sm leading-relaxed text-white/50">
                Hubungkan bot dari detail addon Telegram untuk mulai menerima dan melihat log pesan.
              </p>
              <Link to="/addons/telegram" className="btn btn-primary btn-sm rounded-full px-5">
                Atur koneksi Telegram
              </Link>
            </div>
          )}

          {status === 'connected' && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-white/45">
              <FaTelegram className="mb-4 text-4xl text-[#2aabee]" aria-hidden="true" />
              <p className="font-medium text-white/70">Menunggu pesan Telegram</p>
              <p className="mt-1 text-sm">Pesan dan balasan baru akan muncul di sini.</p>
            </div>
          )}

          {messages.map((message, index) => (
            <article
              key={message.id || `${message.time}-${index}`}
              className={`chat ${message.type === 'outgoing' ? 'chat-end' : 'chat-start'} animate-fade-in`}
            >
              <div className="chat-header mb-1 text-xs text-white/45">
                {message.sender}
                <time className="ml-2">{message.time}</time>
              </div>
              <div
                className={`chat-bubble flex max-w-[min(85%,42rem)] flex-col gap-1 ${message.type === 'outgoing' ? 'chat-bubble-info text-info-content' : 'bg-base-200 text-base-content'}`}
              >
                <div className="custom-markdown overflow-x-hidden text-sm">
                  <Markdown
                    remarkPlugins={[remarkGfm, ...mathRemarkPlugins]}
                    rehypePlugins={[
                      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
                      ...mathRehypePlugins
                    ]}
                    components={{ code: CodeBlock }}
                  >
                    {preprocessLaTeX(message.type === 'outgoing' ? message.reply : message.text)}
                  </Markdown>
                  {message.type === 'outgoing' && message.toolsUsed?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.toolsUsed.map((tool, toolIndex) => (
                        <span
                          key={`${tool}-${toolIndex}`}
                          className="badge badge-accent badge-outline badge-sm text-[10px]"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}

          {isThinking && (
            <div className="chat chat-end animate-fade-in">
              <div className="chat-header mb-1 text-xs text-white/45">
                Mark sedang memproses pesan {currentSender}...
              </div>
              <div className="chat-bubble border border-info/30 bg-info/20 text-info">
                <span className="loading loading-dots loading-sm" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>
      </div>
    </main>
  )
}

export default TelegramBot
