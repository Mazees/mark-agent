import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { getAlwaysAllowedPaths, addAlwaysAllowedPath } from '../api/db'

const ApprovalContext = createContext()

function getPathFromQuery(query) {
  if (!query || typeof query !== 'string') return ''
  const firstPart = query.split('||')[0].trim()
  return firstPart.replace(/^["']|["']$/g, '').replace(/[\\/]+/g, '/').toLowerCase()
}

function getFolderFromPath(filePath) {
  if (!filePath) return ''
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash !== -1) {
    return filePath.substring(0, lastSlash)
  }
  return filePath
}

export const ApprovalProvider = ({ children }) => {
  const [approvalData, setApprovalData] = useState(null)
  const approvalRef = useRef(null)
  const [alwaysAllowedPaths, setAlwaysAllowedPaths] = useState([])

  const alwaysAllowedPathsRef = useRef(alwaysAllowedPaths)
  useEffect(() => {
    alwaysAllowedPathsRef.current = alwaysAllowedPaths
  }, [alwaysAllowedPaths])

  // Muat data alwaysAllowedPaths dari Dexie DB saat startup
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

  // Pastikan ref selalu sinkron dengan state saat ini
  useEffect(() => {
    approvalRef.current = approvalData
  }, [approvalData])

  const handleApproveAlwaysInternal = useCallback(async (targetQuery) => {
    const rawPath = getPathFromQuery(targetQuery)
    const folderPath = getFolderFromPath(rawPath)
    const pathToAdd = folderPath || rawPath

    if (pathToAdd) {
      const updated = await addAlwaysAllowedPath(pathToAdd)
      if (Array.isArray(updated)) {
        setAlwaysAllowedPaths(updated)
      }
    }
  }, [])

  const handleRemoteDecision = useCallback((decisionType, chatId) => {
    // decisionType: 'approve_once' | 'approve_always' | 'reject'
    const current = approvalRef.current
    if (current) {
      approvalRef.current = null
      setApprovalData(null)

      if (decisionType === 'approve_always') {
        handleApproveAlwaysInternal(current.query, current)
      }

      const isApproved = decisionType === 'approve_once' || decisionType === 'approve_always'
      if (typeof current.resolve === 'function') {
        current.resolve(isApproved)
      }

      if (chatId && window.api?.tgSendMessage) {
        let msg = '[INFO]: Permintaan persetujuan telah ditolak.'
        if (decisionType === 'approve_always') {
          msg = '[INFO]: Permintaan persetujuan diizinkan SELAMANYA untuk path folder ini.'
        } else if (decisionType === 'approve_once') {
          msg = '[INFO]: Permintaan persetujuan telah diizinkan sekali.'
        }
        window.api.tgSendMessage(chatId, msg)
      }
    } else {
      if (chatId && window.api?.tgSendMessage) {
        window.api.tgSendMessage(chatId, '[INFO]: Tidak ada permintaan persetujuan yang sedang menunggu.')
      }
    }
  }, [handleApproveAlwaysInternal])

  useEffect(() => {
    // 1. Jalur Dedicated Command Accept
    const unsubAccept = window.api?.onTgCommandAccept
      ? window.api.onTgCommandAccept((data) => {
          handleRemoteDecision('approve_once', data?.chatId)
        })
      : null

    // 2. Jalur Dedicated Command Always
    const unsubAlways = window.api?.onTgCommandAlways
      ? window.api.onTgCommandAlways((data) => {
          handleRemoteDecision('approve_always', data?.chatId)
        })
      : null

    // 3. Jalur Dedicated Command Reject
    const unsubReject = window.api?.onTgCommandReject
      ? window.api.onTgCommandReject((data) => {
          handleRemoteDecision('reject', data?.chatId)
        })
      : null

    return () => {
      if (typeof unsubAccept === 'function') unsubAccept()
      if (typeof unsubAlways === 'function') unsubAlways()
      if (typeof unsubReject === 'function') unsubReject()
    }
  }, [handleRemoteDecision])

  const requestApproval = useCallback((message, tool, query) => {
    // Cek apakah query/path sudah diizinkan selamanya
    const targetPath = getPathFromQuery(query)
    const targetFolder = getFolderFromPath(targetPath)
    const currentAllowed = alwaysAllowedPathsRef.current || []

    const isAlwaysAllowed = currentAllowed.some((allowed) => {
      const normAllowed = (allowed || '').toLowerCase().replace(/[\\/]+/g, '/')
      if (!normAllowed) return false
      return (
        targetPath === normAllowed ||
        targetFolder === normAllowed ||
        targetPath.startsWith(normAllowed.endsWith('/') ? normAllowed : normAllowed + '/')
      )
    })

    if (isAlwaysAllowed) {
      return Promise.resolve(true)
    }

    if (window.api?.tgBroadcastToAdmins) {
      window.api.tgBroadcastToAdmins(
        `[INFO]: Persetujuan Dibutuhkan\nTool: \`${tool}\`\n\n${message}\n\nKetik /accept untuk mengizinkan sekali, /always untuk mengizinkan selamanya, atau /reject untuk menolak.`
      )
    }

    return new Promise((resolve) => {
      const dataObj = { message, tool, query, resolve }
      approvalRef.current = dataObj
      setApprovalData(dataObj)
    })
  }, [])

  const handleApproveOnce = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve(true)
    }
  }

  const handleApproveAlways = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current) {
      handleApproveAlwaysInternal(current.query, current)
      if (typeof current.resolve === 'function') {
        current.resolve(true)
      }
    }
  }

  const handleReject = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve(false)
    }
  }

  return (
    <ApprovalContext.Provider value={{ requestApproval, alwaysAllowedPaths, setAlwaysAllowedPaths }}>
      {children}
      {approvalData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[response-fade-in_0.15s_ease-out_forwards]">
          <div className="bg-base-200 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-lg w-full">
            <h3 className="text-lg font-bold text-error mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-error" /> Mark Meminta Izin
            </h3>
            <p className="mb-3 text-xs text-base-content/70">
              Mark membutuhkan persetujuan Anda untuk mengeksekusi aksi berikut.
            </p>
            <div className="whitespace-pre-wrap font-mono text-xs bg-base-300 p-3.5 rounded-xl overflow-x-auto max-h-56 overflow-y-auto shadow-inner border border-white/5 mb-4 text-base-content/90">
              {approvalData.message}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4">
              <button className="btn btn-ghost btn-sm" onClick={handleReject}>
                Tolak
              </button>
              <div className="flex items-center gap-2">
                <button className="btn btn-outline btn-sm" onClick={handleApproveOnce}>
                  Izinkan Sekali
                </button>
                <button className="btn btn-error btn-sm shadow-md" onClick={handleApproveAlways}>
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
