import ChatList from '../components/ChatList'
import { useChat } from '../contexts/ChatContext'
import { useRef, useEffect } from 'react'
import DotGrid from '../components/DotGrid'
import icon from '../assets/icon.svg'

const Chat = () => {
  const {
    chatData,
    setChatData,
    isAction,
    setIsAction,
    isLoading,
    isSpeak,
    setIsSpeak,
    message,
    setMessage,
    handleSubmit,
    config
  } = useChat()
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatData])

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-end overflow-hidden">
      {/* Background layer */}
      {chatData.length === 0 && (
        <div className="fixed inset-0 w-screen h-screen z-0">
          <DotGrid
            dotSize={5}
            gap={15}
            baseColor="#19362d"
            activeColor="#1fb854"
            proximity={120}
            shockRadius={250}
            shockStrength={5}
            resistance={750}
            returnDuration={1.5}
          />
        </div>
      )}

      {/* Chat area */}
      <div className="relative z-10 flex-1 w-full overflow-hidden flex flex-col items-center">
        {chatData.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none text-white/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <p className="text-lg font-semibold">Mulai percakapan dengan Mark</p>
            <p className="text-sm">Ketik pesan di bawah untuk memulai.</p>
          </div>
        ) : (
          <ul className="flex-1 h-full w-full max-w-4xl no-scrollbar overflow-y-auto px-4 pt-4 pb-2">
            {chatData.map((item, index) => {
              if (item.role === 'command') {
                return (
                  <ChatList
                    key={index}
                    {...item}
                    onRun={() => {
                      alert('run')
                    }}
                  />
                )
              } else {
                return <ChatList key={index} {...item} />
              }
            })}
            <div ref={chatEndRef} />
          </ul>
        )}
      </div>

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-[70%] lg:w-1/2 mb-6 p-4 rounded-2xl flex flex-col gap-3 bg-base-200/60 backdrop-blur-xl border border-white/5 shadow-lg"
      >
        <textarea
          value={message}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          required
          onChange={(e) => setMessage(e.target.value)}
          className="bg-transparent resize-none focus:outline-none w-full overflow-hidden disabled:opacity-50 placeholder:opacity-40"
          placeholder={isLoading ? 'Mark sedang menjawab...' : 'Kirim pesan ke Mark...'}
        ></textarea>
        <div className="w-full flex justify-between items-center">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm gap-1.5 text-lg btn-circle ${isSpeak ? 'btn-primary' : 'btn-ghost opacity-60 hover:opacity-100'}`}
              onClick={() => {
                setIsSpeak(!isSpeak)
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M13 6.037c0-1.724-1.978-2.665-3.28-1.562L5.638 7.933H4c-1.105 0-2 .91-2 2.034v4.066c0 1.123.895 2.034 2 2.034h1.638l4.082 3.458c1.302 1.104 3.28.162 3.28-1.562V6.037Z" />
                <path
                  fill-rule="evenodd"
                  d="M14.786 7.658a.988.988 0 0 1 1.414-.014A6.135 6.135 0 0 1 18 12c0 1.662-.655 3.17-1.715 4.27a.989.989 0 0 1-1.414.014 1.029 1.029 0 0 1-.014-1.437A4.085 4.085 0 0 0 16 12a4.085 4.085 0 0 0-1.2-2.904 1.029 1.029 0 0 1-.014-1.438Z"
                  clip-rule="evenodd"
                />
                <path
                  fill-rule="evenodd"
                  d="M17.657 4.811a.988.988 0 0 1 1.414 0A10.224 10.224 0 0 1 22 12c0 2.807-1.12 5.35-2.929 7.189a.988.988 0 0 1-1.414 0 1.029 1.029 0 0 1 0-1.438A8.173 8.173 0 0 0 20 12a8.173 8.173 0 0 0-2.343-5.751 1.029 1.029 0 0 1 0-1.438Z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <div className="dropdown dropdown-top">
              <div
                tabIndex={0}
                role="button"
                className={`btn btn-sm rounded-lg gap-2 ${
                  isAction.web || isAction.youtube || isAction.plan
                    ? 'btn-neutral text-white'
                    : 'btn-ghost opacity-60 hover:opacity-100'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1em"
                  height="1em"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Tools{' '}
                {(isAction.web || isAction.youtube || isAction.plan) && (
                  <span className="badge badge-xs badge-primary badge-outline ml-1">On</span>
                )}
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-300 rounded-box z-[1] w-52 p-2 shadow-xl mb-2 gap-1 border border-white/10"
              >
                <li>
                  <a
                    className={isAction.youtube ? 'bg-error/20 text-error' : ''}
                    onClick={() => setIsAction((prev) => ({ ...prev, youtube: !prev.youtube }))}
                  >
                    <div className="flex w-full justify-between items-center">
                      <span>YouTube Summary</span>
                      {isAction.youtube && <span className="font-bold">✓</span>}
                    </div>
                  </a>
                </li>
                <li>
                  <a
                    className={isAction.plan ? 'bg-info/20 text-info' : ''}
                    onClick={() => setIsAction((prev) => ({ ...prev, plan: !prev.plan }))}
                  >
                    <div className="flex w-full justify-between items-center whitespace-nowrap">
                      <span className="whitespace-nowrap">Agentic Planning (Beta)</span>
                      {isAction.plan && <span className="font-bold">✓</span>}
                    </div>
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <button type="submit" className="btn btn-circle btn-sm btn-primary text-base">
            {isLoading ? (
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M7 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Z" />
              </svg>
            ) : (
              <svg
                fill="currentColor"
                width="1em"
                height="1em"
                viewBox="0 0 256 256"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M231.626,128a16.015,16.015,0,0,1-8.18262,13.96094L54.53027,236.55273a15.87654,15.87654,0,0,1-18.14648-1.74023,15.87132,15.87132,0,0,1-4.74024-17.60156L60.64746,136H136a8,8,0,0,0,0-16H60.64746L31.64355,38.78906A16.00042,16.00042,0,0,1,54.5293,19.44727l168.915,94.59179A16.01613,16.01613,0,0,1,231.626,128Z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Chat
