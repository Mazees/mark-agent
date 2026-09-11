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
    const num = Number(id)
    setRunningSessionIds((prev) => (prev.map(Number).includes(num) ? prev : [...prev, num]))
  }

  const removeRunningSessionId = (id) => {
    const num = Number(id)
    setRunningSessionIds((prev) => prev.filter((x) => Number(x) !== num))
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

  const abortControllerRef = useRef(null)

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data)
  }

  useEffect(() => {
    loadConfig()
    loadMainThread()

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
      window.removeEventListener('config-updated', handleConfigUpdate)
      window.removeEventListener('ai-reset-complete', handleAiReset)
    }
  }, [])

  const loadMainThread = async () => {
    const data = await getMainThread()
    if (data && data.length > 0) {
      setChatData(data)
    }
    setIsChatLoaded(true)
  }

  useEffect(() => {
    // Save to DB on every change if not initial empty array
    if (chatData !== undefined && isChatLoaded) {
      saveMainThread(chatData)
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
