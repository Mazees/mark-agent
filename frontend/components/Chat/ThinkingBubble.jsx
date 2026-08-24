import React from 'react'
import { Check, Music, Brain, ChevronRight, ListOrdered } from 'lucide-react'
import { FaYoutube } from 'react-icons/fa'

export const ThinkingBubble = ({
  isThinking = false,
  isSummarizing = false,
  isSearchingMusic = false,
  content = '',
  youtubeLink = '',
  reasoning = null,
  executedTools = []
}) => {
  const executingToolCount = executedTools ? executedTools.length : 0

  return (
    <div className="flex flex-col gap-2.5 py-1 text-sm select-text">
      {/* Loading Status Header with Tech Radar (ResponseArea style) */}
      <div className="flex items-center gap-2.5">
        {isSummarizing ? (
          <div className="flex items-center gap-2 text-warning font-medium">
            <FaYoutube className="w-4 h-4 animate-bounce text-error" />
            <span className="text-xs">{content || 'Meringkas video YouTube...'}</span>
          </div>
        ) : isSearchingMusic ? (
          <div className="flex items-center gap-2 text-info font-medium">
            <Music className="w-4 h-4 animate-spin text-info" />
            <span className="text-xs">{content || 'Mencari lagu di YouTube Music...'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-primary font-medium">
            {/* Holographic Dual Ring Spinner (ResponseArea style) */}
            <div className="relative w-4 h-4 flex items-center justify-center text-primary shrink-0">
              <svg viewBox="0 0 50 50" className="w-full h-full animate-[spin_3s_linear_infinite]">
                <circle
                  cx="25"
                  cy="25"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="30 15"
                  className="opacity-40"
                />
                <circle
                  cx="25"
                  cy="25"
                  r="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeDasharray="20 10"
                  className="opacity-90 animate-[spin_1.5s_linear_infinite_reverse]"
                  style={{ transformOrigin: 'center' }}
                />
              </svg>
            </div>
            <span className="text-xs font-semibold animate-pulse text-white/90">
              {content || 'Mark sedang menganalisis & mengeksekusi...'}
            </span>
          </div>
        )}
      </div>

      {/* Live Process Execution Card (ProcessPanel style) */}
      {(reasoning || (executedTools && executedTools.length > 0)) && (
        <div className="flex flex-col gap-2 bg-black/30 backdrop-blur-md rounded-xl border border-white/10 p-3 shadow-inner">
          {/* Collapsible Reasoning Section */}
          {reasoning && (
            <details open className="group/details">
              <summary className="text-[10px] cursor-pointer select-none flex items-center justify-between opacity-70 hover:opacity-100 uppercase tracking-wider mb-1.5 transition-opacity list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-1.5 text-primary font-bold">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Proses Pemikiran</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 group-open/details:rotate-90 transition-transform opacity-60" />
              </summary>
              <div className="text-[11px] opacity-80 border-l-2 border-primary/40 pl-2.5 my-1.5 font-mono whitespace-pre-wrap leading-relaxed text-base-content/90 max-h-48 overflow-y-auto custom-scrollbar">
                {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
              </div>
            </details>
          )}

          {/* Executed Tools Step-by-Step List (ProcessPanel style) */}
          {executedTools && executedTools.length > 0 && (
            <div className="space-y-1.5 pt-1.5 border-t border-white/5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary/80 flex items-center gap-1.5 mb-1 select-none">
                <ListOrdered className="w-3.5 h-3.5" />
                <span>
                  Langkah Alat ({executingToolCount} Aksi)
                </span>
              </div>

              {executedTools.map((step, idx) => {
                const isRunning = step.status === 'running'
                const hasQuery = step.query !== undefined && step.query !== null && step.query !== ''
                const hasResult = step.resultSummary !== undefined && step.resultSummary !== null && step.resultSummary !== ''
                const queryString =
                  typeof step.query === 'string' ? step.query : JSON.stringify(step.query, null, 2)
                const resultString =
                  typeof step.resultSummary === 'string' ? step.resultSummary : JSON.stringify(step.resultSummary, null, 2)

                return (
                  <div
                    key={idx}
                    className={`flex items-start text-[11px] font-mono transition-all ${
                      isRunning
                        ? 'opacity-100 text-white'
                        : 'opacity-85 text-success'
                    }`}
                  >
                    <span className="w-4 inline-flex items-center justify-center shrink-0 mt-0.5 mr-1">
                      {isRunning ? (
                        <span className="w-2 h-2 rounded-full bg-warning animate-ping" />
                      ) : (
                        <Check className="w-3 h-3 text-success font-bold" />
                      )}
                    </span>

                    <div className="flex-1 min-w-0">
                      {hasQuery || hasResult ? (
                        <details className="group/step outline-none" open={isRunning}>
                          <summary className="cursor-pointer select-none flex items-center justify-between hover:opacity-100 outline-none list-none [&::-webkit-details-marker]:hidden py-0.5">
                            <span className="font-bold text-primary truncate">
                              [{step.tool || step.task || 'tool'}]
                              {isRunning && <span className="animate-pulse ml-1 text-warning/90 font-normal text-[10px]">(mengeksekusi...)</span>}
                            </span>
                            <div className="flex items-center gap-1 text-[9px] opacity-60 hover:opacity-100 text-white/60">
                              <span>detail</span>
                              <ChevronRight className="w-2.5 h-2.5 group-open/step:rotate-90 transition-transform" />
                            </div>
                          </summary>
                          <div className="mt-1 pl-2.5 opacity-80 text-[10px] border-l-2 border-primary/40 ml-1 mb-1 font-mono bg-black/40 p-2 rounded text-white/90 whitespace-pre-wrap break-all max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                            {hasQuery && (
                              <div>
                                <span className="text-primary/70 font-semibold">Query: </span>
                                <span>{queryString}</span>
                              </div>
                            )}
                            {hasResult && (
                              <div>
                                <span className="text-success/70 font-semibold">Hasil: </span>
                                <span className="text-white/80">{resultString}</span>
                              </div>
                            )}
                          </div>
                        </details>
                      ) : (
                        <div className="font-bold text-primary py-0.5">
                          [{step.tool || step.task || 'tool'}]
                          {isRunning && <span className="animate-pulse ml-1 text-warning/90 font-normal text-[10px]">(mengeksekusi...)</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
