import { useState, useContext, createContext, useCallback, useRef } from 'react'

const YoutubeMusicContext = createContext()

// Ekstraksi YouTube Video ID dari URL atau ID mentah
export function extractYouTubeVideoId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return ''
  const trimmed = urlOrId.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

  const vMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (vMatch) return vMatch[1]

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]

  const embedMatch = trimmed.match(/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) return embedMatch[1]

  return trimmed
}

export const YoutubeMusicProvider = ({ children }) => {
  const [videoId, setVideoId] = useState('')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)

  const [currentTrack, setCurrentTrack] = useState({
    title: '',
    artist: '',
    thumbnail: '',
    id: ''
  })

  const iframeRef = useRef(null)

  const sendIframeCommand = useCallback((func, args = []) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        )
      } catch (e) {
        console.warn('[YouTubePlayer] Failed to postMessage to iframe:', e)
      }
    }
  }, [])

  const playUrl = useCallback((urlOrId, initialTrack = null) => {
    const extractedId = extractYouTubeVideoId(urlOrId)
    if (!extractedId) return

    setVideoId(extractedId)
    setPlayId((prev) => prev + 1)
    setIsPlayerOpen(true)
    setIsPlaying(true)

    if (initialTrack) {
      setCurrentTrack({
        ...initialTrack,
        id: extractedId,
        videoId: extractedId
      })
    } else {
      setCurrentTrack((prev) => ({
        ...prev,
        id: extractedId,
        videoId: extractedId,
        title: prev.title || 'YouTube Music'
      }))
    }
  }, [])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen((prev) => !prev)
  }, [])

  const playPause = useCallback(() => {
    if (isPlaying) {
      sendIframeCommand('pauseVideo')
      setIsPlaying(false)
    } else {
      sendIframeCommand('playVideo')
      setIsPlaying(true)
    }
  }, [isPlaying, sendIframeCommand])

  const pauseTrack = useCallback(() => {
    sendIframeCommand('pauseVideo')
    setIsPlaying(false)
  }, [sendIframeCommand])

  const resumeTrack = useCallback(() => {
    sendIframeCommand('playVideo')
    setIsPlaying(true)
  }, [sendIframeCommand])

  const nextTrack = useCallback(() => {
    sendIframeCommand('nextVideo')
  }, [sendIframeCommand])

  const prevTrack = useCallback(() => {
    sendIframeCommand('previousVideo')
  }, [sendIframeCommand])

  const seekTo = useCallback(
    (seconds) => {
      sendIframeCommand('seekTo', [seconds, true])
    },
    [sendIframeCommand]
  )

  const setVolume = useCallback(
    (volumePercent) => {
      sendIframeCommand('setVolume', [volumePercent])
    },
    [sendIframeCommand]
  )

  const mute = useCallback(() => {
    sendIframeCommand('mute')
  }, [sendIframeCommand])

  const unMute = useCallback(() => {
    sendIframeCommand('unMute')
  }, [sendIframeCommand])

  const value = {
    videoId,
    setVideoId,
    iframeRef,
    playUrl,
    playId,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    isPlaying,
    setIsPlaying,
    currentTrack,
    setCurrentTrack,
    nextTrack,
    prevTrack,
    playPause,
    pauseTrack,
    resumeTrack,
    seekTo,
    setVolume,
    mute,
    unMute,
    sendIframeCommand
  }

  return <YoutubeMusicContext.Provider value={value}>{children}</YoutubeMusicContext.Provider>
}

export const useYoutubeMusic = () => {
  return useContext(YoutubeMusicContext)
}