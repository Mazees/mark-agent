import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Music, Brain, ChevronRight, ListOrdered, Terminal } from 'lucide-react'
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

      {/* Live Process Execution Trace (Antigravity Style) */}
      {(reasoning || (executedTools && executedTools.length > 0)) && (
        <div className="flex flex-col gap-1 my-1">
          {/* Collapsible Reasoning Section */}
          {reasoning && (
            <details open className="group/details outline-none">
              <summary className="text-xs font-mono cursor-pointer select-none flex items-center gap-2 text-white/70 hover:text-white py-0.5 list-none [&::-webkit-details-marker]:hidden transition-colors">
                <Brain className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                <span className="font-medium text-white/80">Proses Pemikiran AI</span>
                <ChevronRight className="w-3 h-3 group-open/details:rotate-90 transition-transform text-white/40 ml-auto shrink-0" />
              </summary>
              <div className="mt-1 pl-3 my-1 text-[11px] font-mono border-l-2 border-primary/30 text-white/80 leading-relaxed max-h-56 overflow-y-auto custom-scrollbar bg-base-300/30 p-2.5 rounded-lg select-text [&_p]:my-1 [&_p]:leading-relaxed [&_h1]:text-xs [&_h1]:font-bold [&_h1]:my-1.5 [&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:my-1 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:my-1 [&_ul]:my-1 [&_ul]:ml-3.5 [&_ol]:my-1 [&_ol]:ml-3.5 [&_li]:my-0.5 [&_code]:text-[10px] [&_pre]:my-1.5 [&_hr]:my-2 [&_hr]:border-white/10">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
                </Markdown>
              </div>
            </details>
          )}

          {/* Executed Tools Step-by-Step List */}
          {executedTools && executedTools.length > 0 && (
            <details open className="group/liveprocess outline-none">
              <summary className="text-xs font-mono cursor-pointer select-none flex items-center gap-2 text-white/70 hover:text-white py-1 list-none [&::-webkit-details-marker]:hidden transition-colors">
                <Terminal className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                <span className="font-semibold text-white/90">Proses</span>
                <span className="text-[10px] text-white/40 font-normal">
                  ({executingToolCount} langkah)
                </span>
                <ChevronRight className="w-3.5 h-3.5 group-open/liveprocess:rotate-90 transition-transform text-white/40 ml-auto shrink-0" />
              </summary>
              <div className="mt-1 pl-2.5 space-y-1 border-l-2 border-white/15 ml-1.5 my-1">
                {executedTools.map((step, idx) => {
                  const isRunning = step.status === 'running'
                  const hasQuery =
                    step.query !== undefined && step.query !== null && step.query !== ''
                  const hasResult =
                    step.resultSummary !== undefined &&
                    step.resultSummary !== null &&
                    step.resultSummary !== ''
                  const queryString =
                    typeof step.query === 'string'
                      ? step.query
                      : JSON.stringify(step.query, null, 2)
                  const resultString =
                    typeof step.resultSummary === 'string'
                      ? step.resultSummary
                      : JSON.stringify(step.resultSummary, null, 2)

                  const toolLabel = step.tool || step.task || 'tool'
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
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs font-mono text-white/60 py-0.5"
                      >
                        {isRunning ? (
                          <span className="w-2 h-2 rounded-full bg-warning animate-ping shrink-0" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-success shrink-0" />
                        )}
                        <span className="font-semibold text-white/90">{toolLabel}</span>
                        {isRunning && (
                          <span className="text-[10px] text-warning/80 animate-pulse font-normal">
                            (mengeksekusi...)
                          </span>
                        )}
                      </div>
                    )
                  }

                  return (
                    <details
                      key={idx}
                      className="group/livetool outline-none text-xs font-mono"
                      open={isRunning}
                    >
                      <summary className="list-none flex items-center gap-2 cursor-pointer text-white/60 hover:text-white select-none py-0.5 transition-colors">
                        {isRunning ? (
                          <span className="w-2 h-2 rounded-full bg-warning animate-ping shrink-0" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-success shrink-0" />
                        )}
                        <span className="font-semibold text-white/90">{toolLabel}</span>
                        {shortSummary && (
                          <span className="text-white/40 truncate max-w-md">
                            {String(shortSummary).slice(0, 80)}
                          </span>
                        )}
                        <ChevronRight className="w-3 h-3 text-white/40 transition-transform duration-150 group-open/livetool:rotate-90 ml-auto shrink-0" />
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
                            <div className="text-white/80">{resultString}</div>
                          </div>
                        )}
                      </div>
                    </details>
                  )
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
