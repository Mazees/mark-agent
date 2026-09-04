import React, { useState, useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume,
  Volume2,
  VolumeX,
  ListMusic,
  ChevronDown,
  Music,
  ImageIcon,
  Tv,
  X
} from 'lucide-react'

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const YoutubeMusicPlayer = () => {
  const {
    currentTrack,
    queue,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    viewMode,
    isPlayerOpen,
    containerId,
    setIsPlayerOpen,
    togglePlayer,
    setViewMode,
    playTrack,
    playPause,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    toggleMute
  } = useYoutubeMusic()

  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const [showQueue, setShowQueue] = useState(false)

  // Web Bridge / IPC command synchronization
  const playTrackRef = useRef(playTrack)
  const nextTrackRef = useRef(nextTrack)
  const prevTrackRef = useRef(prevTrack)
  const playPauseRef = useRef(playPause)

  useEffect(() => {
    playTrackRef.current = playTrack
    nextTrackRef.current = nextTrack
    prevTrackRef.current = prevTrack
    playPauseRef.current = playPause
  }, [playTrack, nextTrack, prevTrack, playPause])

  useEffect(() => {
    if (window.api?.onExecuteMusicCommand) {
      window.api.onExecuteMusicCommand((command, payload) => {
        if (command === 'play' && payload) {
          if (typeof payload === 'object') {
            playTrackRef.current(payload)
          } else {
            window.api.searchMusic(payload).then((res) => {
              if (res && res.length > 0) {
                playTrackRef.current(res[0], res)
              }
            })
          }
        } else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
  }, [])

  const currentSeek = isSeeking ? seekValue : currentTime
  const progressRatio =
    duration > 0 ? Math.min(100, Math.max(0, (currentSeek / duration) * 100)) : 0
  const remainingTime = duration > currentSeek ? duration - currentSeek : 0

  return (
    <>
      {/* Hidden Persistent YouTube IFrame Container to ensure continuous playback regardless of modal state */}
      <div
        className="fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none -z-50 overflow-hidden"
        style={{ visibility: 'hidden' }}
      >
        <div id={containerId} />
      </div>

      <div className="fixed bottom-5 right-5 z-120 flex flex-col items-end gap-2 select-none pointer-events-none">
        {/* Player Main Card */}
        <div
          className={`
            transition-all duration-300 ease-out origin-bottom-right
            ${
              isPlayerOpen
                ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 scale-95 translate-y-3 pointer-events-none'
            }
          `}
        >
        <div className="relative w-80 sm:w-84 rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 bg-[#0d0d0e]/95 backdrop-blur-2xl text-white flex flex-col p-4">
          {/* Subtle Ambient Red Glow Background */}
          {currentTrack.thumbnail && (
            <div
              className="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 pointer-events-none scale-150 transition-opacity duration-700"
              style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
            />
          )}

          {/* Top Bar (Dismiss handle & View Mode Toggle) */}
          <div className="relative z-10 flex items-center justify-between pb-3">
            <button
              onClick={() => setIsPlayerOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              title="Tutup Player"
            >
              <ChevronDown size={18} />
            </button>

            {/* Video vs Cover Pill Switcher */}
            <div className="flex items-center bg-white/10 p-0.5 rounded-full border border-white/5 backdrop-blur-md">
              <button
                onClick={() => setViewMode('thumbnail')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'thumbnail'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon size={12} />
                <span>Cover</span>
              </button>
              <button
                onClick={() => setViewMode('video')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'video'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Tv size={12} />
                <span>Video</span>
              </button>
            </div>

            {/* Queue Toggle Button */}
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                showQueue
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/50'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
              title="Daftar Antrean"
            >
              <ListMusic size={17} />
            </button>
          </div>

          {/* Media Display Screen (Artwork / Embedded Video) */}
          <div className="relative z-10 w-full aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/80 bg-black/60 border border-white/5 group my-1 flex items-center justify-center">
            {/* 1. YouTube Video View */}
            {viewMode === 'video' && currentTrack.videoId && (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${currentTrack.videoId}?autoplay=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                title={currentTrack.title}
                className="w-full h-full border-none pointer-events-auto z-20"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}

            {/* 2. Cover / Artwork View */}
            {viewMode === 'thumbnail' && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                {currentTrack.thumbnail ? (
                  <>
                    <img
                      src={currentTrack.thumbnail}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-600">
                    <Music size={40} strokeWidth={1.5} />
                    <span className="text-xs font-mono">Belum ada lagu</span>
                  </div>
                )}

                {/* Soundwave Animation Badge */}
                {isPlaying && (
                  <div className="absolute bottom-3 right-3 flex items-end gap-0.5 px-2 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                    <span className="w-0.5 bg-red-500 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-2.5" />
                    <span className="w-0.5 bg-red-500 rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-4" />
                    <span className="w-0.5 bg-red-500 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-2" />
                    <span className="w-0.5 bg-red-500 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-3.5" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Queue List Overlay Panel */}
          {showQueue && queue && queue.length > 0 && (
            <div className="relative z-20 my-2 max-h-36 overflow-y-auto no-scrollbar rounded-2xl bg-black/80 border border-white/10 p-1.5 flex flex-col gap-0.5 text-xs backdrop-blur-xl">
              {queue.map((item, idx) => {
                const isCurrent = (item.videoId || item.id) === currentTrack.videoId
                return (
                  <div
                    key={idx}
                    onClick={() => playTrack(item)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-red-600/20 text-red-400 font-medium'
                        : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-[11px] text-zinc-500 font-mono w-4">{idx + 1}</span>
                      <span className="truncate text-xs">{item.title}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-2">
                      {item.timestamp || ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Song Meta (Title & Artist) */}
          <div className="relative z-10 mt-3 mb-2 flex items-center justify-between">
            <div className="flex flex-col min-w-0 pr-2">
              <span
                className="font-semibold text-base text-white truncate tracking-tight"
                title={currentTrack.title}
              >
                {currentTrack.title || 'Tidak ada lagu aktif'}
              </span>
              <span className="text-xs text-zinc-400 truncate mt-0.5" title={currentTrack.artist}>
                {currentTrack.artist || 'Pilih lagu untuk memulai'}
              </span>
            </div>
          </div>

          {/* Progress Scrubber (Apple Music Style) */}
          <div className="relative z-10 flex flex-col gap-1 my-1">
            <div className="relative flex items-center group">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentSeek}
                onMouseDown={() => setIsSeeking(true)}
                onChange={(e) => setSeekValue(Number(e.target.value))}
                onMouseUp={(e) => {
                  setIsSeeking(false)
                  seekTo(Number(e.target.value))
                }}
                className="w-full h-1 bg-white/15 rounded-full appearance-none cursor-pointer accent-red-500 focus:outline-none transition-all group-hover:h-1.5"
                style={{
                  background: `linear-gradient(to right, #ef4444 ${progressRatio}%, rgba(255, 255, 255, 0.15) ${progressRatio}%)`
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>{formatTime(currentSeek)}</span>
              <span>{duration > 0 ? `-${formatTime(remainingTime)}` : '0:00'}</span>
            </div>
          </div>

          {/* Main Playback Controls Cluster */}
          <div className="relative z-10 flex items-center justify-center gap-6 py-2">
            <button
              onClick={prevTrack}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/5 active:scale-90 transition-all cursor-pointer"
              title="Sebelumnya"
            >
              <SkipBack size={22} fill="currentColor" />
            </button>

            <button
              onClick={playPause}
              className="w-13 h-13 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/5 active:scale-90 transition-all cursor-pointer"
              title="Berikutnya"
            >
              <SkipForward size={22} fill="currentColor" />
            </button>
          </div>

          {/* Volume Control Bar */}
          <div className="relative z-10 flex items-center gap-2 px-1 pt-1 pb-0.5">
            <button
              onClick={toggleMute}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume size={14} />}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-1 bg-white/15 rounded-full appearance-none cursor-pointer accent-white focus:outline-none"
              style={{
                background: `linear-gradient(to right, rgba(255, 255, 255, 0.8) ${isMuted ? 0 : volume}%, rgba(255, 255, 255, 0.15) ${isMuted ? 0 : volume}%)`
              }}
            />

            <Volume2 size={14} className="text-zinc-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Floating Mini Action Button */}
      <button
        onClick={togglePlayer}
        className={`
          group relative w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto
          shadow-lg shadow-black/80 border border-white/10
          transition-all duration-200 ease-out cursor-pointer
          hover:scale-105 active:scale-95
          ${
            isPlayerOpen
              ? 'bg-white/15 text-white hover:bg-white/20'
              : 'bg-[#121214] text-white hover:border-red-500/40'
          }
        `}
        title={isPlayerOpen ? 'Tutup' : 'YouTube Music'}
      >
        {isPlaying && !isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-600/30 animate-ping pointer-events-none" />
        )}

        {isPlayerOpen ? (
          <X size={15} strokeWidth={2} />
        ) : (
          <Music size={16} className={isPlaying ? 'text-red-500 animate-pulse' : 'text-zinc-300'} />
        )}
      </button>
    </div>
    </>
  )
}

export default YoutubeMusicPlayer
