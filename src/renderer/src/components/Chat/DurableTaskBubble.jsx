/* eslint-disable react/prop-types */
import React, { useState } from 'react'
import {
  Check,
  CheckCircle2,
  Loader2,
  FolderOpen,
  FileText,
  AlertTriangle,
  Square,
  ChevronRight,
  XCircle
} from 'lucide-react'

export const DurableTaskBubble = ({
  plan = [],
  resolvedCurrentStep = 0,
  taskStatus = null,
  artifactRoot = null,
  onStop = null,
  activeLiveTools = null,
  activeThinkingContent = null
}) => {
  const [openSteps, setOpenSteps] = useState({})

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

  const isStepOpen = (stepKey, isCurrent) => {
    if (openSteps[stepKey] !== undefined) {
      return openSteps[stepKey]
    }
    return Boolean(isCurrent)
  }

  const handleToggle = (stepKey, isCurrent) => {
    const currentVal = isStepOpen(stepKey, isCurrent)
    setOpenSteps((prev) => ({
      ...prev,
      [stepKey]: !currentVal
    }))
  }

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

  const renderToolItem = (t, idx) => {
    const hasQuery = t.query !== undefined && t.query !== null && t.query !== ''
    const queryString = typeof t.query === 'string' ? t.query : JSON.stringify(t.query, null, 2)
    const textResult = String(t.fullResult || t.resultSummary || t.result || '')
    const hasResult = Boolean(textResult.trim())
    const hasError =
      textResult.startsWith('[ERROR]') ||
      textResult.includes(' crash:') ||
      textResult.toLowerCase().includes(' gagal:')
    const isToolRunning = t.status === 'running'
    const isSuccessful =
      t.status === 'done' ||
      t.status === 'success' ||
      (!hasError && t.status !== 'error' && !isToolRunning)

    const StatusIcon = isToolRunning ? Loader2 : isSuccessful ? Check : XCircle
    const statusClass = isToolRunning
      ? 'text-primary animate-spin'
      : isSuccessful
        ? 'text-primary'
        : 'text-rose-400'

    const toolLabel = t.tool || t.task || 'tool'
    let shortSummary = ''
    if (hasQuery) {
      try {
        const parsed = typeof t.query === 'string' ? JSON.parse(t.query) : t.query
        shortSummary =
          parsed.command ||
          parsed.path ||
          parsed.filePath ||
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
        <div
          key={idx}
          className="flex items-center gap-2 text-[11px] font-mono text-white/70 py-0.5"
        >
          <StatusIcon className={`w-3 h-3 ${statusClass} shrink-0`} />
          <span className="font-semibold text-primary/90">[{toolLabel}]</span>
        </div>
      )
    }

    return (
      <details key={idx} className="group/toolitem outline-none text-[11px] font-mono">
        <summary className="list-none flex items-center gap-1.5 cursor-pointer text-white/70 hover:text-white select-none py-0.5 transition-colors">
          <StatusIcon className={`w-3 h-3 ${statusClass} shrink-0`} />
          <span className="font-semibold text-primary/90">[{toolLabel}]</span>
          {shortSummary && (
            <span className="text-white/40 truncate max-w-[200px] md:max-w-md">
              {String(shortSummary).slice(0, 80)}
            </span>
          )}
          <ChevronRight className="w-2.5 h-2.5 text-white/30 transition-transform duration-150 group-open/toolitem:rotate-90 ml-auto shrink-0" />
        </summary>
        <div className="mt-1 pl-2.5 my-1 text-[10.5px] font-mono border-l-2 border-white/10 text-white/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto custom-scrollbar bg-base-300/40 p-2 rounded-lg space-y-1 select-text">
          {hasQuery && (
            <div>
              <div className="text-primary/70 font-semibold text-[9.5px]">Input:</div>
              <div className="text-white/90">{queryString}</div>
            </div>
          )}
          {hasResult && (
            <div>
              <div className="text-primary/80 font-semibold text-[9.5px]">Output:</div>
              <div className="text-white/80">{textResult}</div>
            </div>
          )}
        </div>
      </details>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 w-full text-xs text-white/90 my-1">
      {/* Header Baris Ringkas */}
      <div className="flex items-center justify-between gap-2 pb-1.5 select-none border-b border-white/5 font-mono text-xs">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-white/90">Workflow :</span>
          <span
            className={` ${
              isAllDone
                ? 'text-primary'
                : isStopped
                  ? 'text-amber-400'
                  : isFailed
                    ? 'text-rose-400'
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

      {/* Step List Collapsible (> v) */}
      <div className="space-y-0.5">
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

          const stepKey = step.id || `step-${idx}`
          const isOpen = isStepOpen(stepKey, isCurrent)

          let title = typeof step === 'string' ? step : step.title || step.task || ''
          if (!title || /^((langkah|tahap|step)\s*\d+[:.-]?\s*)$/i.test(title.trim())) {
            title = step.objective || step.deliverable || `Tahap ${idx + 1}`
          }

          const artifactPath = typeof step === 'object' ? step.artifactPath : null
          const pastTools = Array.isArray(step.executedTools) ? step.executedTools : []
          const liveTools =
            isCurrent && activeLiveTools && activeLiveTools.length > 0 ? activeLiveTools : []
          const displayTools = isCurrent && liveTools.length > 0 ? liveTools : pastTools

          return (
            <div key={stepKey} className="py-0.5">
              {/* Step Header Toggle */}
              <div
                onClick={() => handleToggle(stepKey, isCurrent)}
                className="flex items-center justify-between py-1 cursor-pointer select-none hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform duration-150 shrink-0 ${
                      isOpen ? 'rotate-90 text-primary' : 'text-white/30'
                    }`}
                  />
                  <span
                    className={`truncate text-xs ${
                      isDone
                        ? 'text-white/60'
                        : isCurrent
                          ? 'text-white font-medium'
                          : isStepStopped
                            ? 'text-amber-400/80'
                            : isStepFailed
                              ? 'text-rose-400'
                              : 'text-white/40'
                    }`}
                  >
                    {idx + 1}. {title}
                  </span>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0 ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {artifactPath && isDone && (
                    <button
                      type="button"
                      onClick={() => handleOpenFile(artifactPath)}
                      className="flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary font-mono transition-colors"
                      title={artifactPath}
                    >
                      <FileText className="w-3 h-3 text-primary" />
                      <span className="truncate max-w-[90px] text-primary hover:underline">
                        {artifactPath.split(/[\\/]/).pop()}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Step Expanded Content */}
              {isOpen && (
                <div className="mt-1 pl-3 my-1 ml-2 border-l-2 border-primary/20 space-y-1 animate-[response-fade-in_0.15s_ease-out_forwards]">
                  {displayTools.length > 0 ? (
                    <div className="space-y-1">
                      {displayTools.map((t, tIdx) => renderToolItem(t, tIdx))}
                    </div>
                  ) : isCurrent ? (
                    <div className="flex items-center gap-2 font-mono text-[10.5px] text-white/60 py-1">
                      <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                      <span className="text-white/70 truncate text-[10px]">
                        {activeThinkingContent || 'Menganalisis dan mengeksekusi tahapan...'}
                      </span>
                    </div>
                  ) : step.output ? (
                    <div className="p-2 rounded bg-black/20 border border-white/5 text-[11px] text-white/70 leading-relaxed font-mono whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar">
                      {step.output}
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-white/30 italic py-0.5">
                      {isDone ? 'Tahap telah diselesaikan.' : 'Menunggu eksekusi tahapan...'}
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
        <div className="flex items-center justify-between pt-1 mt-0.5 text-[10px] font-mono text-white/40 select-none">
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
