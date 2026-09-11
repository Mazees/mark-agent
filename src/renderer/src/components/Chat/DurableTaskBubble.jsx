/* eslint-disable react/prop-types */
import {
  Check,
  CheckCircle2,
  Loader2,
  ListOrdered,
  Brain,
  ChevronRight,
  FolderOpen,
  FileText,
  AlertTriangle,
  Target
} from 'lucide-react'

export const DurableTaskBubble = ({
  plan = [],
  resolvedCurrentStep = 0,
  reasoning = '',
  taskId = null,
  taskTitle = '',
  taskObjective = '',
  taskStatus = null,
  artifactRoot = null
}) => {
  const totalSteps = plan.length
  const completedCount = plan.filter(
    (s, idx) => s.status === 'completed' || (idx < resolvedCurrentStep && s.status !== 'failed')
  ).length

  const isAllDone =
    taskStatus === 'completed' ||
    (totalSteps > 0 && completedCount >= totalSteps) ||
    (totalSteps > 0 && resolvedCurrentStep >= totalSteps && taskStatus !== 'failed')

  const isFailed = taskStatus === 'failed'

  const progressPercent =
    totalSteps > 0 ? Math.round((Math.min(completedCount, totalSteps) / totalSteps) * 100) : 0

  const handleOpenFolder = (folderPath) => {
    if (!folderPath) return
    if (window.api && window.api.executeNativeTool) {
      window.api.executeNativeTool('open', folderPath).catch(() => {})
    } else if (window.api && window.api.openPath) {
      window.api.openPath(folderPath)
    }
  }

  const handleOpenFile = (filePath) => {
    if (!filePath) return
    if (window.api && window.api.executeNativeTool) {
      window.api.executeNativeTool('open', filePath).catch(() => {})
    } else if (window.api && window.api.openPath) {
      window.api.openPath(filePath)
    }
  }

  return (
    <div className="bg-base-200/90 border border-primary/25 rounded-2xl p-4 shadow-xl flex flex-col gap-3.5 my-3 backdrop-blur-md max-w-full overflow-hidden text-base-content">
      {/* Header Task Workflow */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-3 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAllDone ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : isFailed ? (
              <AlertTriangle className="w-4 h-4 text-error shrink-0" />
            ) : (
              <ListOrdered className="w-4 h-4 text-primary shrink-0" />
            )}
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                Task Workflow
              </h4>
              <span
                className={`badge badge-xs font-mono text-[9px] px-2 py-1 uppercase tracking-wide border ${
                  isAllDone
                    ? 'badge-success/20 text-success border-success/30'
                    : isFailed
                      ? 'badge-error/20 text-error border-error/30'
                      : 'badge-primary/20 text-primary border-primary/30'
                }`}
              >
                {isAllDone ? 'Selesai' : isFailed ? 'Gagal' : 'Sedang Berjalan'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {taskId && (
              <span className="badge badge-xs badge-ghost font-mono text-[9px] px-1.5 py-0.5 text-white/50 border-white/10">
                {taskId}
              </span>
            )}
            <span className="badge badge-xs badge-ghost font-mono text-[10px] px-2 py-1 text-white/80 border-white/10">
              {Math.min(completedCount, totalSteps)} / {totalSteps} Tahap
            </span>
          </div>
        </div>

        {/* Judul & Sasaran Task */}
        {taskTitle && (
          <div className="mt-1">
            <div className="text-xs font-semibold text-white/95 truncate">{taskTitle}</div>
            {taskObjective && (
              <div className="text-[11px] text-white/60 line-clamp-2 mt-0.5 font-normal">
                {taskObjective}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar Persentase */}
        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden mt-1 border border-white/5">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              isAllDone
                ? 'bg-success'
                : isFailed
                  ? 'bg-error'
                  : 'bg-primary shadow-[0_0_8px_rgba(var(--p),0.6)]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Reasoning / Proses Analisis Collapsible */}
      {reasoning && (
        <details className="group/details bg-black/20 rounded-lg border border-white/5 overflow-hidden">
          <summary className="text-[10px] cursor-pointer select-none flex items-center justify-between px-3 py-1.5 opacity-70 hover:opacity-100 uppercase tracking-wider transition-opacity list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <Brain className="w-3.5 h-3.5" />
              <span>Analisis Perencanaan</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 group-open/details:rotate-90 transition-transform opacity-60" />
          </summary>
          <div className="px-3 py-2 text-[11px] opacity-80 border-t border-white/5 font-mono whitespace-pre-wrap leading-relaxed text-base-content/90 max-h-36 overflow-y-auto custom-scrollbar border-l-2 border-primary/40">
            {reasoning}
          </div>
        </details>
      )}

      {/* Steps List */}
      <div className="space-y-2 mt-0.5">
        {plan.map((step, idx) => {
          const stepStatus =
            step.status ||
            (idx < resolvedCurrentStep
              ? 'completed'
              : idx === resolvedCurrentStep
                ? 'running'
                : 'pending')
          const isDone = stepStatus === 'completed'
          const isCurrent = stepStatus === 'running' && !isAllDone
          const isStepFailed = stepStatus === 'failed'

          const taskTitleText =
            typeof step === 'string' ? step : step.title || step.task || `Tahap ${idx + 1}`
          const objective = typeof step === 'object' ? step.objective : null
          const deliverable = typeof step === 'object' ? step.deliverable : null
          const acceptanceCriteria =
            typeof step === 'object' && Array.isArray(step.acceptanceCriteria)
              ? step.acceptanceCriteria
              : []
          const artifactPath = typeof step === 'object' ? step.artifactPath : null
          const outputSummary = typeof step === 'object' ? step.output : null

          let statusIcon = (
            <span className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[10px] text-white/50">
              {idx + 1}
            </span>
          )
          let cardStyle = 'hover:bg-white/5 border border-white/5 bg-black/10'
          let titleStyle = 'text-white/70 font-normal'

          if (isDone) {
            statusIcon = <Check className="w-4 h-4 text-success" />
            cardStyle = 'bg-success/5 border border-success/20'
            titleStyle = 'text-success/90 font-medium'
          } else if (isCurrent) {
            statusIcon = <Loader2 className="w-4 h-4 text-primary animate-spin" />
            cardStyle =
              'bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(var(--p),0.15)]'
            titleStyle = 'text-white font-semibold animate-pulse'
          } else if (isStepFailed) {
            statusIcon = <AlertTriangle className="w-4 h-4 text-error" />
            cardStyle = 'bg-error/10 border border-error/30'
            titleStyle = 'text-error font-medium'
          }

          return (
            <div
              key={step.id || idx}
              className={`text-[11px] font-mono p-2.5 rounded-xl transition-all ${cardStyle}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5">{statusIcon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${titleStyle}`}>{taskTitleText}</span>
                    {isCurrent && (
                      <span className="text-[9px] text-primary font-mono shrink-0 uppercase tracking-wider animate-pulse">
                        Aktif
                      </span>
                    )}
                  </div>

                  {/* Detail Tahap (Collapsible jika ada info ekstra) */}
                  {(objective ||
                    deliverable ||
                    acceptanceCriteria.length > 0 ||
                    outputSummary ||
                    artifactPath) && (
                    <details className="group/detail mt-1">
                      <summary className="cursor-pointer select-none text-[10px] text-white/50 hover:text-white/80 flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden py-0.5">
                        <ChevronRight className="w-3 h-3 group-open/detail:rotate-90 transition-transform shrink-0" />
                        <span>Detail & Luaran</span>
                      </summary>

                      <div className="mt-1.5 pl-2 border-l border-primary/30 space-y-1.5 text-[10px] text-white/80">
                        {objective && (
                          <div>
                            <span className="text-white/40 uppercase font-semibold text-[9px] block">
                              Sasaran:
                            </span>
                            <span className="text-white/90">{objective}</span>
                          </div>
                        )}

                        {deliverable && (
                          <div>
                            <span className="text-white/40 uppercase font-semibold text-[9px] block">
                              Target Luaran:
                            </span>
                            <span className="text-white/90">{deliverable}</span>
                          </div>
                        )}

                        {acceptanceCriteria.length > 0 && (
                          <div>
                            <span className="text-white/40 uppercase font-semibold text-[9px] block mb-0.5">
                              Kriteria Kelayakan:
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-white/70">
                              {acceptanceCriteria.map((crit, cIdx) => (
                                <li key={cIdx}>{crit}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {outputSummary && (
                          <div className="bg-black/30 p-2 rounded border border-white/5 mt-1 max-h-28 overflow-y-auto custom-scrollbar">
                            <span className="text-white/40 uppercase font-semibold text-[9px] block mb-0.5">
                              Hasil Eksekusi:
                            </span>
                            <p className="whitespace-pre-wrap text-white/90 font-mono text-[10px]">
                              {outputSummary}
                            </p>
                          </div>
                        )}

                        {artifactPath && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpenFile(artifactPath)}
                              className="btn btn-xs btn-ghost border border-white/10 hover:border-primary/40 text-[10px] gap-1.5 text-primary lowercase font-mono py-0 h-6"
                            >
                              <FileText className="w-3 h-3" />
                              <span>{artifactPath.split(/[\\/]/).pop()}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer Aksi */}
      {artifactRoot && (
        <div className="flex items-center justify-between border-t border-white/10 pt-2.5 mt-0.5 text-[10px] font-mono text-white/60 select-none">
          <div className="flex items-center gap-1.5 truncate">
            <Target className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">Artefak: {artifactRoot.split(/[\\/]/).pop()}</span>
          </div>

          <button
            type="button"
            onClick={() => handleOpenFolder(artifactRoot)}
            className="btn btn-xs btn-outline btn-primary gap-1 text-[10px] font-mono h-6 min-h-0 px-2"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Buka Folder</span>
          </button>
        </div>
      )}
    </div>
  )
}

export const PlanningBubble = DurableTaskBubble
