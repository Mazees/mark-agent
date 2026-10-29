import { McpToolName } from './McpToolName'
/* eslint-disable react/prop-types */
import { useState } from 'react'
import { Copy, Check, ChevronDown } from 'lucide-react'

export const ToolShellBox = ({ tool, query, result, preview }) => {
  const [copied, setCopied] = useState(false)
  const [showFullOutput, setShowFullOutput] = useState(false)

  const title = tool || 'tool'

  let commandStr = ''
  if (query !== undefined && query !== null && query !== '') {
    if (typeof query === 'string') {
      try {
        const parsed = JSON.parse(query)
        commandStr =
          parsed.command ||
          parsed.cmd ||
          parsed.path ||
          parsed.url ||
          parsed.query ||
          parsed.prompt ||
          parsed.action ||
          query
      } catch {
        commandStr = query
      }
    } else if (typeof query === 'object') {
      commandStr =
        query.command ||
        query.cmd ||
        query.path ||
        query.url ||
        query.query ||
        query.prompt ||
        query.action ||
        JSON.stringify(query)
    }
  }
  if (typeof commandStr !== 'string') commandStr = JSON.stringify(commandStr)

  const resultStr =
    typeof result === 'string' ? result : result ? JSON.stringify(result, null, 2) : ''
  const hasLongOutput = resultStr.length > 180 || resultStr.split('\n').length > 4

  const handleCopy = async (e) => {
    e.stopPropagation()
    const fullText = `${commandStr ? commandStr + '\n\n' : ''}${resultStr}`
    try {
      await navigator.clipboard.writeText(fullText.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.warn('[ToolShellBox] Gagal menyalin output:', error)
    }
  }

  return (
    <div className="mt-1.5 mb-2 min-w-0 overflow-hidden rounded-lg border border-white/10 bg-base-300/45 text-xs select-text">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-white/8 bg-white/3 px-3">
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-white/80">
          <McpToolName name={title} />
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-1.5 text-white/45 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={copied ? 'Isi tersalin' : 'Salin input dan output tool'}
          title={copied ? 'Tersalin' : 'Salin isi'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="min-w-0 space-y-2.5 px-3 py-2.5">
        {commandStr && (
          <div className="min-w-0">
            <div className="mb-1 font-sans text-[10px] font-medium text-white/45">Input</div>
            <div className="max-h-20 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/90 [overflow-wrap:anywhere] custom-scrollbar">
              {commandStr}
            </div>
          </div>
        )}

        {resultStr && (
          <div className="min-w-0 border-t border-white/8 pt-2">
            <div className="mb-1 font-sans text-[10px] font-medium text-white/45">Output</div>
            <div
              className={`whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/65 [overflow-wrap:anywhere] custom-scrollbar ${showFullOutput ? 'max-h-72 overflow-y-auto' : hasLongOutput ? 'max-h-20 overflow-hidden' : ''}`}
            >
              {resultStr}
            </div>
            {hasLongOutput && (
              <button
                type="button"
                onClick={() => setShowFullOutput((value) => !value)}
                className="mt-1.5 inline-flex items-center gap-1 rounded text-[11px] font-medium text-primary/80 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                aria-expanded={showFullOutput}
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showFullOutput ? 'rotate-180' : ''}`}
                />
                {showFullOutput ? 'Ringkas output' : 'Lihat seluruh output'}
              </button>
            )}
          </div>
        )}

        {preview && (
          <div className="border-t border-white/8 pt-2">
            <div className="mb-1.5 font-sans text-[10px] font-medium text-white/45">
              Pratinjau visual
            </div>
            <button
              type="button"
              onClick={() => window.open(preview, '_blank')}
              className="block max-w-sm overflow-hidden rounded-md border border-white/10 bg-black/30 focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Buka pratinjau visual ukuran penuh"
            >
              <img
                src={preview}
                alt="Pratinjau hasil tool"
                className="max-h-48 w-auto object-contain"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
