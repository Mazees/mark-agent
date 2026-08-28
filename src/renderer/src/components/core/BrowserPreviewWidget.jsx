import React, { useState, useEffect } from 'react'
import DraggableHoloCard from './DraggableHoloCard'

const BrowserPreviewWidget = () => {
  // Map of sessionId -> previewData
  const [previews, setPreviews] = useState({})

  useEffect(() => {
    if (window.api?.onBrowserPreview) {
      window.api.onBrowserPreview((data) => {
        if (!data) {
          setPreviews({})
          return
        }

        const sid = data.sessionId || 'default'

        if (data.closed) {
          setPreviews((prev) => {
            const next = { ...prev }
            delete next[sid]
            return next
          })
          return
        }

        setPreviews((prev) => ({
          ...prev,
          [sid]: { ...data, sessionId: sid }
        }))
      })
    }
  }, [])

  const previewList = Object.values(previews)
  if (previewList.length === 0) return null

  const handleCloseBrowser = (sessionId) => {
    if (window.api?.browserClose) {
      window.api.browserClose(sessionId)
    }
    setPreviews((prev) => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
  }

  const handleOpenBrowser = (sessionId) => {
    if (window.api?.showBrowserWindow) {
      window.api.showBrowserWindow(sessionId)
    }
  }

  const handleHideBrowser = (sessionId) => {
    if (window.api?.hideBrowserWindow) {
      window.api.hideBrowserWindow(sessionId)
    }
  }

  return (
    <>
      {previewList.map((browserPreview, index) => {
        const sid = browserPreview.sessionId || 'default'
        const titleLabel =
          sid === 'default'
            ? 'MARK BROWSER (Lead)'
            : `MARK BROWSER (${sid.length > 12 ? sid.slice(0, 10) + '...' : sid})`

        const defaultPos = {
          x: Math.max(20, window.innerWidth - 340 - index * 30),
          y: Math.max(60, window.innerHeight - 350 - index * 40)
        }

        return (
          <DraggableHoloCard
            key={sid}
            title={titleLabel}
            id={`browser-preview-${sid}`}
            isVisible={true}
            onClose={() => {
              setPreviews((prev) => {
                const next = { ...prev }
                delete next[sid]
                return next
              })
            }}
            defaultPosition={defaultPos}
          >
            <div className="flex flex-col gap-3 w-64 select-none font-['Poppins',sans-serif]">
              <div
                className="text-xs font-medium text-info truncate px-1.5 bg-black/30 rounded-lg py-1 text-center border border-white/5 font-mono text-[11px]"
                title={browserPreview.title || browserPreview.url}
              >
                {browserPreview.title || browserPreview.url}
              </div>
              <div className="w-full h-32 rounded-xl overflow-hidden border border-white/10 relative group shadow-inner">
                {/* HUD Brackets */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/40 pointer-events-none z-10" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary/40 pointer-events-none z-10" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary/40 pointer-events-none z-10" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/40 pointer-events-none z-10" />

                <img
                  src={browserPreview.thumbnail}
                  alt={`Browser Preview ${sid}`}
                  className="w-full h-full object-cover blur-[1.5px] group-hover:blur-none transition-all duration-300"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-300 pointer-events-none" />
              </div>
              <div className="flex gap-2">
                {browserPreview.isForeground ? (
                  <button
                    onClick={() => handleHideBrowser(sid)}
                    className="btn btn-outline btn-warning btn-xs flex-1 gap-1.5 rounded-lg shadow-[0_0_15px_oklch(var(--wa)/0.2)] font-medium h-7"
                    title="Sembunyikan jendela browser ke latar belakang"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                    Sembunyikan
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenBrowser(sid)}
                    className="btn btn-outline btn-success btn-xs flex-1 gap-1.5 rounded-lg shadow-[0_0_15px_oklch(var(--su)/0.2)] font-medium h-7"
                    title="Tampilkan jendela browser ke layar"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Buka Jendela
                  </button>
                )}

                <button
                  onClick={() => handleCloseBrowser(sid)}
                  className="btn btn-outline btn-error btn-xs flex-none px-2 rounded-lg shadow-[0_0_15px_oklch(var(--er)/0.2)] h-7"
                  title="Tutup Sesi Browser Ini"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                  </svg>
                </button>
              </div>
            </div>
          </DraggableHoloCard>
        )
      })}
    </>
  )
}

export default BrowserPreviewWidget
