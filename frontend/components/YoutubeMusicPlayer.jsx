import { useState, useEffect, useRef, useMemo } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import {
  FaPlay,
  FaPause,
  FaStepForward,
  FaStepBackward,
  FaTimes,
  FaChevronDown,
  FaVideo,
  FaImage,
  FaVolumeUp,
  FaVolumeMute,
  FaRandom,
  FaRedo,
  FaYoutube
} from 'react-icons/fa'

export const YoutubeMusicPlayer = () => {
  const {
    videoId,
    iframeRef,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    isPlaying,
    setIsPlaying,
    currentTrack,
    playUrl,
    playPause,
    nextTrack,
    prevTrack,
    seekTo,
    mute,
    unMute
  } = useYoutubeMusic()

  const [showVideoMode, setShowVideoMode] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [isLoop, setIsLoop] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(240) // Default estimate in seconds

  const playUrlRef = useRef(playUrl)

  useEffect(() => {
    playUrlRef.current = playUrl
  }, [playUrl])

  // Parse duration string "3:45" or "03:45" to seconds
  useEffect(() => {
    if (currentTrack?.duration) {
      const parts = String(currentTrack.duration).split(':').map(Number)
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setDuration(parts[0] * 60 + parts[1])
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        setDuration(parts[0] * 3600 + parts[1] * 60 + parts[2])
      }
    }
    setCurrentTime(0)
  }, [videoId, currentTrack?.duration])

  // Real-time progress ticker when playing
  useEffect(() => {
    let interval = null
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            if (isLoop) return 0
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isPlaying, duration, isLoop])

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // Handle Seekbar slider change
  const handleSeek = (e) => {
    const newTime = Number(e.target.value)
    setCurrentTime(newTime)
    seekTo(newTime)
  }

  // Handle Mute toggle
  const toggleMute = () => {
    if (isMuted) {
      unMute()
      setIsMuted(false)
    } else {
      mute()
      setIsMuted(true)
    }
  }

  // Dengarkan perintah musik dari remote / Telegram
  useEffect(() => {
    if (window.api?.onExecuteMusicCommand) {
      window.api.onExecuteMusicCommand((command, payload) => {
        if (command === 'play' && payload) playUrlRef.current(payload)
        else if (command === 'toggle') togglePlayer()
      })
    }
  }, [togglePlayer])

  // Dengarkan event postMessage dari YouTube Iframe (onStateChange)
  useEffect(() => {
    const handleWindowMessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const data = JSON.parse(event.data)
          if (data.event === 'infoDelivery' && data.info) {
            if (data.info.playerState === 1) {
              setIsPlaying(true)
            } else if (data.info.playerState === 2) {
              setIsPlaying(false)
            } else if (data.info.playerState === 0) {
              setIsPlaying(false)
              if (isLoop) {
                seekTo(0)
                playPause()
              }
            }
          }
        }
      } catch (_) {}
    }

    window.addEventListener('message', handleWindowMessage)
    return () => window.removeEventListener('message', handleWindowMessage)
  }, [setIsPlaying, isLoop, seekTo, playPause])

  const embedSrc = useMemo(() => {
    return videoId
      ? `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1`
      : ''
  }, [videoId])

  const thumbnailUrl =
    currentTrack?.thumbnail ||
    (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '')

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed bottom-6 right-6 z-[120] flex flex-col items-end gap-3 pointer-events-none select-none">
      {/* Expandable Player Panel */}
      <div
        className={`
          transition-all duration-300 ease-out origin-bottom-right
          ${
            isPlayerOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          }
        `}
      >
        <div className="relative w-[360px] sm:w-[420px] rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 bg-[#080808]/95 backdrop-blur-3xl flex flex-col">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900/60 border-b border-white/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-600/40 flex-shrink-0">
                <FaYoutube size={14} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
                  YouTube Player
                  {isPlaying && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </span>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowVideoMode(!showVideoMode)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 border ${
                  showVideoMode
                    ? 'bg-red-600/20 text-red-400 border-red-500/30'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
                title={showVideoMode ? 'Pindah ke Mode Thumbnail' : 'Pindah ke Mode Video'}
              >
                {showVideoMode ? (
                  <>
                    <FaVideo size={10} />
                    <span>Video</span>
                  </>
                ) : (
                  <>
                    <FaImage size={10} />
                    <span>Cover</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsPlayerOpen(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Sembunyikan ke Background (Musik tetap berjalan)"
              >
                <FaChevronDown size={12} />
              </button>
            </div>
          </div>

          {/* Media Showcase (16:9 Aspect Ratio) */}
          <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden group">
            {/* 1. Single Continuous YouTube Iframe */}
            {videoId ? (
              <iframe
                ref={iframeRef}
                src={embedSrc}
                title="YouTube Video Player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className={`w-full h-full border-none transition-opacity duration-300 ${
                  showVideoMode
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none absolute inset-0'
                }`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-zinc-600 text-xs">
                <FaYoutube size={36} className="text-red-600 opacity-80" />
                <span className="font-medium text-zinc-400">Belum ada musik yang diputar</span>
              </div>
            )}

            {/* 2. Full 16:9 Thumbnail Cover Mode */}
            {!showVideoMode && videoId && (
              <div
                onClick={playPause}
                className="absolute inset-0 w-full h-full cursor-pointer flex items-center justify-center"
                title={isPlaying ? 'Klik untuk Jeda' : 'Klik untuk Putar'}
              >
                <img
                  src={thumbnailUrl}
                  alt={currentTrack?.title || 'Thumbnail'}
                  className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                    isPlaying ? 'brightness-100' : 'brightness-75'
                  }`}
                />

                {/* Dark Vignette Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

                {/* Dancing Equalizer Bars on Bottom-Left */}
                {isPlaying && (
                  <div className="absolute bottom-3 left-4 flex items-end gap-1 pointer-events-none z-10">
                    <span className="w-1 bg-red-500 rounded-full h-3 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    <span className="w-1 bg-red-500 rounded-full h-5 animate-[pulse_0.8s_ease-in-out_infinite_0.2s]" />
                    <span className="w-1 bg-red-500 rounded-full h-2.5 animate-[pulse_0.7s_ease-in-out_infinite_0.4s]" />
                    <span className="w-1 bg-red-500 rounded-full h-4 animate-[pulse_0.9s_ease-in-out_infinite_0.1s]" />
                  </div>
                )}

                {/* Center Hover Play/Pause Badge */}
                <div
                  className={`absolute w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl transition-all duration-300 ${
                    isPlaying
                      ? 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                      : 'opacity-100 scale-100'
                  }`}
                >
                  {isPlaying ? (
                    <FaPause size={20} className="text-white" />
                  ) : (
                    <FaPlay size={20} className="text-white ml-1" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Track Info Section */}
          <div className="px-5 pt-4 pb-1 flex flex-col">
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
              {currentTrack?.title || 'Tidak ada lagu yang diputar'}
            </h3>
            <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">
              {currentTrack?.artist || 'Mark AI Music Player'}
            </p>
          </div>

          {/* Timeline Progress Slider */}
          <div className="px-5 py-2 flex flex-col gap-1.5">
            <div className="relative flex items-center group">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none transition-all"
                style={{
                  background: `linear-gradient(to right, #dc2626 ${progressPercent}%, #27272a ${progressPercent}%)`
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main Control Bar */}
          <div className="px-5 pb-5 pt-1 flex items-center justify-between">
            {/* Shuffle Button */}
            <button
              onClick={() => setIsShuffle(!isShuffle)}
              className={`p-2 rounded-full transition-colors ${
                isShuffle ? 'text-red-500 bg-red-500/10' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Acak Lagu"
            >
              <FaRandom size={13} />
            </button>

            {/* Central Playback Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={prevTrack}
                className="p-2.5 text-zinc-300 hover:text-white hover:scale-110 active:scale-95 transition-all"
                title="Lagu Sebelumnya"
              >
                <FaStepBackward size={16} />
              </button>

              <button
                onClick={playPause}
                className="w-13 h-13 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/40 hover:scale-105 active:scale-95 transition-all"
                title={isPlaying ? 'Jeda Lagu' : 'Putar Lagu'}
              >
                {isPlaying ? <FaPause size={17} /> : <FaPlay size={17} className="ml-0.5" />}
              </button>

              <button
                onClick={nextTrack}
                className="p-2.5 text-zinc-300 hover:text-white hover:scale-110 active:scale-95 transition-all"
                title="Lagu Selanjutnya"
              >
                <FaStepForward size={16} />
              </button>
            </div>

            {/* Loop & Volume Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsLoop(!isLoop)}
                className={`p-2 rounded-full transition-colors ${
                  isLoop ? 'text-red-500 bg-red-500/10' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Ulangi Lagu"
              >
                <FaRedo size={13} />
              </button>

              <button
                onClick={toggleMute}
                className={`p-2 rounded-full transition-colors ${
                  isMuted ? 'text-red-500 bg-red-500/10' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={isMuted ? 'Nyalakan Suara' : 'Bisukan Suara'}
              >
                {isMuted ? <FaVolumeMute size={14} /> : <FaVolumeUp size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button (FAB) */}
      <button
        onClick={togglePlayer}
        className={`
          group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto
          shadow-2xl shadow-black/80 border border-white/10
          transition-all duration-300 ease-out
          hover:scale-110 hover:shadow-red-600/30
          active:scale-95
          ${
            isPlayerOpen
              ? 'bg-zinc-900 border-white/20'
              : 'bg-gradient-to-tr from-red-700 via-red-600 to-red-500'
          }
        `}
        title={isPlayerOpen ? 'Sembunyikan Player' : 'Buka YouTube Music'}
      >
        {/* Animated pulse ring saat lagu berputar dan panel tertutup */}
        {isPlaying && !isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping pointer-events-none" />
        )}

        {isPlayerOpen ? (
          <FaTimes size={18} className="text-white transition-transform duration-300" />
        ) : isPlaying ? (
          // Dancing equalizer icon on FAB
          <div className="flex items-end gap-1 h-5">
            <span className="w-1 bg-white rounded-full h-3 animate-[pulse_0.6s_ease-in-out_infinite]" />
            <span className="w-1 bg-white rounded-full h-5 animate-[pulse_0.8s_ease-in-out_infinite_0.2s]" />
            <span className="w-1 bg-white rounded-full h-2 animate-[pulse_0.7s_ease-in-out_infinite_0.4s]" />
          </div>
        ) : (
          <FaYoutube size={26} className="text-white transition-transform duration-300 group-hover:scale-110" />
        )}
      </button>
    </div>
  )
}
