import { useState, useRef, useEffect } from 'react'
import ChatList from '../components/ChatList'
import { getAnswer, getRelevantMemoryId } from '../api/ai'

const Chat = () => {
  const [chatData, setChatData] = useState([])

  const chatEndRef = useRef(null);
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [chatData]);

  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.target.disabled = true
    setChatData((prev) => [...prev, { role: 'user', content: message }])
    setChatData((prev) => [...prev, { role: 'ai', content: '...', isThinking: true }])
    const result = await getAnswer(message, [], [])
    setChatData((prev) => prev.filter((item) => !(item.role === 'ai' && item.isThinking)))
    setChatData((prev) => {
      if (result.command) {
        return [
          ...prev,
          { role: 'ai', content: result.answer, isMemorySaved: result.memory ? true : false },
          { role: 'command', content: result.command.run, risk: result.command.risk }
        ]
      } else {
        return [
          ...prev,
          { role: 'ai', content: result.answer, isMemorySaved: result.memory ? true : false }
        ]
      }
    })
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-end p-4">
      <ul className="flex-1 h-full w-full max-w-2xl no-scrollbar overflow-y-auto mb-4">
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
      <form
        onSubmit={handleSubmit}
        className="w-full lg:w-1/2 bg-neutral mb-10 p-5 rounded-xl flex flex-col"
      >
        <textarea
          onChange={(e) => {
            setMessage(e.target.value)
          }}
          className=" placeholder-white resize-none focus:outline-none w-full overflow-hidden"
          placeholder="Kirim Pesan..."
        ></textarea>
        <button
          type="submit"
          className="ml-auto bg-primary btn btn-circle text-lg text-neutral hover:text-white"
        >
          <svg
            fill="currentColor"
            width="1em"
            height="1em"
            viewBox="0 0 256 256"
            id="Flat"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M231.626,128a16.015,16.015,0,0,1-8.18262,13.96094L54.53027,236.55273a15.87654,15.87654,0,0,1-18.14648-1.74023,15.87132,15.87132,0,0,1-4.74024-17.60156L60.64746,136H136a8,8,0,0,0,0-16H60.64746L31.64355,38.78906A16.00042,16.00042,0,0,1,54.5293,19.44727l168.915,94.59179A16.01613,16.01613,0,0,1,231.626,128Z" />
          </svg>
        </button>
      </form>
    </div>
  )
}

export default Chat
