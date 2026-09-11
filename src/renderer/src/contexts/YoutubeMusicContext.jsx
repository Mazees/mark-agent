import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

/**
 * Load YouTube IFrame Player API Script dynamically
 */
let ytIframeScriptLoading = false
let ytIframeReadyCallbacks = []

function loadYouTubeIframeApi(callback) {
  if (window.YT && window.YT.Player) {
    callback()
    return
  }

  ytIframeReadyCallbacks.push(callback)

  if (!ytIframeScriptLoading) {
    ytIframeScriptLoading = true
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)

    window.onYouTubeIframeAPIReady = () => {
      ytIframeReadyCallbacks.forEach((cb) => cb())
      ytIframeReadyCallbacks = []
    }
  }
}

export const YoutubeMusicProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState({
    id: '',
    videoId: '',
    title: 'Tidak Ada Lagu',
    artist: 'Pilih lagu untuk memutar',
    thumbnail: '',
    duration: 0
  })

  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [viewMode, setViewMode] = useState('thumbnail') // 'thumbnail' | 'video'
  const [isReady, setIsReady] = useState(false)

  const playerRef = useRef(null)
  const containerIdRef = useRef('mark-yt-iframe-player')
  const timeUpdateTimerRef = useRef(null)

  // Inisialisasi YouTube Player
  useEffect(() => {
    loadYouTubeIframeApi(() => {
      if (playerRef.current) return

      try {
        playerRef.current = new window.YT.Player(containerIdRef.current, {
          height: '100%',
          width: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            disablekb: 0,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              setIsReady(true)
              event.target.setVolume(80)
            },
            onStateChange: (event) => {
              // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true)
                const dur = playerRef.current?.getDuration() || 0
                if (dur > 0) setDuration(dur)
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false)
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false)
                // Otomatis next track jika ada di queue
                nextTrack()
              }
            },
            onError: (e) => {
              console.warn('[YT Player] Error:', e.data)
              // Error 150/101 sering terjadi jika embedding ditolak, coba lagu berikutnya
              if (e.data === 150 || e.data === 101) {
                nextTrack()
              }
            }
          }
        })
      } catch (err) {
        console.error('[YT Player] Failed to create player instance:', err)
      }
    })

    return () => {
      if (timeUpdateTimerRef.current) clearInterval(timeUpdateTimerRef.current)
    }
  }, [])

  // Timer pemantau progress durasi
  useEffect(() => {
    if (isPlaying) {
      timeUpdateTimerRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const curr = playerRef.current.getCurrentTime() || 0
          const dur = playerRef.current.getDuration() || 0
          setCurrentTime(curr)
          if (dur > 0 && dur !== duration) setDuration(dur)
        }
      }, 500)
    } else {
      if (timeUpdateTimerRef.current) clearInterval(timeUpdateTimerRef.current)
    }
    return () => {
      if (timeUpdateTimerRef.current) clearInterval(timeUpdateTimerRef.current)
    }
  }, [isPlaying, duration])

  // Memutar Track tertentu
  const playTrack = useCallback((track, newQueue = null) => {
    if (!track) return

    const videoId = track.videoId || track.id || (track.url ? track.url.split('v=')[1]?.split('&')[0] : '')
    if (!videoId) return

    const formattedTrack = {
      id: videoId,
      videoId: videoId,
      title: track.title || 'YouTube Track',
      artist: track.artist || track.author || 'YouTube Artist',
      thumbnail: track.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: track.seconds || 0
    }

    setCurrentTrack(formattedTrack)
    setIsPlayerOpen(true)
    setCurrentTime(0)

    if (newQueue && Array.isArray(newQueue) && newQueue.length > 0) {
      setQueue(newQueue)
      const foundIndex = newQueue.findIndex(
        (item) => (item.videoId || item.id) === videoId
      )
      setCurrentIndex(foundIndex >= 0 ? foundIndex : 0)
    }

    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      playerRef.current.loadVideoById({
        videoId: videoId,
        startSeconds: 0
      })
      playerRef.current.playVideo()
      setIsPlaying(true)
    }
  }, [])

  // Kompatibilitas untuk pemanggilan via URL
  const playUrl = useCallback(
    (url, initialTrack = null) => {
      let videoId = ''
      if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0]
      } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0]
      }

      if (videoId) {
        playTrack(initialTrack || { videoId, title: 'YouTube Track', artist: 'YouTube' })
      }
    },
    [playTrack]
  )

  const playPause = useCallback(() => {
    if (!playerRef.current) return
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo()
        setIsPlaying(false)
      } else {
        playerRef.current.playVideo()
        setIsPlaying(true)
      }
    } catch (_) {}
  }, [isPlaying])

  const nextTrack = useCallback(() => {
    setQueue((currQueue) => {
      if (!currQueue || currQueue.length === 0) return currQueue
      setCurrentIndex((currIndex) => {
        const nextIdx = currIndex + 1 < currQueue.length ? currIndex + 1 : 0
        const nextItem = currQueue[nextIdx]
        if (nextItem) {
          const videoId = nextItem.videoId || nextItem.id
          if (videoId) {
            setCurrentTrack({
              id: videoId,
              videoId: videoId,
              title: nextItem.title || 'YouTube Track',
              artist: nextItem.artist || nextItem.author || 'YouTube Artist',
              thumbnail: nextItem.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              duration: nextItem.seconds || 0
            })
            if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
              playerRef.current.loadVideoById({ videoId, startSeconds: 0 })
              playerRef.current.playVideo()
              setIsPlaying(true)
            }
          }
        }
        return nextIdx
      })
      return currQueue
    })
  }, [])

  const prevTrack = useCallback(() => {
    setQueue((currQueue) => {
      if (!currQueue || currQueue.length === 0) return currQueue
      setCurrentIndex((currIndex) => {
        const prevIdx = currIndex - 1 >= 0 ? currIndex - 1 : currQueue.length - 1
        const prevItem = currQueue[prevIdx]
        if (prevItem) {
          const videoId = prevItem.videoId || prevItem.id
          if (videoId) {
            setCurrentTrack({
              id: videoId,
              videoId: videoId,
              title: prevItem.title || 'YouTube Track',
              artist: prevItem.artist || prevItem.author || 'YouTube Artist',
              thumbnail: prevItem.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              duration: prevItem.seconds || 0
            })
            if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
              playerRef.current.loadVideoById({ videoId, startSeconds: 0 })
              playerRef.current.playVideo()
              setIsPlaying(true)
            }
          }
        }
        return prevIdx
      })
      return currQueue
    })
  }, [])

  const seekTo = useCallback((seconds) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, true)
      setCurrentTime(seconds)
    }
  }, [])

  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume)
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(newVolume)
      if (newVolume > 0 && isMuted) {
        playerRef.current.unMute()
        setIsMuted(false)
      }
    }
  }, [isMuted])

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return
    if (isMuted) {
      playerRef.current.unMute()
      setIsMuted(false)
    } else {
      playerRef.current.mute()
      setIsMuted(true)
    }
  }, [isMuted])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen((prev) => !prev)
  }, [])

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'thumbnail' ? 'video' : 'thumbnail'))
  }, [])

  const value = {
    currentTrack,
    queue,
    currentIndex,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    viewMode,
    isPlayerOpen,
    isReady,
    containerId: containerIdRef.current,
    setIsPlayerOpen,
    togglePlayer,
    setViewMode,
    toggleViewMode,
    playTrack,
    playUrl,
    playPause,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume: handleVolumeChange,
    toggleMute
  }

  return <YoutubeMusicContext.Provider value={value}>{children}</YoutubeMusicContext.Provider>
}

export const useYoutubeMusic = () => {
  return useContext(YoutubeMusicContext)
}
