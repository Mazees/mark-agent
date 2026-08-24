import React, { useEffect, useState } from 'react'
import { FaLightbulb } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import HoloCard from './HoloCard'
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
        }, 200) // 200ms for fade-out
        return () => clearTimeout(timer)
      } else {
        setDisplayResponse(currentResponse)
        setAnimState('fade-in')
      }
    }
  }, [currentResponse, displayResponse])

  if (!displayResponse) return null

  const { text, type, sources, pluginResult, youtubeData, youtubeSummary, isProactive, mood } =
    displayResponse

  const animationClass =
    animState === 'fade-out'
      ? 'animate-[response-fade-out_0.2s_ease-out_forwards]'
      : animState === 'fade-in'
        ? 'animate-[response-fade-in_0.3s_ease-out_forwards]'
        : ''

  const renderContent = () => {
    const markdownComponents = {
      code({ node, inline, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '')
        return !inline ? (
          <CodeBlock match={match} children={children} />
        ) : (
          <code className={className} {...props}>
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

    if (type === 'long') {
      let tldr = ''
      let restText = ''

      const firstNewlineMatch = text.match(/\n/)

      if (firstNewlineMatch) {
        // Potong di enter pertama
        const index = firstNewlineMatch.index
        tldr = text.substring(0, index).trim()
        restText = text.substring(index).trim()
      } else {
        // Kalau ga ada enter tapi kepanjangan, potong di titik pertama
        const firstPeriod = text.indexOf('. ')
        if (firstPeriod !== -1 && firstPeriod < 200) {
          tldr = text.substring(0, firstPeriod + 1).trim()
          restText = text.substring(firstPeriod + 1).trim()
        } else {
          tldr = text.substring(0, 150) + '...'
          restText = text
        }
      }

      return (
        <div className="flex flex-col items-center gap-4 w-full relative">

          {/* TLDR Part */}
          {tldr && (
            <div className="relative p-5 md:p-6 w-full max-w-2xl bg-black/20 backdrop-blur-sm border border-white/10 shadow-xl rounded-sm">
              {/* HUD Brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/30" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/30" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/30" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/30" />
              
              <div className="text-center text-sm md:text-base font-mono leading-relaxed custom-markdown opacity-90">
                <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {tldr}
                </Markdown>
              </div>
            </div>
          )}

          {/* Rest of the content in HoloCard */}
          <div className="w-full mt-4">
            <HoloCard title="Detail Informasi" defaultExpanded={false}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
                components={markdownComponents}
              >
                {restText || text}
              </Markdown>

            </HoloCard>
          </div>
        </div>
      )
    }

    // Short type
    return (
      <div className="flex flex-col items-center relative gap-2 w-full px-4">
        <div className="relative p-5 md:p-6 w-full max-w-2xl bg-black/20 backdrop-blur-sm border border-white/10 shadow-[0_0_20px_rgba(0,0,0,0.3)] rounded-sm">
          {/* HUD Brackets */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/30" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/30" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/30" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/30" />
          
          <div className="text-center text-sm md:text-base font-mono leading-relaxed custom-markdown opacity-90">
            {displayResponse.isThinking ? (
              <div className="flex flex-col items-center justify-center gap-4 py-4">
                <div className="relative w-12 h-12 flex items-center justify-center text-[var(--color-primary)]">
                   <svg viewBox="0 0 50 50" className="w-full h-full animate-[spin_3s_linear_infinite]">
                     <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="30 15" className="opacity-50" />
                     <circle cx="25" cy="25" r="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" className="opacity-80 animate-[spin_2s_linear_infinite_reverse]" style={{ transformOrigin: 'center' }} />
                   </svg>
                   <FaLightbulb className="absolute animate-pulse" size={14} />
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-primary)] opacity-70 mb-2">{text !== 'Bentar, mikir dlu...' && text !== 'Memproses...' ? text : 'PROCESSING DATA...'}</div>
                  <div className="flex gap-1.5">
                    <span className="w-1 h-3 bg-[var(--color-primary)] opacity-80 animate-[music-bar_1s_ease-in-out_infinite]" />
                    <span className="w-1 h-4 bg-[var(--color-primary)] opacity-80 animate-[music-bar_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-2 bg-[var(--color-primary)] opacity-80 animate-[music-bar_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }} />
                    <span className="w-1 h-3 bg-[var(--color-primary)] opacity-80 animate-[music-bar_1.1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                  </div>
                </div>
              </div>
            ) : (
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
              </Markdown>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full flex flex-col items-center gap-4 ${animationClass}`}>
      {renderContent()}

      {/* Plugin Execution Result Chip */}
      {pluginResult && (
        <div className="mt-2 w-full flex justify-center">
          <PluginExecutionBubble pluginExecution={pluginResult} />
        </div>
      )}
    </div>
  )
}

export default ResponseArea
