import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

export default function AgentConfirmDialog({ title, description, action, onConfirm, onClose }) {
  const dialog = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const current = dialog.current
    current.showModal()
    return () => {
      if (current.open) current.close()
    }
  }, [])
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } catch (failure) {
      setError(failure.message || 'Perubahan belum dapat disimpan.')
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="agent-confirm-title"
      aria-describedby="agent-confirm-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="modal-box w-[calc(100%-2rem)] max-w-md rounded-xl border border-white/10 bg-base-300 p-6"
      >
        <h2 id="agent-confirm-title" className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p
          id="agent-confirm-description"
          className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/60"
        >
          {description}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost rounded-full"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn rounded-full border-error/30 bg-error/10 text-error hover:bg-error/20"
          >
            {busy ? 'Memproses...' : action}
          </button>
        </div>
      </form>
    </dialog>
  )
}
AgentConfirmDialog.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  action: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}
