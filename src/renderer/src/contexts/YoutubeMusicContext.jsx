import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

const DEFAULT_URL = 'https://music.youtube.com'

export const YoutubeMusicProvider = ({ children }) => {
  const [musicUrl, setMusicUrl] = useState(DEFAULT_URL)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const webviewRef = useRef(null)

  // Poll webview every 1s to detect if music is playing
  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     const webview = webviewRef.current
  //     if (!webview) {
  //       setIsPlaying(false)
  //       return
  //     }
  //     try {
  //       const paused = await webview.executeJavaScript(
  //         `(function(){ const v = document.querySelector('video'); return v ? v.paused : true; })()`
  //       )
  //       setIsPlaying(!paused)
  //     } catch {
  //       setIsPlaying(false)
  //     }
  //   }, 1000)
  //   return () => clearInterval(interval)
  // }, [])

  const playUrl = useCallback((url) => {
    setMusicUrl(url)
    setIsPlayerOpen(true)
  }, [])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen((prev) => !prev)
  }, [])

  const nextTrack = useCallback(() => {
    webviewRef.current?.executeJavaScript(`document.querySelector('.next-button')?.click();`)
  }, [])

  const prevTrack = useCallback(() => {
    webviewRef.current?.executeJavaScript(`document.querySelector('.previous-button')?.click();`)
  }, [])

  const playPause = useCallback(() => {
    webviewRef.current?.executeJavaScript(`document.querySelector('.play-pause-button')?.click();`)
  }, [])

  const value = {
    musicUrl,
    setMusicUrl,
    playUrl,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    webviewRef,
    isPlaying,
    nextTrack,
    prevTrack,
    playPause
  }

  return <YoutubeMusicContext.Provider value={value}>{children}</YoutubeMusicContext.Provider>
}

export const useYoutubeMusic = () => {
  return useContext(YoutubeMusicContext)
}
