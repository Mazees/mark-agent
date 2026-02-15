import { useState, useContext, createContext, useEffect } from 'react'
import { getTitleSession } from '../api/ai'
import { createSession, insertSession } from '../api/db'
import { getChatData } from '../api/db'

const ChatContext = createContext()

export const ChatProvider = ({ children }) => {
  const [chatData, setChatData] = useState([])
  const [sessionId, setSessionId] = useState(null)

  useEffect(() => {
    if (chatData && chatData.length) {
      console.log('Chat data updated:', chatData.length)
      if (!sessionId) {
        ;(async () => {
          const title = await getTitleSession(chatData[0].content)
          const id = await createSession(title, chatData)
          setSessionId(id)
          console.log('Session created with ID:', id)
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
  const value = {
    chatData,
    setChatData,
    sessionId,
    setSessionId,
    changeSession
  }
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export const useChat = () => {
  return useContext(ChatContext)
}
