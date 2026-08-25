import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({ 
  isOpen,
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "Ya", 
  cancelText = "Batal", 
  isError = false,
  hideCancel = false
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="modal modal-open z-[99999] fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md animate-[response-fade-in_0.15s_ease-out_forwards]">
      <div className="modal-box relative bg-base-300 border border-white/10 shadow-2xl z-10 max-w-md">
        <h3 className={`font-bold text-lg ${isError ? 'text-error' : 'text-primary'}`}>{title}</h3>
        <p className="py-4 text-sm opacity-80 whitespace-pre-wrap">
          {message}
        </p>
        <div className="modal-action">
          {!hideCancel && (
            <button 
              type="button"
              className="btn btn-ghost btn-sm" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancel?.();
              }}
            >
              {cancelText}
            </button>
          )}
          <button 
            type="button"
            className={`btn ${isError ? 'btn-error' : 'btn-primary'} btn-sm shadow-md`} 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm?.();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <div 
        className="modal-backdrop fixed inset-0 cursor-pointer bg-transparent" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCancel?.();
        }} 
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

export default ConfirmModal;
