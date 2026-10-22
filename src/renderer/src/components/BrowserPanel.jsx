/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Maximize2, Minimize2 } from 'lucide-react'
import { webApi } from '../api/web-bridge.js'
import { browserCommand, getBrowserState, subscribeBrowserState } from '../api/browser-panel.js'

export default function BrowserPanel({ sessionId, onClose, onResume, expanded, onExpand }) {
  void onResume
  const state = useSyncExternalStore(subscribeBrowserState, () => getBrowserState(sessionId))
  const addressRef = useRef(null),
    lastCursor = useRef(0),
    lastClick = useRef(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [hasReceivedFrame, setHasReceivedFrame] = useState(false)
  const imageRef = useRef(null),
    surfaceRef = useRef(null),
    cursorRef = useRef(null),
    rippleRef = useRef(null),
    cursorPosition = useRef(null),
    keyboardRef = useRef(null),
    frameDimRef = useRef({ width: 1280, height: 720 })
  const commandQueue = useRef(Promise.resolve()),
    pendingMove = useRef(null),
    lastMove = useRef(0),
    subscribed = useRef(false)

  const imageGeometry = () => {
    if (!surfaceRef.current) return null
    const box = surfaceRef.current.getBoundingClientRect()
    const imageWidth = imageRef.current?.naturalWidth || frameDimRef.current.width
    const imageHeight = imageRef.current?.naturalHeight || frameDimRef.current.height
    const scale = Math.min(box.width / imageWidth, box.height / imageHeight)
    const width = imageWidth * scale,
      height = imageHeight * scale
    return { box, width, height, left: (box.width - width) / 2, top: (box.height - height) / 2 }
  }
  const drawCursor = (position) => {
    const geometry = imageGeometry()
    if (!position || !geometry || !cursorRef.current) return
    const browserW = position.width || frameDimRef.current.width
    const browserH = position.height || frameDimRef.current.height
    const x =
      geometry.left + (Math.max(0, Math.min(position.x, browserW - 1)) / browserW) * geometry.width
    const y =
      geometry.top + (Math.max(0, Math.min(position.y, browserH - 1)) / browserH) * geometry.height
    cursorRef.current.style.transform = `translate(${x}px, ${y}px)`
    cursorRef.current.style.opacity = '1'
    return { x, y }
  }

  useEffect(() => {
    if (!state?.open) {
      if (cursorRef.current) cursorRef.current.style.opacity = '0'
      return
    }
    const position = state.cursor || { x: 64, y: 64, sequence: 0 }
    if (!cursorPosition.current || position.sequence >= cursorPosition.current.sequence) {
      cursorPosition.current = { ...position, width: state.width, height: state.height }
    }
    const redraw = () => drawCursor(cursorPosition.current)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(surfaceRef.current)
    return () => observer.disconnect()
  }, [state?.open, state?.cursor?.sequence, state?.width, state?.height])

  useEffect(() => {
    if (!state?.open) return
    let disposed = false
    browserCommand(sessionId, 'resize', { width: 1280, height: 720 }).catch((error) => {
      if (!disposed) setError(error.message)
    })
    return () => {
      disposed = true
    }
  }, [sessionId, state?.open])

  useEffect(() => {
    let disposed = false
    const subscription = async () => {
      const visible = !disposed && document.visibilityState === 'visible'
      subscribed.current = visible
      try {
        await browserCommand(sessionId, visible ? 'subscribe' : 'unsubscribe')
      } catch (e) {
        if (!disposed) setError(e.message)
      }
    }
    const offFrame = webApi.onBrowserPanel('frame', (frame) => {
      if (frame.sessionId === sessionId && subscribed.current && imageRef.current) {
        imageRef.current.src = `data:image/jpeg;base64,${frame.data}`
        setHasReceivedFrame(true)
        if (frame.width && frame.height) {
          frameDimRef.current = { width: frame.width, height: frame.height }
        }
      }
    })
    const offCursor = webApi.onBrowserPanel('cursor', (event) => {
      if (
        event.sessionId !== sessionId ||
        !subscribed.current ||
        event.sequence <= lastCursor.current ||
        !surfaceRef.current
      )
        return
      lastCursor.current = event.sequence
      cursorPosition.current = event
      const { x, y } = drawCursor(event)
      if (event.phase === 'click' && rippleRef.current) {
        const ripple = rippleRef.current
        ripple.style.left = `${x}px`
        ripple.style.top = `${y}px`
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          ripple.animate(
            [
              { opacity: 0.7, transform: 'translate(-50%, -50%) scale(.4)' },
              { opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' }
            ],
            { duration: 250 }
          )
      }
    })
    const offReady = webApi.onBrowserReconnect(subscription)
    document.addEventListener('visibilitychange', subscription)
    subscription()
    return () => {
      disposed = true
      subscribed.current = false
      offFrame()
      offCursor()
      offReady()
      document.removeEventListener('visibilitychange', subscription)
      webApi.browserPanelRequest(sessionId, 'unsubscribe').catch(() => {})
    }
  }, [sessionId])

  useEffect(() => {
    if (!state?.open) {
      setHasReceivedFrame(false)
      if (imageRef.current) {
        imageRef.current.removeAttribute('src')
      }
    }
  }, [state?.open])

  const run = async (action, values) => {
    setBusy(true)
    setError('')
    try {
      await commandQueue.current
      return await browserCommand(sessionId, action, values)
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }
  const input = (event) => {
    if (event.kind === 'move') {
      if (pendingMove.current) {
        pendingMove.current.event = event
        return
      }
      const batch = { event, queuedAt: Date.now() }
      pendingMove.current = batch
      commandQueue.current = commandQueue.current
        .catch(() => {})
        .then(async () => {
          if (pendingMove.current === batch) pendingMove.current = null
          if (Date.now() - batch.queuedAt > 3000) return
          try {
            await webApi.browserPanelRequest(sessionId, 'input', { input: batch.event })
          } catch (e) {
            setError(e.message)
          }
        })
      return
    }
    pendingMove.current = null
    const queuedAt = Date.now()
    commandQueue.current = commandQueue.current
      .catch(() => {})
      .then(async () => {
        if (Date.now() - queuedAt > 3000 && !['up', 'keyUp'].includes(event.kind)) return
        const response = await webApi.browserPanelRequest(sessionId, 'input', { input: event })
        if (response.inputIgnored) setError('Browser sedang sibuk. Coba input kembali.')
        else setError('')
      })
      .catch((e) => setError(e.message))
  }
  const point = (event, clamp = false) => {
    if (!imageRef.current?.naturalWidth) return null
    const geometry = imageGeometry()
    if (!geometry?.width || !geometry.height) return null
    const browserW = frameDimRef.current.width
    const browserH = frameDimRef.current.height
    const x = ((event.clientX - geometry.box.left - geometry.left) / geometry.width) * browserW
    const y = ((event.clientY - geometry.box.top - geometry.top) / geometry.height) * browserH
    if (!clamp && (x < 0 || y < 0 || x >= browserW || y >= browserH)) return null
    return {
      x: Math.max(0, Math.min(browserW - 1, x)),
      y: Math.max(0, Math.min(browserH - 1, y)),
      viewportWidth: browserW,
      viewportHeight: browserH
    }
  }
  const button = (value) => ['left', 'middle', 'right'][value] || 'left'
  return (
    <section
      className="h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col bg-base-300 border-l border-white/10"
      aria-label="Browser"
    >
      {expanded && (
        <button
          type="button"
          onClick={onClose}
          className="px-3 pt-2 text-left text-xs text-white/60 hover:text-white"
        >
          Kembali ke chat
        </button>
      )}
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-white/10">
        <span className="text-xs font-medium text-white/70 mr-auto">Browser</span>
        <button
          type="button"
          onClick={onExpand}
          title={expanded ? 'Perkecil browser' : 'Perluas browser'}
          className="p-1 text-white/50 hover:text-white"
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel browser"
          className="p-1 text-white/50 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center gap-1 p-2 border-b border-white/10">
        {[
          ['back', ArrowLeft, 'Kembali'],
          ['forward', ArrowRight, 'Maju'],
          ['reload', RotateCw, 'Muat ulang']
        ].map(([action, Icon, label]) => (
          <button
            type="button"
            key={action}
            disabled={busy}
            onClick={() => run(action)}
            title={label}
            aria-label={label}
            className="p-1.5 text-white/60 disabled:opacity-25 hover:text-white cursor-pointer"
          >
            <Icon size={15} />
          </button>
        ))}
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (addressRef.current?.value.trim())
              run('navigate', { url: addressRef.current.value.trim() })
          }}
        >
          <input
            aria-label="Alamat browser"
            key={state?.url}
            defaultValue={state?.url === 'about:blank' ? '' : state?.url || ''}
            ref={addressRef}
            disabled={busy}
            placeholder="Ketik URL atau cari dengan Google..."
            className="w-full h-8 px-3 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-primary/40 text-xs text-white/75 disabled:opacity-60"
          />
        </form>
      </div>
      <div className="px-3 py-1.5 min-w-0 shrink-0 flex items-center justify-between text-[11px] border-b border-white/5 text-white/40 font-mono select-none">
        <div className="flex items-center gap-2 min-w-0 truncate">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              state?.active
                ? 'bg-primary animate-pulse'
                : state?.open
                  ? 'bg-emerald-400/80'
                  : 'bg-white/20'
            }`}
          />
          <span className="truncate text-white/60">
            {state?.loading
              ? 'Memuat halaman...'
              : state?.active
                ? 'Mark sedang berinteraksi...'
                : state?.title || 'Google'}
          </span>
        </div>
      </div>
      {error && (
        <div role="alert" className="px-3 py-2 text-xs text-error">
          {error}
        </div>
      )}
      {state?.notice && <div className="px-3 py-2 text-xs text-white/50">{state.notice}</div>}
      <div
        ref={surfaceRef}
        className="relative flex-1 min-h-0 overflow-hidden bg-black/40 cursor-default select-none"
        onPointerDown={(e) => {
          if (!point(e)) return
          e.preventDefault()
          keyboardRef.current?.focus()
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = point(e),
            previous = lastClick.current
          const clickCount =
            previous &&
            Date.now() - previous.time < 450 &&
            Math.hypot(p.x - previous.x, p.y - previous.y) < 5
              ? 2
              : 1
          lastClick.current = { ...p, count: clickCount, time: Date.now() }
          input({ kind: 'down', ...p, button: button(e.button), clickCount })
        }}
        onPointerMove={(e) => {
          if (point(e) && Date.now() - lastMove.current > 40) {
            lastMove.current = Date.now()
            input({ kind: 'move', ...point(e) })
          }
        }}
        onPointerUp={(e) => {
          const p = point(e, true)
          if (p)
            input({
              kind: 'up',
              ...p,
              button: button(e.button),
              clickCount: lastClick.current?.count || 1
            })
          else input({ kind: 'up', x: 0, y: 0, button: button(e.button) })
        }}
        onPointerCancel={(e) => input({ kind: 'up', ...point(e, true), button: 'left' })}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          if (point(e)) input({ kind: 'wheel', ...point(e), deltaX: e.deltaX, deltaY: e.deltaY })
        }}
      >
        <img
          ref={imageRef}
          role="presentation"
          alt=""
          draggable={false}
          onLoad={() => drawCursor(cursorPosition.current)}
          style={{ visibility: state?.open && hasReceivedFrame ? 'visible' : 'hidden' }}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none transition-opacity duration-150"
        />
        {(!state?.open || !hasReceivedFrame) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center text-xs text-white/40 select-none">
            <div className="w-5 h-5 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
            <span className="font-mono text-[11px] tracking-wide">
              {!state?.open ? 'Memulai browser Chromium...' : 'Menghubungkan visual stream...'}
            </span>
          </div>
        )}
        <div
          ref={cursorRef}
          className="absolute top-0 left-0 pointer-events-none opacity-0 transition-transform duration-[180ms] motion-reduce:transition-none"
        >
          <svg
            width="24"
            height="28"
            viewBox="0 0 24 28"
            className="drop-shadow-[0_0_5px_rgba(34,197,94,.6)]"
          >
            <path
              d="M2 2L20 13L12 15L8 23Z"
              fill="#111"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          ref={rippleRef}
          className="absolute pointer-events-none opacity-0 w-7 h-7 rounded-full border-2 border-primary"
        />
        <textarea
          ref={keyboardRef}
          aria-label="Keyboard browser"
          className="absolute opacity-0 w-px h-px pointer-events-none"
          onPaste={(e) => {
            e.preventDefault()
            input({ kind: 'text', text: e.clipboardData.getData('text/plain') })
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return
            e.preventDefault()
            if (e.nativeEvent.isComposing) return
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
              input({ kind: 'text', text: e.key })
            else input({ kind: 'keyDown', key: e.key })
          }}
          onKeyUp={(e) => {
            if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
              e.preventDefault()
              input({ kind: 'keyUp', key: e.key })
            }
          }}
          onCompositionEnd={(e) => {
            if (e.data) input({ kind: 'text', text: e.data })
          }}
          onChange={(e) => {
            e.currentTarget.value = ''
          }}
        />
      </div>
    </section>
  )
}
