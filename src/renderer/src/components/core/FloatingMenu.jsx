import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import markLogo from '../../assets/icon.svg'
import {
  FaBars,
  FaTimes,
  FaCog,
  FaPuzzlePiece,
  FaMicrophoneAlt,
  FaTelegram,
  FaDatabase,
  FaBook,
  FaGoogle,
  FaBrain,
  FaRobot,
  FaCommentAlt,
  FaChevronRight
} from 'react-icons/fa'

const FloatingMenu = () => {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleNav = (path) => {
    navigate(path)
    setIsOpen(false)
  }

  const handleOpenStudio = () => {
    navigate('/')
    window.dispatchEvent(new CustomEvent('open-chat-studio'))
    setIsOpen(false)
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`h-9 w-9 btn btn-ghost p-0 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
          isOpen ? 'text-white bg-white/20 ring-1 ring-white/20' : 'text-white/70 hover:text-white'
        }`}
        title="Buka Menu Navigasi"
      >
        <FaBars size={15} />
      </button>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] transition-opacity duration-300 animate-[response-fade-in_0.2s_ease-out_forwards]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-over Left Navigation Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-base-300/98 border-r border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-[110] flex flex-col transition-transform duration-300 ease-out transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-base-200/40">
          <div className="flex items-center gap-3">
            <img src={markLogo} alt="Mark Logo" className="size-20 object-contain" />
            <div>
              <h2 className="text-sm font-bold font-mono text-white tracking-wider">MARK AGENT</h2>
              <p className="text-[10px] font-mono text-primary uppercase tracking-widest font-semibold">
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '5.0.0'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-error hover:text-white text-base-content/60 transition-colors cursor-pointer"
            title="Tutup Menu"
          >
            <FaTimes size={13} />
          </button>
        </div>

        {/* Scrollable Navigation Items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-4">
          {/* Section: Main Studio & Live */}
          <div>
            <span className="text-[10px] font-mono font-bold text-base-content/40 uppercase tracking-widest px-2.5 mb-1.5 block">
              Workspace & Live
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleOpenStudio}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaCommentAlt className="text-primary text-sm" />
                  <span>Chat Studio</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/live-audio')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaMicrophoneAlt className="text-primary text-sm" />
                  <span>Live Audio & VAD</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>
            </div>
          </div>

          {/* Section: Brain & Cognitive Systems */}
          <div>
            <span className="text-[10px] font-mono font-bold text-base-content/40 uppercase tracking-widest px-2.5 mb-1.5 block">
              Cognitive & Brain
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleNav('/neural-core')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaBrain className="text-primary text-sm" />
                  <span>Neural Core</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30 font-bold">
                  OTAK
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleNav('/subagents')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaRobot className="text-primary text-sm" />
                  <span>Sub-Agents</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/skills')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaPuzzlePiece className="text-primary text-sm" />
                  <span>User Skills</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/knowledge')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaDatabase className="text-primary text-sm" />
                  <span>Knowledge (RAG)</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>
            </div>
          </div>

          {/* Section: Ecosystem & Integrations */}
          <div>
            <span className="text-[10px] font-mono font-bold text-base-content/40 uppercase tracking-widest px-2.5 mb-1.5 block">
              Integrations & System
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleNav('/plugins')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaPuzzlePiece className="text-primary text-sm" />
                  <span>Plugins Hub</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/google-workspace')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaGoogle className="text-primary text-sm" />
                  <span>Google Workspace</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>
              <button
                type="button"
                onClick={() => handleNav('/telegram-bot')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaTelegram className="text-primary text-sm" />
                  <span>Telegram Bot</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/guidebook')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaBook className="text-primary text-sm" />
                  <span>Guidebook</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('/config')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-base-content/80 hover:text-white text-xs font-medium font-mono transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <FaCog className="text-primary text-sm" />
                  <span>Configuration</span>
                </div>
                <FaChevronRight
                  size={10}
                  className="text-base-content/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default FloatingMenu
