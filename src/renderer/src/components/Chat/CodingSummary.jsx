/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react'
import { webApi } from '../../api/web-bridge.js'
export default function CodingSummary({ runId, sessionId }) {
  const [run, setRun] = useState(null)
  useEffect(() => {
    let disposed = false
    const refresh = () =>
      webApi
        .codingRequest(`/coding/runs/${encodeURIComponent(runId)}`, sessionId)
        .then((value) => {
          if (!disposed) setRun(value)
        })
        .catch(() => {})
    refresh()
    const off = webApi.onCodingUpdate((event) => {
      if (String(event.sessionId) === String(sessionId)) refresh()
    })
    return () => {
      disposed = true
      off()
    }
  }, [runId, sessionId])
  if (!run || (!run.files.length && !run.checks.length && !run.childRuns?.length)) return null
  const failed =
    run.checks.filter((c) => c.status === 'failed').length +
    (run.childRuns || []).reduce((n, child) => n + child.failed, 0)
  const fileCount =
    run.files.length + (run.childRuns || []).reduce((n, child) => n + child.files, 0)
  return (
    <button
      type="button"
      className="mt-3 text-xs text-white/50 hover:text-primary text-left"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('coding-panel-open', {
            detail: {
              sessionId,
              tab: 'changes',
              runId: run.files.length ? runId : run.childRuns?.[0]?.id || runId
            }
          })
        )
      }
    >
      {fileCount} perubahan berkas ·{' '}
      {failed
        ? `${failed} pemeriksaan gagal`
        : run.checks.some((c) => c.status === 'passed') ||
            run.childRuns?.some((child) => child.passed > 0)
          ? 'Pemeriksaan lolos'
          : 'Belum diperiksa'}{' '}
      · Lihat perubahan
    </button>
  )
}
