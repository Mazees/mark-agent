import { useState } from 'react'
import PropTypes from 'prop-types'
import { subagentRequest } from '../../api/subagent/client.js'
import { agentStatus } from './agentPresentation.js'

export default function AgentJobs({ jobs, selectedId, onSelect, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [instruction, setInstruction] = useState('')
  const job = jobs.find((j) => j.id === selectedId)
  const act = async (action, body = {}) => {
    setBusy(true)
    setError('')
    try {
      await subagentRequest(`/jobs/${job.id}/${action}`, {
        requestId: crypto.randomUUID(),
        instruction,
        ...body,
        expectedApprovalId: job.approval?.id
      })
      setInstruction('')
      await onRefresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const camera = async () => {
    setBusy(true)
    try {
      const dataUrl = await window.api?.captureCameraFrame?.()
      if (!dataUrl) throw new Error('Aktifkan kamera melalui kontrol kamera Mark terlebih dahulu.')
      await subagentRequest(`/jobs/${job.id}/frame`, {
        dataUrl,
        expectedRequestId: job.clientRequest.id
      })
      await onRefresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Penugasan Minibot" className="shrink-0 border-b border-white/10 py-4 text-sm">
      <label className="flex flex-wrap items-center gap-3 text-xs text-white/50">
        Penugasan
        <select
          value={selectedId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="select select-sm min-w-0 max-w-full flex-1 bg-base-200 text-white/80"
        >
          {!jobs.length && <option value="">Belum ada penugasan</option>}
          {[...jobs].reverse().map((item) => (
            <option key={item.id} value={item.id}>
              {agentStatus(item.status).label} · {item.legacy ? 'Riwayat lama · ' : ''}
              {item.goal.slice(0, 100)}
            </option>
          ))}
        </select>
      </label>
      {job && (
        <p className="mt-3 break-words text-xs leading-relaxed text-white/50">
          {job.goal}
          {job.activity ? ` · ${job.activity}` : ''}
        </p>
      )}
      {job?.error && <p className="mt-2 whitespace-pre-wrap text-xs text-warning">{job.error}</p>}
      {job?.status === 'waiting_review' && (
        <p role="status" className="mt-2 text-xs text-primary">
          Mark sedang meninjau kendala dan menyiapkan arahan.
        </p>
      )}
      {job && ['interrupted', 'waiting_user', 'failed', 'cancelled'].includes(job.status) && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-white/45">
            Tinjau aktivitas terakhir sebelum melanjutkan. Aksi yang hasilnya tidak diketahui tidak
            diulang otomatis.
          </p>
          <input
            aria-label="Instruksi kelanjutan"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Tambahkan arahan atau hasil pemeriksaan..."
            className="input input-sm w-full bg-base-200"
          />
          <div className="flex flex-wrap gap-2">
            {job.approval ? (
              <>
                <button
                  disabled={busy}
                  onClick={() => act('decision', { approved: true })}
                  className="btn btn-sm"
                >
                  Setujui tindakan
                </button>
                <button
                  disabled={busy}
                  onClick={() => act('decision', { approved: false })}
                  className="btn btn-sm btn-ghost"
                >
                  Tolak
                </button>
              </>
            ) : job.clientRequest ? (
              <button disabled={busy} onClick={camera} className="btn btn-sm">
                Ambil gambar kamera
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  act(['failed', 'cancelled'].includes(job.status) ? 'retry' : 'resume')
                }
                className="btn btn-sm"
              >
                {['failed', 'cancelled'].includes(job.status) ? 'Coba lagi' : 'Lanjutkan pekerjaan'}
              </button>
            )}
          </div>
        </div>
      )}
      {job &&
        !['completed', 'failed', 'cancelled'].includes(job.status) &&
        job.status !== 'running' && (
          <button disabled={busy} onClick={() => act('cancel')} className="mt-3 text-xs text-error">
            Batalkan pekerjaan ini
          </button>
        )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      )}
    </section>
  )
}
AgentJobs.propTypes = {
  jobs: PropTypes.array.isRequired,
  selectedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired
}
