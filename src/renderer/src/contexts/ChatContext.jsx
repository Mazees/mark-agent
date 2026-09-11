import { useContext, createContext } from 'react'
import { useMarkAgent } from '../hooks/useMarkAgent'

const ChatContext = createContext()

export const ChatProvider = ({ children }) => {
  const markAgent = useMarkAgent()

  return <ChatContext.Provider value={markAgent}>{children}</ChatContext.Provider>
}

const defaultChatContext = {}

export const useChat = () => {
  const context = useContext(ChatContext)
  return context || defaultChatContext
}
