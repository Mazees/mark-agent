import { useContext, createContext } from 'react'
import { useMarkAgent } from '../hooks/useMarkAgent'

const ChatContext = createContext()

export const ChatProvider = ({ children }) => {
  const markAgent = useMarkAgent()

  return <ChatContext.Provider value={markAgent}>{children}</ChatContext.Provider>
}

const defaultChatContext = {
  chatData: [],
  setChatData: () => {},
  clearChat: () => {},
  message: '',
  setMessage: () => {},
  isLoading: false,
  setIsLoading: () => {},
  isAgentBusy: false,
  setIsAgentBusy: () => {},
  runningSessionId: null,
  setRunningSessionId: () => {},
  runningSessionIds: [],
  setRunningSessionIds: () => {},
  addRunningSessionId: () => {},
  removeRunningSessionId: () => {},
  isSpeak: false,
  setIsSpeak: () => {},
  orbStatus: 'idle',
  setOrbStatus: () => {},
  currentResponse: null,
  setCurrentResponse: () => {},
  notifications: [],
  pushNotification: () => {},
  activeProcesses: [],
  setActiveProcesses: () => {},
  pushProcess: () => {},
  dismissProcess: () => {},
  inputSource: 'pc',
  setInputSource: () => {},
  handlePlanningCommand: () => {},
  handleIntervention: () => {},
  handleStop: () => {},
  handleSubmit: () => {},
  isBooting: false,
  isRecording: false,
  isProcessing: false,
  audioIntensity: 0,
  startRecording: () => {},
  stopRecording: () => {},
  toggleRecording: () => {},
  toastMessage: null,
  currentActiveSessionId: '1',
  setCurrentActiveSessionId: () => {}
}

export const useChat = () => {
  const context = useContext(ChatContext)
  return context || defaultChatContext
}
