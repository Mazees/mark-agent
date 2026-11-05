import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ShieldCheck } from 'lucide-react'
import { APPROVAL_MODES } from '../../../../shared/approval-modes.js'
import { webApi } from '../../api/web-bridge.js'

export default function ApprovalModePicker({ sessionId }) {
  const [mode, setMode] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [placement, setPlacement] = useState({ above: true, height: 360, right: 0 })
  const root = useRef(null)
  const trigger = useRef(null)
  const currentSession = useRef(sessionId)
  useEffect(() => {
    currentSession.current = sessionId
    let alive = true
    setMode(null)
    setOpen(false)
    setBusy(false)
    const update = (data) => {
      if (alive && String(data.sessionId) === String(sessionId)) setMode(data.mode)
    }
    webApi
      .getApprovalMode(sessionId)
      .then((value) => {
        if (alive) {
          setMode(value)
          setError('')
        }
      })
      .catch(() => {
        if (alive) setError('Mode izin gagal dimuat. Buka ulang percakapan untuk mencoba lagi.')
      })
    const unsubscribe = webApi.onApprovalMode(update)
    const changed = (event) => update(event.detail)
    window.addEventListener('session-approval-mode-updated', changed)
    return () => {
      alive = false
      unsubscribe()
      window.removeEventListener('session-approval-mode-updated', changed)
    }
  }, [sessionId])
  useEffect(() => {
    if (!open) return
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const choose = async (value) => {
    const targetSession = sessionId
    setBusy(true)
    try {
      const next = await webApi.setApprovalMode(targetSession, value)
      if (currentSession.current !== targetSession) return
      setMode(next)
      setOpen(false)
      setError('')
      trigger.current?.focus()
    } catch (cause) {
      if (currentSession.current === targetSession) setError(cause.message)
    } finally {
      if (currentSession.current === targetSession) setBusy(false)
    }
  }
  const current = APPROVAL_MODES.find((item) => item.value === mode)
  return (
    <div
      ref={root}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
        if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const buttons = [...root.current.querySelectorAll('[role=menuitemradio]')]
          const index = buttons.indexOf(document.activeElement)
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={'Perizinan: ' + (current?.label || 'Memuat')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!mode || busy}
        onClick={() => {
          const rect = trigger.current.getBoundingClientRect()
          const height = window.visualViewport?.height || window.innerHeight
          const above = rect.top > height - rect.bottom
          const width = Math.min(300, window.innerWidth - 32)
          const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))
          setPlacement({
            above,
            height: Math.max(80, (above ? rect.top : height - rect.bottom) - 16),
            right: root.current.getBoundingClientRect().right - left - width
          })
          setOpen(!open)
        }}
        className={
          'flex max-w-[160px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary ' +
          (mode === 'full' ? 'text-warning' : 'text-base-content/80')
        }
        title={error || current?.description}
      >
        <ShieldCheck size={14} className="shrink-0" />
        <span className="hidden truncate @md:inline">
          {current?.label || (error ? 'Izin gagal dimuat' : 'Memuat izin…')}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Mode perizinan"
          style={{ maxHeight: placement.height, right: placement.right }}
          className={
            'absolute right-0 z-50 w-[min(300px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-white/10 bg-base-200 p-1.5 shadow-xl custom-scrollbar ' +
            (placement.above ? 'bottom-full mb-2' : 'top-full mt-2')
          }
        >
          {APPROVAL_MODES.map((item) => (
            <button
              role="menuitemradio"
              aria-checked={mode === item.value}
              type="button"
              key={item.value}
              disabled={busy}
              onClick={() => choose(item.value)}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left outline-none hover:bg-white/5 focus-visible:bg-white/10 focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Check
                size={14}
                className={
                  'mt-0.5 shrink-0 ' + (mode === item.value ? 'text-primary' : 'invisible')
                }
              />
              <span>
                <span className="block text-xs font-medium">{item.label}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-base-content/70">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
ApprovalModePicker.propTypes = {
  sessionId: (props, name) =>
    ['string', 'number'].includes(typeof props[name])
      ? null
      : new Error('sessionId wajib berupa ID percakapan.')
}
