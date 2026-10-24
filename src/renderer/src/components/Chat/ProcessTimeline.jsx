/* eslint-disable react/prop-types */
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Ban, Check, ChevronRight, Loader2, Terminal, XCircle } from 'lucide-react'
import { preprocessLaTeX, mathRemarkPlugins, mathRehypePlugins } from '../../utils/latexHelper'
import { splitProcessTimeline } from '../../utils/processSteps'
import { useApproval } from '../../contexts/ApprovalContext'
import { ApprovalBubble } from './ApprovalBubble'
import { ToolShellBox } from './ToolShellBox'

export const ProcessTimeline = ({ steps = [], isActive = false, className = '' }) => {
  const { activeApproval } = useApproval() || {}
  const [openGroups, setOpenGroups] = useState({})
  const timeline = splitProcessTimeline(steps)

  if (timeline.length === 0) return null

  return (
    <div className={`flex flex-col gap-1.5 select-none ${className}`.trim()}>
      {timeline.map((segment, segmentIndex) => {
        if (segment.type === 'narration') {
          return (
            <div
              key={segment.id || `narration-${segmentIndex}`}
              className="py-2 text-sm text-white/85 leading-relaxed select-text"
            >
              <Markdown
                remarkPlugins={[remarkGfm, ...mathRemarkPlugins]}
                rehypePlugins={[...mathRehypePlugins]}
              >
                {preprocessLaTeX(segment.text)}
              </Markdown>
            </div>
          )
        }

        const group = segment.steps
        const groupOpen = openGroups[segmentIndex] ?? isActive
        const approvalShown = group.some(
          (step, index) =>
            activeApproval?.status === 'pending' &&
            (step.status === 'running' || index === group.length - 1) &&
            activeApproval.tool === step.tool
        )

        return (
          <details
            key={`process-${segmentIndex}`}
            className="group/process outline-none"
            open={groupOpen}
            onToggle={(event) => {
              const open = event.currentTarget.open
              setOpenGroups((previous) =>
                previous[segmentIndex] === open ? previous : { ...previous, [segmentIndex]: open }
              )
            }}
          >
            <summary className="group/row list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/70 hover:text-white select-none py-1 transition-colors">
              <Terminal className="w-3.5 h-3.5 text-primary/80 shrink-0" />
              <span className="font-semibold text-white/80 group-hover/row:text-white group-focus-visible/row:text-white">
                Proses
              </span>
              <span className="text-[10px] text-white/40 font-normal">
                ({group.length} langkah)
              </span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-white/40 opacity-0 transition-[opacity,transform] duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-open/process:rotate-90 group-open/process:opacity-100" />
            </summary>

            <div className="mt-1 pl-2.5 space-y-1 border-l-2 border-white/15 ml-1.5 my-1">
              {group.map((step, index) => {
                const key = step.id || `${step.timestamp || 'step'}-${index}`

                if (step.type === 'intervention') {
                  const text = step.text || step.content || step.message || step.task || ''
                  return (
                    <div key={key} className="flex items-start gap-2 py-0.5 text-xs">
                      <span className="font-bold text-primary font-mono shrink-0 select-none">
                        Kamu:
                      </span>
                      <span className="text-white/90 font-sans select-text whitespace-pre-wrap leading-relaxed">
                        {text}
                      </span>
                    </div>
                  )
                }

                if (step.type === 'narration' || (!step.tool && !step.action)) {
                  const text = step.text || step.content || step.message || step.task || ''
                  if (!text) return null
                  return (
                    <div
                      key={key}
                      className="py-1 pl-1 pr-2 text-xs text-white/85 leading-relaxed font-sans select-text"
                    >
                      <Markdown
                        remarkPlugins={[remarkGfm, ...mathRemarkPlugins]}
                        rehypePlugins={[...mathRehypePlugins]}
                      >
                        {preprocessLaTeX(text)}
                      </Markdown>
                    </div>
                  )
                }

                const isRunning = step.status === 'running'
                const isStopped = step.status === 'stopped' || step.status === 'cancelled'
                const isPendingApproval = Boolean(
                  activeApproval?.status === 'pending' &&
                  (isRunning || index === group.length - 1) &&
                  activeApproval.tool === step.tool
                )
                const result = step.fullResult || step.resultSummary || step.result || ''
                const resultText = typeof result === 'string' ? result : JSON.stringify(result)
                const hasQuery =
                  step.query !== undefined && step.query !== null && step.query !== ''
                const hasResult = Boolean(String(resultText || '').trim())
                const isFailed =
                  step.status === 'failed' ||
                  step.status === 'error' ||
                  resultText.startsWith('[ERROR]') ||
                  resultText.includes(' crash:') ||
                  resultText.toLowerCase().includes(' gagal:')
                const displayReason = step.reason || null
                const toolLabel = step.tool || step.action || 'Aktivitas'
                let shortSummary = ''
                if (hasQuery) {
                  try {
                    const args =
                      typeof step.query === 'object' ? step.query : JSON.parse(step.query)
                    shortSummary =
                      args.command ||
                      args.path ||
                      args.url ||
                      args.query ||
                      args.prompt ||
                      args.message ||
                      args.text ||
                      ''
                  } catch {
                    shortSummary = typeof step.query === 'string' ? step.query : ''
                  }
                }
                const StatusIcon = isPendingApproval
                  ? Loader2
                  : isRunning
                    ? Loader2
                    : isStopped
                      ? Ban
                      : isFailed
                        ? XCircle
                        : Check
                const statusClass = isPendingApproval
                  ? 'text-warning animate-spin'
                  : isRunning
                    ? 'text-primary/80 animate-spin'
                    : isStopped
                      ? 'text-warning'
                      : isFailed
                        ? 'text-error'
                        : 'text-success/80'
                const label = displayReason || toolLabel

                if (!hasQuery && !hasResult) {
                  return (
                    <div key={key} className="flex flex-col py-0.5">
                      <div className="flex items-center gap-2 text-xs font-mono text-white/60">
                        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusClass}`} />
                        <span className="font-semibold text-white/80">{label}</span>
                        {isPendingApproval && (
                          <span className="text-[10px] text-warning animate-pulse">
                            (menunggu persetujuan...)
                          </span>
                        )}
                        {isStopped && (
                          <span className="text-[10px] text-warning/80">(dihentikan)</span>
                        )}
                      </div>
                      {isPendingApproval && (
                        <ApprovalBubble
                          approvalId={activeApproval.id}
                          tool={activeApproval.tool}
                          query={activeApproval.query}
                          message={activeApproval.message}
                          status={activeApproval.status}
                        />
                      )}
                    </div>
                  )
                }

                return (
                  <div key={key} className="flex flex-col py-0.5">
                    <details
                      className="group/toolitem outline-none text-xs font-mono"
                      open={isRunning}
                    >
                      <summary className="group/row list-none flex items-center gap-2 cursor-pointer text-white/60 hover:text-white select-none py-0.5 transition-colors">
                        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusClass}`} />
                        <span className="font-semibold text-white/80 group-hover/row:text-white group-focus-visible/row:text-white">
                          {label}
                        </span>
                        {isPendingApproval && (
                          <span className="text-[10px] text-warning animate-pulse">
                            (menunggu persetujuan...)
                          </span>
                        )}
                        {isStopped && (
                          <span className="text-[10px] text-warning/80">(dihentikan)</span>
                        )}
                        {!displayReason && shortSummary && (
                          <span className="text-white/40 truncate max-w-md">
                            {String(shortSummary).slice(0, 80)}
                          </span>
                        )}
                        <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-white/40 opacity-0 transition-[opacity,transform] duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-open/toolitem:rotate-90 group-open/toolitem:opacity-100" />
                      </summary>
                      <ToolShellBox
                        tool={step.tool || step.action}
                        query={step.query}
                        result={result}
                        preview={step.preview}
                        reason={displayReason}
                      />
                    </details>
                    {isPendingApproval && (
                      <ApprovalBubble
                        approvalId={activeApproval.id}
                        tool={activeApproval.tool}
                        query={activeApproval.query}
                        message={activeApproval.message}
                        status={activeApproval.status}
                      />
                    )}
                  </div>
                )
              })}
              {activeApproval?.status === 'pending' && !approvalShown && (
                <div className="pl-3 pr-1 my-2 pb-2">
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
          </details>
        )
      })}
    </div>
  )
}

export default ProcessTimeline
