/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Maximize2, Minimize2 } from 'lucide-react'
import { webApi } from '../api/web-bridge.js'
import { browserCommand, getBrowserState, subscribeBrowserState } from '../api/browser-panel.js'

export default function BrowserPanel({ sessionId, onClose, onResume, expanded, onExpand }) {
  const state = useSyncExternalStore(subscribeBrowserState, () => getBrowserState(sessionId))
  const addressRef = useRef(null),
    lastCursor = useRef(0),
    lastClick = useRef(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const imageRef = useRef(null),
    surfaceRef = useRef(null),
    cursorRef = useRef(null),
    rippleRef = useRef(null),
    keyboardRef = useRef(null)
  const commandQueue = useRef(Promise.resolve()),
    lastMove = useRef(0),
    cursorTimer = useRef(null),
    subscribed = useRef(false)
  const manual = state?.mode === 'manual' && state?.ownedByYou
  const manualRef = useRef(manual)
  manualRef.current = manual

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
      if (frame.sessionId === sessionId && subscribed.current && imageRef.current)
        imageRef.current.src = `data:image/jpeg;base64,${frame.data}`
    })
    const offCursor = webApi.onBrowserPanel('cursor', (event) => {
      if (
        event.sessionId !== sessionId ||
        !subscribed.current ||
        getBrowserState(sessionId)?.mode !== 'agent' ||
        event.revision !== getBrowserState(sessionId)?.revision ||
        event.sequence <= lastCursor.current ||
        !surfaceRef.current
      )
        return
      lastCursor.current = event.sequence
      const box = surfaceRef.current.getBoundingClientRect(),
        scale = Math.min(box.width / 1280, box.height / 720)
      const x = (box.width - 1280 * scale) / 2 + event.x * scale,
        y = (box.height - 720 * scale) / 2 + event.y * scale
      const cursor = cursorRef.current
      cursor.style.opacity = '1'
      cursor.style.transform = `translate(${x}px, ${y}px)`
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
      clearTimeout(cursorTimer.current)
      cursorTimer.current = setTimeout(() => {
        if (cursorRef.current) cursorRef.current.style.opacity = '0'
      }, 1800)
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
      clearTimeout(cursorTimer.current)
      document.removeEventListener('visibilitychange', subscription)
      webApi.browserPanelRequest(sessionId, 'unsubscribe').catch(() => {})
    }
  }, [sessionId])

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
    if (!manualRef.current) return
    commandQueue.current = commandQueue.current
      .catch(() => {})
      .then(() => {
        if (!manualRef.current) return
        return webApi.browserPanelRequest(sessionId, 'input', { input: event })
      })
      .catch((e) => setError(e.message))
  }
  const point = (event) => {
    const r = surfaceRef.current.getBoundingClientRect(),
      scale = Math.min(r.width / 1280, r.height / 720)
    const x = (event.clientX - r.left - (r.width - 1280 * scale) / 2) / scale
    const y = (event.clientY - r.top - (r.height - 720 * scale) / 2) / scale
    return x < 0 || y < 0 || x > 1280 || y > 720 ? null : { x, y }
  }
  const button = (value) => ['left', 'middle', 'right'][value] || 'left'
  return (
    <section
      className="h-full min-w-0 flex flex-col bg-base-300 border-l border-white/10"
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
            disabled={!manual || busy}
            onClick={() => run(action)}
            title={label}
            aria-label={label}
            className="p-1.5 text-white/60 disabled:opacity-25 hover:text-white"
          >
            <Icon size={15} />
          </button>
        ))}
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual && addressRef.current?.value.trim())
              run('navigate', { url: addressRef.current.value })
          }}
        >
          <input
            aria-label="Alamat browser"
            key={state?.url}
            defaultValue={state?.url === 'about:blank' ? '' : state?.url || ''}
            ref={addressRef}
            disabled={!manual || busy}
            placeholder="https://..."
            className="w-full h-8 px-3 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-primary/40 text-xs text-white/75 disabled:opacity-60"
          />
        </form>
      </div>
      <div className="px-3 py-2 flex items-center gap-3 text-[11px] border-b border-white/5 text-white/45">
        <span className="flex-1">
          {state?.mode === 'taking-over'
            ? 'Menunggu aksi Mark selesai...'
            : manual
              ? 'Kontrol Anda · balas chat untuk melanjutkan'
              : state?.mode === 'manual'
                ? 'Menunggu pengguna'
                : state?.loading
                  ? 'Memuat halaman...'
                  : state?.open
                    ? 'Dikendalikan Mark'
                    : 'Browser belum dibuka'}
        </span>
        {manual ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await run('resume')) onResume?.()
            }}
            className="text-primary disabled:opacity-30"
          >
            Kembalikan ke Mark
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || state?.mode === 'taking-over'}
            onClick={() => run('takeover')}
            className="text-primary disabled:opacity-30"
          >
            Ambil alih
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="px-3 py-2 text-xs text-error">
          {error}
        </div>
      )}
      {state?.notice && <div className="px-3 py-2 text-xs text-white/50">{state.notice}</div>}
      <div
        ref={surfaceRef}
        className={`relative flex-1 min-h-0 overflow-hidden bg-black/30 ${manual ? 'cursor-default' : 'cursor-not-allowed'}`}
        onPointerDown={(e) => {
          if (!manual || !point(e)) return
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
          if (manual && point(e) && Date.now() - lastMove.current > 40) {
            lastMove.current = Date.now()
            input({ kind: 'move', ...point(e) })
          }
        }}
        onPointerUp={(e) => {
          const p = point(e)
          if (p)
            input({
              kind: 'up',
              ...p,
              button: button(e.button),
              clickCount: lastClick.current?.count || 1
            })
          else input({ kind: 'up', x: 0, y: 0, button: button(e.button) })
        }}
        onPointerCancel={(e) => input({ kind: 'up', ...point(e), button: 'left' })}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          if (manual && point(e))
            input({ kind: 'wheel', ...point(e), deltaX: e.deltaX, deltaY: e.deltaY })
        }}
      >
        <img
          ref={imageRef}
          alt="Tampilan halaman browser"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        />
        {!state?.open && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-white/35">
            Halaman yang dibuka Mark akan tampil di sini. Ambil alih untuk membuka alamat sendiri.
          </div>
        )}
        <div
          ref={cursorRef}
          className="absolute top-0 left-0 pointer-events-none opacity-0 transition-transform duration-[180ms] motion-reduce:transition-none"
          style={{ display: state?.mode !== 'agent' ? 'none' : undefined }}
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
          disabled={!manual}
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
