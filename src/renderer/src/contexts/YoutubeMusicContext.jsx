import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

const DEFAULT_URL = 'https://music.youtube.com'

export const YoutubeMusicProvider = ({ children }) => {
  const [musicUrl, setMusicUrl] = useState(DEFAULT_URL)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const webviewRef = useRef(null)

  const [currentTrack, setCurrentTrack] = useState({ title: '', artist: '' })

  // Poll webview every 1s to detect if music is playing and get track info
  useEffect(() => {
    const interval = setInterval(async () => {
      const webview = webviewRef.current
      if (!webview) {
        setIsPlaying(false)
        return
      }
      try {
        const info = await webview.executeJavaScript(
          `(function(){ 
            const titleEl = document.querySelector('yt-formatted-string.title.ytmusic-player-bar, .title.ytmusic-player-bar');
            const subtitleEl = document.querySelector('span.subtitle.ytmusic-player-bar, .byline.ytmusic-player-bar');
            const imgEl = document.querySelector('img.image.ytmusic-player-bar, .thumbnail.ytmusic-player img');
            const video = document.querySelector('video');
            return {
              title: titleEl ? (titleEl.getAttribute('title') || titleEl.innerText || titleEl.textContent || '').trim() : '',
              artist: subtitleEl ? (subtitleEl.getAttribute('title') || subtitleEl.innerText || subtitleEl.textContent || '').trim() : '',
              thumbnail: imgEl ? imgEl.src.replace(/=w\\d+-h\\d+.*$/, '=w1080-h1080-l90-rj').replace(/\\?sqp=.*$/, '') : '',
              paused: video ? video.paused : true
            };
          })()`
        )
        setIsPlaying(!info.paused)
        if (info.title) {
          setCurrentTrack(prev => ({ 
            title: info.title, 
            artist: info.artist, 
            thumbnail: info.thumbnail || prev.thumbnail 
          }))
        }
      } catch {
        setIsPlaying(false)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const playUrl = useCallback((url, initialTrack = null) => {
    setMusicUrl(url)
    setPlayId(prev => prev + 1)
    setIsPlayerOpen(true)
    if (initialTrack) {
      setCurrentTrack(initialTrack)
    }
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
    playId,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    webviewRef,
    isPlaying,
    currentTrack,
    nextTrack,
    prevTrack,
    playPause
  }

  return <YoutubeMusicContext.Provider value={value}>{children}</YoutubeMusicContext.Provider>
}

export const useYoutubeMusic = () => {
  return useContext(YoutubeMusicContext)
}