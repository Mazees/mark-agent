import React, { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '../Chat/CodeBlock'
import { subagentStore } from '../../api/subagent/subagentStore'
import {
  Bot,
  Send,
  Square,
  Terminal,
  Brain,
  X,
  Clock,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import { runSubagentTurn, killSubagentExecution } from '../../api/subagent/subagentExecutor'
import { useConfirm } from '../../hooks/useConfirm'

const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline ? (
      <CodeBlock match={match} children={children} />
    ) : (
      <code
        className="bg-base-300/90 text-accent font-mono text-[11px] px-1.5 py-0.5 rounded border border-base-content/10"
        {...props}
      >
        {children}
      </code>
    )
  }
}

// Komponen Single Unified Bubble untuk Sub-Agent
function SubagentUnifiedBubble({ turn, subagentName, isRunning }) {
  const [isThoughtOpen, setIsThoughtOpen] = useState(false)
  const [isStepsOpen, setIsStepsOpen] = useState(false)
  const [openStepIdx, setOpenStepIdx] = useState(null)

  return (
    <div className="chat chat-start animate-fade-in">
      <div className="chat-image avatar placeholder">
        <div className="w-8 h-8 rounded-2xl text-[10px] font-bold shadow-md flex items-center justify-center bg-primary/20 text-primary border border-primary/30">
          SUB
        </div>
      </div>
      <div className="chat-header text-[11px] opacity-50 mb-1 flex items-center gap-1.5">
        <span>{subagentName}</span>
        <span className="text-[10px]">
          {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="chat-bubble bg-base-200/95 text-base-content border border-base-content/15 shadow-xl max-w-[88%] rounded-2xl p-4 space-y-3.5">
        {/* 1. Dropdown Thought (Reasoning Analisis) */}
        {turn.thoughts && turn.thoughts.length > 0 && (
          <div className="bg-base-300/80 rounded-xl border border-base-content/10 overflow-hidden text-xs select-none shadow-sm">
            <button
              type="button"
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-base-content/5 transition-colors text-left"
            >
              <div className="flex items-center gap-2 font-semibold text-accent text-[11px]">
                <Brain className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Pemikiran Sub-Agent
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-base-content/50">
                <span>{isThoughtOpen ? 'Tutup' : 'Lihat'}</span>
                {isThoughtOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </div>
            </button>
            {isThoughtOpen && (
              <div className="p-3.5 bg-base-100/90 border-t border-base-content/10 space-y-2 text-[11px] text-base-content/90 whitespace-pre-wrap leading-relaxed">
                <div className="border-l-2 border-accent pl-2.5 py-0.5">
                  {turn.thoughts[turn.thoughts.length - 1] || ''}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Dropdown Langkah Eksekusi (Tools) */}
        {turn.steps && turn.steps.length > 0 && (
          <div className="bg-base-300/80 rounded-xl border border-base-content/10 overflow-hidden text-xs select-none shadow-sm">
            <button
              type="button"
              onClick={() => setIsStepsOpen(!isStepsOpen)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-base-content/5 transition-colors text-left"
            >
              <div className="flex items-center gap-2 font-semibold text-warning text-[11px]">
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>Langkah Eksekusi ({turn.steps.length})</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-base-content/50">
                <span>{isStepsOpen ? 'Tutup' : 'Lihat'}</span>
                {isStepsOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </div>
            </button>

            {isStepsOpen && (
              <div className="p-3.5 bg-base-100/90 border-t border-base-content/10 space-y-2 font-mono text-[11px]">
                {turn.steps.map((step, idx) => {
                  const isObsOpen = openStepIdx === idx
                  return (
                    <div
                      key={idx}
                      className="space-y-1 bg-base-200/50 p-2 rounded-lg border border-base-content/5"
                    >
                      <div
                        onClick={() => step.observation && setOpenStepIdx(isObsOpen ? null : idx)}
                        className={`flex items-start gap-1.5 py-0.5 ${step.observation ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                      >
                        <span className="text-warning font-semibold shrink-0">{idx + 1}.</span>
                        <span className="text-primary font-semibold shrink-0">{step.tool}</span>
                        <span className="text-base-content/40 shrink-0">:</span>
                        <span
                          className={`text-base-content/90 break-all flex-1 ${isObsOpen ? '' : 'truncate'}`}
                        >
                          {step.query || ''}
                        </span>
                        {step.observation &&
                          (isObsOpen ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          ))}
                      </div>

                      {isObsOpen && step.observation && (
                        <div className="p-2.5 bg-black/40 rounded-lg text-base-content/80 whitespace-pre-wrap break-all text-[10px] max-h-44 overflow-y-auto mt-1 border border-base-content/10 font-mono">
                          {(typeof step.observation === 'string' ? step.observation : JSON.stringify(step.observation)).replace(/^\[OBSERVATION\]:\s*/, '')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. Final Content / Answer or Loading */}
        {turn.answer ? (
          <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed font-normal pt-1 text-base-content/95">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {turn.answer
                .replace(/^\[DARI LEAD AGENT \(MARK\)\]:\s*/, '')
                .replace(/^\[DARI CREATOR \/ USER \(MADA\)\]:\s*/, '')}
            </Markdown>
          </div>
        ) : isRunning ? (
          <div className="flex items-center gap-2 text-xs text-base-content/75 py-1 font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
            <span className="text-[11px]">Memproses langkah...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Helper untuk mengelompokkan pesan mentah menjadi satu bubble per giliran
function groupSubagentMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return []
  const grouped = []
  let currentSubTurn = null

  for (const msg of rawMessages) {
    if (msg.sender === 'user' || msg.sender === 'mark') {
      if (currentSubTurn) {
        grouped.push(currentSubTurn)
        currentSubTurn = null
      }
      grouped.push({
        type: 'dialogue',
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp
      })
    } else if (msg.sender === 'subagent') {
      let parsed = {}
      try {
        parsed = typeof msg.content === 'object' ? msg.content : JSON.parse(msg.content)
      } catch (e) {
        parsed = { answer: msg.content }
      }

      const thought = msg.thought || parsed.thought
      const action = msg.action || parsed.action
      const answer = parsed.answer || (action ? null : msg.content)

      if (!currentSubTurn) {
        currentSubTurn = {
          type: 'subagent_turn',
          id: msg.id,
          sender: 'subagent',
          timestamp: msg.timestamp,
          thoughts: [],
          steps: [],
          answer: null
        }
      }

      if (thought && !currentSubTurn.thoughts.includes(thought)) {
        currentSubTurn.thoughts.push(thought)
      }

      if (action) {
        const acts = Array.isArray(action) ? action : [action]
        acts.forEach((act) => {
          if (act?.tool) {
            currentSubTurn.steps.push({
              tool: act.tool,
              query: act.query || '',
              observation: null
            })
          }
        })
      }

      if (answer) {
        currentSubTurn.answer = answer
      }
    } else if (msg.sender === 'tool') {
      if (currentSubTurn && currentSubTurn.steps.length > 0) {
        const lastStepWithoutObs = [...currentSubTurn.steps].reverse().find((s) => !s.observation)
        if (lastStepWithoutObs) {
          lastStepWithoutObs.observation = msg.content
        } else {
          currentSubTurn.steps[currentSubTurn.steps.length - 1].observation = msg.content
        }
      } else {
        if (!currentSubTurn) {
          currentSubTurn = {
            type: 'subagent_turn',
            id: msg.id,
            sender: 'subagent',
            timestamp: msg.timestamp,
            thoughts: [],
            steps: [{ tool: 'tool-execution', query: '', observation: msg.content }],
            answer: null
          }
        }
      }
    }
  }

  if (currentSubTurn) {
    grouped.push(currentSubTurn)
  }

  return grouped
}

export default function SubagentIntercom({ subagentId, onClose }) {
  const [subagent, setSubagent] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)

  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const isAutoScrollRef = useRef(true)
  const prevMsgCountRef = useRef(0)

  const loadData = async () => {
    if (!subagentId) return
    try {
      const sub = await subagentStore.getSubagent(subagentId)
      const msgs = await subagentStore.getMessages(subagentId)
      setSubagent(sub)
      setMessages(msgs || [])
    } catch (err) {
      console.error('[SubagentIntercom] Load error:', err)
    }
  }

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior })
      isAutoScrollRef.current = true
      setShowScrollBottomBtn(false)
    }
  }

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60
    isAutoScrollRef.current = isAtBottom
    setShowScrollBottomBtn(!isAtBottom)
  }

  // Reset scroll dan muat data ketika subagentId berubah
  useEffect(() => {
    prevMsgCountRef.current = 0
    isAutoScrollRef.current = true
    setShowScrollBottomBtn(false)
    loadData().then(() => {
      setTimeout(() => scrollToBottom('auto'), 50)
    })
    const interval = setInterval(loadData, 1000)
    return () => clearInterval(interval)
  }, [subagentId])

  // Hanya auto-scroll jika ada pesan baru DAN user sedang berada di posisi bawah
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      if (isAutoScrollRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
      prevMsgCountRef.current = messages.length
    }
  }, [messages.length])

  const { confirm, ModalComponent } = useConfirm()

  const handleSendMessage = async (e) => {
    e?.preventDefault()
    if (!inputText.trim() || isSending) return

    const textToSend = inputText.trim()
    setInputText('')
    setIsSending(true)
    isAutoScrollRef.current = true
    setShowScrollBottomBtn(false)

    try {
      await runSubagentTurn(subagentId, textToSend, 'user')
      await loadData()
      setTimeout(() => scrollToBottom('smooth'), 50)
    } catch (err) {
      console.error('[SubagentIntercom] Send error:', err)
    } finally {
      setIsSending(false)
    }
  }

  const handleKill = async () => {
    const result = await confirm({
      title: 'Hentikan Eksekusi Sub-Agent',
      message: 'Apakah kamu yakin ingin menghentikan eksekusi sub-agent ini secara paksa?',
      isError: true,
      confirmText: 'Hentikan',
      cancelText: 'Batal'
    })
    if (result?.isConfirmed) {
      killSubagentExecution(subagentId)
      loadData()
    }
  }

  if (!subagent) return null

  const isRunning = subagent.status === 'running'
  const groupedTurns = groupSubagentMessages(messages)

  return (
    <div className="flex flex-col h-full bg-base-300/60 rounded-3xl overflow-hidden select-none border border-base-content/10 relative font-['Poppins',sans-serif]">
      {/* Header Intercom */}
      <div className="p-4 bg-base-200/90 backdrop-blur-md border-b border-base-content/10 flex items-center justify-between flex-none z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/20 text-primary rounded-2xl shadow-inner border border-primary/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-wide">{subagent.name}</h3>
              <span
                className={`badge badge-xs font-semibold uppercase tracking-wider ${
                  isRunning
                    ? 'badge-warning animate-pulse'
                    : subagent.status === 'idle'
                      ? 'badge-info'
                      : subagent.status === 'failed'
                        ? 'badge-error'
                        : 'badge-success'
                }`}
              >
                {subagent.status}
              </span>
              <span className="text-[10px] text-base-content/40 font-mono">[{subagent.id}]</span>
            </div>
            <p className="text-xs text-base-content/60">{subagent.role}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={handleKill}
              className="btn btn-error btn-xs btn-outline gap-1 rounded-xl"
              title="Hentikan Paksa"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content hover:bg-base-content/10"
              title="Tutup Panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Goal & Mission Info Strip */}
      <div className="px-5 py-3 bg-base-200/40 border-b border-base-content/5 text-xs flex items-center justify-between gap-4 flex-none z-10">
        <div className="flex items-center gap-2 truncate">
          <span className="font-bold text-primary shrink-0 uppercase text-[10px] tracking-wider">
            Mission Goal:
          </span>
          <span className="text-base-content/80 truncate font-medium">{subagent.goal}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-base-content/40 font-mono shrink-0">
          <Clock className="w-3 h-3" />
          <span>Turns: {subagent.turnCount || 0}</span>
        </div>
      </div>

      {/* Message Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 p-5 overflow-y-auto space-y-4 relative"
      >
        {groupedTurns.map((item, idx) => {
          if (item.type === 'subagent_turn') {
            const isLastTurn = idx === groupedTurns.length - 1
            return (
              <SubagentUnifiedBubble
                key={item.id}
                turn={item}
                subagentName={subagent.name}
                isRunning={isRunning && isLastTurn}
              />
            )
          }

          const isUser = item.sender === 'user'
          const isMark = item.sender === 'mark'

          return (
            <div key={item.id} className="chat chat-end animate-fade-in">
              <div className="chat-image avatar placeholder">
                <div
                  className={`w-8 h-8 rounded-2xl text-[10px] font-bold shadow-md flex items-center justify-center ${
                    isUser
                      ? 'bg-accent text-accent-content border border-accent/40 shadow-accent/20'
                      : 'bg-primary text-primary-content border border-primary/30'
                  }`}
                >
                  {isUser ? 'USER' : 'MARK'}
                </div>
              </div>
              <div className="chat-header text-[11px] opacity-50 mb-1 flex items-center gap-1.5">
                <span className={isUser ? 'text-accent font-semibold' : ''}>
                  {isUser ? 'Creator (Mada)' : 'Lead Agent (Mark)'}
                </span>
                <span className="text-[10px]">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div
                className={`chat-bubble text-xs leading-relaxed max-w-[85%] rounded-2xl shadow-md p-3.5 ${
                  isUser
                    ? 'bg-accent text-accent-content font-medium border border-accent/40 shadow-accent/20'
                    : 'bg-primary text-primary-content border border-primary/30'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed font-normal">
                  {item.content
                    .replace(/^\[DARI LEAD AGENT \(MARK\)\]:\s*/, '')
                    .replace(/^\[DARI CREATOR \/ USER \(MADA\)\]:\s*/, '')}
                </div>
              </div>
            </div>
          )
        })}

        {/* Initial Loading State hanya jika belum ada bubble giliran sub-agent yang aktif */}
        {isRunning &&
          (groupedTurns.length === 0 ||
            groupedTurns[groupedTurns.length - 1]?.type !== 'subagent_turn') && (
            <div className="chat chat-start animate-fade-in">
              <div className="chat-image avatar placeholder">
                <div className="w-8 h-8 rounded-2xl text-[10px] font-bold shadow-md flex items-center justify-center bg-primary/20 text-primary border border-primary/30">
                  SUB
                </div>
              </div>
              <div className="chat-header text-[11px] opacity-50 mb-1">
                <span>{subagent.name}</span>
              </div>
              <div className="chat-bubble bg-base-200/95 text-base-content border border-base-content/15 text-xs flex items-center gap-2.5 py-2.5 px-4 shadow-md">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="font-mono text-[11px] text-base-content/80">
                  Memproses langkah...
                </span>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottomBtn && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-20 right-6 btn btn-circle btn-sm btn-primary shadow-xl shadow-primary/30 z-20 animate-bounce"
          title="Scroll ke bawah"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* User Intervention Whisper Input */}
      <form
        onSubmit={handleSendMessage}
        className="p-3.5 bg-base-200/90 border-t border-base-content/10 flex items-center gap-2 flex-none backdrop-blur-md z-10"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ketik instruksi/arahan langsung sebagai Creator (Mada)..."
          disabled={isSending}
          className="input input-sm input-bordered flex-1 rounded-xl bg-base-100/70 focus:bg-base-100 text-xs shadow-inner"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="btn btn-accent btn-sm rounded-xl px-4 gap-1.5 shadow-md shadow-accent/20 font-semibold"
        >
          {isSending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" /> Kirim
            </>
          )}
        </button>
      </form>

      {/* Confirmation Modal */}
      <ModalComponent />
    </div>
  )
}
