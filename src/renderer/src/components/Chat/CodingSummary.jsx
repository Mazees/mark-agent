/* eslint-disable react/prop-types */
import { lazy, Suspense, useCallback, useEffect, useId, useState } from 'react'
import { ChevronRight, FileDiff, FileText, Undo2 } from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
const DiffEditor = lazy(() => import('./CodingDiff.jsx'))

function ChangeCard({ run, sessionId, refresh }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [diff, setDiff] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const detailId = useId()
  useEffect(() => {
    setDiff(null)
    if (!open || !selected) return
    let disposed = false
    webApi
      .codingRequest(`/coding/runs/${encodeURIComponent(run.id)}/diff`, sessionId, {
        path: selected
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
  }, [run.id, sessionId, selected, open])
  if (
    ['running', 'waiting'].includes(run.status) ||
    run.captureStatus !== 'completed' ||
    !run.files.length
  )
    return null
  const undo = async (path) => {
    setBusy(true)
    setError('')
    try {
      await webApi.codingRequest(
        `/coding/runs/${encodeURIComponent(run.id)}/undo`,
        sessionId,
        path ? { path } : {},
        'POST'
      )
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const additions = run.files.reduce((total, file) => total + (file.additions || 0), 0)
  const deletions = run.files.reduce((total, file) => total + (file.deletions || 0), 0)
  return (
    <section
      className="mt-4 min-w-0 rounded-xl border border-white/10 bg-white/[0.02] text-xs [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-primary [&_button:focus-visible]:outline-offset-2"
      aria-label="Perubahan selama giliran ini"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex w-full items-start gap-2.5 rounded-xl p-4 text-left hover:bg-white/[0.03]"
      >
        <FileDiff size={17} className="shrink-0 text-white/65" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-white/85">Perubahan selama giliran ini</span>
          <span className="mt-1 block text-white/60">
            {run.files.length} berkas{run.agentName ? ` · ${run.agentName}` : ''}
            {['failed', 'interrupted'].includes(run.status) ? ' · Pekerjaan terhenti' : ''}
          </span>
        </span>
        <span className="flex shrink-0 gap-2 tabular-nums">
          <span className="text-primary">+{additions}</span>
          <span className="text-error">−{deletions}</span>
        </span>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-white/55 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div id={detailId} className="border-t border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="min-w-0 flex-1 leading-relaxed text-white/60">
              {run.captureScope === 'recorded-files'
                ? 'Riwayat ini mencakup berkas yang direkam pada versi Mark sebelumnya.'
                : 'Perubahan workspace selama pekerjaan berlangsung, termasuk edit bersamaan dari Anda atau tool lain.'}
            </p>
            {run.files.some((file) => file.undoAvailable && !file.undone) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => undo()}
                className="inline-flex items-center gap-1.5 text-white/70 hover:text-white disabled:opacity-40"
              >
                <Undo2 size={13} aria-hidden="true" />
                Urungkan semua
              </button>
            )}
          </div>
          <ul className="divide-y divide-white/5 border-t border-white/5">
            {run.files.map((file) => (
              <li
                key={file.path}
                className={`flex items-center gap-1 px-3 ${selected === file.path ? 'bg-primary/[0.07]' : ''}`}
              >
                <button
                  type="button"
                  aria-pressed={selected === file.path}
                  onClick={() => {
                    setError('')
                    setSelected((value) => (value === file.path ? null : file.path))
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-3 text-left text-white/80"
                >
                  <FileText size={15} aria-hidden="true" className="shrink-0 text-white/55" />
                  <span className="min-w-0 flex-1 break-all">{file.relativePath}</span>
                  <span className="shrink-0 text-[10px] text-white/60">
                    {file.undone
                      ? 'Dipulihkan'
                      : file.binary
                        ? 'Biner'
                        : file.added
                          ? 'Baru'
                          : file.deleted
                            ? 'Dihapus'
                            : 'Diubah'}
                  </span>
                </button>
                {file.undoAvailable && !file.undone && (
                  <button
                    type="button"
                    aria-label={`Urungkan ${file.relativePath}`}
                    disabled={busy}
                    onClick={() => undo(file.path)}
                    className="p-2 text-white/60 hover:text-white disabled:opacity-40"
                  >
                    <Undo2 size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {selected && (
            <div className="min-w-0 border-t border-white/10">
              {!diff && error ? null : !diff ? (
                <p role="status" className="p-4 text-white/60">
                  Memuat perbandingan...
                </p>
              ) : diff.notice ? (
                <p className="p-4 leading-relaxed text-white/65">
                  {diff.notice} Sebelum: {diff.beforeSize || 0} byte. Sesudah: {diff.afterSize || 0}{' '}
                  byte.
                </p>
              ) : (
                <div className="h-80 min-w-0 overflow-hidden">
                  <Suspense
                    fallback={
                      <p role="status" className="p-4 text-white/60">
                        Memuat editor...
                      </p>
                    }
                  >
                    <DiffEditor
                      original={diff.before}
                      modified={diff.after}
                      options={{
                        readOnly: true,
                        fontSize: 12,
                        renderSideBySide: false,
                        minimap: { enabled: false },
                        wordWrap: 'on'
                      }}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="break-words px-4 pb-4 text-error">
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
