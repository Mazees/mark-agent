import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Ya',
  cancelText = 'Batal',
  isError = false,
  hideCancel = false
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel?.()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen || typeof document === 'undefined') return null

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-[response-fade-in_0.15s_ease-out_forwards]">
      <div 
        className="fixed inset-0 bg-transparent cursor-pointer"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onCancel?.()
        }}
      />
      <div className="relative w-full max-w-md bg-base-300 border border-white/15 rounded-2xl shadow-2xl z-10 p-6 overflow-hidden animate-[holo-project-in_0.2s_ease-out_forwards]">
        <h3 className={`font-bold text-lg ${isError ? 'text-error' : 'text-primary'}`}>
          {title}
        </h3>
        <p className="py-4 text-sm text-base-content/80 whitespace-pre-wrap leading-relaxed">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          {!hideCancel && (
            <button
              type="button"
              className="btn btn-ghost btn-sm px-4 rounded-lg cursor-pointer"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel?.()
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`btn ${isError ? 'btn-error' : 'btn-primary'} btn-sm px-5 shadow-lg rounded-lg font-medium cursor-pointer`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onConfirm?.()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ConfirmModal
