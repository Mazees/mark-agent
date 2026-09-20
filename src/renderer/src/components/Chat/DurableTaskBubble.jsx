/* eslint-disable react/prop-types */
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  FolderOpen,
  FileText,
  Square,
  ChevronRight,
  XCircle,
  Brain,
  Terminal,
  Ban,
  Loader2
} from 'lucide-react'
import { useApproval } from '../../contexts/ApprovalContext'
import { ApprovalBubble } from './ApprovalBubble'
import { FileDiffModal } from './FileDiffModal'

export const DurableTaskBubble = ({
  plan = [],
  resolvedCurrentStep = 0,
  reasoning = null,
  taskId = null,
  taskTitle = null,
  taskStatus = null,
  artifactRoot = null,
  onStop = null,
  executedTools = [],
  activeLiveTools = null,
  activeThinkingContent = null
}) => {
  const [selectedArtifactPath, setSelectedArtifactPath] = useState(null)
  const [isProcessOpen, setIsProcessOpen] = useState(true)
  const { activeApproval } = useApproval() || {}

  const totalSteps = plan.length
  const completedCount = plan.filter(
    (s, idx) =>
      s.status === 'completed' || plan.slice(idx + 1).some((later) => later.status === 'completed')
  ).length

  const isStopped = taskStatus === 'stopped' || taskStatus === 'cancelled'
  const isFailed = taskStatus === 'failed'
  const isAllDone =
    taskStatus === 'completed' ||
    (!isStopped && !isFailed && totalSteps > 0 && completedCount >= totalSteps)
  const isRunning = !isAllDone && !isFailed && !isStopped

  const toolsToDisplay =
    activeLiveTools && activeLiveTools.length > 0 ? activeLiveTools : executedTools || []
  const displayReasoning = reasoning || activeThinkingContent

  const handleOpenFolder = (folderPath) => {
    if (!folderPath) return
    fetch('/api/tasks/ensure-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath: folderPath })
    })
      .then((r) => r.json())
      .then((res) => {
        const target = res?.data || folderPath
        if (window.api?.executeNativeTool) {
          window.api.executeNativeTool('open-folder', { path: target }).catch(() => {
            window.api.executeNativeTool('open', target).catch(() => {})
          })
        } else if (window.api?.openPath) {
          window.api.openPath(target)
        }
      })
      .catch(() => {
        if (window.api?.executeNativeTool) {
          window.api.executeNativeTool('open-folder', { path: folderPath }).catch(() => {
            window.api.executeNativeTool('open', folderPath).catch(() => {})
          })
        } else if (window.api?.openPath) {
          window.api.openPath(folderPath)
        }
      })
  }

  const renderToolItem = (t, idx) => {
    const isToolRunning = t.status === 'running'
    const isPendingApproval = Boolean(
      activeApproval &&
      activeApproval.status === 'pending' &&
      isToolRunning &&
      (activeApproval.tool === t.tool || !t.tool)
    )
    const hasQuery = t.query !== undefined && t.query !== null && t.query !== ''
    const queryString = typeof t.query === 'string' ? t.query : JSON.stringify(t.query, null, 2)
    const textResult = String(t.fullResult || t.resultSummary || t.result || '')
    const hasResult = Boolean(textResult.trim())
    const isStoppedTool = t.status === 'stopped' || t.status === 'cancelled'
    const hasError =
      !isStoppedTool &&
      (t.status === 'failed' ||
        t.status === 'error' ||
        textResult.startsWith('[ERROR]') ||
        textResult.includes(' crash:') ||
        textResult.toLowerCase().includes(' gagal:'))
    const isSuccessful =
      !isStoppedTool &&
      !hasError &&
      (t.status === 'done' || t.status === 'success' || t.status !== 'error')

    const StatusIcon = isStoppedTool ? Ban : isSuccessful ? Check : XCircle
    const statusClass = isStoppedTool
      ? 'text-warning'
      : isSuccessful
        ? 'text-success'
        : 'text-error'

    const toolLabel = t.tool || t.task || 'tool'
    let shortSummary = ''
    if (hasQuery) {
      try {
        const parsed = JSON.parse(queryString)
        shortSummary =
          parsed.command ||
          parsed.path ||
          parsed.query ||
          parsed.prompt ||
          parsed.skill_name ||
          queryString
      } catch (_) {
        shortSummary = queryString
      }
    }

    if (!hasQuery && !hasResult) {
      return (
        <div key={idx} className="flex flex-col py-0.5">
          <div className="flex items-center gap-2 text-xs font-mono text-white/60">
            {isPendingApproval ? (
              <span className="w-2 h-2 rounded-full bg-warning animate-ping shrink-0" />
            ) : (
              <StatusIcon className={`w-3.5 h-3.5 ${statusClass} shrink-0`} />
            )}
            <span className="font-semibold text-white/90">{toolLabel}</span>
            {isPendingApproval ? (
              <span className="text-[10px] text-warning font-normal animate-pulse">
                (menunggu persetujuan...)
              </span>
            ) : isToolRunning ? (
              <span className="text-[10px] text-warning/80 animate-pulse font-normal">
                (mengeksekusi...)
              </span>
            ) : isStoppedTool ? (
              <span className="text-[10px] text-warning/80 font-normal">(dihentikan)</span>
            ) : null}
          </div>
          {isPendingApproval && (
            <div className="pl-3 pr-1">
              <ApprovalBubble
                approvalId={activeApproval.id}
                tool={activeApproval.tool}
                query={activeApproval.query}
                message={activeApproval.message}
                status={activeApproval.status}
              />
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={idx} className="flex flex-col py-0.5">
        <details className="group/toolitem outline-none text-xs font-mono" open={isToolRunning}>
          <summary className="list-none flex items-center gap-2 cursor-pointer text-white/60 hover:text-white select-none py-0.5 transition-colors">
            {isPendingApproval ? (
              <span className="w-2 h-2 rounded-full bg-warning animate-ping shrink-0" />
            ) : (
              <StatusIcon className={`w-3.5 h-3.5 ${statusClass} shrink-0`} />
            )}
            <span className="font-semibold text-white/90">{toolLabel}</span>
            {isPendingApproval ? (
              <span className="text-[10px] text-warning font-normal animate-pulse">
                (menunggu persetujuan...)
              </span>
            ) : isToolRunning ? (
              <span className="text-[10px] text-warning/80 animate-pulse font-normal">
                (mengeksekusi...)
              </span>
            ) : isStoppedTool ? (
              <span className="text-[10px] text-warning/80 font-normal">(dihentikan)</span>
            ) : null}
            {shortSummary && (
              <span className="text-white/40 truncate max-w-md">
                {String(shortSummary).slice(0, 80)}
              </span>
            )}
            <ChevronRight className="w-3 h-3 text-white/40 transition-transform duration-150 group-open/toolitem:rotate-90 ml-auto shrink-0" />
          </summary>
          <div className="mt-1 pl-3 my-1.5 text-[11px] font-mono border-l-2 border-white/20 text-white/80 whitespace-pre-wrap break-all max-h-56 overflow-y-auto custom-scrollbar bg-base-300/40 p-2.5 rounded-lg space-y-1.5 select-text">
            {hasQuery && (
              <div>
                <div className="text-primary/70 font-semibold mb-0.5">Input:</div>
                <div className="text-white/90">{queryString}</div>
              </div>
            )}
            {hasResult && (
              <div>
                <div className="text-success/70 font-semibold mb-0.5">Output:</div>
                <div className="text-white/80">{textResult}</div>
              </div>
            )}
          </div>
        </details>
        {isPendingApproval && (
          <div className="pl-3 pr-1 my-1">
            <ApprovalBubble
              approvalId={activeApproval.id}
              tool={activeApproval.tool}
              query={activeApproval.query}
              message={activeApproval.message}
              status={activeApproval.status}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 w-full text-xs text-white/90 my-1 py-1">
      {/* ── 1. HEADER ALUR KERJA MINIMALIS ── */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10 text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-primary">Workflow :</span>
          <span className="text-white/90 font-medium truncate">{taskTitle || 'Task Workflow'}</span>
          <span className="text-white/40 text-[11px] font-mono shrink-0">
            ({completedCount}/{totalSteps})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              isAllDone
                ? 'text-primary bg-primary/10'
                : isStopped
                  ? 'text-amber-400 bg-amber-400/10'
                  : isFailed
                    ? 'text-rose-400 bg-rose-400/10'
                    : 'text-primary bg-primary/10'
            }`}
          >
            {isAllDone ? 'Selesai' : isStopped ? 'Dihentikan' : isFailed ? 'Gagal' : 'Berjalan'}
          </span>
        </div>
      </div>

      {/* ── 2. DAFTAR CHECKBOX STEPS BIASA (FLAT MINIMALIS) ── */}
      <div className="flex flex-col gap-1 py-0.5">
        {plan.map((step, idx) => {
          const hasLaterDone = plan.slice(idx + 1).some((later) => later.status === 'completed')
          const isStepDone = step.status === 'completed' || hasLaterDone
          const isStepRunning =
            !isStepDone && isRunning && (step.status === 'running' || idx === resolvedCurrentStep)

          let title = typeof step === 'string' ? step : step.title || step.task || ''
          if (!title || /^((langkah|tahap|step)\s*\d+[:.-]?\s*)$/i.test(title.trim())) {
            title = step.objective || step.deliverable || `Tahap ${idx + 1}`
          }

          const artifactPath = typeof step === 'object' ? step.artifactPath : null

          return (
            <div
              key={step.id || `step-${idx}`}
              className="flex items-center justify-between gap-2.5 py-1 select-none"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Checkbox Icon / Loading Spinner */}
                {isStepDone ? (
                  <div className="w-3.5 h-3.5 rounded bg-primary/20 border border-primary flex items-center justify-center text-primary shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                ) : isStepRunning ? (
                  <div className="w-3.5 h-3.5 rounded flex items-center justify-center text-primary shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                ) : (
                  <div className="w-3.5 h-3.5 rounded border border-white/25 shrink-0" />
                )}

                {/* Step Title & Deliverable Info */}
                <div className="flex items-baseline gap-1.5 min-w-0 truncate">
                  <span
                    className={`text-xs truncate ${
                      isStepDone
                        ? 'text-white/90'
                        : isStepRunning
                          ? 'text-primary font-medium'
                          : 'text-white/70'
                    }`}
                  >
                    {idx + 1}. {title}
                  </span>
                  {isStepRunning && (
                    <span className="text-[10px] font-mono text-primary/80 animate-pulse shrink-0">
                      (sedang berjalan...)
                    </span>
                  )}
                  {step.deliverable && !isStepRunning && (
                    <span className="text-[10px] font-mono text-white/30 truncate hidden sm:inline">
                      ({step.deliverable})
                    </span>
                  )}
                </div>
              </div>

              {/* Action Button: Lihat Hasil */}
              {isStepDone && artifactPath && (
                <button
                  type="button"
                  onClick={() => setSelectedArtifactPath(artifactPath)}
                  className="btn btn-ghost btn-xs text-primary hover:underline gap-1 font-mono text-[10.5px] h-5 min-h-0 px-1.5 shrink-0"
                  title="Buka pratinjau artefak dokumen"
                >
                  <FileText className="w-3 h-3 text-primary" />
                  <span>Lihat Hasil</span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 3. PROSES SAMA PERSIS SEPERTI BUBBLE BIASA ── */}
      {((toolsToDisplay && toolsToDisplay.length > 0) || displayReasoning) && (
        <div className="my-2 space-y-1.5 select-none pt-1.5 border-t border-white/10">
          {/* Thinking / Reasoning Accordion */}
          {displayReasoning && (
            <details className="group/thought outline-none" open={isRunning}>
              <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/60 hover:text-white select-none py-0.5 transition-colors">
                <Brain className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                <span className="font-medium text-white/80">Proses Pemikiran AI</span>
                <ChevronRight className="w-3 h-3 text-white/40 transition-transform duration-150 group-open/thought:rotate-90 ml-auto shrink-0" />
              </summary>
              <div className="mt-1 pl-3 my-2 text-[11px] font-mono border-l-2 border-primary/30 text-white/80 leading-relaxed max-h-64 overflow-y-auto custom-scrollbar bg-base-300/30 p-2.5 rounded-lg select-text [&_p]:my-1 [&_p]:leading-relaxed [&_h1]:text-xs [&_h1]:font-bold [&_h1]:my-1.5 [&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:my-1 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:my-1 [&_ul]:my-1 [&_ul]:ml-3.5 [&_ol]:my-1 [&_ol]:ml-3.5 [&_li]:my-0.5 [&_code]:text-[10px] [&_pre]:my-1.5 [&_hr]:my-2 [&_hr]:border-white/10">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {typeof displayReasoning === 'string'
                    ? displayReasoning
                    : JSON.stringify(displayReasoning, null, 2)}
                </Markdown>
              </div>
            </details>
          )}

          {/* Executed Tools Folded Process Accordion */}
          {toolsToDisplay && toolsToDisplay.length > 0 && (
            <details
              className="group/process outline-none"
              open={isRunning || isProcessOpen}
              onToggle={(e) => setIsProcessOpen(e.currentTarget.open)}
            >
              <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/70 hover:text-white select-none py-1 transition-colors">
                <Terminal className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                <span className="font-semibold text-white/90">Proses</span>
                <span className="text-[10px] text-white/40 font-normal">
                  ({toolsToDisplay.length} langkah)
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-white/40 transition-transform duration-150 group-open/process:rotate-90 ml-auto shrink-0" />
              </summary>
              <div className="mt-1 pl-2.5 space-y-1 border-l-2 border-white/15 ml-1.5 my-1">
                {toolsToDisplay.map((t, idx) => renderToolItem(t, idx))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Indikator Menunggu ketika masih berjalan tanpa tool/reasoning */}
      {isRunning && (!toolsToDisplay || toolsToDisplay.length === 0) && !displayReasoning && (
        <div className="flex items-center gap-2 text-xs text-primary font-medium py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-white/80 animate-pulse">
            Mark sedang menganalisis & mengeksekusi...
          </span>
        </div>
      )}

      {/* ── 4. FOOTER FOLDER ARTEFAK ── */}
      {artifactRoot && (
        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-white/40 select-none">
          <span className="truncate max-w-[200px]">
            Folder: {artifactRoot.split(/[\\/]/).pop()}
          </span>
          <button
            type="button"
            onClick={() => handleOpenFolder(artifactRoot)}
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Buka Folder</span>
          </button>
        </div>
      )}

      {/* ── 5. MODAL PRATINJAU ARTEFAK DOKUMEN VIA FILEDIFFMODAL ── */}
      {selectedArtifactPath && (
        <FileDiffModal
          isOpen={Boolean(selectedArtifactPath)}
          onClose={() => setSelectedArtifactPath(null)}
          tool="read-file"
          query={{ path: selectedArtifactPath }}
        />
      )}
    </div>
  )
}

export const PlanningBubble = DurableTaskBubble
export default DurableTaskBubble
