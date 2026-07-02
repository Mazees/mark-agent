import React, { useEffect, useState } from 'react'
import { FaLightbulb } from 'react-icons/fa'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import HoloCard from './HoloCard'
import { CodeBlock } from '../Chat/CodeBlock'
import { YoutubeSearchBubble } from '../Chat/YoutubeSearchBubble'
import { YoutubeSummaryBubble } from '../Chat/YoutubeSummaryBubble'
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
          {/* Proactive Badge */}
          {isProactive && (
            <div className="absolute -top-6 flex items-center justify-center animate-fade-in">
              <span className="badge badge-sm badge-info shadow-[0_0_10px_oklch(var(--in)/0.5)] flex items-center gap-1">
                <FaLightbulb /> Proactive Nudge
              </span>
            </div>
          )}

          {/* TLDR Part */}
          {tldr && (
            <div className="text-center text-lg md:text-xl font-medium leading-relaxed custom-markdown opacity-90 px-4 max-w-2xl">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tldr}
              </Markdown>
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

              {/* External Elements inside card */}
              {sources && sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
                  <h4 className="text-xs font-semibold uppercase text-primary mb-2 opacity-70">
                    Sumber Referensi
                  </h4>
                  <div className="flex flex-col gap-2">
                    {sources.map((src, i) => {
                      return (
                        <li
                          key={i}
                          href={src.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline opacity-80 hover:opacity-100 truncate block cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault()
                            window.api.openExternal(src.link)
                          }}
                        >
                          {src.title || src.link}
                        </li>
                      )
                    })}
                  </div>
                </div>
              )}
              {youtubeData && (
                <div className="mt-4">
                  <YoutubeSearchBubble
                    queryYoutube={youtubeData.query}
                    youtubeLink={youtubeData.link}
                  />
                </div>
              )}
              {youtubeSummary && (
                <div className="mt-4">
                  <YoutubeSummaryBubble youtubeLink={youtubeSummary} />
                </div>
              )}
            </HoloCard>
          </div>
        </div>
      )
    }

    // Short type
    return (
      <div className="flex flex-col items-center relative gap-2 w-full">
        {isProactive && (
          <div className="absolute -top-6 flex items-center justify-center animate-fade-in">
            <span className="badge badge-sm badge-info shadow-[0_0_10px_oklch(var(--in)/0.5)] flex items-center gap-1">
              <FaLightbulb /> Proactive Nudge
            </span>
          </div>
        )}
        <div className="text-center text-xl md:text-2xl font-medium leading-relaxed custom-markdown opacity-90 px-4 max-w-2xl">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </Markdown>
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
