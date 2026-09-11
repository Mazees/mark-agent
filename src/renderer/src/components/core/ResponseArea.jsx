import React, { useEffect, useState } from 'react'
import { FaLightbulb } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from '../Chat/CodeBlock'
import PluginExecutionBubble from '../Chat/PluginExecutionBubble'

const ResponseArea = ({ currentResponse }) => {
  const [animState, setAnimState] = useState('idle') // 'fade-out', 'fade-in', 'idle'
  const [displayResponse, setDisplayResponse] = useState(currentResponse)

  useEffect(() => {
    if (currentResponse !== displayResponse) {
      if (displayResponse) {
        setAnimState('fade-out')
        const timer = setTimeout(() => {
          setDisplayResponse(currentResponse)
          setAnimState('fade-in')
        }, 150)
        return () => clearTimeout(timer)
      } else {
        setDisplayResponse(currentResponse)
        setAnimState('fade-in')
      }
    }
  }, [currentResponse, displayResponse])

  if (!displayResponse) return null

  const { text, type, pluginResult } = displayResponse

  const animationClass =
    animState === 'fade-out'
      ? 'animate-[response-fade-out_0.15s_ease-out_forwards]'
      : animState === 'fade-in'
        ? 'animate-[response-fade-in_0.2s_ease-out_forwards]'
        : ''

  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      return !inline ? (
        <CodeBlock match={match} children={children} />
      ) : (
        <code className={`px-1.5 py-0.5 rounded bg-white/10 text-primary font-mono text-xs ${className || ''}`} {...props}>
          {children}
        </code>
      )
    },
    a: ({ node, ...props }) => {
      let url = props.href || '#'
      if (url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      return (
        <a
          {...props}
          className="text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault()
            if (window.api && window.api.openExternal && url !== '#') {
              window.api.openExternal(url)
            }
          }}
        />
      )
    }
  }

  const renderContent = () => {
    if (displayResponse.isThinking) {
      return (
        <div className="w-full">
          <div className="p-4 rounded-xl bg-white/[0.03] text-left text-xs md:text-sm font-mono leading-relaxed text-white/90">
            <div className="flex flex-col items-center justify-center gap-3 py-3">
              <div className="relative w-8 h-8 flex items-center justify-center text-primary">
                <svg viewBox="0 0 50 50" className="w-full h-full animate-[spin_3s_linear_infinite]">
                  <circle
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="30 15"
                    className="opacity-40"
                  />
                  <circle
                    cx="25"
                    cy="25"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="20 10"
                    className="opacity-80 animate-[spin_2s_linear_infinite_reverse]"
                    style={{ transformOrigin: 'center' }}
                  />
                </svg>
                <FaLightbulb className="absolute animate-pulse text-primary" size={10} />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-primary/80 font-mono">
                {text !== 'Bentar, mikir dlu...' && text !== 'Memproses...' ? text : 'PROCESSING DATA...'}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="w-full">
        <div className="p-3.5 rounded-xl bg-white/[0.03] text-left text-xs md:text-sm font-mono leading-relaxed text-white/90">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            components={markdownComponents}
          >
            {text}
          </Markdown>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full flex flex-col gap-3 ${animationClass}`}>
      {renderContent()}

      {/* Plugin Execution Result Chip */}
      {pluginResult && (
        <div className="w-full">
          <PluginExecutionBubble pluginExecution={pluginResult} />
        </div>
      )}
    </div>
  )
}

export default ResponseArea
