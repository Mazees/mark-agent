/* eslint-disable react/prop-types */
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { preprocessLaTeX, mathRemarkPlugins, mathRehypePlugins } from '../../utils/latexHelper'
import { Check, FolderOpen, FileText, ChevronRight, Brain, Loader2 } from 'lucide-react'
import { FileDiffModal } from './FileDiffModal'
import { DesktopPreviewWidget } from '../DesktopPreviewWidget'
import { ProcessTimeline } from './ProcessTimeline'

export const DurableTaskBubble = ({
  plan = [],
  resolvedCurrentStep = 0,
  reasoning = null,
  taskTitle = null,
  taskStatus = null,
  artifactRoot = null,
  executedTools = [],
  activeLiveTools = null,
  activeThinkingContent = null
}) => {
  const [selectedArtifactPath, setSelectedArtifactPath] = useState(null)

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

      {((toolsToDisplay && toolsToDisplay.length > 0) || displayReasoning) && (
        <div className="my-2 space-y-1.5 select-none pt-1.5 border-t border-white/10">
          {displayReasoning && (
            <details className="group/thought outline-none" open={isRunning}>
              <summary className="group/row list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/60 hover:text-white select-none py-0.5 transition-colors">
                <Brain className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                <span className="font-medium text-white/80 transition-colors group-hover/row:text-white group-focus-visible/row:text-white">
                  Proses Pemikiran AI
                </span>
                <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-white/40 opacity-0 transition-[opacity,transform] duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-open/thought:rotate-90 group-open/thought:opacity-100" />
              </summary>
              <div className="mt-1 pl-3 my-2 text-[11px] font-mono border-l-2 border-primary/30 text-white/80 leading-relaxed max-h-64 overflow-y-auto custom-scrollbar bg-base-300/30 p-2.5 rounded-lg select-text [&_p]:my-1 [&_p]:leading-relaxed [&_h1]:text-xs [&_h1]:font-bold [&_h1]:my-1.5 [&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:my-1 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:my-1 [&_ul]:my-1 [&_ul]:ml-3.5 [&_ol]:my-1 [&_ol]:ml-3.5 [&_li]:my-0.5 [&_code]:text-[10px] [&_pre]:my-1.5 [&_hr]:my-2 [&_hr]:border-white/10">
                <Markdown
                  remarkPlugins={[remarkGfm, ...mathRemarkPlugins]}
                  rehypePlugins={[...mathRehypePlugins]}
                >
                  {preprocessLaTeX(
                    typeof displayReasoning === 'string'
                      ? displayReasoning
                      : JSON.stringify(displayReasoning, null, 2)
                  )}
                </Markdown>
              </div>
            </details>
          )}
          {isRunning && <DesktopPreviewWidget />}
          <ProcessTimeline steps={toolsToDisplay} isActive={isRunning} />
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
