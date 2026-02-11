import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Markdown from 'react-markdown'

const ChatList = ({
  role = 'user',
  content = '',
  isThinking = false,
  isSearching = false,
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false,
  isSummarizing = false,
  isYoutubeSummary = false,
  youtubeLink = '',
  risk = 'safe',
  sources = [],
  onRun
}) => {
  const isUser = role === 'user'
  const isCommand = role === 'command'
  const [executed, setExecuted] = useState(risk === 'safe' ? true : false)

  const getYouTubeID= (text) => {
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
            <span className="text-xs italic opacity-70">Mark is summarizing youtube video...</span>
          </div>
        ) : isSearching ? (
          <div className="flex items-center gap-2 py-1 text-xs text-white animate-pulse">
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
            <span className="italic opacity-70">Mark is searching...</span>
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
              <Markdown>{content}</Markdown>
            </div>
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
