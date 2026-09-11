import { useState, useEffect } from 'react'
import { webApi } from '../../api/web-bridge'

export const useTelegramBot = () => {
  const [status, setStatus] = useState('disconnected')
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')

  useEffect(() => {
    webApi.tgGetStatus().then((res) => {
      if (res?.status) setStatus(res.status)
    })

    webApi.tgGetHistory().then((history) => {
      if (history && history.length > 0) {
        setMessages(history)
      }
    })

    const unsubConn = webApi.onTgConnection((newStatus) => {
      setStatus(newStatus)
    })

    const unsubThink = webApi.onTgThinking(({ sender }) => {
      setIsThinking(true)
      setCurrentSender(sender)
    })

    const unsubMsg = webApi.onTgMessage((data) => {
      setMessages((prev) => [...prev, { type: 'incoming', ...data }])
    })

    const unsubReply = webApi.onTgReplySent((data) => {
      setMessages((prev) => [...prev, { type: 'outgoing', ...data }])
      setIsThinking(false)
    })

    return () => {
      if (typeof unsubConn === 'function') unsubConn()
      if (typeof unsubThink === 'function') unsubThink()
      if (typeof unsubMsg === 'function') unsubMsg()
      if (typeof unsubReply === 'function') unsubReply()
    }
  }, [])

  const startBot = (token) => {
    webApi.tgStart(token)
  }

  const stopBot = () => {
    webApi.tgStop()
  }

  return {
    status,
    messages,
    isThinking,
    currentSender,
    startBot,
    stopBot
  }
}
