import { useState, useRef, useEffect } from 'react'
import ChatList from '../components/ChatList'
import { getAnswer, getRelevantMemoryId, getSearchResult } from '../api/ai'
import { deleteData, insertData, updateData, getSpecificMemory } from '../api/db'

const Chat = () => {
  const [chatData, setChatData] = useState([])

  const chatEndRef = useRef(null)
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => {
    scrollToBottom()
  }, [chatData])

  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.target.disabled = true
    setChatData((prev) => [...prev, { role: 'user', content: message }])
    setChatData((prev) => [...prev, { role: 'ai', content: '...', isThinking: true }])
    const memoryIdRef = await getRelevantMemoryId(message)
    console.log(`Relevant Memory ID: ${JSON.stringify(memoryIdRef)}`)
    const memoryReference = await getSpecificMemory(memoryIdRef)
    const chatHistory = [...chatData].reverse().slice(0, 10)
    const answer = await getAnswer(message, memoryReference, chatHistory)
    setChatData((prev) => prev.filter((item) => !(item.role === 'ai' && item.isThinking)))
    console.log('Answer from AI:', answer)

    if (answer.command?.action === 'run') {
      console.log('Sending command to Main Process:', answer.command.run)
      const result = await window.api.runNodeFunction(answer.command.run)
      console.log('Main Process response:', result)
    } else if (answer.command?.action === 'search') {
      setChatData((prev) => [...prev, { role: 'ai', content: '...', isSearching: true }])
      const searchResults = await getSearchResult(answer.answer, answer.command.query)
      setChatData((prev) => prev.filter((item) => !(item.role === 'ai' && item.isSearching)))
      setChatData((prev) => [
        ...prev,
        { role: 'ai', content: searchResults.answer, sources: searchResults.sources }
      ])
      return
    }
    if (answer.memory) {
      if (answer.memory.action === 'insert') {
        await insertData(answer.memory)
      } else if (answer.memory.action === 'update') {
        await updateData(answer.memory)
      } else if (answer.memory.action === 'delete') {
        await deleteData(answer.memory)
      }
    }
    setChatData((prev) => {
      if (answer.command) {
        return [
          ...prev,
          { role: 'ai', content: answer.answer, isMemorySaved: answer.memory ? true : false },
          { role: 'command', content: answer.command.run, risk: answer.command.risk }
        ]
      } else {
        return [
          ...prev,
          {
            role: 'ai',
            content: answer.answer,
            isMemorySaved: answer.memory?.action === 'insert' ? true : false,
            isMemoryUpdated: answer.memory?.action === 'update' ? true : false,
            isMemoryDeleted: answer.memory?.action === 'delete' ? true : false
          }
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
