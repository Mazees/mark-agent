import React, { useState, useRef, useEffect } from 'react'
import { scrapeGoogle, deepSearch } from '../../api/scraping'

export const WebSearchBubble = ({ query, sendDataWebSearch }) => {
  const [url, setUrl] = useState(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`)
  const [isCaptcha, setIsCaptcha] = useState(false)
  
  const webRef = useRef(null)
  const scrapingActive = useRef(false)
  const initialLoadHandled = useRef(false)
  
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  ]
  const randomUA = useRef(userAgents[Math.floor(Math.random() * userAgents.length)])

  useEffect(() => {
    setUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`)
  }, [query])

  const waitForLoad = (webview) => {
    return new Promise((resolve) => {
      let timeoutId
      const onDone = () => {
        clearTimeout(timeoutId)
        webview.removeEventListener('dom-ready', onDone)
        resolve()
      }
      timeoutId = setTimeout(onDone, 10000) // 10 second timeout for each page load
      webview.addEventListener('dom-ready', onDone)
    })
  }

  const onScrape = async (webview) => {
    if (scrapingActive.current) return
    scrapingActive.current = true
    const source = await scrapeGoogle(webview, url, setIsCaptcha)
    const links = []
    for (const urlItem of source) {
      let link = null
      if (urlItem.title === 'AI Google Summary') {
        link = { source: urlItem.title, url: urlItem.link, text: urlItem.snippet }
      } else {
        setUrl(urlItem.link)
        await waitForLoad(webview)
        link = await deepSearch(webview, urlItem.link)
      }
      links.push(link)
    }
    sendDataWebSearch(source, links)
    scrapingActive.current = false
  }

  useEffect(() => {
    const webview = webRef.current
    if (!webview) return
    const handleInitialLoad = () => {
      if (!initialLoadHandled.current) {
        initialLoadHandled.current = true
        onScrape(webview)
      }
    }
    webview.addEventListener('dom-ready', handleInitialLoad)
    return () => {
      webview.removeEventListener('dom-ready', handleInitialLoad)
    }
  }, [])

  const containerClass = 'bg-success relative p-3 rounded-xl text-base-content border border-base-300 shadow-md min-h-0 transition-all duration-300'

  return (
    <div className="chat chat-start flex flex-col mb-4">
      <div className={containerClass}>
        <div className="aspect-video h-50 rounded-xl overflow-hidden no-scrollbar">
          {!isCaptcha && (
            <div className="flex gap-2 items-center justify-center py-1 text-lg text-white animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2  w-full h-full z-20">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                  d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                />
              </svg>
              <span className="italic">Mark is searching...</span>
            </div>
          )}
          <webview
            src={url}
            ref={webRef}
            style={{ zoom: '0.5' }}
            className={`w-full h-full overflow-hidden no-scrollbar zoom ${isCaptcha ? '' : 'brightness-70 blur-[2px] pointer-events-none'}`}
            useragent={randomUA.current}
          />
        </div>
      </div>
      {isCaptcha && (
        <div className="flex chat-footer pointer-events-none justify-center gap-2 text-sm mt-2 text-yellow-300 animate-pulse">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
              clipRule="evenodd"
            />
          </svg>
          <span>Selesaikan captcha untuk melanjutkan</span>
        </div>
      )}
    </div>
  )
}
