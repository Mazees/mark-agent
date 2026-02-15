import { useState, useRef, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Markdown from 'react-markdown'
import rehypeExternalLinks from 'rehype-external-links'
import { scrapeGoogle } from '../api/scraping'
import { deepSearch } from '../api/scraping'

const ChatList = ({
  role = 'user',
  content = '',
  isThinking = false,
  isSearching = false,
  query = null,
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false,
  isSummarizing = false,
  isYoutubeSummary = false,
  isYoutubeSearch = false,
  queryYoutube = '',
  youtubeLink = '',
  risk = 'safe',
  sources = [],
  sendDataWebSearch,
  onRun
}) => {
  const isUser = role === 'user'
  const isCommand = role === 'command'
  const [executed, setExecuted] = useState(risk === 'safe' ? true : false)
  const [url, setUrl] = useState(
    `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`
  )
  const webRef = useRef(null)
  const scrapingActive = useRef(false)
  const initialLoadHandled = useRef(false)

  useEffect(() => {
    const webview = webRef.current
    if (!webview || !isSearching) return
    const handleInitialLoad = () => {
      if (!initialLoadHandled.current) {
        initialLoadHandled.current = true
        onScrape(webview)
      }
    }
    webview.addEventListener('did-stop-loading', handleInitialLoad)
    return () => {
      webview.removeEventListener('did-stop-loading', handleInitialLoad)
    }
  }, [isSearching])

  const getYouTubeID = (text) => {
    const ytRegex =
      /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    const match = text.match(ytRegex)
    return match ? match[1] : null
  }

  // Determine style and metadata
  let containerClass = isUser
    ? 'chat-bubble-primary chat-bubble'
    : 'bg-neutral text-white chat-bubble'

  if (isCommand) {
    containerClass = 'bg-base-200 p-3 rounded-xl w-full text-base-content border border-base-300'
  }

  const waitForLoad = (webview) => {
    return new Promise((resolve) => {
      const onDone = () => {
        webview.removeEventListener('did-stop-loading', onDone)
        resolve()
      }
      webview.addEventListener('did-stop-loading', onDone)
    })
  }
  const onScrape = async (webview) => {
    if (scrapingActive.current) return
    scrapingActive.current = true
    const source = await scrapeGoogle(webview, url)
    const links = []
    for (const url of source) {
      let link = null
      if (url.title === 'AI Google Summary') {
        link = { source: url.title, url: url.link, text: url.snippet }
      } else {
        setUrl(url.link)
        await waitForLoad(webview)
        link = await deepSearch(webview, url.link)
      }
      links.push(link)
    }
    sendDataWebSearch(source, links)
    scrapingActive.current = false
  }

  // For commands, use a different layout without DaisyUI chat grid
  if (isCommand) {
    return (
      <div className="mb-4 ml-12 w-1/2">
        <div
          className={`${containerClass} shadow-md transition-all duration-300 flex flex-col gap-2`}
        >
          <SyntaxHighlighter
            language="powershell"
            style={oneDark}
            customStyle={{
              margin: 0,
              padding: '0.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              background: '#282c34'
            }}
          >
            {content}
          </SyntaxHighlighter>
          <div className="flex items-center gap-2 mt-1">
            {risk === 'confirm' ? (
              <>
                {executed ? (
                  <span className="text-[10px] opacity-70 flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Executed
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      onRun()
                      setExecuted(true)
                    }}
                    className="btn btn-xs ml-auto btn-primary border-none text-[10px]"
                  >
                    Run
                  </button>
                )}
              </>
            ) : risk === 'safe' ? (
              <span className="text-[10px] opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
                Executed
              </span>
            ) : (
              <span className="text-[10px] opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                Blocked
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`chat ${isUser ? 'chat-end' : 'chat-start'} mb-4`}>
      <div className="chat-image avatar">
        <div className="w-10 rounded-full bg-neutral text-white flex items-center justify-center border border-primary/20">
          <span className="text-xs font-bold uppercase">{isUser ? 'U' : 'M'}</span>
        </div>
      </div>
      <div className="chat-header opacity-50 text-[10px] uppercase font-bold mb-1 px-1">
        {isUser ? 'You' : 'Mark AI'}
      </div>
      <div className={`${containerClass} shadow-md min-h-0 transition-all duration-300`}>
        {isThinking ? (
          <div className="flex items-center gap-2 py-1 animate-pulse">
            <span className="loading loading-dots loading-xs"></span>
            <span className="text-xs italic opacity-70">Mark is thinking...</span>
          </div>
        ) : isSummarizing ? (
          <div className="flex items-center gap-2 py-1 animate-pulse">
            <span className="loading loading-dots loading-xs"></span>
            <span className="text-xs italic opacity-70">Mark is summarizing...</span>
          </div>
        ) : isSearching ? (
          <div className="aspect-video h-50 rounded-xl overflow-hidden no-scrollbar">
            <div className="flex gap-2 items-center justify-center py-1 text-lg text-white animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2  w-full h-full z-20">
              <svg
                ariaHidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                  d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                />
              </svg>
              <span className="italic">Mark is searching...</span>
            </div>
            <webview
              src={url}
              ref={webRef}
              style={{ zoom: '0.5' }}
              className="w-full h-full pointer-events-none overflow-hidden no-scrollbar blur-[2px] brightness-70 zoom"
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isYoutubeSummary && (
              <div className="p-3 bg-base-300 rounded-2xl my-2">
                <iframe
                  className="w-full aspect-video"
                  src={`https://www.youtube.com/embed/${getYouTubeID(youtubeLink)}`}
                  title="YouTube video player"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allowfullscreen
                ></iframe>
              </div>
            )}
            <div className="text-sm leading-relaxed custom-markdown">
              <Markdown
                rehypePlugins={[
                  [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
                ]}
              >
                {content}
              </Markdown>
            </div>
            {isYoutubeSearch && (
              <h1 className="text-xs font-bold mt-2 flex items-center gap-1 uppercase tracking-wider">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  width="1em"
                  height="1em"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
                    clipRule="evenodd"
                  />
                </svg>
                {`Pencarian: ${queryYoutube.slice(0, 40)}`}
                {queryYoutube.length > 40 ? '...' : ''}
              </h1>
            )}
            {isYoutubeSearch && (
              <div className="p-3 bg-base-300 flex flex-wrap rounded-2xl">
                {youtubeLink.map((id) => (
                  <iframe
                    className="w-1/2 aspect-video rounded-lg"
                    src={`https://www.youtube.com/embed/${id}`}
                    title="YouTube video player"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen
                  ></iframe>
                ))}
              </div>
            )}
            {sources && sources.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-primary/10">
                <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
                  Sources:
                </span>
                {sources.map((source, i) => (
                  <button
                    key={i}
                    onClick={() => window.api.openExternal(source.link)}
                    className="btn btn-xs btn-neutral border border-primary/20 hover:border-primary/50 normal-case text-[10px] flex items-center gap-1 bg-base-300 transform transition hover:scale-105"
                    title={source.link}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3 h-3 text-primary"
                    >
                      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                    </svg>
                    <span className="truncate max-w-37.5">{source.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {(isMemorySaved || isMemoryUpdated || isMemoryDeleted) && (
        <div className="chat-footer text-[10px] text-white font-bold mt-2 px-1">
          {isMemorySaved ? 'Memory Saved' : isMemoryUpdated ? 'Memory Updated' : 'Memory Deleted'}{' '}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  )
}

export default ChatList
