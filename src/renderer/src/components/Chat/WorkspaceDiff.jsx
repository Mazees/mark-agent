/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react'
import CodingDiff from './CodingDiff.jsx'
import { webApi } from '../../api/web-bridge.js'
export default function WorkspaceDiff({ tab, sessionId }) {
  const [diff, setDiff] = useState(null),
    [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    webApi
      .codingRequest(`/coding/runs/${encodeURIComponent(tab.runId)}/diff`, sessionId, {
        path: tab.path
      })
      .then((value) => {
        if (!disposed) setDiff(value)
      })
      .catch((e) => {
        if (!disposed) setError(e.message)
      })
    return () => {
      disposed = true
    }
  }, [tab.runId, tab.path, sessionId])
  if (error)
    return (
      <p role="alert" className="p-4 text-xs text-error">
        {error}
      </p>
    )
  if (!diff)
    return (
      <p role="status" className="p-4 text-xs text-white/60">
        Memuat diff giliran ini…
      </p>
    )
  if (diff.notice)
    return (
      <p className="p-4 text-xs text-white/60">
        {diff.notice} Sebelum: {diff.beforeSize || 0} byte. Sesudah: {diff.afterSize || 0} byte.
      </p>
    )
  return (
    <CodingDiff
      original={diff.before}
      modified={diff.after}
      options={{
        readOnly: true,
        fontSize: 12,
        renderSideBySide: false,
        minimap: { enabled: false }
      }}
    />
  )
}
