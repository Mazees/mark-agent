import { useState, useEffect, useRef } from 'react'
import { FaTerminal, FaStop, FaQuestionCircle, FaPaperPlane, FaTimes, FaShieldAlt } from 'react-icons/fa'

const PCOverlayPage = () => {
  const [actionTitle, setActionTitle] = useState('Mengontrol PC')
  const [actionDetail, setActionDetail] = useState('')
  const [isStopped, setIsStopped] = useState(false)
  const [stopReason, setStopReason] = useState('')

  // Modal tanya user (os-ask)
  const [isAsking, setIsAsking] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [userAnswer, setUserAnswer] = useState('')

  const hideTimerRef = useRef(null)

  useEffect(() => {
    if (!window.api) return

    const unsubShow = window.api.onPCOverlayShow?.((data) => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsStopped(false)
      if (data?.action) setActionTitle(data.action)
      if (data?.detail) setActionDetail(data.detail)
      if (window.api.showPCOverlayWindow) {
        window.api.showPCOverlayWindow(420, 76)
      }
    })

    const unsubHide = window.api.onPCOverlayHide?.(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        setIsAsking(false)
        if (window.api.hidePCOverlayWindow) {
          window.api.hidePCOverlayWindow()
        }
      }, 500)
    })

    const unsubAsk = window.api.onPCOverlayAsk?.((data) => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsAsking(true)
      setAskQuestion(data?.question || 'MARK membutuhkan masukan/konfirmasi Anda.')
      setUserAnswer('')
      if (window.api.showPCOverlayWindow) {
        window.api.showPCOverlayWindow(440, 320)
      }
    })

    const unsubStop = window.api.onPCEmergencyStop?.((data) => {
      setIsStopped(true)
      setStopReason(data?.reason || 'Otomasi PC dihentikan darurat (Ctrl+Shift+S).')
      if (window.api.showPCOverlayWindow) {
        window.api.showPCOverlayWindow(420, 76)
      }
    })

    return () => {
      if (unsubShow) unsubShow()
      if (unsubHide) unsubHide()
      if (unsubAsk) unsubAsk()
      if (unsubStop) unsubStop()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const handleEmergencyStop = async () => {
    setIsStopped(true)
    setStopReason('Emergency Stop ditekan oleh User.')
    if (window.api?.triggerPCEmergencyStop) {
      await window.api.triggerPCEmergencyStop('Emergency Stop ditekan via Floating HUD')
    }
  }

  const handleSubmitAnswer = async (e) => {
    if (e) e.preventDefault()
    if (!userAnswer.trim()) return

    if (window.api?.resolveAskUserPC) {
      await window.api.resolveAskUserPC(userAnswer.trim())
    }
    setIsAsking(false)
    setUserAnswer('')
    if (window.api?.showPCOverlayWindow) {
      window.api.showPCOverlayWindow(420, 76)
    }
  }

  const handleAbortSession = async () => {
    if (window.api?.resolveAskUserPC) {
      await window.api.resolveAskUserPC('SISTEM: USER MEMBATALKAN OTOMASI PC.')
    }
    handleEmergencyStop()
    setIsAsking(false)
  }

  return (
    <div className="w-screen h-screen bg-transparent select-none overflow-hidden p-2 flex items-start justify-center font-mono">
      {isAsking ? (
        // Mode Dialog Interaktif (os-ask)
        <div className="w-full h-full rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.95)] border border-[#1fb854]/40 bg-[#0e1411]/95 backdrop-blur-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2 text-[#1fb854] font-bold text-xs tracking-wider uppercase">
              <FaQuestionCircle size={14} />
              <span>MARK Butuh Konfirmasi</span>
            </div>
            <button
              onClick={handleAbortSession}
              className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white"
              title="Batalkan"
            >
              <FaTimes size={12} />
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-[#1fb854]/20 text-xs text-[#cac9c9] leading-relaxed max-h-28 overflow-y-auto my-1">
            {askQuestion}
          </div>

          <form onSubmit={handleSubmitAnswer} className="flex flex-col gap-2">
            <input
              type="text"
              autoFocus
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Ketik jawaban atau instruksi Anda..."
              className="input input-xs input-bordered w-full bg-black/60 border-[#1fb854]/30 focus:border-[#1fb854] text-xs text-white"
            />

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleAbortSession}
                className="btn btn-ghost btn-xs text-error hover:bg-error/10 text-[10px]"
              >
                Batalkan Otomasi
              </button>
              <button
                type="submit"
                disabled={!userAnswer.trim()}
                className="btn btn-xs px-3 gap-1 font-bold bg-[#1fb854] hover:bg-[#1fb854]/85 text-black border-none shadow-md shadow-[#1fb854]/30 text-[11px]"
              >
                <FaPaperPlane size={9} />
                <span>Kirim</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        // Mode Floating Security Banner (Live Actions)
        <div className="w-full h-full rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.95)] border border-[#1fb854]/35 bg-[#0e1411]/95 backdrop-blur-3xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Status Icon */}
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                isStopped
                  ? 'bg-error text-white shadow-error/40'
                  : 'bg-[#1fb854]/15 text-[#1fb854] border border-[#1fb854]/30 shadow-[0_0_12px_rgba(31,184,84,0.25)]'
              }`}
            >
              {isStopped ? <FaShieldAlt size={12} /> : <FaTerminal size={12} className="animate-pulse" />}
            </div>

            {/* Action Text */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] font-extrabold tracking-wider uppercase ${
                    isStopped ? 'text-error' : 'text-[#1fb854]'
                  }`}
                >
                  {isStopped ? 'STOPPED' : 'PC AUTOMATION ACTIVE'}
                </span>
                {!isStopped && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#1fb854] shadow-[0_0_8px_#1fb854] animate-ping" />
                )}
              </div>
              <p className="text-[11px] font-semibold text-white/90 truncate">
                {isStopped ? stopReason : actionTitle}
              </p>
              {actionDetail && !isStopped && (
                <p className="text-[9px] text-white/50 truncate">{actionDetail}</p>
              )}
            </div>
          </div>

          {/* Emergency Stop Button */}
          {!isStopped && (
            <button
              onClick={handleEmergencyStop}
              className="btn btn-error btn-xs rounded-xl font-bold tracking-wide gap-1 shadow-lg shadow-error/30 hover:scale-105 active:scale-95 transition-transform flex-shrink-0 text-[10px] px-2.5"
              title="Hentikan eksekusi otomasi seketika (Ctrl+Shift+S)"
            >
              <FaStop size={8} />
              <span>STOP (Ctrl+Shift+S)</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default PCOverlayPage
