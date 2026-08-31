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
    <div className="relative z-50" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 w-9 btn btn-ghost p-0 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${isOpen ? 'text-white bg-white/15' : 'text-white/70 hover:text-white'}`}
        title="Buka Menu Navigasi"
      >
        <FaBars size={15} />
      </button>

      {isOpen && (
        <div className="absolute top-12 left-0 w-64 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 flex flex-col gap-1 shadow-[0_16px_40px_rgba(0,0,0,0.7)] animate-[holo-enter_0.2s_ease-out_forwards] z-50">
          <button
            onClick={() => {
              navigate('/')
              window.dispatchEvent(new CustomEvent('open-chat-studio'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-white text-xs font-semibold text-left cursor-pointer"
          >
            <FaCommentAlt className="text-primary" /> Chat Studio
          </button>

          <button
            onClick={() => handleNav('/config')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaCog className="text-primary" /> Configuration
          </button>

          <button
            onClick={() => handleNav('/plugins')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaPuzzlePiece className="text-primary" /> Plugins
          </button>
          <button
            onClick={() => handleNav('/neural-core')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaBrain className="text-primary" /> Neural Core
          </button>
          <button
            onClick={() => handleNav('/skills')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaPuzzlePiece className="text-primary" /> User Skills
          </button>

          <button
            onClick={() => handleNav('/subagents')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaRobot className="text-primary" /> Sub-Agents
          </button>

          <button
            onClick={() => handleNav('/google-workspace')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaGoogle className="text-primary" /> Google Workspace
          </button>

          <button
            onClick={() => handleNav('/live-audio')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaMicrophoneAlt className="text-primary" /> Live Audio
          </button>

          <button
            onClick={() => handleNav('/knowledge')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaDatabase className="text-primary" /> Knowledge (RAG)
          </button>

          <button
            onClick={() => handleNav('/guidebook')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaBook className="text-primary" /> Guidebook
          </button>

          <button
            onClick={() => {
              onOpenHistory()
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-xs font-medium text-left cursor-pointer"
          >
            <FaHistory className="text-primary" /> History
          </button>

          <div className="h-px w-full bg-white/10 my-1" />

          <button
            onClick={() => handleNav('/telegram-bot')}
            className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/5 cursor-pointer text-white/80 text-xs font-medium"
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
