/* eslint-disable react/prop-types, react-refresh/only-export-components */
import { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { webApi } from '../api/web-bridge.js'
import { McpToolName } from '../components/Chat/McpToolName'

const ApprovalContext = createContext()

export function extractToolTarget(tool, query) {
  if (['run-powershell', 'run-task'].includes(tool))
    return {
      type: 'command',
      value: typeof query === 'object' ? query?.command || '' : String(query || '')
    }
  return {
    type: 'path',
    value:
      typeof query === 'object'
        ? query?.path || query?.filePath || query?.file_path || ''
        : String(query || '').split('||')[0]
  }
}
export function getFolderFromPath(value) {
  return value?.replace(/[\\/][^\\/]*$/, '') || ''
}

export function ApprovalProvider({ children }) {
  const [approvalData, setApprovalData] = useState(null)
  const queue = useRef([])
  const dialog = useRef(null)
  const location = useLocation()
  const showNext = useCallback(
    () => setApprovalData(queue.current[0] ? { ...queue.current[0] } : null),
    []
  )
  const resolveApproval = useCallback(
    async (id, choice) => {
      const current = queue.current.find((item) => item.id === id)
      if (!current || current.busy) return
      current.busy = true
      showNext()
      try {
        const result = await webApi.decideToolApproval(current.id, current.meta.owner, choice)
        current.cleanup?.()
        queue.current = queue.current.filter((item) => item !== current)
        current.meta.targetSetChatData?.((items) =>
          items.map((item) => (item.approvalId === id ? { ...item, status: choice } : item))
        )
        current.resolve(result.status === 'allowed')
      } catch (cause) {
        current.error = cause.message
        current.busy = false
      }
      showNext()
    },
    [showNext]
  )
  const requestApproval = useCallback(
    (message, tool, query, meta = {}) =>
      new Promise((resolve) => {
        if (!meta.requestId || meta.signal?.aborted) {
          resolve(false)
          return
        }
        const existing = queue.current.find((entry) => entry.id === meta.requestId)
        if (existing) {
          existing.resolvers.push(resolve)
          return
        }
        const resolvers = [resolve]
        const item = {
          id: meta.requestId,
          message,
          tool,
          query,
          meta,
          status: 'pending',
          resolvers,
          resolve: (result) => resolvers.forEach((done) => done(result))
        }
        const abort = () => {
          queue.current = queue.current.filter((entry) => entry !== item)
          item.cleanup?.()
          item.resolve(false)
          showNext()
        }
        const timer = setTimeout(
          abort,
          Math.max(1, (meta.expiresAt || Date.now() + 300000) - Date.now())
        )
        item.cleanup = () => {
          clearTimeout(timer)
          meta.signal?.removeEventListener('abort', abort)
        }
        meta.signal?.addEventListener('abort', abort, { once: true })
        queue.current.push(item)
        showNext()
      }),
    [showNext]
  )

  useEffect(() => {
    webApi.requestToolApproval = requestApproval
    return () => {
      if (webApi.requestToolApproval === requestApproval) delete webApi.requestToolApproval
    }
  }, [requestApproval])
  useEffect(() => {
    let alive = true
    const receive = (packet) => {
      if (alive)
        requestApproval(packet.message, packet.tool, packet.query, {
          ...packet,
          sessionId: packet.owner.codingSessionId
        }).catch(() => {})
    }
    const unsubscribe = webApi.onToolApprovalRequest(receive)
    const closed = webApi.onToolApprovalClosed((data) => {
      const current = queue.current.find((item) => item.id === data.requestId)
      if (!current) return
      current.cleanup?.()
      current.resolve(data.status === 'allowed')
      queue.current = queue.current.filter((item) => item !== current)
      showNext()
    })
    webApi
      .getPendingToolApprovals()
      .then((items) => items.forEach(receive))
      .catch(() => {})
    return () => {
      alive = false
      unsubscribe()
      closed()
    }
  }, [requestApproval, showNext])

  useEffect(() => {
    if (!approvalData) return
    window.api
      ?.tgBroadcastToAdmins?.(
        approvalData.message +
          '\n' +
          (approvalData.meta.reason || '') +
          '\n' +
          (approvalData.meta.scopeLabel || '') +
          '\n/accept untuk sekali, /reject untuk menolak.' +
          (approvalData.meta.canRemember
            ? ' /session atau /always untuk menyimpan cakupan izin ini.'
            : '')
      )
      ?.catch?.(() => {})
  }, [approvalData?.id])
  useEffect(() => {
    const handlers = [
      ['onTgCommandAccept', 'approve_once'],
      ['onTgCommandSession', 'approve_session'],
      ['onTgCommandAlways', 'approve_always'],
      ['onTgCommandReject', 'reject']
    ].map(([event, choice]) =>
      window.api?.[event]?.((data) => {
        const current = queue.current[0]
        if (!current) return
        resolveApproval(
          current.id,
          current.meta.canRemember ? choice : choice === 'reject' ? choice : 'approve_once'
        )
        if (data?.chatId)
          window.api?.tgSendMessage?.(data.chatId, 'Keputusan izin sedang diproses.')
      })
    )
    return () => handlers.forEach((unsubscribe) => unsubscribe?.())
  }, [resolveApproval])
  useEffect(
    () => () => {
      for (const item of queue.current) {
        item.cleanup?.()
        item.resolve(false)
      }
      queue.current = []
    },
    []
  )
  useEffect(() => {
    if (
      !approvalData ||
      (location.pathname === '/chat' &&
        !approvalData.meta.owner?.approvalJobId &&
        !approvalData.meta.direct)
    )
      return
    const previous = document.activeElement
    dialog.current?.querySelector('button')?.focus()
    return () => previous?.focus?.()
  }, [approvalData?.id, location.pathname])

  return (
    <ApprovalContext.Provider
      value={{
        requestApproval,
        resolveApproval,
        activeApproval:
          approvalData?.meta.owner?.approvalJobId || approvalData?.meta.direct ? null : approvalData
      }}
    >
      {children}
      {approvalData &&
        (location.pathname !== '/chat' ||
          approvalData.meta.owner?.approvalJobId ||
          approvalData.meta.direct) && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
            role="presentation"
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="approval-title"
              className="w-full max-w-lg max-h-[calc(100dvh-32px)] overflow-y-auto rounded-xl border border-white/10 bg-base-200 p-5 text-sm shadow-xl custom-scrollbar"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  resolveApproval(approvalData.id, 'reject')
                }
                if (event.key === 'Tab') {
                  const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')]
                  const first = buttons[0],
                    last = buttons.at(-1)
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault()
                    last?.focus()
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault()
                    first?.focus()
                  }
                }
              }}
            >
              <h3 id="approval-title" className="mb-3 flex items-center gap-2 font-semibold">
                <ShieldAlert size={18} className="text-warning" />
                Persetujuan tindakan
              </h3>
              <McpToolName name={approvalData.tool} />
              <p className="mt-3 whitespace-pre-wrap break-words">{approvalData.message}</p>
              <p className="mt-3 text-xs leading-relaxed text-base-content/70">
                {approvalData.meta.reason}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-base-content/70">
                {approvalData.meta.scopeLabel}
              </p>
              {approvalData.error && (
                <p role="alert" className="mt-3 text-error">
                  {approvalData.error}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={approvalData.busy}
                  className="btn btn-ghost btn-sm text-error"
                  onClick={() => resolveApproval(approvalData.id, 'reject')}
                >
                  Tolak
                </button>
                {approvalData.meta.canRemember && (
                  <>
                    <button
                      type="button"
                      disabled={approvalData.busy}
                      className="btn btn-ghost btn-sm"
                      onClick={() => resolveApproval(approvalData.id, 'approve_session')}
                    >
                      Izinkan sesi ini
                    </button>
                    <button
                      type="button"
                      disabled={approvalData.busy}
                      className="btn btn-ghost btn-sm"
                      onClick={() => resolveApproval(approvalData.id, 'approve_always')}
                    >
                      Simpan izin
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={approvalData.busy}
                  className="btn btn-primary btn-sm"
                  onClick={() => resolveApproval(approvalData.id, 'approve_once')}
                >
                  Izinkan sekali
                </button>
              </div>
            </div>
          </div>
        )}
    </ApprovalContext.Provider>
  )
}

export const useApproval = () => useContext(ApprovalContext)
