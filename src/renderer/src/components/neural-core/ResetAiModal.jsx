import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FaTrash, FaCheckCircle, FaShieldAlt } from 'react-icons/fa'

export const ResetAiModal = ({ isOpen, onClose, onConfirm, isResetting = false }) => {
  const [step, setStep] = useState(1)
  const [inputText, setInputText] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const CONFIRM_PHRASE = 'RESET MARK'

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isResetting) {
        handleClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isResetting])

  if (!isOpen) return null

  const handleClose = () => {
    if (isResetting) return
    setStep(1)
    setInputText('')
    setIsSuccess(false)
    onClose?.()
  }

  const handleNextStep = () => {
    setStep(2)
  }

  const handleExecuteReset = async () => {
    if (inputText.trim() !== CONFIRM_PHRASE) return
    const success = await onConfirm()
    if (success !== false) {
      setIsSuccess(true)
      setTimeout(() => {
        handleClose()
      }, 1600)
    }
  }

  const modalContent = (
    <div className="modal modal-open z-[99999] fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md animate-[response-fade-in_0.15s_ease-out_forwards]">
      <div className="modal-box relative bg-base-300 border border-white/10 shadow-2xl z-10 max-w-md">
        {/* Success State */}
        {isSuccess ? (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-success/20 text-success flex items-center justify-center border border-success/30 shadow-lg">
              <FaCheckCircle className="text-2xl" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-success">
                Reset AI Berhasil
              </h3>
              <p className="py-2 text-sm opacity-80">
                Seluruh memori, riwayat chat, dan sifat Mark telah dikembalikan ke kondisi awal.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header Title */}
            <h3 className="font-bold text-lg text-error">
              Reset Total AI (Tahap {step}/2)
            </h3>

            {/* Step 1: Warning Details */}
            {step === 1 && (
              <div className="py-3 space-y-3">
                <p className="text-sm opacity-90">
                  Apakah Anda yakin ingin mereset seluruh data memori dan riwayat Mark?
                </p>
                <div className="p-3 bg-base-200/80 rounded-xl border border-white/5 space-y-1.5 text-xs">
                  <div className="text-error font-semibold flex items-center gap-1.5">
                    <FaTrash size={10} /> Data yang akan dihapus:
                  </div>
                  <ul className="list-disc list-inside opacity-70 space-y-0.5 pl-1">
                    <li>Seluruh riwayat obrolan & sesi percakapan</li>
                    <li>Seluruh memori eksplisit (Vector RAG)</li>
                    <li>Seluruh potongan dokumen tersimpan</li>
                    <li>Seluruh keahlian mandiri (Learned Skills)</li>
                    <li>Status sifat & karakter (kembali ke default netral)</li>
                    <li>Riwayat tugas mandiri & sub-agen</li>
                  </ul>
                  <div className="pt-2 text-primary font-semibold flex items-center gap-1.5 border-t border-white/5">
                    <FaShieldAlt size={10} /> Data yang dipertahankan:
                  </div>
                  <p className="opacity-70 pl-1">
                    Pengaturan API Key, model provider, prompt, dan konfigurasi umum sistem tetap aman.
                  </p>
                </div>

                <div className="modal-action mt-4">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleClose()
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="btn btn-error btn-sm shadow-md"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleNextStep()
                    }}
                  >
                    Lanjutkan ke Konfirmasi Terakhir
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Final Verification via Typing */}
            {step === 2 && (
              <div className="py-3 space-y-3">
                <p className="text-sm opacity-90">
                  Tindakan ini <strong className="text-error">tidak dapat dibatalkan</strong>. Untuk mengonfirmasi penghapusan seluruh memori Mark, ketik teks di bawah:
                </p>

                <div className="p-3 bg-base-200 rounded-xl border border-error/20 text-center font-mono font-bold text-sm tracking-widest text-error select-all">
                  {CONFIRM_PHRASE}
                </div>

                <div>
                  <label className="block text-xs opacity-60 mb-1">
                    Ketik ulang kata konfirmasi:
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ketik RESET MARK di sini"
                    className="w-full bg-base-200 border border-white/10 focus:border-error rounded-xl px-3 py-2 text-xs font-mono text-base-content outline-none transition-colors uppercase"
                  />
                </div>

                <div className="modal-action mt-4">
                  <button
                    type="button"
                    disabled={isResetting}
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setStep(1)
                    }}
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={inputText.trim() !== CONFIRM_PHRASE || isResetting}
                    className="btn btn-error btn-sm shadow-md gap-1.5"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleExecuteReset()
                    }}
                  >
                    {isResetting && <span className="loading loading-spinner loading-xs" />}
                    <span>{isResetting ? 'Mereset...' : 'Hapus & Reset AI'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div
        className="modal-backdrop fixed inset-0 cursor-pointer bg-transparent"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          handleClose()
        }}
      />
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}

export default ResetAiModal

