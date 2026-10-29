/* eslint-disable react/prop-types */
import { useEffect, useId, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  FolderOpen,
  FileText,
  ChevronRight,
  Circle,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { FileDiffModal } from './FileDiffModal'
import { ProcessTimeline } from './ProcessTimeline'
import { getAgentTaskWithSteps, workflowMutation } from '../../api/taskStore'
import { addWebListener, removeWebListener } from '../../api/web-bridge'

const labels = {
  running: 'Berjalan',
  pending: 'Belum dimulai',
  completed: 'Selesai',
  paused: 'Dijeda',
  waiting_user: 'Menunggu bantuan',
  waiting_minibots: 'Menunggu Minibot',
  failed: 'Gagal',
  cancelled: 'Dihentikan',
  stopped: 'Dihentikan',
  needs_revision: 'Perlu diperbaiki',
  skipped: 'Dilewati'
}
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
export const DurableTaskBubble = ({
  plan = [],
  taskId,
  taskTitle,
  taskStatus,
  artifactRoot,
  reasoning,
  executedTools = [],
  activeLiveTools,
  activeThinkingContent
}) => {
  const [snapshot, setSnapshot] = useState(null)
  const [open, setOpen] = useState(taskStatus !== 'completed')
  const [selected, setSelected] = useState(null)
  const [artifact, setArtifact] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = snapshot?.status || taskStatus || 'pending'
  const previousStatus = useRef(status)
  const groupId = useId()
  useEffect(() => {
    let disposed = false
    const receive = (task) => {
      if (!disposed && task?.id === taskId) setSnapshot(task)
    }
    const sync = () => {
      if (taskId)
        getAgentTaskWithSteps(taskId)
          .then(receive)
          .catch(() => {})
    }
    sync()
    const timer = ['completed', 'cancelled', 'stopped'].includes(status)
      ? null
      : setInterval(sync, 5000)
    addWebListener('task:updated', receive)
    addWebListener('core:ready', sync)
    return () => {
      disposed = true
      clearInterval(timer)
      removeWebListener('task:updated', receive)
      removeWebListener('core:ready', sync)
    }
  }, [taskId, status])
  useEffect(() => {
    if (status === 'completed' && previousStatus.current !== 'completed') setOpen(false)
    previousStatus.current = status
  }, [status])
  const steps = snapshot?.steps || plan
  const done = steps.filter((s) => s.status === 'completed').length
  const tools = activeLiveTools?.length ? activeLiveTools : executedTools
  const thought = reasoning || activeThinkingContent
  const hasFiles = steps.some((s) => s.artifactPath)
  const folder = snapshot?.artifactRoot || artifactRoot
  const control = async (action) => {
    setBusy(true)
    setError('')
    try {
      const task = await getAgentTaskWithSteps(taskId)
      const updated = await workflowMutation(task, 'control', { action })
      setSnapshot(updated)
      window.dispatchEvent(
        new CustomEvent('task-control', { detail: { taskId, sessionId: task.sessionId, action } })
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label={'Rencana tugas: ' + (snapshot?.title || taskTitle || 'Tugas')}
      className="my-2 w-full min-w-0 rounded-xl border border-white/10 bg-base-200/40 p-4 text-sm sm:p-5"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={groupId}
        className={'flex w-full items-start gap-3 rounded text-left ' + focus}
      >
        <ChevronRight
          aria-hidden="true"
          size={17}
          className={'mt-1 shrink-0 motion-safe:transition-transform ' + (open ? 'rotate-90' : '')}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium leading-relaxed text-white/90">
            {snapshot?.title || taskTitle || 'Rencana tugas'}
          </span>
          <span
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50"
            aria-live="polite"
          >
            <span className={status === 'running' ? 'text-primary' : ''}>
              {labels[status] || status}
            </span>
            <span>
              {done} dari {steps.length} selesai
            </span>
          </span>
        </span>
      </button>
      <div id={groupId} hidden={!open} className="mt-4 min-w-0">
        <ol className="space-y-1">
          {steps.map((step, index) => {
            const complete = step.status === 'completed'
            const active = step.id === snapshot?.activeStepId || step.status === 'running'
            const expanded = selected === step.id || selected === index
            const key = step.id || index
            const title =
              typeof step === 'string' ? step : step.title || step.task || step.objective
            const Icon = complete
              ? Check
              : active && status === 'running'
                ? Loader2
                : step.status === 'failed'
                  ? AlertCircle
                  : Circle
            return (
              <li key={key} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={groupId + '-' + index}
                  onClick={() => setSelected(expanded ? null : key)}
                  className={
                    'flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left ' +
                    focus +
                    ' ' +
                    (active
                      ? 'bg-primary/5 text-white/95'
                      : complete
                        ? 'text-white/50'
                        : 'text-white/75')
                  }
                >
                  <Icon
                    aria-hidden="true"
                    size={17}
                    className={
                      'mt-0.5 shrink-0 ' +
                      (complete || active ? 'text-primary ' : '') +
                      (active && status === 'running' ? 'motion-safe:animate-spin' : '')
                    }
                  />
                  <span className="min-w-0 flex-1 break-words leading-relaxed">
                    <span className={active ? 'font-medium' : ''}>
                      {index + 1}. {title}
                    </span>
                    <span className="sr-only"> — {labels[step.status] || step.status}</span>
                    {active && !complete && (
                      <span className="mt-0.5 block text-xs text-white/45">
                        {status === 'running' ? 'Sedang dikerjakan' : labels[status]}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={'mt-1 shrink-0 text-white/35 ' + (expanded ? 'rotate-90' : '')}
                  />
                </button>
                <div
                  id={groupId + '-' + index}
                  hidden={!expanded}
                  className="mb-3 ml-5 space-y-3 border-l border-white/10 py-2 pl-5 text-sm leading-relaxed text-white/65 [overflow-wrap:anywhere]"
                >
                  {step.objective && (
                    <p>
                      <span className="block text-xs text-white/40">Sasaran</span>
                      {step.objective}
                    </p>
                  )}
                  {step.deliverable && (
                    <p>
                      <span className="block text-xs text-white/40">Hasil yang diharapkan</span>
                      {step.deliverable}
                    </p>
                  )}
                  {step.outputSummary && (
                    <div>
                      <span className="block text-xs text-white/40">Hasil</span>
                      <Markdown remarkPlugins={[remarkGfm]}>{step.outputSummary}</Markdown>
                    </div>
                  )}
                  {step.verificationProof && (
                    <p className="whitespace-pre-wrap">
                      <span className="block text-xs text-white/40">Bukti pemeriksaan</span>
                      {step.verificationProof}
                    </p>
                  )}
                  {step.error && <p className="text-error">{step.error}</p>}
                  {step.artifactPath && (
                    <button
                      type="button"
                      onClick={() => setArtifact(step.artifactPath)}
                      className={
                        'inline-flex max-w-full items-start gap-2 rounded text-primary hover:underline ' +
                        focus
                      }
                    >
                      <FileText size={16} className="mt-0.5 shrink-0" />
                      {step.artifactPath.split(/[\\/]/).pop()}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        {(tools?.length > 0 || thought) && (
          <details className="mt-4 border-t border-white/10 pt-3">
            <summary className={'cursor-pointer rounded py-1 text-xs text-white/50 ' + focus}>
              Detail proses
            </summary>
            <div className="mt-3 space-y-3 text-sm text-white/60 [overflow-wrap:anywhere]">
              {thought && (
                <div className="max-h-64 overflow-y-auto leading-relaxed">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {typeof thought === 'string' ? thought : JSON.stringify(thought)}
                  </Markdown>
                </div>
              )}
              <ProcessTimeline steps={tools || []} isActive={status === 'running'} />
            </div>
          </details>
        )}
        {snapshot?.planRevisions?.length > 0 && (
          <details className="mt-3 text-xs text-white/45">
            <summary className={'cursor-pointer rounded ' + focus}>Perubahan rencana</summary>
            <ul className="mt-2 space-y-2">
              {snapshot.planRevisions.map((r) => (
                <li key={r.version}>{r.explanation}</li>
              ))}
            </ul>
          </details>
        )}
        {(snapshot?.error || error) && (
          <p role={error ? 'alert' : undefined} className="mt-3 break-words text-xs text-error">
            {error || snapshot.error}
          </p>
        )}
      </div>
      {((snapshot?.planVersion && !['completed', 'cancelled', 'stopped'].includes(status)) ||
        hasFiles) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs">
          {snapshot?.planVersion &&
            ['running', 'waiting_minibots', 'waiting_user'].includes(status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => control('cancel')}
                className={
                  'rounded px-2 py-1.5 text-white/50 hover:text-white disabled:opacity-40 ' + focus
                }
              >
                Hentikan
              </button>
            )}
          {snapshot?.planVersion && ['paused', 'waiting_user'].includes(status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => control('resume')}
              className={'rounded px-2 py-1.5 text-primary disabled:opacity-40 ' + focus}
            >
              Lanjutkan
            </button>
          )}
          {snapshot?.planVersion && status === 'failed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => control('retry')}
              className={'rounded px-2 py-1.5 text-primary disabled:opacity-40 ' + focus}
            >
              Coba lagi
            </button>
          )}
          {hasFiles && folder && (
            <button
              type="button"
              onClick={() =>
                window.api
                  ?.executeNativeTool('open-folder', { path: folder })
                  .catch((e) => setError(e.message))
              }
              className={
                'ml-auto inline-flex items-center gap-2 rounded px-2 py-1.5 text-white/50 hover:text-white ' +
                focus
              }
            >
              <FolderOpen size={14} />
              Buka folder hasil
            </button>
          )}
        </div>
      )}
      {!open && error && (
        <p role="alert" className="mt-3 text-xs text-error">
          {error}
        </p>
      )}
      {artifact && (
        <FileDiffModal
          isOpen
          onClose={() => setArtifact(null)}
          tool="read-file"
          query={{ path: artifact }}
        />
      )}
    </section>
  )
}
export const PlanningBubble = DurableTaskBubble
export default DurableTaskBubble
