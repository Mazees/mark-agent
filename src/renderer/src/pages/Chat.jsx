import { useState, useRef, useEffect } from 'react'
import ChatList from '../components/ChatList'
import { getAnswer, getSearchResult, getYoutubeSummary } from '../api/ai'
import { getRelevantMemory } from '../api/vectorMemory'
import { deleteMemory, insertMemory, updateMemory, getAllMemory } from '../api/db'
import axios from 'axios'
import { useChat } from '../contexts/ChatContext'

const Chat = () => {
  const { chatData, setChatData, sessionId, setSessionId, changeSession } = useChat()
  const [isAction, setIsAction] = useState({ web: false, youtube: false })
  const searchProp = useRef({ userInput: '', signal: null, chatSession: null })

  const receiveSearchResult = async (search, result) => {
    setChatData((prev) => [
      ...prev.filter((item) => !item.isSearching),
      { role: 'ai', content: '...', isSummarizing: true }
    ])
    try {
      const searchSummary = await getSearchResult(
        search,
        result,
        searchProp.current.userInput,
        searchProp.current.signal,
        searchProp.current.chatSession
      )
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        {
          role: 'ai',
          content: searchSummary.answer,
          sources: searchSummary.sources,
          isMemorySaved: true
        }
      ])
      insertMemory({
        type: 'fact',
        key: 'misc',
        memory: JSON.stringify(searchSummary.answer)
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

  const chatEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => {
    scrollToBottom()
  }, [chatData])

  useEffect(() => {
    console.log('isAction changed:', isAction)
  }, [isAction.youtube])

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
        ...chatData
          .filter(
            (item) =>
              item.role !== 'command' &&
              !item.isThinking &&
              !item.isSearching &&
              !item.isSummarizing
          )
          .slice(-10)
          .map((item) => ({
            role: item.role === 'ai' ? 'assistant' : 'user',
            content: item.content
          })),
        { role: 'user', content: userInput }
      ]

      const answer = await getAnswer(
        userInput,
        memoryReference,
        chatSession,
        abortControllerRef.current.signal,
        isAction.web,
        isAction.youtube
      )
      console.log('AI Answer:', answer)

      if (!answer) {
        throw new Error('Gagal mengurai jawaban dari Mark menjadi format JSON.')
      }

      if (answer.memory && answer.command?.action !== 'search') {
        const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
        if (actions[answer.memory.action]) {
          const memoryData = { ...answer.memory }
          memoryData.memory = memoryData.memory
            .trim()
            .replace(/^[\\"]+|[\\"]+$/g, '')
            .replace(/\\n/g, '\n')
          await actions[answer.memory.action](memoryData)
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
        await handleSearchCommand(
          userInput,
          answer.command.query,
          abortControllerRef.current.signal,
          chatSession
        )
      }
      if (answer.command?.action === 'youtube') {
        await handleYoutubeSummary(answer.command.query, abortControllerRef.current.signal)
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
    searchProp.current = { userInput, signal, chatSession }
    setChatData((prev) => [
      ...prev,
      {
        role: 'ai',
        content: '...',
        isSearching: true,
        query: query,
        sendDataWebSearch: receiveSearchResult
      }
    ])
  }

  const getYoutubeData = async (url) => {
    try {
      // encodeURIComponent penting biar karakter ? & = di link YouTube gak bikin error
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`

      const response = await axios.get(endpoint)
      const data = response.data

      return {
        judul: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
        success: true
      }
    } catch (error) {
      console.error('Gagal ambil data YouTube:', error.message)
      return {
        judul: 'Video Tidak Ditemukan',
        author: '-',
        thumbnail: null,
        success: false
      }
    }
  }

  const handleYoutubeSummary = async (url, signal) => {
    setChatData((prev) => [...prev, { role: 'ai', content: '...', isSummarizing: true }])
    try {
      const data = await getYoutubeData(url)
      const searchResults = await getYoutubeSummary(url, data, signal)
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        {
          role: 'ai',
          content: searchResults,
          isYoutubeSummary: true,
          youtubeLink: url
        }
      ])
    } catch (error) {
      console.error('Youtube Summary Technical Error:', error)
      if (error.name === 'AbortError') {
        setChatData((prev) => [...prev.filter((item) => !item.isSummarizing)])
        setChatData((prev) => prev.slice(0, -1))
      } else {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isSummarizing),
          {
            role: 'ai',
            content: 'Gagal dapet info dari youtube nih, koneksi atau captcha mungkin bermasalah.'
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
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`btn btn-outline hover:bg-transparent hover:border-white tooltip tooltip-bottom tooltip-accent btn-sm ${isAction.web ? 'bg-blue-600' : ''}`}
              onClick={() => {
                setIsAction((prev) => ({ ...prev, web: !prev.web }))
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
              type="button"
              className={`btn btn-outline hover:bg-transparent hover:border-white tooltip tooltip-bottom tooltip-accent btn-sm ${isAction.youtube ? 'bg-red-600' : ''}`}
              onClick={() => {
                setIsAction((prev) => ({ ...prev, youtube: !prev.youtube }))
              }}
              data-tip="Meringkas Youtube"
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fill-rule="evenodd"
                  d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
                  clip-rule="evenodd"
                />
              </svg>
              Youtube Summary
            </button>
          </div>
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
