import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { onSubagentChange, subagentRequest } from '../../api/subagent/client.js'

function Decision({ job, refresh }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (action, body = {}) => {
    setBusy(true)
    setError('')
    try {
      await subagentRequest(`/jobs/${job.id}/${action}`, {
        requestId: crypto.randomUUID(),
        expectedApprovalId: job.approval?.id,
        instruction: reply.trim(),
        ...body
      })
      await refresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const camera = async () => {
    setBusy(true)
    setError('')
    try {
      const dataUrl = await window.api?.captureCameraFrame?.()
      if (!dataUrl) throw new Error('Aktifkan kamera melalui kontrol kamera Mark terlebih dahulu.')
      await subagentRequest(`/jobs/${job.id}/frame`, {
        dataUrl,
        expectedRequestId: job.clientRequest.id
      })
      await refresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-w-0 border-t border-white/10 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="break-words text-sm font-medium text-white/90">{job.agentName}</h3>
        <span
          className={`text-xs ${job.status === 'waiting_review' ? 'text-primary' : 'text-white/50'}`}
        >
          {job.status === 'waiting_review'
            ? 'Ditinjau Mark'
            : job.status === 'interrupted'
              ? 'Terputus'
              : 'Perlu jawaban Anda'}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-white/45">
        {job.goal}
      </p>
      {job.status === 'waiting_review' ? (
        <p role="status" className="mt-3 text-sm text-white/65">
          Mark sedang meninjau kendala dan menyiapkan arahan.
        </p>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80">
            {job.question}
          </p>
          {job.approval && (
            <details className="mt-3 text-xs text-white/60">
              <summary className="cursor-pointer py-1">
                Tindakan: {job.approval.function?.name}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/5 p-3 font-mono">
                {job.approval.function?.arguments}
              </pre>
            </details>
          )}
          <label className="mt-3 block text-xs text-white/50">
            {job.approval || job.clientRequest
              ? 'Arahan tambahan (opsional)'
              : 'Jawaban atau arahan'}
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={2}
              className="textarea mt-2 w-full resize-y border-white/15 bg-base-200 text-sm text-white/85"
              placeholder="Tulis arahan untuk Minibot ini..."
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {job.approval ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act('decision', { approved: true })}
                  className="btn btn-sm rounded-full"
                >
                  Setujui tindakan
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act('decision', {
                      approved: false,
                      instruction: reply.trim() || 'Tindakan ditolak pengguna. Cari cara lain.'
                    })
                  }
                  className="btn btn-sm btn-ghost rounded-full"
                >
                  Tolak
                </button>
              </>
            ) : job.clientRequest ? (
              <button
                type="button"
                disabled={busy}
                onClick={camera}
                className="btn btn-sm rounded-full"
              >
                Ambil gambar kamera
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => act('resume')}
                className="btn btn-sm rounded-full"
              >
                Kirim arahan
              </button>
            )}
            {job.canReview && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act('review')}
                className="btn btn-sm btn-ghost rounded-full"
              >
                Minta Mark meninjau
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => act('cancel')}
              className="btn btn-sm btn-ghost rounded-full text-white/45"
            >
              Batalkan tugas
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

export default function SubagentDecisionInbox({ sessionId }) {
  const [state, setState] = useState({ sessionId: null, jobs: [], error: '' })
  const reload = useRef(async () => {})
  useEffect(() => {
    let disposed = false
    let sequence = 0
    const refresh = async () => {
      const request = ++sequence
      try {
        const jobs = await subagentRequest(`/attention?sessionId=${encodeURIComponent(sessionId)}`)
        if (!disposed && request === sequence) setState({ sessionId, jobs, error: '' })
      } catch (failure) {
        if (!disposed && request === sequence)
          setState((previous) => ({ ...previous, error: failure.message }))
      }
    }
    reload.current = refresh
    refresh()
    const off = onSubagentChange(refresh)
    const timer = setInterval(refresh, 10000)
    return () => {
      disposed = true
      clearInterval(timer)
      off()
    }
  }, [sessionId])
  if (state.sessionId !== sessionId || !state.jobs.length) return null
  return (
    <section
      aria-label="Keputusan Minibot"
      className="my-5 w-full min-w-0 shrink-0 rounded-xl border border-white/10 bg-base-100 px-4 sm:px-5"
    >
      <div className="py-4">
        <h2 className="text-sm font-medium text-white/90">
          Koordinasi Minibots <span className="ml-1 text-white/40">{state.jobs.length}</span>
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Mark menangani keputusan teknis. Permintaan yang membutuhkan Anda dikumpulkan di sini.
        </p>
      </div>
      {state.jobs.map((job) => (
        <Decision
          key={`${job.id}:${job.approval?.id || job.reviewId || job.status}`}
          job={job}
          refresh={() => reload.current()}
        />
      ))}
      {state.error && (
        <p role="alert" className="pb-4 text-xs text-error">
          Daftar belum diperbarui: {state.error}
        </p>
      )}
    </section>
  )
}
Decision.propTypes = { job: PropTypes.object.isRequired, refresh: PropTypes.func.isRequired }
SubagentDecisionInbox.propTypes = { sessionId: PropTypes.string.isRequired }
