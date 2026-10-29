import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

export default function SkillEditorDialog({
  title,
  description,
  confirmLabel,
  destructive,
  name,
  onNameChange,
  onConfirm,
  onClose,
  busy,
  error
}) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="skill-dialog-title"
      aria-describedby="skill-dialog-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
        className="modal-box w-[calc(100%-2rem)] max-w-md border border-white/10 bg-base-300 p-6"
      >
        <h2 id="skill-dialog-title" className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p
          id="skill-dialog-description"
          className="mt-3 break-words text-sm leading-relaxed text-white/55"
        >
          {description}
        </p>
        {onNameChange && (
          <label className="mt-5 block text-sm text-white/75">
            Nama
            <input
              required
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={busy}
              className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none focus:border-primary/60"
              autoComplete="off"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm leading-relaxed text-error">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-ghost rounded-full px-4"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy || (!!onNameChange && !name.trim())}
            className={`btn rounded-full px-5 ${destructive ? 'btn-error' : 'border-white bg-white text-neutral-900 hover:bg-white/90'}`}
          >
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
SkillEditorDialog.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  destructive: PropTypes.bool,
  name: PropTypes.string,
  onNameChange: PropTypes.func,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  error: PropTypes.string
}
