import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { EFFORT_LEVELS } from '@shared/agent/effort.js'

export default function EffortPicker({ value, onChange, disabled, error }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState({ top: 0, left: 0, height: 300 })
  const trigger = useRef(null)
  const menu = useRef(null)
  const current = EFFORT_LEVELS.find((level) => level.value === value)
  useEffect(() => {
    if (!open) return
    const dismiss = (event) => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target))
        setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
      window.removeEventListener('resize', close)
    }
  }, [open])
  const show = () => {
    const rect = trigger.current.getBoundingClientRect()
    const viewport = window.visualViewport?.height || window.innerHeight
    const height = Math.min(310, Math.max(rect.top, viewport - rect.bottom) - 16)
    setPlacement({
      top: rect.top > viewport - rect.bottom ? rect.top - height - 8 : rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)),
      height
    })
    setOpen(true)
    requestAnimationFrame(() => menu.current?.querySelector('[aria-checked="true"]')?.focus())
  }
  const choose = (level) => {
    onChange(level)
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={`Effort: ${current?.label || 'memuat'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error || current?.description}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            show()
          }
        }}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-base-content/80 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>{current?.label || 'Effort'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Tingkat effort"
            style={{ top: placement.top, left: placement.left, maxHeight: placement.height }}
            className="fixed z-[1000] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-white/10 bg-base-200 p-1.5 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
                trigger.current?.focus()
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const items = [...menu.current.querySelectorAll('[role="menuitemradio"]')]
              const index = items.indexOf(document.activeElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
              items[next]?.focus()
            }}
          >
            {EFFORT_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                role="menuitemradio"
                aria-checked={level.value === value}
                onClick={() => choose(level.value)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left outline-none hover:bg-white/5 focus-visible:bg-white/10 focus-visible:ring-1 focus-visible:ring-primary"
              >
                <Check
                  size={14}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${value === level.value ? 'text-primary' : 'invisible'}`}
                />
                <span>
                  <span className="block text-xs font-medium">{level.label}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-base-content/70">
                    {level.description}
                  </span>
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
EffortPicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  error: PropTypes.string
}
