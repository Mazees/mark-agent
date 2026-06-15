import { useState, useEffect } from 'react'

export const useWhatsappBot = (ytMusic) => {
  const [status, setStatus] = useState('disconnected')
  const [qrCode, setQrCode] = useState(null)
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')

  useEffect(() => {
    if (!window.api) return

    window.api.waGetStatus().then(({ status: initialStatus, qr }) => {
      setStatus(initialStatus)
      if (initialStatus === 'qr' && qr) setQrCode(qr)
    })

    if (window.api.waGetHistory) {
      window.api.waGetHistory().then((history) => {
        if (history && history.length > 0) {
          setMessages(history)
        }
      })
    }

    window.api.onWaQr((qr) => {
      setQrCode(qr)
      setStatus('qr')
    })

    window.api.onWaConnection((newStatus) => {
      setStatus(newStatus)
      if (newStatus !== 'qr') setQrCode(null)
    })

    window.api.onWaThinking(({ sender, isGroup, jid }) => {
      setIsThinking(true)
      setCurrentSender(isGroup ? `Grup / ${sender}` : sender)
    })

    window.api.onWaMessage((data) => {
      setMessages(prev => [...prev, { type: 'incoming', ...data }])
    })

    window.api.onWaReplySent((data) => {
      setMessages(prev => [...prev, { type: 'outgoing', ...data }])
      setIsThinking(false)
    })

    return () => {
      window.api.removeWaListeners()
    }
  }, [])

  const startBot = () => window.api.waStart()
  const stopBot = () => window.api.waStop()
  const logout = () => window.api.waLogout()

  return {
    status,
    qrCode,
    messages,
    isThinking,
    currentSender,
    startBot,
    stopBot,
    logout
  }
}
