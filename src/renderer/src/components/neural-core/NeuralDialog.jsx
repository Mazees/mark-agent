import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import PropTypes from 'prop-types'

export default function NeuralDialog({ title, subtitle, children, footer, onClose, busy = false }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const current = dialog.current
    current.showModal()
    return () => {
      if (current.open) current.close()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="modal-box flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-base-300 p-0">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-semibold text-white">
              {title}
            </h2>
            {subtitle && <p className="mt-2 text-xs leading-relaxed text-white/45">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Tutup dialog"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle shrink-0"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 py-5 custom-scrollbar">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
NeuralDialog.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
  onClose: PropTypes.func.isRequired,
  busy: PropTypes.bool
}
