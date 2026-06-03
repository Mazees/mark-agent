import { useState, useContext, createContext, useEffect, useRef } from 'react'
import {
  getTitleSession,
  getAnswer,
  getSearchResult,
  getYoutubeSummary,
  playVoice,
  getPlan,
  getTaskAction,
  getTaskSummary,
  getPlanConclusion
} from '../api/ai'
import {
  createSession,
  insertSession,
  getChatData,
  deleteMemory,
  insertMemory,
  updateMemory,
  getAllMemory,
  getAllConfig
} from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import axios from 'axios'
import { useYoutubeMusic } from './YoutubeMusicContext'

const ChatContext = createContext()

export const ChatProvider = ({ children }) => {
  const { playUrl, nextTrack, prevTrack, playPause } = useYoutubeMusic()

  const [chatData, setChatData] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [isAction, setIsAction] = useState({ web: false, youtube: false, plan: false })
  const [config, setConfig] = useState([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeak, setIsSpeak] = useState(false)

  const searchProp = useRef({ userInput: '', signal: null, chatSession: null })
  const abortControllerRef = useRef(null)

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data)
  }

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (chatData && chatData.length) {
      if (!sessionId) {
        ;(async () => {
          const title = await getTitleSession(chatData[0].content)
          const id = await createSession(title, chatData)
          setSessionId(id)
        })()
      } else {
        ;(async () => {
          await insertSession(sessionId, chatData)
        })()
      }
    }
  }, [chatData])

  const changeSession = async (id) => {
    setSessionId(id)
    const chat = await getChatData(id)
    setChatData([...chat])
  }

  const receiveSearchResult = async (search, result) => {
    setChatData((prev) => [
      ...prev.filter((item) => !item.isSearching),
      { role: 'ai', content: '...', isSummarizing: true }
    ])
    if (result.length > 0) {
      try {
        const searchSummary = await getSearchResult(
          search,
          result,
          searchProp.current.userInput,
          searchProp.current.signal,
          searchProp.current.chatSession
        )
        setChatData((prev) => [
          ...prev.filter((item, index) => !item.isSummarizing || index === chatData.length - 2),
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
            ...prev.filter((item) => !item.isSummarizing),
            {
              role: 'ai',
              content:
                'Gagal dapet info dari internet nih, koneksi atau captcha mungkin bermasalah.'
            }
          ])
        }
      }
    } else {
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        {
          role: 'ai',
          content: 'Gagal dapet info dari internet nih, koneksi atau captcha mungkin bermasalah.'
        }
      ])
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

  const handleYoutubeSearch = async (answer, signal) => {
    try {
      const searchResults = await window.api.searchYoutube(answer.command.query)
      setChatData((prev) => [
        ...prev.filter((item) => !item.isThinking),
        {
          role: 'ai',
          content: answer.answer,
          isYoutubeSearch: true,
          youtubeLink: [...searchResults],
          queryYoutube: answer.command.query
        }
      ])
    } catch (error) {
      console.error('Youtube Search Error:', error)
      if (error.name === 'AbortError') {
        setChatData((prev) => [...prev.filter((item) => !item.isThinking)])
        setChatData((prev) => prev.slice(0, -1))
      } else {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: 'Gagal dapet info dari youtube nih, koneksi atau captcha mungkin bermasalah.'
          }
        ])
      }
    }
  }

  const getYoutubeData = async (url) => {
    try {
      const endpoint = `https://www.youtube.com/embed?url=${encodeURIComponent(url)}&format=json`
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
      return { judul: 'Video Tidak Ditemukan', author: '-', thumbnail: null, success: false }
    }
  }

  const handleYoutubeSummary = async (url, signal) => {
    setChatData((prev) => [...prev, { role: 'ai', content: '...', isSummarizing: true }])
    try {
      const data = await getYoutubeData(url)
      const searchResults = await getYoutubeSummary(url, data, signal)
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        { role: 'ai', content: searchResults, isYoutubeSummary: true, youtubeLink: url }
      ])
    } catch (error) {
      console.error('Youtube Summary Error:', error)
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

  const handleMusic = async (action, query) => {
    if (action === 'music-next') return nextTrack()
    if (action === 'music-prev') return prevTrack()
    if (action === 'music-toggle') return playPause()

    setChatData((prev) => [...prev, { role: 'ai', content: '...', isSearchingMusic: true }])
    const music = await window.api.searchMusic(query)
    const isAutoplay = action === 'music-play'

    setChatData((prev) => [
      ...prev.filter((item) => !item.isSearchingMusic),
      {
        role: 'ai',
        content: `Hasil Pencarian Lagu untuk "${query}": \n ${music.map((item) => item.title).join('\n')}`,
        isMusic: true,
        isMusicAutoplay: isAutoplay,
        musicQuery: query,
        musicList: isAutoplay ? music.slice(0, 1) : [...music]
      }
    ])

    if (isAutoplay && music.length > 0) {
      playUrl(`https://music.youtube.com/watch?v=${music[0].id}`)
    }
  }

  const handleAIResponse = async (userInput) => {
    if (!userInput) return
    setIsLoading(true)
    const userMessage = { role: 'user', content: userInput }
    const thinkingMessage = { role: 'ai', content: '...', isThinking: true }
    const rawSession = [
      ...chatData
        .filter(
          (item) =>
            item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing
        )
        .map((item) => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }))
    ]

    let chatSession = []
    rawSession.forEach((item, index) => {
      if (index > 0 && item.role === chatSession[chatSession.length - 1].role) {
        chatSession[chatSession.length - 1].content =
          chatSession[chatSession.length - 1].content + `\n ${item.content}`
      } else {
        chatSession.push(item)
      }
    })

    chatSession = [...chatSession].slice(-1 * (config[0]?.context || 10))
    chatSession = [...chatSession, userMessage]
    setChatData((prev) => [...prev, userMessage, thinkingMessage])
    abortControllerRef.current = new AbortController()

    try {
      const allMemory = await getAllMemory()
      const memoryReference = await getRelevantMemory(userInput, allMemory)

      const answer = await getAnswer(
        userInput,
        memoryReference,
        chatSession,
        abortControllerRef.current.signal,
        isAction.web,
        isAction.youtube
      )

      if (!answer) throw new Error('Gagal mengurai jawaban dari Mark menjadi format JSON.')

      if (isSpeak) {
        playVoice(answer.answer)
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

      if (answer.command?.action === 'yt-search') {
        handleYoutubeSearch(answer, abortControllerRef.current.signal)
      } else {
        setChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const aiResponse = {
            role: 'ai',
            content: answer.answer,
            isMemorySaved:
              answer.memory?.action === 'insert' && answer.command?.action !== 'search',
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
      }

      if (answer.command?.action === 'search') {
        await handleSearchCommand(
          userInput,
          answer.command.query,
          abortControllerRef.current.signal,
          chatSession
        )
      }
      if (answer.command?.action === 'yt-summary') {
        await handleYoutubeSummary(answer.command.query, abortControllerRef.current.signal)
      }
      if (answer.command?.action?.startsWith('music')) {
        await handleMusic(answer.command.action, answer.command?.query)
      }
      setMessage('')
      setIsLoading(false)
    } catch (error) {
      setIsLoading(false)
      if (error.name === 'AbortError') {
        setChatData((prev) => [...prev.filter((item) => !item.isThinking)])
        setChatData((prev) => prev.slice(0, -1))
      } else if (error?.code === 'LM_STUDIO_OFFLINE' || error?.message?.includes('LM Studio mati')) {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content:
              'LM Studio lagi mati bro. Nyalain dulu server-nya di port 1234, baru gue lanjut jawab.'
          }
        ])
      } else {
        console.error('AI Response Error:', error)
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          { role: 'ai', content: `Maaf, terjadi kesalahan: ${error.message}` }
        ])
      }
    }
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
  }

  const handlePlanningCommand = async (userInput) => {
    if (!userInput) return
    setIsLoading(true)
    const userMessage = { role: 'user', content: userInput }
    setChatData((prev) => [...prev, userMessage])
    abortControllerRef.current = new AbortController()
    
    try {
      // 1. Get Plan
      setChatData((prev) => [...prev, { role: 'ai', content: 'Menganalisis instruksi dan membuat rencana...', isThinking: true }])
      const plan = await getPlan(userInput, abortControllerRef.current.signal)
      
      setChatData((prev) => {
         const filtered = prev.filter(item => !item.isThinking);
         return [...filtered, { role: 'ai', content: '', isPlanSteps: true, plan: plan, currentStep: 0 }];
      })

      let contextSummaries = [];
      let previousContext = [];

      // 2. Loop
      for (let i = 0; i < plan.length; i++) {
        const task = plan[i];
        
        // UI update for running task - UPDATE currentStep instead of adding new thinking message
        setChatData((prev) => prev.map(item => item.isPlanSteps ? { ...item, currentStep: i } : item));
        
        const actionData = await getTaskAction(task, previousContext, abortControllerRef.current.signal);

        
        let actionResult = null;
        let summary = "Tidak ada hasil";
        
        // Execute Action
        if (actionData.action === 'search') {
           actionResult = await new Promise((resolve, reject) => {
               setChatData((prev) => [
                   ...prev.filter(item => !item.isThinking), 
                   { 
                       role: 'ai', 
                       content: '...', 
                       isSearching: true, 
                       query: actionData.query, 
                       sendDataWebSearch: (search, result) => resolve({ search, result }) 
                   }
               ]);
               
               // Optional timeout just in case it hangs (Ditingkatkan ke 45 detik karena deep search bisa lama)
               setTimeout(() => resolve({ search: [], result: [] }), 45000)
           });
           summary = await getTaskSummary(task, actionResult.search, abortControllerRef.current.signal);
        } else if (actionData.action === 'yt-search') {
           actionResult = await window.api.searchYoutube(actionData.query);
           summary = await getTaskSummary(task, actionResult, abortControllerRef.current.signal);
        } else if (actionData.action === 'yt-summary') {
           const yData = await getYoutubeData(actionData.query);
           const sum = await getYoutubeSummary(actionData.query, yData, abortControllerRef.current.signal);
           summary = sum;
        } else if (actionData.action?.startsWith('music')) {
           if (actionData.action === 'music-next') {
              nextTrack();
              summary = "Memutar lagu selanjutnya.";
           } else if (actionData.action === 'music-prev') {
              prevTrack();
              summary = "Memutar lagu sebelumnya.";
           } else if (actionData.action === 'music-toggle') {
              playPause();
              summary = "Pause/Resume lagu.";
           } else {
              actionResult = await window.api.searchMusic(actionData.query);
              if (actionData.action === 'music-play' && actionResult.length > 0) {
                 playUrl(`https://music.youtube.com/watch?v=${actionResult[0].id}`);
              }
              summary = await getTaskSummary(task, actionResult.slice(0,3), abortControllerRef.current.signal);
           }
        } else {
           summary = await getTaskSummary(task, { note: "internal thought / done" }, abortControllerRef.current.signal);
        }
        
        contextSummaries.push(summary);
        previousContext.push(`Task: ${task} -> Hasil: ${summary}`);
        
        setChatData((prev) => prev.filter((item) => !item.isSearching));
      }
      
      // All steps done
      setChatData((prev) => prev.map(item => item.isPlanSteps ? { ...item, currentStep: plan.length } : item));
      
      // 3. Conclusion
      setChatData((prev) => [...prev, { role: 'ai', content: 'Merangkum hasil akhir...', isThinking: true }]);
      const finalAnswer = await getPlanConclusion(userInput, contextSummaries, abortControllerRef.current.signal);
      
      setChatData((prev) => {
         const filtered = prev.filter(item => !item.isThinking);
         return [...filtered, { role: 'ai', content: finalAnswer }]
      });
      
      if (isSpeak) {
        playVoice(finalAnswer);
      }
      
      setMessage('');
      setIsLoading(false);

    } catch (error) {
       console.error("Planning Error:", error);
       setIsLoading(false);
       if (error.name === 'AbortError') {
          setChatData((prev) => [...prev.filter((item) => !item.isThinking && !item.isSearching)]);
          setChatData((prev) => prev.slice(0, -1));
       } else {
          setChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            { role: 'ai', content: `Maaf, terjadi kesalahan di proses planning: ${error.message}` }
          ]);
       }
    }
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (isLoading) {
      handleStop()
    } else {
      if (isAction.plan) {
         handlePlanningCommand(message.trim())
      } else {
         handleAIResponse(message.trim())
      }
    }
  }

  const value = {
    chatData,
    setChatData,
    sessionId,
    setSessionId,
    changeSession,
    isAction,
    setIsAction,
    isSpeak,
    setIsSpeak,
    config,
    isLoading,
    message,
    setMessage,
    handleAIResponse,
    handleStop,
    handleSubmit
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export const useChat = () => useContext(ChatContext)
