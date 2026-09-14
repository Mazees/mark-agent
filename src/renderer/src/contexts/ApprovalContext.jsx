import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ShieldAlert, Terminal, FileCode } from 'lucide-react'
import { getAlwaysAllowedPaths, addAlwaysAllowedPath, getSessionAutoMode } from '../api/db'

const ApprovalContext = createContext()

export function extractToolTarget(tool, query) {
  if (!query) return { type: 'unknown', value: '' }

  if (tool === 'run-powershell') {
    const cmd =
      typeof query === 'object' && query !== null
        ? query.command || query.cmd || ''
        : String(query || '')
    return { type: 'command', value: String(cmd).trim() }
  }

  let rawPath = ''
  if (typeof query === 'object' && query !== null) {
    rawPath = query.path || query.filePath || query.cwd || query.target || ''
  } else if (typeof query === 'string') {
    rawPath = query.split('||')[0].trim()
  }

  return {
    type: 'path',
    value: String(rawPath)
      .replace(/^["']|["']$/g, '')
      .trim()
  }
}

export function getFolderFromPath(filePath) {
  if (!filePath) return ''
  const normalized = filePath.replace(/[\\/]+/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash !== -1) {
    return normalized.substring(0, lastSlash)
  }
  return normalized
}

export const ApprovalProvider = ({ children }) => {
  const [approvalData, setApprovalData] = useState(null)
  const approvalRef = useRef(null)
  const [alwaysAllowedPaths, setAlwaysAllowedPaths] = useState([])
  const sessionAllowedMapRef = useRef(new Map())

  const location = useLocation()
  const isChatStudio =
    location?.pathname === '/chat' ||
    (typeof window !== 'undefined' && window.location.hash.includes('/chat'))

  const alwaysAllowedPathsRef = useRef(alwaysAllowedPaths)
  useEffect(() => {
    alwaysAllowedPathsRef.current = alwaysAllowedPaths
  }, [alwaysAllowedPaths])

  // Muat data alwaysAllowedPaths dari SQLite database saat startup
  useEffect(() => {
    getAlwaysAllowedPaths().then((paths) => {
      if (Array.isArray(paths)) {
        setAlwaysAllowedPaths(paths)
      }
    })

    const handleConfigUpdated = (e) => {
      if (Array.isArray(e.detail?.alwaysAllowedPaths)) {
        setAlwaysAllowedPaths(e.detail.alwaysAllowedPaths)
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)
    return () => window.removeEventListener('config-updated', handleConfigUpdated)
  }, [])

  // Pastikan ref selalu sinkron dengan state
  useEffect(() => {
    approvalRef.current = approvalData
  }, [approvalData])

  const handleApproveAlwaysInternal = useCallback(async (tool, targetQuery) => {
    const target = extractToolTarget(tool, targetQuery)
    let identifierToAdd = ''

    if (target.type === 'command') {
      identifierToAdd = `cmd:${target.value.toLowerCase()}`
    } else if (target.type === 'path' && target.value) {
      const normalizedPath = target.value.replace(/[\\/]+/g, '/').toLowerCase()
      const folder = getFolderFromPath(normalizedPath)
      identifierToAdd = folder || normalizedPath
    }

    if (identifierToAdd) {
      const updated = await addAlwaysAllowedPath(identifierToAdd)
      if (Array.isArray(updated)) {
        setAlwaysAllowedPaths(updated)
      }
    }
  }, [])

  const resolveApproval = useCallback(
    (approvalId, decisionType) => {
      // decisionType: 'approve_once' | 'approve_session' | 'approve_always' | 'reject'
      const current = approvalRef.current
      if (!current) return
      if (approvalId && current.id !== approvalId) return

      approvalRef.current = null
      setApprovalData(null)

      const sid = current.meta?.sessionId ? String(current.meta.sessionId) : '1'

      if (decisionType === 'approve_always') {
        handleApproveAlwaysInternal(current.tool, current.query)
      } else if (decisionType === 'approve_session') {
        if (!sessionAllowedMapRef.current.has(sid)) {
          sessionAllowedMapRef.current.set(sid, new Set())
        }
        const target = extractToolTarget(current.tool, current.query)
        const targetKey =
          target.type === 'command'
            ? `cmd:${target.value.toLowerCase()}`
            : target.value
              ? target.value.replace(/[\\/]+/g, '/').toLowerCase()
              : current.tool
        sessionAllowedMapRef.current.get(sid).add(targetKey)
        if (target.type === 'path' && target.value) {
          const folder = getFolderFromPath(target.value.replace(/[\\/]+/g, '/').toLowerCase())
          if (folder) sessionAllowedMapRef.current.get(sid).add(folder)
        }
      }

      const isApproved =
        decisionType === 'approve_once' ||
        decisionType === 'approve_session' ||
        decisionType === 'approve_always'

      // Update bubble state in chat feed if targetSetChatData exists
      if (typeof current.meta?.targetSetChatData === 'function') {
        current.meta.targetSetChatData((prev) =>
          (prev || []).map((msg) =>
            msg.id === current.id || msg.approvalId === current.id
              ? { ...msg, status: decisionType }
              : msg
          )
        )
      }

      if (typeof current.resolve === 'function') {
        current.resolve(isApproved)
      }
    },
    [handleApproveAlwaysInternal]
  )

  const handleRemoteDecision = useCallback(
    (decisionType, chatId) => {
      const current = approvalRef.current
      if (current) {
        resolveApproval(current.id, decisionType)

        if (chatId && window.api?.tgSendMessage) {
          let msg = '[INFO]: Permintaan persetujuan telah ditolak.'
          if (decisionType === 'approve_always') {
            msg = '[INFO]: Permintaan persetujuan diizinkan SELAMANYA.'
          } else if (decisionType === 'approve_session') {
            msg = '[INFO]: Permintaan persetujuan telah diizinkan untuk sesi ini.'
          } else if (decisionType === 'approve_once') {
            msg = '[INFO]: Permintaan persetujuan telah diizinkan sekali.'
          }
          window.api.tgSendMessage(chatId, msg)
        }
      } else {
        if (chatId && window.api?.tgSendMessage) {
          window.api.tgSendMessage(
            chatId,
            '[INFO]: Tidak ada permintaan persetujuan yang sedang menunggu.'
          )
        }
      }
    },
    [resolveApproval]
  )

  useEffect(() => {
    const unsubAccept = window.api?.onTgCommandAccept
      ? window.api.onTgCommandAccept((data) => {
          handleRemoteDecision('approve_once', data?.chatId)
        })
      : null

    const unsubSession = window.api?.onTgCommandSession
      ? window.api.onTgCommandSession((data) => {
          handleRemoteDecision('approve_session', data?.chatId)
        })
      : null

    const unsubAlways = window.api?.onTgCommandAlways
      ? window.api.onTgCommandAlways((data) => {
          handleRemoteDecision('approve_always', data?.chatId)
        })
      : null

    const unsubReject = window.api?.onTgCommandReject
      ? window.api.onTgCommandReject((data) => {
          handleRemoteDecision('reject', data?.chatId)
        })
      : null

    return () => {
      if (typeof unsubAccept === 'function') unsubAccept()
      if (typeof unsubSession === 'function') unsubSession()
      if (typeof unsubAlways === 'function') unsubAlways()
      if (typeof unsubReject === 'function') unsubReject()
    }
  }, [handleRemoteDecision])

  const checkIsAlwaysAllowed = useCallback((tool, query) => {
    const target = extractToolTarget(tool, query)
    const allowedList = alwaysAllowedPathsRef.current || []

    if (target.type === 'command') {
      const cmdKey = `cmd:${target.value.toLowerCase()}`
      return allowedList.some((item) => (item || '').toLowerCase() === cmdKey)
    }

    if (target.type === 'path' && target.value) {
      const normTarget = target.value.replace(/[\\/]+/g, '/').toLowerCase()
      const targetFolder = getFolderFromPath(normTarget)

      return allowedList.some((item) => {
        const normAllowed = (item || '').toLowerCase().replace(/[\\/]+/g, '/')
        if (!normAllowed || normAllowed.startsWith('cmd:')) return false
        return (
          normTarget === normAllowed ||
          targetFolder === normAllowed ||
          normTarget.startsWith(normAllowed.endsWith('/') ? normAllowed : normAllowed + '/')
        )
      })
    }

    return false
  }, [])

  const checkIsSessionAllowed = useCallback((sessionId, tool, query) => {
    const sid = sessionId ? String(sessionId) : '1'
    const sessionSet = sessionAllowedMapRef.current.get(sid)
    if (!sessionSet) return false

    const target = extractToolTarget(tool, query)
    const targetKey =
      target.type === 'command'
        ? `cmd:${target.value.toLowerCase()}`
        : target.value
          ? target.value.replace(/[\\/]+/g, '/').toLowerCase()
          : tool
    const folder = target.type === 'path' ? getFolderFromPath(targetKey) : ''

    return sessionSet.has(targetKey) || (folder && sessionSet.has(folder))
  }, [])

  const requestApproval = useCallback(
    async (message, tool, query, meta = {}) => {
      const sid = meta.sessionId ? String(meta.sessionId) : '1'

      // 1. Bypass otomatis jika is_auto_mode aktif pada sesi ini di database
      const isAuto = await getSessionAutoMode(sid)
      if (isAuto) {
        return true
      }

      // 2. Bypass jika sudah diizinkan selamanya (whitelist permanen)
      if (checkIsAlwaysAllowed(tool, query)) {
        return true
      }

      // 3. Bypass jika sudah diizinkan untuk sesi ini (in-memory)
      if (checkIsSessionAllowed(sid, tool, query)) {
        return true
      }

      if (window.api?.tgBroadcastToAdmins) {
        window.api.tgBroadcastToAdmins(
          `[INFO]: Persetujuan Dibutuhkan\nTool: \`${tool}\`\n\n${message}\n\nKetik /accept untuk sekali, /session untuk sesi ini, /always untuk selamanya, atau /reject untuk menolak.`
        )
      }

      const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      return new Promise((resolve) => {
        const dataObj = {
          id: approvalId,
          message,
          tool,
          query,
          meta,
          status: 'pending',
          resolve
        }
        approvalRef.current = dataObj
        setApprovalData(dataObj)

        // Jika dipanggil dari sesi percakapan, tambahkan ApprovalBubble ke riwayat chat
        if (typeof meta.targetSetChatData === 'function') {
          const approvalMsg = {
            id: approvalId,
            role: 'ai',
            isApproval: true,
            approvalId,
            tool,
            content: message,
            message,
            query,
            status: 'pending',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
          meta.targetSetChatData((prev) => [...(prev || []), approvalMsg])
        }
      })
    },
    [checkIsAlwaysAllowed, checkIsSessionAllowed]
  )

  const activeTargetInfo = approvalData
    ? extractToolTarget(approvalData.tool, approvalData.query)
    : null

  return (
    <ApprovalContext.Provider
      value={{
        requestApproval,
        resolveApproval,
        activeApproval: approvalData,
        alwaysAllowedPaths,
        setAlwaysAllowedPaths
      }}
    >
      {children}

      {/* Floating Dialog: Hanya ditampilkan di MarkHome atau halaman non-ChatStudio */}
      {approvalData && !isChatStudio && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[response-fade-in_0.15s_ease-out_forwards]">
          <div className="bg-base-200 border border-warning/30 p-6 rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-base font-bold text-warning flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-warning" /> Mark Meminta Izin
              </h3>
              {approvalData.tool && (
                <span className="badge badge-sm font-mono bg-warning/15 text-warning border-warning/30 font-semibold">
                  {approvalData.tool}
                </span>
              )}
            </div>

            <p className="mb-3 text-xs text-base-content/70">
              Mark membutuhkan persetujuan Anda untuk mengeksekusi aksi berikut.
            </p>

            <div className="bg-base-300 p-3.5 rounded-xl overflow-x-auto max-h-56 overflow-y-auto shadow-inner border border-white/5 mb-4 text-xs font-mono text-base-content/90 custom-scrollbar">
              {activeTargetInfo?.value ? (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-warning/80 flex items-center gap-1.5 select-none">
                    {activeTargetInfo.type === 'command' ? (
                      <>
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Perintah Shell:</span>
                      </>
                    ) : (
                      <>
                        <FileCode className="w-3.5 h-3.5" />
                        <span>Target Berkas:</span>
                      </>
                    )}
                  </div>
                  <div className="text-white whitespace-pre-wrap break-all">
                    {activeTargetInfo.value}
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-all">{approvalData.message}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
              <button
                className="btn btn-ghost btn-sm text-error hover:bg-error/10 border border-error/20 cursor-pointer"
                onClick={() => resolveApproval(approvalData.id, 'reject')}
              >
                Tolak
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-outline btn-sm cursor-pointer"
                  onClick={() => resolveApproval(approvalData.id, 'approve_once')}
                >
                  Izinkan Sekali
                </button>
                <button
                  className="btn btn-outline btn-warning btn-sm cursor-pointer"
                  onClick={() => resolveApproval(approvalData.id, 'approve_session')}
                >
                  Izinkan Sesi Ini
                </button>
                <button
                  className="btn btn-error btn-sm shadow-md cursor-pointer font-semibold"
                  onClick={() => resolveApproval(approvalData.id, 'approve_always')}
                >
                  Izinkan Selamanya
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ApprovalContext.Provider>
  )
}

export const useApproval = () => useContext(ApprovalContext)
