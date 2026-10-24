import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowDown, Bot, ChevronRight, Loader2, Send, Terminal, Trash2 } from 'lucide-react'
import { subagentStore } from '../../api/subagent/subagentStore'
import { runSubagentTurn } from '../../api/subagent/subagentExecutor'
import { agentDate } from './agentPresentation'
import { preprocessLaTeX, mathRemarkPlugins, mathRehypePlugins } from '../../utils/latexHelper'
import AgentConfirmDialog from './AgentConfirmDialog'

function textContent(raw) {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed.answer || parsed.content || parsed.text || Array.isArray(parsed))
      )
        return textContent(parsed)
    } catch {
      /* Plain text is already displayable. */
    }
    return raw
  }
  if (Array.isArray(raw))
    return raw
      .map((item) =>
        item.type === 'image_url'
          ? `![Gambar dari agen](${item.image_url?.url || ''})`
          : textContent(item.text || item.content)
      )
      .join('\n\n')
  if (typeof raw === 'object')
    return textContent(
      raw.answer ?? raw.content ?? raw.text ?? raw.message ?? JSON.stringify(raw, null, 2)
    )
  return String(raw)
}
function MessageText({ children }) {
  return (
    <div className="min-w-0 break-words text-sm leading-7 text-white/80 [&_p+p]:mt-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-white/5 [&_pre]:p-4 [&_code]:font-mono [&_code]:text-xs [&_img]:my-3 [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto">
      <Markdown remarkPlugins={[remarkGfm, ...mathRemarkPlugins]} rehypePlugins={mathRehypePlugins}>
        {preprocessLaTeX(textContent(children))}
      </Markdown>
    </div>
  )
}
MessageText.propTypes = { children: PropTypes.any }

function ToolActivity({ call, result, running }) {
  const name = call.function?.name || call.name || 'Tool'
  const args = call.function?.arguments ?? call.arguments ?? call.query
  const received = result !== undefined
  let resultValue = result
  if (typeof result === 'string') {
    try {
      resultValue = JSON.parse(result.replace(/^\[OBSERVATION\]:\s*/, ''))
    } catch {
      /* Tool results may be plain text. */
    }
  }
  const failed =
    received &&
    (resultValue?.success === false ||
      resultValue?.error ||
      (typeof result === 'string' && /^\[?error/i.test(result)))
  return (
    <details className="group py-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-xs text-white/55 hover:text-white/80 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="shrink-0 transition-transform group-open:rotate-90" />
        <Terminal size={14} className="shrink-0" />
        <span className="min-w-0 break-all">{name}</span>
        <span className={`ml-auto shrink-0 ${failed ? 'text-error' : ''}`}>
          {received ? (failed ? 'Gagal' : 'Selesai') : running ? 'Berjalan' : 'Tanpa hasil'}
        </span>
        {!received && running && (
          <Loader2 size={13} className="shrink-0 motion-safe:animate-spin text-primary" />
        )}
      </summary>
      <div className="space-y-3 pb-2 pl-6 pt-2 text-xs text-white/55">
        {args != null && (
          <div>
            <p className="mb-2 text-white/40">Input</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/[0.03] p-3 font-mono">
              {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}
        {received && (
          <div>
            <p className="mb-2 text-white/40">Hasil</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/[0.03] p-3 font-mono">
              {typeof result === 'string'
                ? result.replace(/^\[OBSERVATION\]:\s*/, '')
                : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}
ToolActivity.propTypes = {
  call: PropTypes.object.isRequired,
  result: PropTypes.any,
  running: PropTypes.bool
}

function activityItems(messages) {
  const items = []
  const tools = new Map()
  for (const message of messages) {
    if (message.sender === 'tool' || message.role === 'tool') {
      const target = tools.get(message.tool_call_id) || tools.get(message.name)
      if (target) target.result = message.content
      else
        items.push({
          type: 'tool',
          id: message.id,
          call: { name: message.name || 'Hasil tool' },
          result: message.content
        })
      continue
    }
    items.push({ type: 'message', message })
    if (Array.isArray(message.tool_calls))
      for (const call of message.tool_calls) {
        const item = { type: 'tool', id: call.id || `${message.id}-${items.length}`, call }
        items.push(item)
        if (call.id) tools.set(call.id, item)
        tools.set(call.function?.name || call.name, item)
      }
  }
  return items
}

export default function AgentChatFeed({ subagent, onRefresh }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [away, setAway] = useState(false)
  const scroll = useRef(null)
  const bottom = useRef(null)
  const follow = useRef(true)
  const mounted = useRef(false)
  const revision = useRef(0)
  const previous = useRef('')
  const running = subagent.status === 'running'
  const load = useCallback(async () => {
    const current = ++revision.current
    try {
      const result = await subagentStore.getMessages(subagent.id)
      if (!mounted.current || current !== revision.current) return
      const next = Array.isArray(result) ? result : []
      const serialized = JSON.stringify(next)
      if (serialized !== previous.current) {
        previous.current = serialized
        setMessages(next)
      }
      setError('')
    } catch (failure) {
      if (mounted.current && current === revision.current)
        setError(failure.message || 'Aktivitas belum dapat dimuat.')
    } finally {
      if (mounted.current && current === revision.current) setLoading(false)
    }
  }, [subagent.id])
  useEffect(() => {
    mounted.current = true
    let timer
    let cancelled = false
    const poll = async () => {
      await load()
      if (!cancelled) timer = setTimeout(poll, 1200)
    }
    poll()
    return () => {
      mounted.current = false
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [messages, running])
  const send = async (event) => {
    event.preventDefault()
    if (!draft.trim() || sending || running) return
    const value = draft.trim()
    setSending(true)
    setError('')
    setDraft('')
    follow.current = true
    try {
      const result = await runSubagentTurn(subagent.id, value, 'user')
      if (result?.success === false)
        throw new Error(result.error || 'Instruksi belum dapat diselesaikan.')
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message)
        setDraft((current) => current || value)
      }
    } finally {
      if (mounted.current) {
        setSending(false)
        await load()
        await onRefresh()
      }
    }
  }
  const clear = async () => {
    await subagentStore.clearMessages(subagent.id)
    previous.current = ''
    setMessages([])
    setConfirmClear(false)
    await load()
  }
  const items = activityItems(messages)
  const latestMessage = items.findLastIndex((item) => item.type === 'message')
  const activeTool = running
    ? items.findIndex(
        (item, index) => index > latestMessage && item.type === 'tool' && item.result === undefined
      )
    : -1
  return (
    <section aria-label="Aktivitas agen" className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll}
        onScroll={() => {
          const el = scroll.current
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          setAway(!follow.current)
        }}
        className="min-h-0 flex-1 overflow-y-auto py-6 custom-scrollbar"
      >
        {messages.length > 0 && !running && (
          <div className="mb-5 flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-white/40 hover:text-white/75 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Trash2 size={14} /> Bersihkan riwayat
            </button>
          </div>
        )}
        {loading ? (
          <p role="status" className="py-10 text-sm text-white/45">
            Memuat aktivitas...
          </p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <Bot size={28} className="mx-auto mb-4 text-white/25" />
            <p className="text-sm text-white/65">
              {running ? 'Agen sedang menyiapkan tugas...' : 'Belum ada aktivitas.'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/40">
              {running
                ? 'Langkah kerja akan muncul di sini.'
                : 'Kirim instruksi di bawah untuk mulai bekerja.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map((item, index) => {
              if (item.type === 'tool')
                return (
                  <ToolActivity
                    key={`tool-${item.id}`}
                    call={item.call}
                    result={item.result}
                    running={index === activeTool}
                  />
                )
              const message = item.message
              const incoming = ['user', 'mark', 'peer'].includes(message.sender)
              const system = message.sender === 'system' || message.role === 'system'
              let thought = message.thought
              if (!thought && typeof message.content === 'object')
                thought = message.content?.thought
              const content = textContent(message.content).replace(
                /^\[DARI (?:LEAD AGENT \(MARK\)|CREATOR \/ USER|SESAMA SUB-AGENT)\]:\s*/,
                ''
              )
              if (!content && !thought) return null
              if (system)
                return (
                  <p
                    key={message.id || index}
                    role={/^\[ERROR/.test(content) ? 'alert' : undefined}
                    className={`whitespace-pre-wrap break-words border-l-2 pl-4 text-sm leading-relaxed ${/^\[ERROR/.test(content) ? 'border-error/40 text-error' : 'border-white/10 text-white/50'}`}
                  >
                    {content.replace(/^\[ERROR EKSEKUSI\]:\s*/, '')}
                  </p>
                )
              return (
                <article
                  key={message.id || index}
                  className={
                    incoming
                      ? 'ml-auto w-fit max-w-[90%] rounded-xl bg-white/[0.05] px-4 py-3'
                      : 'min-w-0'
                  }
                >
                  <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-medium text-white/65">
                      {incoming
                        ? message.sender === 'mark'
                          ? 'Mark'
                          : message.sender === 'peer'
                            ? 'Agen lain'
                            : 'Anda'
                        : subagent.name}
                    </span>
                    <time className="text-white/30">{agentDate(message.timestamp)}</time>
                  </header>
                  {thought && (
                    <details className="group mb-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50">
                      <summary className="flex cursor-pointer list-none items-center gap-2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                        <ChevronRight size={14} className="shrink-0 group-open:rotate-90" />
                        Pemikiran
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">
                        {textContent(thought)}
                      </p>
                    </details>
                  )}
                  {content && <MessageText>{content}</MessageText>}
                </article>
              )
            })}
          </div>
        )}
        {running && items.length > 0 && (
          <p role="status" className="mt-6 flex items-center gap-2 text-xs text-white/50">
            <Loader2 size={14} className="text-primary motion-safe:animate-spin" />
            Agen sedang bekerja...
          </p>
        )}
        {error && (
          <div role="alert" className="mt-5 text-sm text-error">
            {error}
            <button type="button" onClick={load} className="ml-3 rounded-md underline">
              Coba muat ulang
            </button>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {away && (
        <button
          type="button"
          aria-label="Ke aktivitas terbaru"
          onClick={() => {
            bottom.current?.scrollIntoView({ behavior: 'smooth' })
            follow.current = true
            setAway(false)
          }}
          className="btn btn-circle btn-sm absolute bottom-32 right-3 border-white/15 bg-base-200 text-white/75"
        >
          <ArrowDown size={16} />
        </button>
      )}
      <form onSubmit={send} className="shrink-0 border-t border-white/10 pb-5 pt-4">
        <label htmlFor="agent-instruction" className="sr-only">
          Instruksi untuk {subagent.name}
        </label>
        <div className="flex items-end gap-3 rounded-xl border border-white/15 p-3 focus-within:border-primary/50">
          <textarea
            id="agent-instruction"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.currentTarget.form.requestSubmit()
              }
            }}
            placeholder={
              running
                ? 'Tulis instruksi berikutnya...'
                : `Berikan instruksi kepada ${subagent.name}...`
            }
            rows={2}
            className="max-h-36 min-h-12 min-w-0 flex-1 resize-y bg-transparent text-sm leading-relaxed text-white/80 outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            aria-label="Kirim instruksi"
            disabled={!draft.trim() || sending || running}
            className="btn btn-circle btn-sm border-white bg-white text-neutral-900 disabled:border-white/5 disabled:bg-white/5 disabled:text-white/25"
          >
            {sending ? (
              <Loader2 size={16} className="motion-safe:animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/35">
          {running || sending
            ? 'Instruksi berikutnya dapat dikirim setelah agen selesai bekerja.'
            : 'Enter untuk mengirim · Shift+Enter untuk baris baru'}
        </p>
      </form>
      {confirmClear && (
        <AgentConfirmDialog
          title="Bersihkan riwayat?"
          description="Seluruh pesan dan langkah kerja pada agen ini akan dihapus. Tugas dan hasil akhirnya tetap tersimpan."
          action="Bersihkan riwayat"
          onConfirm={clear}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </section>
  )
}
AgentChatFeed.propTypes = {
  subagent: PropTypes.object.isRequired,
  onRefresh: PropTypes.func.isRequired
}
