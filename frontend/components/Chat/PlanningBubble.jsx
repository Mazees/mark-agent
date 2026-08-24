import React from 'react'
import { Check, CheckCircle2, Circle, Loader2, ListOrdered, Brain, ChevronRight } from 'lucide-react'

export const PlanningBubble = ({ plan = [], resolvedCurrentStep = 0, reasoning = '' }) => {
  const isAllDone = plan.length > 0 && resolvedCurrentStep >= plan.length

  return (
    <div className="bg-base-200/90 border border-primary/25 rounded-2xl p-4 shadow-xl flex flex-col gap-3 my-2 backdrop-blur-md max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 select-none">
        <div className="flex items-center gap-2">
          {isAllDone ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <ListOrdered className="w-4 h-4 text-primary" />
          )}
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
            {isAllDone ? 'Task Completed' : `Executing Multi-Step Task (${plan.length} Steps)`}
          </h4>
        </div>
        <span className="badge badge-xs badge-primary/20 text-primary border-primary/30 font-mono text-[10px] px-2 py-1">
          {Math.min(resolvedCurrentStep, plan.length)} / {plan.length}
        </span>
      </div>

      {/* Reasoning Collapsible */}
      {reasoning && (
        <details open className="group/details bg-black/20 rounded-lg border border-white/5 overflow-hidden">
          <summary className="text-[10px] cursor-pointer select-none flex items-center justify-between px-3 py-1.5 opacity-70 hover:opacity-100 uppercase tracking-wider transition-opacity list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <Brain className="w-3.5 h-3.5" />
              <span>Proses Pemikiran</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 group-open/details:rotate-90 transition-transform opacity-60" />
          </summary>
          <div className="px-3 py-2 text-[11px] opacity-80 border-t border-white/5 font-mono whitespace-pre-wrap leading-relaxed text-base-content/90 max-h-40 overflow-y-auto custom-scrollbar border-l-2 border-primary/40">
            {reasoning}
          </div>
        </details>
      )}

      {/* Steps List (ProcessPanel Style) */}
      <div className="space-y-1.5 mt-0.5">
        {plan.map((step, idx) => {
          const isDone = idx < resolvedCurrentStep
          const isCurrent = idx === resolvedCurrentStep && !isAllDone
          const isUpcoming = idx > resolvedCurrentStep

          const taskTitle = typeof step === 'string' ? step : step.title || step.task || JSON.stringify(step)
          const stepDetail = typeof step === 'object' ? step.objective || step.query || step.deliverable : null

          let prefix = `${idx + 1}.`
          let textStyle = 'opacity-40 text-white font-normal'
          let suffix = ''

          if (isDone) {
            prefix = <Check className="w-3.5 h-3.5 text-success font-bold" />
            textStyle = 'opacity-90 text-success font-semibold'
          } else if (isCurrent) {
            prefix = <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            textStyle = 'opacity-100 text-white font-bold animate-pulse'
            suffix = '...'
          }

          return (
            <div
              key={idx}
              className={`flex items-start text-[11px] font-mono p-1.5 rounded-lg transition-all ${
                isCurrent ? 'bg-primary/10 border border-primary/30' : 'hover:bg-white/5'
              } ${textStyle}`}
            >
              <span className="w-5 inline-flex items-center justify-center shrink-0 mt-0.5 mr-1.5">
                {prefix}
              </span>

              <div className="flex-1 min-w-0">
                {stepDetail ? (
                  <details className="group/step outline-none">
                    <summary className="cursor-pointer select-none flex items-center justify-between hover:opacity-100 outline-none list-none [&::-webkit-details-marker]:hidden py-0.5">
                      <span className="truncate">
                        {taskTitle} {suffix}
                      </span>
                      <div className="flex items-center gap-1 text-[9px] opacity-60 hover:opacity-100 text-white/60">
                        <span>detail</span>
                        <ChevronRight className="w-2.5 h-2.5 group-open/step:rotate-90 transition-transform" />
                      </div>
                    </summary>
                    <div className="mt-1 pl-2.5 opacity-75 text-[10px] border-l-2 border-primary/30 ml-1 mb-1 font-mono bg-black/40 p-2 rounded text-white/90 whitespace-pre-wrap break-all max-h-32 overflow-y-auto custom-scrollbar">
                      {stepDetail}
                    </div>
                  </details>
                ) : (
                  <div className="py-0.5 truncate">
                    {taskTitle} {suffix}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
