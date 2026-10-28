import SubagentDecisionInbox from '../components/subagent/SubagentDecisionInbox.jsx'
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { ChevronRight, Folder, PanelRight } from 'lucide-react'
import BrowserPanel from '../components/BrowserPanel.jsx'
import {
  browserSessionId,
  browserCommand,
  getBrowserState,
  subscribeBrowserState
} from '../api/browser-panel.js'
import {
  db,
  getSessionSummaries,
  getSessionSummary,
  createSession,
  saveSession,
  deleteSession,
  renameSession,
  getChatData,
  updateSessionMetadata,
  getSessionCompact
} from '../api/db'
import ChatList from '../components/ChatList'
import InputBar from '../components/core/InputBar'
import WorkspaceSidebar from '../components/Chat/WorkspaceSidebar.jsx'
import { webApi } from '../api/web-bridge.js'
import { isMainSession, resolveSessionWorkspace } from '@shared/workspaces.js'
import { useApproval } from '../contexts/ApprovalContext'
import { stripMarkTags } from '@shared/parsers/mark-tag-parser.js'

/**
 * Ekstraksi dan filter semua prefix/meta-tag (seperti <mic>, <mood:value>)
 * serta fallback riwayat lama ((Mikrofon), [mood:...]) agar pesan tampil bersih di ChatStudio.
 *
 * @param {string|Array} content
 * @returns {{ cleanContent: string|Array, prefixes: string[] }}
 */
export function filterMessagePrefixes(content) {
  if (!content) return { cleanContent: '', prefixes: [] }
  if (typeof content !== 'string') {
    if (Array.isArray(content)) {
      const allPrefixes = []
      const cleanArray = content.map((item) => {
        if (item && item.type === 'text' && typeof item.text === 'string') {
          const res = filterMessagePrefixes(item.text)
          allPrefixes.push(...res.prefixes)
          return { ...item, text: res.cleanContent }
        }
        return item
      })
      return { cleanContent: cleanArray, prefixes: allPrefixes }
    }
    return { cleanContent: content, prefixes: [] }
  }

  const prefixes = []
  const cleanContent = stripMarkTags(content)
    .replace(/(?:<mic>|\(Mikrofon\))/gi, (match) => {
      prefixes.push(match)
      return ''
    })
    .trim()

  return { cleanContent, prefixes }
}

function buildCompletedTurnRenderItems(messages = [], isLoading = false) {
  const renderItems = []
  let index = 0

  while (index < messages.length) {
    const current = messages[index]
    if (current.role !== 'user') {
      renderItems.push({ type: 'message', message: current })
      index += 1
      continue
    }

    renderItems.push({ type: 'message', message: current })
    let turnEnd = index + 1
    while (turnEnd < messages.length && messages[turnEnd].role !== 'user') turnEnd += 1

    const turnMessages = messages.slice(index + 1, turnEnd)
    const assistantMessages = turnMessages.filter((message) => message.role !== 'user')
    const isLatestTurn = turnEnd === messages.length
    const isTurnActive = assistantMessages.some(
      (message) =>
        message.isThinking ||
        message.taskStatus === 'running' ||
        (message.isApproval && message.status === 'pending')
    )
    const mostCompleteToolSnapshot = assistantMessages.reduce((best, message) => {
      const candidate = Array.isArray(message.executedTools) ? message.executedTools : []
      return candidate.length >= best.length ? candidate : best
    }, [])

    if (isLatestTurn && (isTurnActive || isLoading)) {
      renderItems.push({
        type: 'process',
        id: assistantMessages.at(-1)?.id || assistantMessages.at(-1)?.created_at || index,
        messages: assistantMessages,
        steps: mostCompleteToolSnapshot,
        isActive: true
      })
      index = turnEnd
      continue
    }

    const finalIndex = turnMessages.findLastIndex(
      (message) =>
        message.role !== 'user' &&
        !message.isThinking &&
        !message.isApproval &&
        !(message.isPlanSteps && message.taskStatus === 'running')
    )

    const shouldCollapse =
      finalIndex >= 0 &&
      !isTurnActive &&
      !(isLoading && isLatestTurn) &&
      (assistantMessages.length > 1 ||
        assistantMessages.some(
          (message) => Array.isArray(message.executedTools) && message.executedTools.length > 0
        ))

    if (!shouldCollapse) {
      turnMessages.forEach((message) => renderItems.push({ type: 'message', message }))
      index = turnEnd
      continue
    }

    const finalMessage = turnMessages[finalIndex]
    const progressMessages = turnMessages.filter(
      (message, messageIndex) => messageIndex !== finalIndex && message.role !== 'user'
    )
    renderItems.push({
      type: 'process',
      id: finalMessage.id || finalMessage.created_at || index,
      messages: progressMessages,
      steps: mostCompleteToolSnapshot
    })
    renderItems.push({ type: 'message', message: finalMessage, hideProcessDetails: true })
    index = turnEnd
  }

  return renderItems
}

export const ChatStudio = ({ isOpen, onClose, chatContext: propChatContext }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [initialDraft] = useState(() =>
    typeof location.state?.composerDraft === 'string' ? location.state.composerDraft : ''
  )

  useEffect(() => {
    if (typeof location.state?.composerDraft !== 'string') return
    const remainingState = { ...location.state }
    delete remainingState.composerDraft
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: remainingState
    })
  }, [location, navigate])

  const contextChat = useChat()
  const chatContext = propChatContext || contextChat
  const {
    chatData: mainChatData,
    setChatData: setMainChatData,
    handlePlanningCommand,
    handleIntervention,
    isLoading: isMainLoading,
    isAgentBusy,
    runningSessionId,
    runningSessionIds = [],
    handleStop,
    isRecording,
    isProcessing,
    audioIntensity,
    startRecording,
    stopRecording,
    inputSource,
    setCurrentActiveSessionId
  } = chatContext || {}

  const { activeApproval } = useApproval() || {}

  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('1')
  const [browserOpen, setBrowserOpen] = useState(!!location.state?.openBrowser)
  const [browserExpanded, setBrowserExpanded] = useState(false)
  const [chatWidth, setChatWidth] = useState(380)
  const [sidebarMinimized, setSidebarMinimized] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1200)
  const browserId = browserSessionId(activeSessionId)
  const browserRevisions = useRef(new Map())
  useEffect(() => {
    if (browserOpen) setSidebarMinimized(true)
  }, [browserOpen])
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 1200)
    window.addEventListener('resize', resize)
    const check = () => {
      const state = getBrowserState(browserId)
      if (!state) return
      const previous = browserRevisions.current.get(browserId) || 0
      browserRevisions.current.set(browserId, state.panelRevision || 0)
      if ((state.panelRevision || 0) > previous) setBrowserOpen(true)
    }
    check()
    const off = subscribeBrowserState(check)
    return () => {
      off()
      window.removeEventListener('resize', resize)
    }
  }, [browserId])
  const resumeBrowser = () => {
    if (!isCurrentLoading)
      handleSendMessage(
        'Lanjutkan berdasarkan kondisi halaman terbaru. Periksa hasil langkah pengguna sebelum melanjutkan.'
      )
  }
  const [lastCompactedMessageId, setLastCompactedMessageId] = useState(null)
  const [activeSessionCompact, setActiveSessionCompact] = useState(null)
  const [isSessionsLoading, setIsSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const sessionsRequestRef = useRef(0)

  useEffect(() => {
    if (typeof setCurrentActiveSessionId === 'function') {
      setCurrentActiveSessionId(String(activeSessionId))
    }
    return () => {
      if (typeof setCurrentActiveSessionId === 'function') {
        setCurrentActiveSessionId('1')
      }
    }
  }, [activeSessionId, setCurrentActiveSessionId])

  useEffect(() => {
    let isMounted = true
    const loadCompactData = async () => {
      try {
        const data = await getSessionCompact(String(activeSessionId))
        if (isMounted) {
          setActiveSessionCompact(data || null)
          setLastCompactedMessageId(
            data?.lastCompactedMessageId || data?.last_compacted_message_id || null
          )
        }
      } catch (_) {}
    }
    loadCompactData()

    const handleCompactUpdated = (e) => {
      if (String(e.detail?.sessionId) === String(activeSessionId)) {
        setLastCompactedMessageId(e.detail?.lastCompactedMessageId || null)
        setActiveSessionCompact({
          summaryBlock: e.detail?.summaryBlock,
          lastCompactedMessageId: e.detail?.lastCompactedMessageId
        })
      }
    }

    window.addEventListener('session-compact-updated', handleCompactUpdated)
    return () => {
      isMounted = false
      window.removeEventListener('session-compact-updated', handleCompactUpdated)
    }
  }, [activeSessionId])

  const [activeSessionData, setActiveSessionData] = useState([])
  const [visibleMessageCount, setVisibleMessageCount] = useState(30)
  const [defaultRoot, setDefaultRoot] = useState('')
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false)
  const workspaceBusyRef = useRef(false)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)

  const loadAllSessions = useCallback(async () => {
    const requestId = ++sessionsRequestRef.current
    setIsSessionsLoading(true)
    setSessionsError('')
    try {
      const [list, info] = await Promise.all([getSessionSummaries(), webApi.getWorkspaceInfo()])
      if (requestId === sessionsRequestRef.current) {
        setSessions(list)
        setDefaultRoot(info.defaultWorkspaceRoot)
      }
    } catch (e) {
      console.error('Error loading sessions:', e)
      if (requestId === sessionsRequestRef.current)
        setSessionsError('Daftar sesi belum dapat dimuat.')
    } finally {
      if (requestId === sessionsRequestRef.current) setIsSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllSessions()
    const unsubscribe = webApi.onDatabaseRestored(loadAllSessions)
    return () => {
      sessionsRequestRef.current += 1
      unsubscribe()
    }
  }, [loadAllSessions])

  // Direct display pipeline: Main Thread uses mainChatData directly with 0ms lag
  const currentDisplayMessages =
    String(activeSessionId) === '1' ? mainChatData || [] : activeSessionData

  const isCurrentLoading =
    runningSessionIds.map(String).includes(String(activeSessionId)) ||
    (String(activeSessionId) === '1' && !runningSessionIds.length && (isMainLoading || isAgentBusy))

  // Sync active session data for custom sessions (id > 1)
  useEffect(() => {
    setVisibleMessageCount(30)
    if (String(activeSessionId) === '1') return
    let isCancelled = false
    getChatData(activeSessionId).then((data) => {
      if (!isCancelled) {
        setActiveSessionData(data || [])
      }
    })
    return () => {
      isCancelled = true
    }
  }, [activeSessionId])

  // Sinkronisasi status karakter gauge ke UI saat sesi aktif dimuat/berganti
  useEffect(() => {
    if (isCurrentLoading) return
    if (!currentDisplayMessages || currentDisplayMessages.length === 0) {
      window.dispatchEvent(
        new CustomEvent('context-tracker-updated', {
          detail: {
            sessionId: String(activeSessionId),
            currentTokens: 0,
            maxTokens: 256000,
            currentChars: 0,
            maxChars: 256000,
            percentage: 0
          }
        })
      )
      return
    }

    let isMounted = true
    import('../api/ai/contextManager')
      .then(({ calculateSessionTokens, MAX_CONTEXT_TOKENS }) => {
        if (!isMounted) return
        const tokens = calculateSessionTokens(
          currentDisplayMessages,
          activeSessionCompact?.summaryBlock || activeSessionCompact?.summary_block || '',
          activeSessionCompact?.lastCompactedMessageId ||
            activeSessionCompact?.last_compacted_message_id ||
            null,
          '',
          activeSessionCompact?.lastCompactedAt || activeSessionCompact?.last_compacted_at || null
        )
        window.dispatchEvent(
          new CustomEvent('context-tracker-updated', {
            detail: {
              sessionId: String(activeSessionId),
              currentTokens: tokens,
              maxTokens: MAX_CONTEXT_TOKENS,
              percentage: Math.min(100, (tokens / MAX_CONTEXT_TOKENS) * 100),
              currentChars: tokens,
              maxChars: MAX_CONTEXT_TOKENS
            }
          })
        )
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [activeSessionId, currentDisplayMessages?.length, activeSessionCompact, isCurrentLoading])

  const handleSendMessage = async (prompt, sendOptions = {}) => {
    if (!prompt.trim()) return

    const rawDisplay = sendOptions?.displayPrompt || prompt
    // Auto-update session title if it's default
    const currentSession =
      sessions.find((s) => String(s.id) === String(activeSessionId)) ||
      (await getSessionSummary(activeSessionId))
    let newTitle = currentSession?.title
    if (newTitle === 'Percakapan Baru' && rawDisplay.length > 0) {
      newTitle = rawDisplay.slice(0, 30) + (rawDisplay.length > 30 ? '...' : '')
      await renameSession(activeSessionId, newTitle)
      await loadAllSessions()
    }

    if (isCurrentLoading && typeof handleIntervention === 'function') {
      handleIntervention(prompt, activeSessionId, {
        displayPrompt: rawDisplay,
        skillRefs: sendOptions.skillRefs
      })
      return
    }

    const isMain = String(activeSessionId) === '1' || String(activeSessionId) === '1.0'
    const commandOpts = {
      displayPrompt: rawDisplay,
      attachedFiles: sendOptions?.attachedFiles,
      ...sendOptions,
      workspaceRoot: resolveSessionWorkspace(
        { ...currentSession, id: activeSessionId },
        defaultRoot
      ),
      ...(!isMain ? { sessionId: activeSessionId, customChatData: activeSessionData } : {})
    }

    handlePlanningCommand(prompt, false, false, commandOpts)
  }

  // Real-time live background sync across sessions & trigger quick prompt
  useEffect(() => {
    const handleSessionUpdate = (e) => {
      if (e.detail && String(e.detail.sessionId) === String(activeSessionId)) {
        setActiveSessionData(e.detail.data || [])
      }
    }

    const handleQuickPrompt = (e) => {
      if (e.detail?.prompt) {
        handleSendMessage(e.detail.prompt)
      }
    }

    window.addEventListener('session-updated', handleSessionUpdate)
    window.addEventListener('trigger-quick-prompt', handleQuickPrompt)

    return () => {
      window.removeEventListener('session-updated', handleSessionUpdate)
      window.removeEventListener('trigger-quick-prompt', handleQuickPrompt)
    }
  }, [activeSessionId, handleSendMessage])

  const lastMessage = currentDisplayMessages[currentDisplayMessages.length - 1]
  const lastMessageContent = lastMessage?.content || ''
  const lastMessageIsThinking = !!lastMessage?.isThinking
  const isAutoScrollEnabledRef = useRef(true)

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    // User is considered at bottom if within 80px
    isAutoScrollEnabledRef.current = scrollHeight - scrollTop - clientHeight < 80
  }

  const scrollToBottom = (behavior = 'auto') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior
      })
    }
  }

  useLayoutEffect(() => {
    if (isOpen === false) return
    const container = messagesContainerRef.current
    if (!container) return
    isAutoScrollEnabledRef.current = true
    container.scrollTop = container.scrollHeight
  }, [activeSessionId, isOpen])

  // Direct stick-to-bottom without conflicting timers or layout thrashing
  useEffect(() => {
    if (isAutoScrollEnabledRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [
    currentDisplayMessages.length,
    lastMessageContent,
    lastMessageIsThinking,
    isCurrentLoading,
    activeApproval?.status,
    activeApproval?.id
  ])

  // Pastikan auto-scroll ketika ada permintaan izin baru
  useEffect(() => {
    if (activeApproval && activeApproval.status === 'pending') {
      isAutoScrollEnabledRef.current = true
      scrollToBottom('smooth')
      const t = setTimeout(() => {
        scrollToBottom('smooth')
      }, 100)
      return () => clearTimeout(t)
    }
  }, [activeApproval?.id, activeApproval?.status])

  const createWorkspaceChat = async (root = null) => {
    const newSession = await createSession('Percakapan Baru', { workspaceRoot: root })
    setSessions((prev) => [...prev, newSession])
    setActiveSessionData([])
    setActiveSessionId(newSession.id)
  }

  const runWorkspaceAction = async (action) => {
    if (workspaceBusyRef.current) return
    workspaceBusyRef.current = true
    setIsWorkspaceBusy(true)
    setSessionsError('')
    try {
      await action()
    } catch (error) {
      setSessionsError(error.message || 'Workspace belum dapat disimpan.')
    } finally {
      workspaceBusyRef.current = false
      setIsWorkspaceBusy(false)
    }
  }

  const handleCreateNewChat = (root = null) => runWorkspaceAction(() => createWorkspaceChat(root))
  const handleAddWorkspace = () =>
    runWorkspaceAction(async () => {
      const selected = await webApi.selectDirectory()
      if (selected) await createWorkspaceChat(selected)
    })

  const handleSaveSession = async (id, updates) => {
    if (isMainSession(id)) throw new Error('Main Thread tidak dapat diubah.')
    const sessionIsRunning = runningSessionIds.map(String).includes(String(id))
    if (sessionIsRunning && Object.hasOwn(updates, 'workspaceRoot'))
      throw new Error('Tunggu proses percakapan selesai sebelum mengubah workspace.')
    const saved = await updateSessionMetadata(id, updates)
    setSessions((prev) =>
      prev.map((session) =>
        String(session.id) === String(id) ? { ...session, ...saved } : session
      )
    )
  }

  const handleDeleteSession = async (id) => {
    if (isMainSession(id)) throw new Error('Main Thread tidak dapat dihapus.')
    if (runningSessionIds.map(String).includes(String(id)))
      throw new Error('Tunggu proses percakapan selesai sebelum menghapus sesi.')
    const result = await deleteSession(id)
    if (!result?.success) throw new Error('Percakapan belum dapat dihapus.')
    setSessions((prev) => prev.filter((session) => String(session.id) !== String(id)))
    if (String(activeSessionId) === String(id)) setActiveSessionId('1')
  }

  const handleStopSession = () => {
    if (handleStop) handleStop(activeSessionId)
  }

  const handleManualCompaction = async () => {
    if (!currentDisplayMessages || currentDisplayMessages.length <= 1) return

    const compactBannerId = `compact-banner-${Date.now()}`
    const bannerMsg = {
      id: compactBannerId,
      role: 'system',
      isCompacting: true,
      compactProgress: 'Merangkum konteks percakapan...'
    }

    if (String(activeSessionId) === '1') {
      setMainChatData((prev) => [...(prev || []), bannerMsg])
    } else {
      setActiveSessionData((prev) => [...(prev || []), bannerMsg])
    }

    try {
      const configList = await db.config.toArray()
      const activeConfig = configList?.[0]?.data || configList?.[0] || {}

      const { executeSessionCompaction } = await import('../api/ai/contextManager')
      const res = await executeSessionCompaction({
        sessionId: String(activeSessionId),
        messages: currentDisplayMessages.filter((m) => !m.isCompacting),
        activeConfig,
        force: true,
        onProgress: (prog) => {
          const updateFn = (prev) =>
            (prev || []).map((m) =>
              m.id === compactBannerId
                ? { ...m, compactProgress: prog?.text || m.compactProgress }
                : m
            )
          if (String(activeSessionId) === '1') {
            setMainChatData(updateFn)
          } else {
            setActiveSessionData(updateFn)
          }
        }
      })

      if (res?.isCompacted) {
        if (res.compactedMessages) {
          const cleanCompacted = res.compactedMessages.filter((m) => m.id !== compactBannerId)
          if (String(activeSessionId) === '1') {
            setMainChatData(cleanCompacted)
          } else {
            setActiveSessionData(cleanCompacted)
          }
        }
        if (res.lastCompactedMessageId) {
          setLastCompactedMessageId(res.lastCompactedMessageId)
          setActiveSessionCompact({
            summaryBlock: res.newSummaryBlock,
            lastCompactedMessageId: res.lastCompactedMessageId
          })
        }
        window.dispatchEvent(
          new CustomEvent('session-compact-updated', {
            detail: {
              sessionId: String(activeSessionId),
              lastCompactedMessageId: res.lastCompactedMessageId,
              summaryBlock: res.newSummaryBlock
            }
          })
        )
        const currentTok = res.currentTokens ?? res.currentChars ?? 0
        const maxTok = res.maxTokens || 256000
        window.dispatchEvent(
          new CustomEvent('context-tracker-updated', {
            detail: {
              sessionId: String(activeSessionId),
              currentTokens: currentTok,
              maxTokens: maxTok,
              currentChars: currentTok,
              maxChars: maxTok,
              percentage: Math.min(100, (currentTok / maxTok) * 100),
              lastCompactedAt: Date.now()
            }
          })
        )
      }
    } catch (e) {
      console.error('[ChatStudio] Manual compaction error:', e)
    } finally {
      if (String(activeSessionId) === '1') {
        setMainChatData((prev) => (prev || []).filter((m) => m.id !== compactBannerId))
      } else {
        setActiveSessionData((prev) => (prev || []).filter((m) => m.id !== compactBannerId))
      }
    }
  }

  useEffect(() => {
    const handleReqCompact = () => handleManualCompaction()
    window.addEventListener('request-manual-compaction', handleReqCompact)
    return () => window.removeEventListener('request-manual-compaction', handleReqCompact)
  }, [activeSessionId, currentDisplayMessages])

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose()
    } else {
      navigate('/')
    }
  }

  // Jika dipanggil via route (tanpa prop isOpen), default ke true
  if (isOpen === false) return null

  const activeSessionObj = sessions.find((s) => String(s.id) === String(activeSessionId)) || {
    id: '1',
    title: 'Main Thread'
  }
  const activeSessionWorkspace = resolveSessionWorkspace(activeSessionObj, defaultRoot)

  return (
    <>
      <div className="fixed inset-0 z-[80] w-screen h-screen bg-base-300 flex overflow-hidden animate-[response-fade-in_0.2s_ease-out_forwards]">
        <div className={narrow && browserOpen ? 'hidden' : 'contents'}>
          <WorkspaceSidebar
            sessions={sessions}
            defaultRoot={defaultRoot}
            activeId={activeSessionId}
            runningIds={[
              ...runningSessionIds,
              ...(!runningSessionIds.length && (isMainLoading || isAgentBusy) ? ['1'] : [])
            ]}
            loading={isSessionsLoading}
            error={sessionsError}
            busy={isWorkspaceBusy || !defaultRoot}
            onRetry={loadAllSessions}
            onClose={handleClose}
            minimized={sidebarMinimized}
            onToggleMinimized={() => setSidebarMinimized((value) => !value)}
            onSelect={setActiveSessionId}
            onCreate={handleCreateNewChat}
            onAddWorkspace={handleAddWorkspace}
            onSave={handleSaveSession}
            onDelete={handleDeleteSession}
          />
        </div>

        {/* === RIGHT MAIN: BUBBLE CHAT AREA === */}
        <div
          className={`flex-1 flex flex-col h-full bg-base-300/60 relative min-w-0 overflow-hidden ${browserOpen && (narrow || browserExpanded) ? 'hidden' : ''}`}
          style={
            browserOpen && !narrow && !browserExpanded
              ? { flex: '0 0 auto', width: chatWidth, maxWidth: '40%' }
              : undefined
          }
        >
          {/* Header */}
          <div className="h-14 px-3 border-b border-white/10 flex items-center justify-between bg-base-300/80 backdrop-blur-md shrink-0 z-30 relative select-none">
            <div className="flex flex-col min-w-0 pr-4">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-bold text-white truncate">
                  {activeSessionObj.title || 'Percakapan'}
                </h3>
                {activeSessionWorkspace && (
                  <span
                    className="badge badge-xs bg-primary/10 text-primary border-primary/30 font-mono text-[9px] px-2 py-0.5 max-w-28 shrink-0 truncate inline-flex items-center gap-1"
                    title={`Workspace: ${activeSessionWorkspace}`}
                  >
                    <Folder className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{activeSessionWorkspace.split(/[\\/]/).pop()}</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/40">
                {currentDisplayMessages.length} pesan terdaftar
              </span>
            </div>

            <button
              type="button"
              onClick={() => setBrowserOpen(true)}
              className="flex shrink-0 items-center gap-2 text-xs text-white/60 hover:text-white"
              title="Buka browser percakapan"
              aria-label="Buka browser percakapan"
            >
              <PanelRight size={16} />
              {!browserOpen && 'Browser'}
            </button>
          </div>

          {/* Messages Stream Container */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-6 custom-scrollbar min-h-0"
          >
            <div className="max-w-6xl mx-auto w-full min-h-full flex flex-col space-y-8">
              {currentDisplayMessages.length > visibleMessageCount && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => setVisibleMessageCount((prev) => prev + 30)}
                    className="btn btn-xs btn-ghost text-[11px] text-white/50 hover:text-white border border-white/10 rounded-full px-4 normal-case cursor-pointer"
                  >
                    Muat pesan sebelumnya ({currentDisplayMessages.length - visibleMessageCount}{' '}
                    pesan lagi)
                  </button>
                </div>
              )}

              {currentDisplayMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-white/40 space-y-4 my-auto">
                  <img src="/icon-256.png" alt="icon" className="size-30" />
                  <div className="max-w-lg space-y-1">
                    <h4 className="text-xl font-bold text-white">Selamat Datang di Mark Agent</h4>
                    <p className="text-lg text-white/50">
                      Tanyakan apapun, analisis kode, atau diskusikan ide riset bersama Mark.
                    </p>
                  </div>
                </div>
              ) : (
                (() => {
                  const hasActivePlan = (currentDisplayMessages || []).some(
                    (m) => m.isPlanSteps && m.taskStatus === 'running'
                  )
                  const activeThinkingMsg =
                    [...(currentDisplayMessages || [])].reverse().find((m) => m.isThinking) || null

                  const visibleMessages = currentDisplayMessages.slice(-visibleMessageCount)
                  return buildCompletedTurnRenderItems(visibleMessages, isCurrentLoading).map(
                    (item, idx) => {
                      if (item.type === 'process') {
                        const progressMessages = item.messages.filter((message) => {
                          if (message.isPlanSteps) return true
                          const content = message.content
                          if (
                            message.isThinking &&
                            typeof content === 'string' &&
                            /^(?:Mengeksekusi\b|Selesai mengeksekusi\b)/i.test(content.trim())
                          ) {
                            return false
                          }
                          return typeof content === 'string'
                            ? Boolean(content.trim())
                            : Boolean(content?.length)
                        })
                        let stepCursor = 0
                        const processItems = progressMessages.map((message, messageIndex) => {
                          const messageStepCount = Array.isArray(message.executedTools)
                            ? message.executedTools.length
                            : 0
                          const stepEnd = Math.max(stepCursor, messageStepCount)
                          const messageSteps = item.steps.slice(stepCursor, stepEnd)
                          stepCursor = stepEnd
                          return { message, messageSteps, messageIndex }
                        })
                        if (stepCursor < item.steps.length) {
                          processItems.push({
                            message: { role: 'assistant', content: '' },
                            messageSteps: item.steps.slice(stepCursor),
                            messageIndex: 'remaining'
                          })
                        }
                        const activeActivityIndex = item.isActive
                          ? processItems.findLastIndex(({ messageSteps }) =>
                              messageSteps.some((step) => step.tool || step.action)
                            )
                          : -1

                        return (
                          <details
                            key={`process-${item.id}-${idx}`}
                            className="chat-process group/completed-process w-full outline-none"
                            open={item.isActive}
                          >
                            <summary className="group/row list-none flex w-full items-center gap-1.5 cursor-pointer border-b border-white/10 mt-1 pt-1.5 pb-2 text-sm font-sans text-white/55 hover:text-white/80 focus-visible:text-white/80 select-none transition-colors">
                              <span>Proses</span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white/55 transition-transform duration-150 group-open/completed-process:rotate-90" />
                            </summary>
                            <div className="chat-process-body space-y-2">
                              {item.isActive && processItems.length === 0 && (
                                <div role="status" className="text-sm text-white/60">
                                  Sedang menganalisis permintaan…
                                </div>
                              )}
                              {processItems.map(
                                ({ message, messageSteps, messageIndex }, processIndex) => (
                                  <ChatList
                                    key={
                                      message.id ||
                                      `${message.timestamp || 'progress'}-${messageIndex}`
                                    }
                                    role={message.role || 'assistant'}
                                    content={message.content || ''}
                                    reasoning={item.isActive ? message.reasoning : null}
                                    compactActivity
                                    isActivityActive={processIndex === activeActivityIndex}
                                    sources={message.sources || []}
                                    timestamp={message.timestamp}
                                    isPlanSteps={message.isPlanSteps}
                                    plan={message.plan}
                                    currentStep={message.currentStep}
                                    taskId={message.taskId}
                                    taskTitle={message.taskTitle}
                                    taskObjective={message.taskObjective}
                                    taskStatus={message.taskStatus}
                                    artifactRoot={message.artifactRoot}
                                    executedTools={messageSteps}
                                  />
                                )
                              )}
                            </div>
                          </details>
                        )
                      }

                      const msg = item.message
                      if (hasActivePlan && msg.isThinking && !msg.isPlanSteps) {
                        return null
                      }
                      const { cleanContent } = filterMessagePrefixes(msg.content)
                      return (
                        <ChatList
                          key={
                            msg.id
                              ? `${msg.id}-${idx}`
                              : `${msg.created_at || msg.timestamp || 'msg'}-${idx}`
                          }
                          id={msg.id || msg.timestamp || msg.created_at}
                          lastCompactedMessageId={lastCompactedMessageId}
                          isCompacting={msg.isCompacting}
                          compactProgress={msg.compactProgress}
                          role={msg.role}
                          content={cleanContent}
                          followsProcess={item.hideProcessDetails}
                          reasoning={msg.reasoning}
                          skills={msg.skills}
                          isThinking={msg.isThinking}
                          isSearching={msg.isSearching}
                          isSummarizing={msg.isSummarizing}
                          isSearchingMusic={msg.isSearchingMusic}
                          sources={msg.sources}
                          executedTools={item.hideProcessDetails ? [] : msg.executedTools}
                          isMemorySaved={msg.isMemorySaved}
                          isMemoryUpdated={msg.isMemoryUpdated}
                          isMemoryDeleted={msg.isMemoryDeleted}
                          timestamp={msg.timestamp}
                          mood={msg.mood}
                          source={msg.source}
                          sender={msg.sender}
                          isPlanSteps={msg.isPlanSteps}
                          plan={msg.plan}
                          currentStep={msg.currentStep}
                          taskId={msg.taskId}
                          taskTitle={msg.taskTitle}
                          taskObjective={msg.taskObjective}
                          taskStatus={msg.taskStatus}
                          artifactRoot={msg.artifactRoot}
                          activeLiveTools={
                            hasActivePlan && msg.isPlanSteps
                              ? activeThinkingMsg?.executedTools || null
                              : null
                          }
                          activeThinkingContent={
                            hasActivePlan && msg.isPlanSteps
                              ? (activeThinkingMsg?.reasoning
                                  ? activeThinkingMsg.reasoning
                                      .split('\n')
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                      .pop()
                                  : null) ||
                                activeThinkingMsg?.content ||
                                null
                              : null
                          }
                          onStop={handleStopSession}
                          isApproval={msg.isApproval}
                          approvalId={msg.approvalId}
                          approvalTool={msg.tool}
                          approvalQuery={msg.query}
                          approvalStatus={msg.status}
                        />
                      )
                    }
                  )
                })()
              )}
              <SubagentDecisionInbox sessionId={String(activeSessionId)} />
              {/* Spacer besar dan anti-shrink agar pesan paling bawah (termasuk tombol ApprovalBubble) tidak pernah terpotong saat scroll mentok */}
              <div
                ref={messagesEndRef}
                className="h-32 min-h-32 shrink-0 w-full pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Bottom Input Area */}
          <div className="p-3 border-t border-white/10 bg-base-200/40 shrink-0 z-20">
            <div className="max-w-6xl mx-auto w-full h-full">
              <InputBar
                contextManagedExternally={true}
                initialDraft={initialDraft}
                sessionId={String(activeSessionId)}
                inline={true}
                onSubmit={handleSendMessage}
                isLoading={isCurrentLoading}
                isRecording={isRecording}
                isProcessing={isProcessing}
                audioIntensity={audioIntensity}
                onStartRecord={startRecording}
                onStopRecord={stopRecording}
                onStop={handleStopSession}
                source={inputSource || 'pc'}
                workspaceRoot={activeSessionWorkspace}
                onManualCompact={handleManualCompaction}
              />
            </div>
          </div>
        </div>
        {browserOpen && (
          <>
            {!narrow && !browserExpanded && (
              <div
                role="separator"
                aria-label="Lebar percakapan dan browser"
                aria-orientation="vertical"
                tabIndex={0}
                className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 focus:bg-primary/40"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                    setChatWidth((w) =>
                      Math.max(300, Math.min(600, w + (e.key === 'ArrowLeft' ? -30 : 30)))
                    )
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setChatWidth(
                      Math.max(300, Math.min(600, e.clientX - (sidebarMinimized ? 48 : 320)))
                    )
                }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              />
            )}
            <div className="min-w-0 h-full flex-1 overflow-hidden">
              <BrowserPanel
                key={browserId}
                sessionId={browserId}
                onClose={() => setBrowserOpen(false)}
                onResume={resumeBrowser}
                expanded={browserExpanded || narrow}
                onExpand={() =>
                  narrow ? setBrowserOpen(false) : setBrowserExpanded((value) => !value)
                }
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
export default ChatStudio
