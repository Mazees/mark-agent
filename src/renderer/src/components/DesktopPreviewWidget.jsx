import React, { useState, useEffect } from 'react'
import { Monitor, X, Minimize2, MousePointer, ShieldAlert, Maximize2 } from 'lucide-react'

// Module-level singleton state untuk Desktop Preview agar tahan terhadap unmount/remount di React
let globalState = {
  isVisible: false,
  isMinimized: false,
  isExpanded: false,
  currentImage: null,
  resolution: '1280x720',
  lastAction: null,
  clickMarkers: [],
  cursorPos: null,
  lastUpdated: 0
}

const listeners = new Set()
let autoHideTimer = null
let isIpcInitialized = false

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener({ ...globalState })
    } catch (e) {
      console.error('[DesktopPreviewWidget] Listener error:', e)
    }
  })
}

export function setDesktopPreviewState(updater) {
  if (typeof updater === 'function') {
    globalState = updater(globalState)
  } else {
    globalState = { ...globalState, ...updater }
  }
  notifyListeners()
}

export function getDesktopPreviewState() {
  return globalState
}

function initIpcListeners() {
  if (isIpcInitialized || typeof window === 'undefined') return
  isIpcInitialized = true

  // Listener preview tangkapan layar desktop OS
  if (window.api?.onComputerPreview) {
    window.api.onComputerPreview((data) => {
      if (!data?.image) return

      if (autoHideTimer) clearTimeout(autoHideTimer)
      autoHideTimer = setTimeout(() => {
        globalState = { ...globalState, isVisible: false }
        notifyListeners()
      }, 60000)

      globalState = {
        ...globalState,
        currentImage: data.image,
        resolution:
          data.width && data.height ? `${data.width}x${data.height}` : globalState.resolution,
        cursorPos:
          Array.isArray(data.cursor) && data.cursor.length >= 2
            ? data.cursor
            : globalState.cursorPos,
        isVisible: true,
        lastUpdated: Date.now()
      }
      notifyListeners()
    })
  }

  // Listener marker klik visual
  if (window.api?.onComputerClick) {
    window.api.onComputerClick((data) => {
      if (data?.x === undefined || data?.y === undefined) return
      const markerId = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
      const newMarker = {
        id: markerId,
        x: data.x,
        y: data.y,
        button: data.button || 'left',
        burst: Boolean(data.burst)
      }

      globalState = {
        ...globalState,
        clickMarkers: [...globalState.clickMarkers.slice(-4), newMarker],
        lastAction: `Click (${data.x}, ${data.y})`,
        lastUpdated: Date.now()
      }
      notifyListeners()

      setTimeout(() => {
        globalState = {
          ...globalState,
          clickMarkers: globalState.clickMarkers.filter((m) => m.id !== markerId)
        }
        notifyListeners()
      }, 1200)
    })
  }
}

export const DesktopPreviewWidget = ({ forceShow = false }) => {
  const [state, setState] = useState(() => {
    initIpcListeners()
    return getDesktopPreviewState()
  })

  useEffect(() => {
    initIpcListeners()
    const listener = (newState) => setState(newState)
    listeners.add(listener)
    // Sinkronisasi instan saat mount agar tidak blank
    setState(getDesktopPreviewState())
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const {
    isVisible,
    isMinimized,
    isExpanded,
    currentImage,
    resolution,
    lastAction,
    clickMarkers,
    cursorPos
  } = state

  const handleMinimize = (minimized) => {
    setDesktopPreviewState({ isMinimized: minimized })
  }

  const handleExpand = () => {
    setDesktopPreviewState((prev) => ({ isExpanded: !prev.isExpanded }))
  }

  const handleClose = () => {
    if (autoHideTimer) clearTimeout(autoHideTimer)
    setDesktopPreviewState({ isVisible: false })
  }

  if ((!isVisible && !forceShow) || !currentImage) return null

  // Tampilan minimized (compact inline pill)
  if (isMinimized) {
    return (
      <div className="my-2 select-none animate-fade-in">
        <button
          type="button"
          onClick={() => handleMinimize(false)}
          className="btn btn-xs btn-outline btn-primary flex items-center gap-2 border-primary/40 bg-base-950/70 hover:bg-primary/20 backdrop-blur-md rounded-lg shadow-sm"
          title="Tampilkan Viewport Computer Use"
        >
          <Monitor className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-[11px] font-mono">
            Tampilkan Viewport Computer Use ({resolution})
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`my-2.5 w-full ${
        isExpanded ? 'max-w-2xl' : 'max-w-lg'
      } bg-base-950/90 backdrop-blur-xl border border-primary/30 rounded-xl shadow-xl overflow-hidden flex flex-col animate-fade-in select-none transition-all duration-200`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-900/90 border-b border-white/10 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
          <span className="text-[11px] font-bold font-mono tracking-wider text-primary truncate">
            COMPUTER USE VIEWPORT
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 font-mono text-base-content/70 shrink-0">
            {resolution}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExpand}
            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
            title={isExpanded ? 'Perkecil Ukuran' : 'Perbesar Ukuran'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleMinimize(true)}
            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
            title="Minimize Viewport"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-error"
            title="Tutup Viewport"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Monitor Display Screen */}
      <div className="relative aspect-video w-full bg-black/95 overflow-hidden flex items-center justify-center">
        <img
          src={currentImage}
          alt="Desktop Screen Capture"
          className="w-full h-full object-contain pointer-events-none select-none"
        />

        {/* Click Marker Ripples */}
        {clickMarkers.map((marker) => {
          const leftPct = (marker.x / 1280) * 100
          const topPct = (marker.y / 720) * 100
          return (
            <div
              key={marker.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 animate-ping ${
                  marker.burst
                    ? 'border-warning bg-warning/30'
                    : marker.button === 'right'
                      ? 'border-secondary bg-secondary/30'
                      : 'border-primary bg-primary/30'
                }`}
              />
              <div className="w-2 h-2 rounded-full bg-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-sm" />
            </div>
          )
        })}

        {/* Live Host Cursor Position */}
        {cursorPos && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-75 z-10"
            style={{
              left: `${Math.max(0, Math.min(100, (cursorPos[0] / 1280) * 100))}%`,
              top: `${Math.max(0, Math.min(100, (cursorPos[1] / 720) * 100))}%`
            }}
          >
            <div className="w-5 h-5 rounded-full border-2 border-red-500 bg-red-500/20 shadow-lg flex items-center justify-center animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            </div>
          </div>
        )}

        {/* Watermark Overlay Status */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono text-white/90 border border-white/10 flex items-center gap-1.5 shadow-md">
          <MousePointer className="w-3 h-3 text-primary animate-pulse" />
          <span>
            {lastAction ||
              (cursorPos ? `Cursor [${cursorPos[0]}, ${cursorPos[1]}]` : 'Observing Viewport')}
          </span>
        </div>

        {/* Canonical Canvas Indicator */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/50">
          1280x720 VLA
        </div>
      </div>

      {/* Footer Info & Emergency Kill-Switch Reminder */}
      <div className="px-3 py-1 bg-base-950/70 flex items-center justify-between text-[10px] text-base-content/50 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3 text-warning" />
          <span>
            Kill-Switch: <kbd className="kbd kbd-xs font-mono">Ctrl+Shift+S</kbd>
          </span>
        </div>
        <span className="font-mono text-emerald-400 text-[10px]">Live OS Stream</span>
      </div>
    </div>
  )
}

export default DesktopPreviewWidget
