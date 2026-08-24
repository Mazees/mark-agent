import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBars,
  FaCog,
  FaPuzzlePiece,
  FaMicrophoneAlt,
  FaHistory,
  FaTelegram,
  FaDatabase,
  FaNetworkWired,
  FaHeartbeat,
  FaBook,
  FaGoogle,
  FaBrain,
  FaRobot,
  FaCommentAlt
} from 'react-icons/fa'

const FloatingMenu = ({ onOpenHistory, tgStatus = 'disconnected' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNav = (path) => {
    navigate(path)
    setIsOpen(false)
  }

  return (
    <div className="fixed top-8 left-8 z-50" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 btn btn-outline bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] flex items-center justify-center transition-all shadow-lg hover:shadow-[0_0_15px_oklch(var(--su)/0.3)] ${isOpen ? 'text-white border-success/50' : 'text-white/70 hover:text-white hover:border-white/20'}`}
      >
        <FaBars size={20} />
      </button>

      {isOpen && (
        <div className="absolute top-16 left-0 w-64 bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-sm p-2 flex flex-col gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-[holo-enter_0.2s_ease-out_forwards]">
          {/* HUD Brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/30 pointer-events-none z-10" />

          <button
            onClick={() => {
              navigate('/')
              window.dispatchEvent(new CustomEvent('open-chat-studio'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-white text-sm font-semibold text-left border border-primary/20 shadow-sm"
          >
            <FaCommentAlt className="text-primary" /> Chat Studio
          </button>

          <button
            onClick={() => handleNav('/config')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaCog className="text-primary" /> Configuration
          </button>

          <button
            onClick={() => handleNav('/plugins')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaPuzzlePiece className="text-primary" /> Plugins
          </button>

          <button
            onClick={() => handleNav('/skills')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaBrain className="text-primary" /> Mark Skills
          </button>

          <button
            onClick={() => handleNav('/subagents')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaRobot className="text-primary" /> Sub-Agents
          </button>

          <button
            onClick={() => handleNav('/google-workspace')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaGoogle className="text-primary" /> Google Workspace
          </button>

          <button
            onClick={() => handleNav('/live-audio')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaMicrophoneAlt className="text-primary" /> Live Audio
          </button>

          <button
            onClick={() => handleNav('/knowledge')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaDatabase className="text-primary" /> Knowledge (RAG)
          </button>

          <button
            onClick={() => handleNav('/guidebook')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaBook className="text-primary" /> Guidebook
          </button>

          <button
            onClick={() => {
              // Custom event to open memory map in MarkHome
              window.dispatchEvent(new CustomEvent('open-memory-map'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaNetworkWired className="text-primary" /> Memory Map
          </button>

          <button
            onClick={() => handleNav('/relational')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaHeartbeat className="text-primary" /> Relational Growth
          </button>

          <button
            onClick={() => {
              onOpenHistory()
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaHistory className="text-primary" /> History
          </button>

          <div className="h-px w-full bg-white/10 my-1" />

          <button
            onClick={() => handleNav('/telegram-bot')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 cursor-pointer text-white/80 text-sm font-medium"
          >
            <FaTelegram className={tgStatus === 'connected' ? 'text-info' : 'text-white/30'} />
            <div className="flex-1 text-left">Telegram Bot</div>
            <div
              className={`w-2 h-2 rounded-full ${tgStatus === 'connected' ? 'bg-info shadow-[0_0_8px_oklch(var(--in))]' : 'bg-error'}`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

export default FloatingMenu
