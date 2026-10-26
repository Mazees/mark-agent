import { useState, useEffect, useRef } from 'react'
import { getAllConfig, saveMainThread, getMainThread } from '../../api/db'

export const useMarkState = () => {
  const [chatData, setChatData] = useState([])
  const [config, setConfig] = useState([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAgentBusy, setIsAgentBusy] = useState(false)
  const [runningSessionIds, setRunningSessionIds] = useState([])
  const runningSessionId = runningSessionIds[0] || null

  const addRunningSessionId = (id) => {
    if (id === null || id === undefined) return
    const strId = String(id)
    setRunningSessionIds((prev) => (prev.map(String).includes(strId) ? prev : [...prev, strId]))
  }

  const removeRunningSessionId = (id) => {
    if (id === null || id === undefined) return
    const strId = String(id)
    setRunningSessionIds((prev) => prev.filter((x) => String(x) !== strId))
  }

  const setRunningSessionId = (id) => {
    if (id === null || id === undefined) {
      setRunningSessionIds([])
    } else {
      addRunningSessionId(id)
    }
  }
  const [isSpeak, setIsSpeak] = useState(false)
  const [orbStatus, setOrbStatus] = useState('idle')
  const [currentResponse, setCurrentResponse] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [activeProcesses, setActiveProcesses] = useState([])
  const [inputSource, setInputSource] = useState('pc')
  const [activeTopic, setActiveTopic] = useState(null)
  const [currentActiveSessionId, setCurrentActiveSessionId] = useState('1')
  const [isChatLoaded, setIsChatLoaded] = useState(false)
  const [isBooting, setIsBooting] = useState(true)
  const sessionId = useRef('mark-main-thread')
  const chatSaveQueueRef = useRef(Promise.resolve())
  const savedGreetingIdsRef = useRef(new Set())

  const abortControllerRef = useRef(null)

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data)
  }

  useEffect(() => {
    let cancelled = false
    loadConfig()
    loadMainThread(() => cancelled)

    const handleConfigUpdate = (e) => {
      if (e.detail) {
        setConfig([e.detail])
      }
    }

    const handleAiReset = () => {
      setChatData([])
      setCurrentActiveSessionId('1')
      setActiveTopic(null)
      setCurrentResponse(null)
      setNotifications([])
      setActiveProcesses([])
    }

    window.addEventListener('config-updated', handleConfigUpdate)
    window.addEventListener('ai-reset-complete', handleAiReset)
    return () => {
      cancelled = true
      window.removeEventListener('config-updated', handleConfigUpdate)
      window.removeEventListener('ai-reset-complete', handleAiReset)
    }
  }, [])

  const loadMainThread = async (isCancelled) => {
    try {
      const data = await getMainThread()
      if (isCancelled()) return
      if (data && data.length > 0) {
        savedGreetingIdsRef.current = new Set(
          data.filter((message) => message.source === 'startup').map((message) => message.id)
        )
        setChatData(data)
      }
    } finally {
      if (!isCancelled()) setIsChatLoaded(true)
    }
  }

  useEffect(() => {
    if (chatData !== undefined && isChatLoaded) {
      const greetings = chatData.filter((message) => message.source === 'startup' && message.id)
      const hasNewGreeting = greetings.some(
        (message) => !savedGreetingIdsRef.current.has(message.id)
      )
      const save = () => {
        chatSaveQueueRef.current = chatSaveQueueRef.current
          .then(async () => {
            const saved = await saveMainThread(chatData)
            if (!saved) throw new Error('Riwayat Main Thread belum tersimpan.')
            for (const greeting of greetings) savedGreetingIdsRef.current.add(greeting.id)
          })
          .catch((error) => console.warn('[useMarkState] Gagal menyimpan riwayat chat:', error))
      }
      if (hasNewGreeting) {
        save()
        return
      }
      const timer = setTimeout(save, 800)
      return () => clearTimeout(timer)
    }
  }, [chatData, isChatLoaded])

  const clearChat = () => {
    setChatData([]) // saveMainThread will auto save the empty array
  }

  const pushNotification = (type, message) => {
    setNotifications((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), type, message, timestamp: Date.now() }
    ])
  }

  const pushProcess = (process) => {
    // process: { id, type, status, data }
    setActiveProcesses((prev) => {
      const existing = prev.findIndex((p) => p.id === process.id)
      if (existing !== -1) {
        // Update
        const next = [...prev]
        next[existing] = { ...next[existing], ...process }
        return next
      }
      // Add new
      return [...prev, process]
    })
  }

  const dismissProcess = (id) => {
    setActiveProcesses((prev) => prev.filter((p) => p.id !== id))
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
    if (window.api?.browserClose) {
      window.api.browserClose()
    }
  }

  return {
    chatData,
    setChatData,
    clearChat,
    sessionId: sessionId.current,
    config,
    setConfig,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    isAgentBusy,
    setIsAgentBusy,
    runningSessionId,
    setRunningSessionId,
    runningSessionIds,
    setRunningSessionIds,
    addRunningSessionId,
    removeRunningSessionId,
    isSpeak,
    setIsSpeak,
    orbStatus,
    setOrbStatus,
    currentResponse,
    setCurrentResponse,
    notifications,
    pushNotification,
    activeProcesses,
    setActiveProcesses,
    pushProcess,
    dismissProcess,
    inputSource,
    setInputSource,
    activeTopic,
    setActiveTopic,
    currentActiveSessionId,
    setCurrentActiveSessionId,
    isChatLoaded,
    isBooting,
    setIsBooting,
    abortControllerRef,
    handleStop
  }
}
