import React, { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '../Chat/CodeBlock'
import {
  Bot,
  Send,
  Square,
  Terminal,
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  ArrowDown,
  Sparkles,
  Trash2,
  Info
} from 'lucide-react'
import { subagentStore } from '../../api/subagent/subagentStore'
import { runSubagentTurn, killSubagentExecution } from '../../api/subagent/subagentExecutor'

function extractTextContent(raw) {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object') {
    if (raw.answer) return extractTextContent(raw.answer)
    if (raw.content) return extractTextContent(raw.content)
    if (raw.message) return extractTextContent(raw.message)
    if (raw.text) return extractTextContent(raw.text)
    return JSON.stringify(raw, null, 2)
  }
  return String(raw)
}

function extractThoughtContent(raw, fallbackThought = null) {
  if (fallbackThought) return fallbackThought
  if (raw && typeof raw === 'object' && raw.thought) {
    return String(raw.thought)
  }
  return null
}

const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline ? (
      <CodeBlock match={match} children={children} />
    ) : (
      <code
        className="bg-base-300/90 text-primary font-mono text-[11px] px-1.5 py-0.5 rounded border border-base-content/10"
        {...props}
      >
        {children}
      </code>
    )
  }
}

/**
 * Format argument tool menjadi inline string bergaya Hermes / CLI terminal:
 * e.g. message_agent -target "Mr Tester" -msg "Hello"
 */
function formatToolArgsToCLI(_toolName, rawArgs) {
  if (!rawArgs) return ''
  let args = rawArgs
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs)
    } catch {
      return rawArgs
    }
  }

  if (typeof args !== 'object') return String(args)

  const parts = []
  for (const [key, val] of Object.entries(args)) {
    if (val === undefined || val === null || val === '') continue
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val)
    const truncatedVal = valStr.length > 50 ? valStr.slice(0, 47) + '...' : valStr
    parts.push(`--${key} "${truncatedVal}"`)
  }
  return parts.join(' ')
}

/**
 * Komponen Accordion Thought (Hermes style "Thought >")
 */
function ThoughtAccordion({ thought }) {
  const [isOpen, setIsOpen] = useState(false)
  if (!thought) return null

  return (
    <div className="my-1.5 bg-base-300/40 hover:bg-base-300/60 rounded-xl border border-base-content/10 transition-all overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left select-none text-base-content/75 hover:text-base-content"
      >
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <Brain className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="font-semibold text-accent/90">Thought</span>
          <span className="text-base-content/40 text-[10px]">&gt;</span>
          <span className="text-base-content/50 text-[10px] truncate max-w-xs md:max-w-md">
            {thought.slice(0, 60)}...
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-base-content/40 font-mono">
          <span>{isOpen ? 'hide' : 'expand'}</span>
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3.5 bg-base-100/80 border-t border-base-content/10 text-[11px] text-base-content/90 font-mono leading-relaxed whitespace-pre-wrap">
          {thought}
        </div>
      )}
    </div>
  )
}

/**
 * Komponen Baris Eksekusi Tool Bergaya Terminal Inline
 * e.g. "> Ran message_agent --target_agent "Mr Tester" ..."
 */
function InlineToolExecution({ toolCall, observation }) {
  const [isOpen, setIsOpen] = useState(false)
  const toolName = toolCall?.function?.name || toolCall?.name || 'tool-execution'
  const rawArgs = toolCall?.function?.arguments || toolCall?.arguments || toolCall?.query || ''
  const cliArgs = formatToolArgsToCLI(toolName, rawArgs)

  return (
    <div className="my-1 font-mono text-[11px] bg-base-300/30 hover:bg-base-300/50 rounded-xl border border-base-content/10 transition-all overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left text-base-content/80 hover:text-base-content"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal className="w-3.5 h-3.5 text-warning shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="text-base-content/40 font-bold">&gt;</span>
            <span className="text-base-content/60">Ran</span>
            <span className="text-primary font-semibold">{toolName}</span>
            {cliArgs && (
              <span className="text-base-content/50 text-[10px] truncate max-w-sm">
                {cliArgs}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-2 text-[10px] text-base-content/40">
          {observation ? (
            <span className="text-success flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>result</span>
            </span>
          ) : (
            <span className="text-warning animate-pulse">executing...</span>
          )}
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 bg-black/40 border-t border-base-content/10 space-y-2 text-[10px] text-base-content/85">
          {rawArgs && (
            <div>
              <div className="text-[10px] text-base-content/40 uppercase tracking-wider mb-1">Arguments:</div>
              <pre className="p-2 rounded-lg bg-base-100/50 overflow-x-auto text-warning font-mono whitespace-pre-wrap border border-base-content/5">
                {typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs, null, 2)}
              </pre>
            </div>
          )}

          {observation && (
            <div>
              <div className="text-[10px] text-base-content/40 uppercase tracking-wider mb-1">Output:</div>
              <pre className="p-2 rounded-lg bg-base-100/50 overflow-x-auto text-base-content/90 font-mono whitespace-pre-wrap max-h-56 overflow-y-auto border border-base-content/5">
                {observation.replace(/^\[OBSERVATION\]:\s*/, '')}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Bubble percakapan untuk pesan masuk (User / Lead Agent / Peer Sub-Agent)
 */
function IncomingMessageBubble({ message }) {
  const isMark = message.sender === 'mark'
  const isPeer = message.sender === 'peer'

  const senderBadge = isMark ? 'LEAD AGENT' : isPeer ? 'PEER AGENT' : 'CREATOR'
  const badgeColor = isMark ? 'bg-primary/20 text-primary border-primary/30' : isPeer ? 'bg-accent/20 text-accent border-accent/30' : 'bg-secondary/20 text-secondary border-secondary/30'

  // Bersihkan tag awalan jika ada
  const cleanContent = extractTextContent(message.content)
    .replace(/^\[DARI LEAD AGENT \(MARK\)\]:\s*/, '')
    .replace(/^\[DARI CREATOR \/ USER\]:\s*/, '')
    .replace(/^\[DARI SESAMA SUB-AGENT\]:\s*/, '')

  return (
    <div className="chat chat-end my-3 animate-fade-in">
      <div className="chat-header text-[10px] font-mono opacity-50 mb-1 flex items-center gap-1.5">
        <span className={`px-1.5 py-0.2 rounded-md border text-[9px] font-bold ${badgeColor}`}>
          {senderBadge}
        </span>
        <span>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="chat-bubble bg-base-100 border border-base-content/15 shadow-md max-w-[85%] rounded-2xl p-3.5 text-xs text-base-content leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {cleanContent}
        </Markdown>
      </div>
    </div>
  )
}

/**
 * Bubble percakapan untuk pesan keluar dari Sub-Agent (Hermes unified block)
 */
function SubagentMessageTurn({ turn, subagentName, isRunning }) {
  return (
    <div className="chat chat-start my-3 animate-fade-in">
      <div className="chat-image avatar placeholder">
        <div className="w-8 h-8 rounded-2xl text-[10px] font-bold shadow-md flex items-center justify-center bg-primary/20 text-primary border border-primary/30 font-mono">
          {subagentName.slice(0, 2).toUpperCase()}
        </div>
      </div>
      <div className="chat-header text-[10px] font-mono opacity-50 mb-1 flex items-center gap-1.5">
        <span className="font-semibold text-base-content/80">{subagentName}</span>
        <span>
          {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="chat-bubble bg-base-200/90 text-base-content border border-base-content/15 shadow-lg max-w-[90%] md:max-w-[85%] rounded-2xl p-4 space-y-2.5">
        {/* 1. Reasoning Accordion */}
        {turn.thoughts && turn.thoughts.length > 0 && (
          <div className="space-y-1">
            {turn.thoughts.map((th, idx) => (
              <ThoughtAccordion key={idx} thought={th} />
            ))}
          </div>
        )}

        {/* 2. Inline Tool Execution Items */}
        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="space-y-1">
            {turn.toolCalls.map((tc, idx) => (
              <InlineToolExecution
                key={idx}
                toolCall={tc}
                observation={turn.observations?.[tc.id] || turn.observations?.[tc.function?.name]}
              />
            ))}
          </div>
        )}

        {/* 3. Final Output Text */}
        {turn.content ? (
          <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed font-normal pt-1 text-base-content/95">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {extractTextContent(turn.content)}
            </Markdown>
          </div>
        ) : isRunning ? (
          <div className="flex items-center gap-2 text-xs text-base-content/60 py-1 font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
            <span className="text-[11px]">Memproses langkah kerja...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Parser kronologis untuk menggabungkan message history menjadi struktur turn terorganisir
 */
function groupChronologicalMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return []
  const result = []
  let currentTurn = null

  for (const msg of rawMessages) {
    if (msg.sender === 'user' || msg.sender === 'mark' || msg.sender === 'peer') {
      if (currentTurn) {
        result.push(currentTurn)
        currentTurn = null
      }
      result.push({
        type: 'incoming',
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp
      })
    } else if (msg.sender === 'system' || msg.role === 'system') {
      if (currentTurn) {
        result.push(currentTurn)
        currentTurn = null
      }
      result.push({
        type: 'system',
        id: msg.id,
        sender: 'system',
        content: msg.content,
        timestamp: msg.timestamp
      })
    } else if (msg.sender === 'subagent' || msg.role === 'assistant') {
      if (!currentTurn) {
        currentTurn = {
          type: 'subagent_turn',
          id: msg.id,
          timestamp: msg.timestamp,
          thoughts: [],
          toolCalls: [],
          observations: {},
          content: null
        }
      }

      const extractedThought = extractThoughtContent(msg.content, msg.thought)
      if (extractedThought && !currentTurn.thoughts.includes(extractedThought)) {
        currentTurn.thoughts.push(extractedThought)
      }

      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        currentTurn.toolCalls.push(...msg.tool_calls)
      }

      if (msg.content) {
        currentTurn.content = extractTextContent(msg.content)
      }
    } else if (msg.sender === 'tool' || msg.role === 'tool') {
      if (currentTurn) {
        const key = msg.tool_call_id || msg.name || 'last_tool'
        currentTurn.observations[key] = msg.content
      }
    }
  }

  if (currentTurn) {
    result.push(currentTurn)
  }

  return result
}

export default function AgentChatFeed({ subagentId, onOpenInspector, onDeleteAgent }) {
  const [subagent, setSubagent] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)

  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const isAutoScrollRef = useRef(true)

  const loadData = async () => {
    if (!subagentId) return
    try {
      const agent = await subagentStore.getSubagent(subagentId)
      const msgs = await subagentStore.getMessages(subagentId)
      setSubagent(agent)
      setMessages(msgs || [])
    } catch (err) {
      console.error('[AgentChatFeed] Load error:', err)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 1000)
    return () => clearInterval(interval)
  }, [subagentId])

  useEffect(() => {
    if (isAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    isAutoScrollRef.current = isAtBottom
    setShowScrollBottomBtn(!isAtBottom)
  }

  const handleSendMessage = async (e) => {
    e?.preventDefault()
    if (!inputText.trim() || !subagentId || isSending) return

    const text = inputText.trim()
    setInputText('')
    setIsSending(true)
    isAutoScrollRef.current = true

    try {
      await runSubagentTurn(subagentId, text, 'user')
      await loadData()
    } catch (err) {
      console.error('[AgentChatFeed] Send error:', err)
    } finally {
      setIsSending(false)
    }
  }

  const handleStopExecution = () => {
    if (!subagentId) return
    killSubagentExecution(subagentId)
    loadData()
  }

  const handleClearHistory = async () => {
    if (!subagentId) return
    await subagentStore.clearMessages(subagentId)
    await loadData()
  }

  if (!subagent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-base-content/30 gap-2 font-mono">
        <Bot className="w-8 h-8 stroke-[1.5]" />
        <p className="text-xs">Memuat data sub-agent...</p>
      </div>
    )
  }

  const isRunning = subagent.status === 'running'
  const groupedTurns = groupChronologicalMessages(messages)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base-200/40 relative font-['Poppins',sans-serif]">
      {/* Feed Header */}
      <div className="p-3 px-4 border-b border-base-content/10 flex items-center justify-between bg-base-200/70 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-xs font-mono">
            {subagent.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-base-content/90 truncate font-mono">
                {subagent.name}
              </h2>
              {isRunning && (
                <span className="badge badge-primary badge-xs gap-1 font-mono text-[9px] py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-base-100 animate-ping" />
                  Running
                </span>
              )}
            </div>
            <p className="text-[10px] text-base-content/50 truncate font-mono">
              {subagent.role || 'Specialist'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <button
              type="button"
              onClick={handleStopExecution}
              className="btn btn-error btn-xs rounded-xl gap-1 px-2.5 font-mono text-[11px]"
              title="Hentikan Eksekusi"
            >
              <Square className="w-3 h-3 fill-current" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClearHistory}
              className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content rounded-xl font-mono text-[10px]"
              title="Bersihkan Log Chat"
            >
              Clear Log
            </button>
          )}

          {onDeleteAgent && (
            <button
              type="button"
              onClick={() => onDeleteAgent(subagentId)}
              className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-error transition-colors"
              title="Hapus Sub-Agent"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
              title="Lihat Detail Agen"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Goal Banner */}
      {subagent.goal && (
        <div className="px-4 py-2 bg-base-300/40 border-b border-base-content/5 flex items-start gap-2 text-[11px] text-base-content/75 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <div className="truncate">
            <span className="font-semibold text-primary/90 mr-1">Goal:</span>
            <span>{subagent.goal}</span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:px-6 space-y-2 custom-scrollbar"
      >
        {groupedTurns.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-base-content/30 gap-2.5">
            <Bot className="w-8 h-8 stroke-[1.5]" />
            <p className="text-xs font-mono">Belum ada aktivitas pada agen ini.</p>
            <p className="text-[10px] text-base-content/40 max-w-xs font-mono">
              Kirim instruksi melalui input di bawah untuk memulai giliran kerja mandiri.
            </p>
          </div>
        ) : (
          groupedTurns.map((turn, idx) => {
            if (turn.type === 'incoming') {
              return <IncomingMessageBubble key={turn.id || idx} message={turn} />
            }
            return (
              <SubagentMessageTurn
                key={turn.id || idx}
                turn={turn}
                subagentName={subagent.name}
                isRunning={isRunning && idx === groupedTurns.length - 1}
              />
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            isAutoScrollRef.current = true
            setShowScrollBottomBtn(false)
          }}
          className="btn btn-circle btn-sm bg-base-100/90 border border-base-content/20 shadow-xl absolute bottom-18 right-6 z-20 hover:scale-105 transition-all text-primary"
          title="Scroll ke Bawah"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Message Input Footer */}
      <div className="p-3 border-t border-base-content/10 bg-base-200/70 backdrop-blur-sm shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={`Kirim instruksi langsung ke @${subagent.name}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isRunning || isSending}
            className="input input-sm flex-1 rounded-xl bg-base-100/70 border-base-content/10 text-xs focus:outline-none focus:border-primary/50 font-mono"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isRunning || isSending}
            className="btn btn-primary btn-sm rounded-xl px-3 font-medium shadow-sm shadow-primary/20"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
