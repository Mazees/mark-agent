import { useState, useEffect, useRef } from 'react'
import { FaTerminal, FaStop, FaQuestionCircle, FaPaperPlane, FaTimes, FaShieldAlt } from 'react-icons/fa'

export const PCOverlay = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [actionTitle, setActionTitle] = useState('Mengontrol PC')
  const [actionDetail, setActionDetail] = useState('')
  const [isStopped, setIsStopped] = useState(false)
  const [stopReason, setStopReason] = useState('')

  // Modal tanya user (os-ask)
  const [isAsking, setIsAsking] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [userAnswer, setUserAnswer] = useState('')

  const hideTimerRef = useRef(null)

  // Listen ke event PC Automation
  useEffect(() => {
    if (!window.api) return

    const unsubShow = window.api.onPCOverlayShow?.((data) => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
      setIsStopped(false)
      if (data?.action) setActionTitle(data.action)
      if (data?.detail) setActionDetail(data.detail)
    })

    const unsubHide = window.api.onPCOverlayHide?.(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        setIsAsking(false)
      }, 600)
    })

    const unsubAsk = window.api.onPCOverlayAsk?.((data) => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
      setIsAsking(true)
      setAskQuestion(data?.question || 'MARK membutuhkan masukan/konfirmasi Anda.')
      setUserAnswer('')
    })

    const unsubStop = window.api.onPCEmergencyStop?.((data) => {
      setIsVisible(true)
      setIsStopped(true)
      setStopReason(data?.reason || 'Otomasi PC dihentikan darurat (Ctrl+Shift+S).')
    })

    return () => {
      if (unsubShow) unsubShow()
      if (unsubHide) unsubHide()
      if (unsubAsk) unsubAsk()
      if (unsubStop) unsubStop()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // Emergency Stop Handler
  const handleEmergencyStop = async () => {
    setIsStopped(true)
    setStopReason('Emergency Stop ditekan oleh User.')
    if (window.api?.triggerPCEmergencyStop) {
      await window.api.triggerPCEmergencyStop('Emergency Stop ditekan via Floating HUD')
    }
  };

  // Submit Jawaban Ask User
  const handleSubmitAnswer = async (e) => {
    if (e) e.preventDefault()
    if (!userAnswer.trim()) return

    if (window.api?.resolveAskUserPC) {
      await window.api.resolveAskUserPC(userAnswer.trim())
    }
    setIsAsking(false)
    setUserAnswer('')
  }

  // Cancel / Abort dari Ask User
  const handleAbortSession = async () => {
    if (window.api?.resolveAskUserPC) {
      await window.api.resolveAskUserPC('SISTEM: USER MEMBATALKAN OTOMASI PC.')
    }
    handleEmergencyStop()
    setIsAsking(false)
  }

  if (!isVisible) return null

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none select-none">
      <div
        className={`
          transition-all duration-300 ease-out origin-top
          pointer-events-auto
          ${
            isVisible
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'
          }
        `}
      >
        {isAsking ? (
          // Mode Dialog Interaktif (os-ask)
          <div className="w-[380px] sm:w-[440px] rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.95)] border border-cyan-500/40 bg-[#080808]/95 backdrop-blur-3xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs tracking-wider uppercase">
                <FaQuestionCircle size={15} />
                <span>MARK Membutuhkan Masukan</span>
              </div>
              <button
                onClick={handleAbortSession}
                className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white"
                title="Batalkan"
              >
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/90 leading-relaxed max-h-36 overflow-y-auto">
              {askQuestion}
            </div>

            <form onSubmit={handleSubmitAnswer} className="flex flex-col gap-3">
              <input
                type="text"
                autoFocus
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Ketik jawaban atau instruksi Anda..."
                className="input input-sm input-bordered w-full bg-black/50 border-white/20 text-xs focus:border-cyan-500 text-white"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAbortSession}
                  className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                >
                  Batalkan Otomasi
                </button>
                <button
                  type="submit"
                  disabled={!userAnswer.trim()}
                  className="btn btn-primary btn-xs px-4 gap-1.5 font-bold shadow-md shadow-primary/30"
                >
                  <FaPaperPlane size={10} />
                  <span>Kirim Jawaban</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          // Mode Floating Security Banner (Live Actions)
          <div className="min-w-[340px] sm:min-w-[380px] max-w-[480px] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-cyan-500/30 bg-[#080808]/95 backdrop-blur-3xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Pulsing Status Icon */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors shadow-md ${
                  isStopped
                    ? 'bg-error text-white shadow-error/40'
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-cyan-500/20'
                }`}
              >
                {isStopped ? <FaShieldAlt size={14} /> : <FaTerminal size={14} className="animate-pulse" />}
              </div>

              {/* Action Text */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-extrabold tracking-wider uppercase ${
                      isStopped ? 'text-error' : 'text-cyan-400'
                    }`}
                  >
                    {isStopped ? 'STOPPED' : 'PC AUTOMATION ACTIVE'}
                  </span>
                  {!isStopped && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </div>
                <p className="text-xs font-semibold text-white/90 truncate">
                  {isStopped ? stopReason : actionTitle}
                </p>
                {actionDetail && !isStopped && (
                  <p className="text-[10px] text-white/50 truncate">{actionDetail}</p>
                )}
              </div>
            </div>

            {/* Emergency Stop Button */}
            {!isStopped && (
              <button
                onClick={handleEmergencyStop}
                className="btn btn-error btn-xs rounded-xl font-bold tracking-wide gap-1 shadow-lg shadow-error/30 hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
                title="Hentikan eksekusi otomasi seketika (Ctrl+Shift+S)"
              >
                <FaStop size={10} />
                <span>STOP (Ctrl+Shift+S)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
