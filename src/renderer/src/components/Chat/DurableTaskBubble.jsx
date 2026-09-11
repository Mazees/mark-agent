/* eslint-disable react/prop-types */
import {
  Check,
  CheckCircle2,
  Loader2,
  FolderOpen,
  FileText,
  AlertTriangle,
  Square
} from 'lucide-react'

export const DurableTaskBubble = ({
  plan = [],
  resolvedCurrentStep = 0,
  taskTitle = '',
  taskObjective = '',
  taskStatus = null,
  artifactRoot = null,
  onStop = null,
  activeLiveTools = null,
  activeThinkingContent = null
}) => {
  const totalSteps = plan.length
  const completedCount = plan.filter(
    (s, idx) => s.status === 'completed' || (idx < resolvedCurrentStep && s.status !== 'failed')
  ).length

  const isStopped = taskStatus === 'stopped' || taskStatus === 'cancelled'
  const isFailed = taskStatus === 'failed'
  const isAllDone =
    taskStatus === 'completed' ||
    (!isStopped && !isFailed && totalSteps > 0 && completedCount >= totalSteps)
  const isRunning = !isAllDone && !isFailed && !isStopped

  const progressPercent =
    totalSteps > 0 ? Math.round((Math.min(completedCount, totalSteps) / totalSteps) * 100) : 0

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
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('open-folder', { path: target }).catch(() => {
            window.api.executeNativeTool('open', target).catch(() => {})
          })
        } else if (window.api && window.api.openPath) {
          window.api.openPath(target)
        }
      })
      .catch(() => {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('open-folder', { path: folderPath }).catch(() => {
            window.api.executeNativeTool('open', folderPath).catch(() => {})
          })
        } else if (window.api && window.api.openPath) {
          window.api.openPath(folderPath)
        }
      })
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
    <div className="flex flex-col gap-2.5 w-full text-xs text-white/90">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 select-none border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          {isAllDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : isStopped ? (
            <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 shrink-0" />
          ) : isFailed ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0 ring-2 ring-primary/25" />
          )}
          <span className="font-semibold text-white/95 truncate">
            {taskTitle || 'Task Workflow'}
          </span>
          <span
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
              isAllDone
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : isStopped
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : isFailed
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-primary/10 text-primary border-primary/20'
            }`}
          >
            {isAllDone ? 'Selesai' : isStopped ? 'Dihentikan' : isFailed ? 'Gagal' : 'Berjalan'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-white/40">
            {completedCount}/{totalSteps}
          </span>
          {isRunning && typeof onStop === 'function' && (
            <button
              type="button"
              onClick={onStop}
              className="btn btn-ghost btn-xs text-white/50 hover:text-error hover:bg-error/10 gap-1 h-5 min-h-0 px-2 rounded font-mono text-[10px]"
              title="Hentikan alur kerja"
            >
              <Square className="w-2.5 h-2.5 fill-current text-error" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Tipis */}
      <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden mt-1.5">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isAllDone
              ? 'bg-emerald-400'
              : isStopped
                ? 'bg-amber-400'
                : isFailed
                  ? 'bg-rose-400'
                  : 'bg-primary'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Deskripsi/Objective ringkas jika ada */}
      {taskObjective && !isAllDone && !isStopped && (
        <p className="text-[11px] text-white/50 mt-2 line-clamp-2">{taskObjective}</p>
      )}

      {/* Step List Sederhana */}
      <div className="space-y-1 mt-2.5">
        {plan.map((step, idx) => {
          const stepStatus =
            step.status === 'failed'
              ? 'failed'
              : idx < resolvedCurrentStep
                ? 'completed'
                : idx === resolvedCurrentStep
                  ? isStopped
                    ? 'stopped'
                    : 'running'
                  : step.status || 'pending'

          const isDone = stepStatus === 'completed'
          const isStepStopped = stepStatus === 'stopped' || (isStopped && stepStatus === 'running')
          const isStepFailed = stepStatus === 'failed'
          const isCurrent = stepStatus === 'running' && !isAllDone && !isStopped && !isFailed

          let title = typeof step === 'string' ? step : step.title || step.task || ''
          if (!title || /^((langkah|tahap|step)\s*\d+[:.-]?\s*)$/i.test(title.trim())) {
            title = step.objective || step.deliverable || `Tahap ${idx + 1}`
          }

          const artifactPath = typeof step === 'object' ? step.artifactPath : null

          return (
            <div
              key={step.id || idx}
              className={`text-xs py-1.5 px-2.5 rounded-lg transition-colors ${
                isCurrent
                  ? 'bg-primary/10 border border-primary/20 text-white font-medium'
                  : isDone
                    ? 'text-white/60'
                    : isStepStopped
                      ? 'text-amber-400/80'
                      : isStepFailed
                        ? 'text-rose-400'
                        : 'text-white/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="shrink-0 flex items-center justify-center w-3.5 h-3.5">
                    {isDone ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isCurrent ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-primary/25 text-primary flex items-center justify-center font-mono text-[9px] font-bold border border-primary/40">
                        {idx + 1}
                      </span>
                    ) : isStepStopped ? (
                      <Square className="w-2.5 h-2.5 text-amber-400 fill-current" />
                    ) : isStepFailed ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <span className="text-[9px] text-white/30 font-mono">{idx + 1}</span>
                    )}
                  </span>
                  <span className={`truncate ${isDone ? 'line-through text-white/40' : ''}`}>
                    {title}
                  </span>
                </div>

                {artifactPath && isDone && (
                  <button
                    type="button"
                    onClick={() => handleOpenFile(artifactPath)}
                    className="shrink-0 flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary font-mono ml-2 transition-colors"
                    title={artifactPath}
                  >
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">
                      {artifactPath.split(/[\\/]/).pop()}
                    </span>
                  </button>
                )}
              </div>

              {/* Live Tool Execution Sub-Box untuk Langkah Aktif */}
              {isCurrent && (
                <div className="mt-2 ml-5.5 p-2 rounded-lg bg-base-300/80 border border-primary/20 space-y-1 animate-[response-fade-in_0.2s_ease-out_forwards]">
                  {activeLiveTools && activeLiveTools.length > 0 ? (
                    (() => {
                      const runningTool = activeLiveTools[activeLiveTools.length - 1]
                      const queryText = runningTool.query
                        ? typeof runningTool.query === 'string'
                          ? runningTool.query.replace(/^[{"\s]+|[}"\s]+$/g, '')
                          : JSON.stringify(runningTool.query)
                        : activeThinkingContent || 'Mengeksekusi tahapan...'

                      return (
                        <div className="flex items-center justify-between gap-2 min-w-0 font-mono text-[10.5px]">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                            <span className="text-primary font-semibold shrink-0">
                              [{runningTool.tool}]
                            </span>
                            <span className="text-white/70 truncate text-[10px]">{queryText}</span>
                          </div>
                          {activeLiveTools.length > 1 && (
                            <span className="badge badge-xs bg-primary/10 text-primary border border-primary/20 text-[9px] shrink-0 font-mono">
                              {activeLiveTools.length} alat
                            </span>
                          )}
                        </div>
                      )
                    })()
                  ) : (
                    <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/60">
                      <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                      <span className="text-white/70 truncate text-[10px]">
                        {activeThinkingContent || 'Menganalisis dan mengeksekusi tahapan...'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer Folder Artefak */}
      {artifactRoot && (
        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2 text-[10px] font-mono text-white/40 select-none">
          <span className="truncate max-w-[200px]">
            Artefak: {artifactRoot.split(/[\\/]/).pop()}
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
    </div>
  )
}

export const PlanningBubble = DurableTaskBubble
