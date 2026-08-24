import { useContext, createContext } from 'react'
import { useMarkAgent } from '../hooks/useMarkAgent'

const ChatContext = createContext()

export const ChatProvider = ({ children }) => {
  const markAgent = useMarkAgent()

  return <ChatContext.Provider value={markAgent}>{children}</ChatContext.Provider>
}

export const useChat = () => useContext(ChatContext)
