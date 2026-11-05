/* eslint-disable react/prop-types */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FileDiff, FileText, Check, X } from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
function ChangeCard({ run, sessionId, refresh }) {
  const [open, setOpen] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const detailId = useId()
  const requestIds = useRef({})
  if (
    ['running', 'waiting'].includes(run.status) ||
    run.captureStatus !== 'completed' ||
    !run.files.length
  )
    return null
  const decided =
    run.review?.decision || (run.files.every((file) => file.undone) ? 'rejected' : null)
  const decide = async (decision) => {
    setBusy(true)
    setError('')
    try {
      await webApi.codingRequest(
        '/coding/runs/' + encodeURIComponent(run.id) + '/review',
        sessionId,
        { decision, requestId: requestIds.current[decision] ||= crypto.randomUUID(), afterOid: run.afterOid },
        'POST'
      )
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const openFile = (file) =>
    window.dispatchEvent(
      new CustomEvent('coding-panel-open', {
        detail: {
          sessionId: String(sessionId),
          type: 'diff',
          runId: run.id,
          path: file.relativePath || file.path
        }
      })
    )
  return (
    <section
      aria-label="Perubahan selama giliran ini"
      className="mt-4 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-xs [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-primary [&_button:focus-visible]:outline-offset-[-2px]"
    >
      {run.agentName && (
        <p className="border-b border-white/5 px-3 py-2 text-white/50">{run.agentName}</p>
      )}
      {open && (
        <ul id={detailId} className="py-1">
          {run.files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => openFile(file)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5"
                title={file.relativePath || file.path}
              >
                <FileText size={14} className="shrink-0 text-white/40" />
                <span className="shrink-0 tabular-nums text-primary">+{file.additions || 0}</span>
                <span className="shrink-0 tabular-nums text-error">−{file.deletions || 0}</span>
                <span className="min-w-0 flex-1 truncate text-white/80">
                  {(file.relativePath || file.path).split(/[\\/]/).pop()}
                </span>
                <span className="hidden max-w-[45%] truncate text-[10px] text-white/40 sm:block">
                  {file.relativePath || file.path}
                </span>
                {file.binary && <span className="text-white/40">Biner</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen(!open)}
          className="mr-auto inline-flex items-center gap-2 text-white/60"
        >
          <FileDiff size={14} />
          {run.files.length} berkas berubah
          <ChevronDown size={13} className={open ? 'rotate-180' : ''} />
        </button>
        {decided ? (
          <span
            className={
              decided === 'accepted'
                ? 'inline-flex items-center gap-1 text-primary'
                : 'inline-flex items-center gap-1 text-white/55'
            }
          >
            {decided === 'accepted' ? <Check size={13} /> : <X size={13} />}
            {decided === 'accepted' ? 'Diterima' : 'Ditolak'}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('rejected')}
              className="rounded px-2 py-1 text-white/55 hover:bg-white/5 disabled:opacity-40"
            >
              Tolak semua
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('accepted')}
              className="rounded bg-primary/15 px-2 py-1 text-primary hover:bg-primary/25 disabled:opacity-40"
            >
              {busy ? 'Memproses…' : 'Terima semua'}
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="break-words px-3 pb-3 text-error">
          {error}
        </p>
      )}
    </section>
  )
}
export default function CodingSummary({ runId, runIds, sessionId }) {
  const key = JSON.stringify([...new Set(runIds || (runId ? [runId] : []))])
  return (
    <RecordedChanges
      key={`${sessionId}:${key}`}
      idsKey={key}
      strictReferences={Boolean(runIds)}
      sessionId={sessionId}
    />
  )
}
function RecordedChanges({ idsKey: key, strictReferences, sessionId }) {
  const [runs, setRuns] = useState([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const ids = JSON.parse(key)
    return Promise.all(
      ids.map(async (id) => {
        try {
          return await webApi.codingRequest(`/coding/runs/${encodeURIComponent(id)}`, sessionId)
        } catch (e) {
          if (strictReferences) throw e
          return null
        }
      })
    )
  }, [key, sessionId, strictReferences])
  useEffect(() => {
    let disposed = false
    const update = () =>
      refresh()
        .then((values) => {
          if (!disposed) {
            setRuns(values.filter(Boolean))
            setError('')
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message)
        })
    update()
    const off = webApi.onCodingUpdate((event) => {
      if (String(event.sessionId) === String(sessionId) && JSON.parse(key).includes(event.runId))
        update()
    })
    return () => {
      disposed = true
      off()
    }
  }, [key, sessionId, refresh])
  const reload = async () => setRuns((await refresh()).filter(Boolean))
  return (
    <>
      {runs.map((run) => (
        <ChangeCard key={run.id} run={run} sessionId={sessionId} refresh={reload} />
      ))}
      {error && (
        <p role="alert" className="mt-3 text-xs text-error break-words">
          Riwayat perubahan tidak tersedia: {error}
        </p>
      )}
      {runs
        .filter(
          (run) => !['running', 'waiting'].includes(run.status) && run.captureStatus === 'failed'
        )
        .map((run) => (
          <p key={run.id} role="alert" className="mt-3 text-xs text-error break-words">
            {run.captureError}
          </p>
        ))}
    </>
  )
}
