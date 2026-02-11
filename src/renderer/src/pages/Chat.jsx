import { useState, useRef, useEffect } from 'react'
import ChatList from '../components/ChatList'
import { getAnswer, getSearchResult } from '../api/ai'
import { getRelevantMemory } from '../api/vectorMemory'
import { deleteData, insertData, updateData, getAllMemory } from '../api/db'

const Chat = () => {
  const [chatData, setChatData] = useState([])
  const [isWebSearch, setIsWebSearch] = useState(false)

  const chatEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => {
    scrollToBottom()
  }, [chatData])

  const [message, setMessage] = useState('')

  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    console.log('isLoading changed:', isLoading)
    if (!isLoading) {
      abortControllerRef.current = null
    }
  }, [isLoading])

  const handleAIResponse = async (userInput) => {
    setIsLoading(true)
    const userMessage = { role: 'user', content: userInput }
    const thinkingMessage = { role: 'ai', content: '...', isThinking: true }

    setChatData((prev) => [...prev, userMessage, thinkingMessage])
    abortControllerRef.current = new AbortController()
    try {
      const allMemory = await getAllMemory()
      const memoryReference = await getRelevantMemory(userInput, allMemory)
      console.log('Memory yang relevan:' + JSON.stringify(memoryReference))
      const chatSession = [
        ...chatData.slice(-5).map((item) => ({
          role: item.role === 'ai' ? 'assistant' : 'user',
          content: item.content
        })),
        { role: 'user', content: userMessage }
      ]

      const answer = await getAnswer(
        userInput,
        memoryReference,
        chatSession,
        abortControllerRef.current.signal,
        isWebSearch
      )
      console.log('AI Answer:', answer)

      if (!answer) {
        throw new Error('Gagal mengurai jawaban dari Mark menjadi format JSON.')
      }

      if (answer.memory && answer.command?.action !== 'search') {
        const actions = { insert: insertData, update: updateData, delete: deleteData }
        if (actions[answer.memory.action]) {
          await actions[answer.memory.action](answer.memory)
        }
      }
      setChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        const aiResponse = {
          role: 'ai',
          content: answer.answer,
          isMemorySaved: answer.memory?.action === 'insert' && answer.command?.action !== 'search',
          isMemoryUpdated: answer.memory?.action === 'update',
          isMemoryDeleted: answer.memory?.action === 'delete'
        }
        if (answer.command?.run) {
          return [
            ...filtered,
            aiResponse,
            { role: 'command', content: answer.command.run, risk: answer.command.risk }
          ]
        }
        return [...filtered, aiResponse]
      })
      if (answer.command?.action === 'search') {
        await handleSearchCommand(userInput, answer.command.query, abortControllerRef.current.signal, chatSession)
      }
      setMessage('')
    } catch (error) {
      if (error.name === 'AbortError') {
        setChatData((prev) => [...prev.filter((item) => !item.isThinking)])
        setChatData((prev) => prev.slice(0, -1))
      } else {
        console.error('AI Response Error:', error)
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: `Maaf, terjadi kesalahan saat memproses permintaanmu, error: ${error.message}`
          }
        ])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchCommand = async (userInput, query, signal, chatSession) => {
    setChatData((prev) => [...prev, { role: 'ai', content: '...', isSearching: true }])
    try {
      const searchResults = await getSearchResult(userInput, query, signal, chatSession)
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSearching),
        {
          role: 'ai',
          content: searchResults.answer,
          sources: searchResults.sources,
          isMemorySaved: true
        }
      ])
      insertData({
        type: 'fact',
        key: 'misc',
        memory: JSON.stringify(searchResults.answer),
      })
    } catch (error) {
      console.error('Search Technical Error:', error)
      if (error.name === 'AbortError') {
        setChatData((prev) => [...prev.filter((item) => !item.isSearching)])
        setChatData((prev) => prev.slice(0, -1))
      } else {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isSearching),
          {
            role: 'ai',
            content: 'Gagal dapet info dari internet nih, koneksi atau captcha mungkin bermasalah.'
          }
        ])
      }
    }
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLoading) {
      handleStop()
    } else {
      handleAIResponse(message.trim())
    }
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
          value={message}
          disabled={isLoading}
          required
          onChange={(e) => setMessage(e.target.value)}
          className="placeholder-white resize-none focus:outline-none w-full overflow-hidden disabled:opacity-50"
          placeholder={isLoading ? 'Mark sedang menjawab...' : 'Kirim Pesan...'}
        ></textarea>
        <div className="w-full flex justify-between">
          <button
            type="button"
            className={`btn btn-outline hover:bg-transparent hover:border-white tooltip tooltip-accent btn-sm ${isWebSearch ? 'btn-active' : ''}`}
            onClick={() => {
              setIsWebSearch(!isWebSearch)
            }}
            data-tip="Pencarian Web"
          >
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
            Web Search
          </button>
          <button
            type="submit"
            className="bg-primary btn btn-circle text-lg text-neutral hover:text-white disabled:bg-neutral-focus"
          >
            {isLoading ? (
              <svg
                aria-hidden="true"
                className="text-white"
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
                id="Flat"
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
