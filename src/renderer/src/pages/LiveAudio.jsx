import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const LiveAudio = () => {
  const navigate = useNavigate()
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle') // idle, listening, speaking
  const timeoutsRef = useRef([])

  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }

  const handleMicToggle = () => {
    if (isActive) {
      setIsActive(false)
      setStatus('idle')
      clearAllTimeouts()
    } else {
      setIsActive(true)
      setStatus('listening')
      // Simulate Mark speaking after 3 seconds (placeholder)
      const t1 = setTimeout(() => {
        setStatus('speaking')
        const t2 = setTimeout(() => {
          setStatus('listening')
        }, 2000)
        timeoutsRef.current.push(t2)
      }, 3000)
      timeoutsRef.current.push(t1)
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Tap untuk mulai bicara'
      case 'listening':
        return 'Mendengarkan...'
      case 'speaking':
        return 'Mark sedang berbicara...'
      default:
        return 'Tap untuk mulai bicara'
    }
  }

  const getStatusSubtext = () => {
    switch (status) {
      case 'idle':
        return 'Tekan tombol mikrofon untuk memulai percakapan live dengan Mark'
      case 'listening':
        return 'Silakan bicara, Mark sedang mendengarkan'
      case 'speaking':
        return 'Tunggu sebentar, Mark sedang merespon'
      default:
        return ''
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-linear-to-b from-base-300 via-base-100 to-base-300">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl transition-all duration-1000 ${isActive ? 'scale-110 bg-primary/10' : 'scale-100'}`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-success/5 blur-3xl transition-all duration-1000 delay-200 ${isActive ? 'scale-125 bg-success/10' : 'scale-100'}`}
        />
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 btn btn-ghost btn-sm gap-2 z-20 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1.2em"
          height="1.2em"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali
      </button>

      {/* Header */}
      <div className="relative z-10 text-center mb-8 select-none">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.3em"
              height="1.3em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-primary"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M17 11a1 1 0 0 1 1 1 6 6 0 0 1-12 0 1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 1-1Z" />
              <path d="M12 19a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Live Audio</h1>
        </div>
        <p className="text-sm opacity-50">Percakapan suara real-time dengan Mark</p>
      </div>

      {/* Audio Visualizer Circle */}
      <div className="relative z-10 flex items-center justify-center mb-10">
        {/* Outer pulse rings */}
        {isActive && (
          <>
            <div className="absolute w-64 h-64 rounded-full border border-primary/20 audio-pulse-ring" />
            <div
              className="absolute w-72 h-72 rounded-full border border-primary/10 audio-pulse-ring"
              style={{ animationDelay: '0.5s' }}
            />
            <div
              className="absolute w-80 h-80 rounded-full border border-primary/5 audio-pulse-ring"
              style={{ animationDelay: '1s' }}
            />
          </>
        )}

        {/* Main visualizer circle */}
        <div
          className={`relative w-52 h-52 rounded-full flex items-center justify-center transition-all duration-700 ${
            isActive
              ? status === 'speaking'
                ? 'audio-glow-speaking'
                : 'audio-glow-listening'
              : 'audio-glow-idle'
          }`}
        >
          {/* Inner gradient ring */}
          <div
            className={`absolute inset-0 rounded-full transition-all duration-500 ${
              isActive
                ? 'bg-linear-to-br from-primary/30 via-success/20 to-primary/30'
                : 'bg-linear-to-br from-base-200/60 via-base-300/40 to-base-200/60'
            }`}
          />

          {/* Inner circle with waveform placeholder */}
          <div
            className={`relative w-40 h-40 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-500 ${
              isActive
                ? 'bg-base-100/40 border border-primary/30'
                : 'bg-base-100/20 border border-white/5'
            }`}
          >
            {/* Animated bars (audio waveform placeholder) */}
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    isActive
                      ? status === 'speaking'
                        ? 'bg-success audio-bar-speaking'
                        : 'bg-primary audio-bar-listening'
                      : 'bg-white/20 h-4'
                  }`}
                  style={{
                    animationDelay: `${i * 0.15}s`
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status text */}
      <div className="relative z-10 text-center mb-12 select-none">
        <p
          className={`text-lg font-semibold mb-1 transition-colors duration-300 ${
            status === 'listening'
              ? 'text-primary'
              : status === 'speaking'
                ? 'text-success'
                : 'text-white/60'
          }`}
        >
          {getStatusText()}
        </p>
        <p className="text-sm opacity-40 max-w-xs">{getStatusSubtext()}</p>
      </div>

      {/* Mic button */}
      <div className="relative z-10">
        <button
          onClick={handleMicToggle}
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 active:scale-95 ${
            isActive
              ? 'bg-error shadow-lg hover:bg-error/90'
              : 'bg-primary shadow-lg hover:bg-primary/90'
          }`}
        >
          {isActive ? (
            /* Stop icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.8em"
              height="1.8em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-white"
            >
              <path d="M7 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Z" />
            </svg>
          ) : (
            /* Mic icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.8em"
              height="1.8em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="text-white"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M17 11a1 1 0 0 1 1 1 6 6 0 0 1-12 0 1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 1-1Z" />
              <path d="M12 19a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
            </svg>
          )}
        </button>

        {/* Active ring animation around mic button */}
        {isActive && (
          <div className="absolute inset-0 w-18 h-18 rounded-full border-2 border-error/50 audio-pulse-ring pointer-events-none" />
        )}
      </div>

      {/* Bottom hint */}
      <p className="relative z-10 mt-8 text-xs opacity-30 select-none">
        {isActive ? 'Tekan tombol untuk menghentikan' : 'Pastikan mikrofon sudah tersambung'}
      </p>
    </div>
  )
}

export default LiveAudio
