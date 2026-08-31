import React, { useEffect, useState } from 'react'
import { FaCheckCircle, FaListUl, FaBolt, FaCheck, FaChevronRight } from 'react-icons/fa'

const ProcessPanel = ({ processes = [], onDismiss, isEmbedded = false }) => {
  const [renderedProcesses, setRenderedProcesses] = useState([])
  const executingTaskCount = processes.filter(
    (process) => process.type === 'planning' && process.status === 'active'
  ).length

  // Sync rendered processes with delayed unmount
  useEffect(() => {
    setRenderedProcesses((prev) => {
      let next = prev.map((rp) => {
        const updated = processes.find((p) => p.id === rp.id)
        if (updated) return { ...updated, isExiting: false }
        if (!rp.isExiting) return { ...rp, isExiting: true }
        return rp
      })

      processes.forEach((p) => {
        if (!prev.find((rp) => rp.id === p.id)) {
          next.push({ ...p, isExiting: false })
        }
      })

      return next
    })
  }, [processes])

  // Clean up exiting processes after animation
  useEffect(() => {
    const hasExiting = renderedProcesses.some((p) => p.isExiting)
    if (hasExiting) {
      const timer = setTimeout(() => {
        setRenderedProcesses((prev) => prev.filter((p) => !p.isExiting))
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [renderedProcesses])

  // Auto-dismiss logic for 'done' and 'failed' status
  useEffect(() => {
    const timers = []
    processes.forEach((proc) => {
      if (proc.status === 'done' || proc.status === 'completed' || proc.status === 'failed') {
        const timeout = proc.type === 'planning' ? 1200 : 2500
        const timer = setTimeout(() => {
          if (onDismiss) onDismiss(proc.id)
        }, timeout)
        timers.push(timer)
      }
    })
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [processes, onDismiss])

  if (!renderedProcesses || renderedProcesses.length === 0) return null

  return (
    <div className="w-full flex flex-col gap-2">
      {renderedProcesses.map((proc) => {
        if (proc.type === 'planning') {
          const { steps, currentStep, reasoning } = proc.data || {}
          const isDone = proc.status === 'done'
          const isFailed = proc.status === 'failed'
          const isPaused = proc.status === 'paused'
          const executionTitle =
            executingTaskCount === 1
              ? 'Executing 1 Task'
              : `Executing ${Math.max(executingTaskCount, 1)} Tasks`

          return (
            <div
              key={proc.id}
              className="bg-black/60 border border-primary/20 rounded-xl p-3 shadow-lg flex flex-col gap-1.5 animate-[holo-project-in_0.2s_ease-out_forwards]"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-1.5 text-xs font-mono font-bold">
                <div className="flex items-center gap-1.5 text-primary">
                  {isDone ? (
                    <FaCheckCircle className="text-success" />
                  ) : isFailed ? (
                    <FaBolt className="text-error" />
                  ) : isPaused ? (
                    <FaBolt className="text-warning" />
                  ) : (
                    <FaListUl className="text-primary animate-pulse" />
                  )}
                  <span>{isDone ? 'Task Completed' : isFailed ? 'Task Failed' : executionTitle}</span>
                </div>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(proc.id)}
                    className="text-white/40 hover:text-white text-xs cursor-pointer px-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {reasoning && (
                <details className="group mt-1">
                  <summary className="text-[10px] cursor-pointer select-none flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity uppercase tracking-wider">
                    <FaChevronRight className="group-open:rotate-90 transition-transform text-[8px]" />
                    Proses Pemikiran
                  </summary>
                  <div className="text-[10px] opacity-70 border-l border-primary/30 pl-2 mt-1 mb-1 font-mono whitespace-pre-wrap">
                    {reasoning}
                  </div>
                </details>
              )}

              {steps && steps.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {steps.map((step, idx) => {
                    let prefix = `${idx + 1}.`
                    let opacity = 'opacity-40 text-white/70'
                    let suffix = ''

                    if (idx < currentStep) {
                      prefix = <FaCheck className="inline" size={9} />
                      opacity = 'opacity-100 text-success font-bold'
                    } else if (idx === currentStep && !isDone) {
                      opacity = 'opacity-100 text-primary font-bold animate-pulse'
                      suffix = '...'
                    }

                    const hasQuery = typeof step === 'object' && step.query
                    const taskTitle = typeof step === 'object' ? step.task : step

                    return (
                      <div key={idx} className={`flex items-start text-[10px] font-mono ${opacity}`}>
                        <span className="w-3.5 shrink-0 inline-block">{prefix}</span>
                        <div className="flex-1 min-w-0">
                          {hasQuery ? (
                            <details className="group/step outline-none">
                              <summary className="cursor-pointer select-none flex items-center hover:opacity-100 outline-none list-none [&::-webkit-details-marker]:hidden transition-opacity">
                                <FaChevronRight className="group-open/step:rotate-90 transition-transform text-[8px] mr-1 opacity-50 shrink-0" />
                                <span className="truncate">{taskTitle} {suffix}</span>
                              </summary>
                              <div className="mt-1 pl-2 opacity-80 text-[9px] border-l border-primary/30 ml-1 mb-1 break-words font-mono bg-black/40 p-1.5 rounded text-primary/90 max-h-32 overflow-y-auto">
                                {typeof step.query === 'object' ? JSON.stringify(step.query, null, 2) : step.query}
                              </div>
                            </details>
                          ) : (
                            <div className="truncate">
                              {taskTitle} {suffix}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        if (proc.type === 'plugin-execution') {
          const hasQuery = !!proc.data?.query
          return (
            <div
              key={proc.id}
              className="bg-black/60 border border-primary/20 rounded-xl p-2.5 shadow-lg text-xs font-mono text-white/80 animate-[holo-project-in_0.2s_ease-out_forwards]"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-primary flex items-center gap-1 text-[11px] font-bold">
                  <FaBolt size={10} className="animate-pulse" /> {proc.data?.action}
                </div>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(proc.id)}
                    className="text-white/40 hover:text-white text-xs cursor-pointer px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
              {hasQuery ? (
                <details className="group/plugin outline-none">
                  <summary className="text-[10px] text-white/70 cursor-pointer select-none flex items-center hover:opacity-100 outline-none list-none [&::-webkit-details-marker]:hidden transition-opacity">
                    <FaChevronRight className="group-open/plugin:rotate-90 transition-transform text-[8px] mr-1 opacity-50 shrink-0" />
                    <span className="truncate">
                      Mengeksekusi: <span className="text-primary font-semibold">{proc.data?.action}</span>
                    </span>
                  </summary>
                  <div className="mt-1 pl-2 opacity-80 text-[9px] border-l border-primary/30 ml-1 mb-1 font-mono bg-black/40 p-1.5 rounded text-primary/90 max-h-28 overflow-y-auto whitespace-pre-wrap break-all">
                    {typeof proc.data.query === 'object'
                      ? JSON.stringify(proc.data.query, null, 2)
                      : String(proc.data.query)}
                  </div>
                </details>
              ) : (
                <div className="text-[10px] text-white/70 truncate">
                  Mengeksekusi: <span className="text-primary">{proc.data?.action}</span>
                </div>
              )}
              {proc.data?.result && (
                <div className="mt-1 p-1.5 bg-primary/10 text-primary border border-primary/20 rounded text-[9px] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {typeof proc.data.result === 'object'
                    ? JSON.stringify(proc.data.result, null, 2)
                    : String(proc.data.result)}
                </div>
              )}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

export default ProcessPanel
