import React, { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'
import {
  Brain,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Activity,
  Check,
  XCircle,
  Terminal
} from 'lucide-react'

export const MessageBubble = React.memo(
  ({
    isUser,
    content,
    reasoning,
    sources = [],
    executedTools = [],
    isPlanConclusion = false,
    isLearned = false,
    isThinking = false
  }) => {
    const [isCopied, setIsCopied] = useState(false)
    const [isProcessOpen, setIsProcessOpen] = useState(Boolean(isThinking))

    useEffect(() => {
      if (isThinking) {
        setIsProcessOpen(true)
      }
    }, [isThinking])

    const resolveImageUrl = (url) => {
      if (!url || typeof url !== 'string') return ''
      if (
        url.startsWith('data:image/') ||
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('/api/') ||
        url.startsWith('blob:')
      ) {
        return url
      }
      if (url.includes('temp-uploads')) {
        const filename = url.split(/[/\\]/).pop()
        return `/api/chat/temp-file/${encodeURIComponent(filename)}`
      }
      return url
    }

    const extractContent = (val) => {
      if (val == null) return { text: '', images: [] }
      if (typeof val === 'string') {
        if (
          val.startsWith('data:image/') ||
          val.startsWith('/api/chat/temp-file/') ||
          (val.includes('temp-uploads') && /\.(png|jpe?g|webp|gif|bmp)$/i.test(val))
        ) {
          return { text: '', images: [resolveImageUrl(val)] }
        }
        return { text: val, images: [] }
      }
      if (Array.isArray(val)) {
        const texts = []
        const images = []
        for (const item of val) {
          if (!item) continue
          if (typeof item === 'string') {
            if (
              item.startsWith('data:image/') ||
              item.startsWith('/api/chat/temp-file/') ||
              (item.includes('temp-uploads') && /\.(png|jpe?g|webp|gif|bmp)$/i.test(item))
            ) {
              images.push(resolveImageUrl(item))
            } else {
              texts.push(item)
            }
          } else if (item.type === 'text') {
            if (item.text) texts.push(item.text)
          } else if (item.type === 'image_url') {
            const imgUrl =
              item.image_url?.url ||
              item.url ||
              (typeof item.image_url === 'string' ? item.image_url : null)
            if (imgUrl) images.push(resolveImageUrl(imgUrl))
          } else if (item.image_url || item.url) {
            const imgUrl = item.image_url?.url || item.image_url || item.url
            if (typeof imgUrl === 'string') images.push(resolveImageUrl(imgUrl))
          } else {
            texts.push(JSON.stringify(item, null, 2))
          }
        }
        return { text: texts.join('\n\n'), images }
      }
      if (typeof val === 'object') {
        if (val.type === 'image_url') {
          const imgUrl =
            val.image_url?.url ||
            val.url ||
            (typeof val.image_url === 'string' ? val.image_url : null)
          if (imgUrl) return { text: '', images: [resolveImageUrl(imgUrl)] }
        }
        return { text: JSON.stringify(val, null, 2), images: [] }
      }
      return { text: String(val), images: [] }
    }

    const { text: stringContent, images: attachedImages } = extractContent(content)

    const handleCopy = () => {
      const textToCopy = stringContent || ''
      if (!textToCopy) return
      navigator.clipboard.writeText(textToCopy)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }

    return (
      <div className="text-sm leading-relaxed custom-markdown flex flex-col gap-1 relative group">
        {/* Plan Conclusion Header */}
        {isPlanConclusion && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider mb-2 border-b border-primary/20 pb-1.5 w-max">
            <Sparkles className="w-3.5 h-3.5" />
            Kesimpulan Rencana
          </div>
        )}

        {/* Executed Tools & Reasoning Activity Trace (Antigravity Style) */}
        {((executedTools && executedTools.length > 0) || reasoning) && (
          <div className="my-2.5 space-y-1.5 select-none">
            {/* Thinking / Reasoning Accordion */}
            {reasoning && (
              <details className="group/thought outline-none">
                <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/60 hover:text-white select-none py-0.5 transition-colors">
                  <Brain className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                  <span className="font-medium text-white/80">Proses Pemikiran AI</span>
                  <ChevronRight className="w-3 h-3 text-white/40 transition-transform duration-150 group-open/thought:rotate-90 ml-auto shrink-0" />
                </summary>
                <div className="mt-1 pl-3 my-2 text-[11px] font-mono border-l-2 border-primary/30 text-white/80 leading-relaxed max-h-64 overflow-y-auto custom-scrollbar bg-base-300/30 p-2.5 rounded-lg select-text [&_p]:my-1 [&_p]:leading-relaxed [&_h1]:text-xs [&_h1]:font-bold [&_h1]:my-1.5 [&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:my-1 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:my-1 [&_ul]:my-1 [&_ul]:ml-3.5 [&_ol]:my-1 [&_ol]:ml-3.5 [&_li]:my-0.5 [&_code]:text-[10px] [&_pre]:my-1.5 [&_hr]:my-2 [&_hr]:border-white/10">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
                  </Markdown>
                </div>
              </details>
            )}

            {/* Executed Tools Folded Process Accordion */}
            {executedTools && executedTools.length > 0 && (
              <details
                className="group/process outline-none"
                open={isProcessOpen}
                onToggle={(e) => setIsProcessOpen(e.currentTarget.open)}
              >
                <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-mono text-white/70 hover:text-white select-none py-1 transition-colors">
                  <Terminal className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                  <span className="font-semibold text-white/90">Proses</span>
                  <span className="text-[10px] text-white/40 font-normal">
                    ({executedTools.length} langkah)
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/40 transition-transform duration-150 group-open/process:rotate-90 ml-auto shrink-0" />
                </summary>
                <div className="mt-1 pl-2.5 space-y-1 border-l-2 border-white/15 ml-1.5 my-1">
                  {executedTools.map((t, idx) => {
                    const hasQuery = t.query !== undefined && t.query !== null && t.query !== ''
                    const queryString =
                      typeof t.query === 'string' ? t.query : JSON.stringify(t.query, null, 2)
                    const textResult = String(t.fullResult || t.resultSummary || '')
                    const hasResult = Boolean(textResult.trim())
                    const hasError =
                      textResult.startsWith('[ERROR]') ||
                      textResult.includes(' crash:') ||
                      textResult.toLowerCase().includes(' gagal:')
                    const isSuccessful =
                      t.status === 'done' ||
                      t.status === 'success' ||
                      (!hasError && t.status !== 'error')
                    const StatusIcon = isSuccessful ? Check : XCircle
                    const statusClass = isSuccessful ? 'text-success' : 'text-error'

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
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs font-mono text-white/60 py-0.5"
                        >
                          <StatusIcon className={`w-3.5 h-3.5 ${statusClass} shrink-0`} />
                          <span className="font-semibold text-white/90">{toolLabel}</span>
                        </div>
                      )
                    }

                    return (
                      <details key={idx} className="group/toolitem outline-none text-xs font-mono">
                        <summary className="list-none flex items-center gap-2 cursor-pointer text-white/60 hover:text-white select-none py-0.5 transition-colors">
                          <StatusIcon className={`w-3.5 h-3.5 ${statusClass} shrink-0`} />
                          <span className="font-semibold text-white/90">{toolLabel}</span>
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
                    )
                  })}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Attached Images Preview Grid */}
        {attachedImages && attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 my-1.5">
            {attachedImages.map((imgSrc, idx) => (
              <div
                key={idx}
                className="relative group/img rounded-xl overflow-hidden border border-white/20 shadow-md bg-black/40 max-w-xs"
              >
                <img
                  src={imgSrc}
                  alt={`Lampiran ${idx + 1}`}
                  className="max-h-56 w-auto object-contain cursor-pointer transition-transform duration-200 group-hover/img:scale-105"
                  onClick={() => {
                    const w = window.open('')
                    w?.document.write(
                      `<body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${imgSrc}" style="max-width:95vw;max-height:95vh;border-radius:8px;object-contain;" /></body>`
                    )
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Markdown Content / Plain User Message */}
        {stringContent &&
          (isUser ? (
            <div className="whitespace-pre-wrap leading-relaxed">{stringContent}</div>
          ) : (
            <div className="prose prose-sm max-w-none text-inherit prose-pre:p-0 prose-pre:bg-transparent prose-headings:text-inherit prose-strong:text-inherit">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                  [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
                ]}
                components={{
                  code: CodeBlock
                }}
              >
                {stringContent}
              </Markdown>
            </div>
          ))}

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10">
            <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
              Sumber & Referensi:
            </span>
            {sources.map((source, i) => (
              <button
                key={i}
                onClick={() => window.api?.openExternal?.(source.link)}
                className="btn btn-xs btn-neutral border border-primary/20 hover:border-primary/50 normal-case text-[10px] flex items-center gap-1.5 bg-base-300 transform transition hover:scale-105"
                title={source.link}
              >
                <ExternalLink className="w-3 h-3 text-primary" />
                <span className="truncate max-w-[150px]">{source.title || source.link}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
)
