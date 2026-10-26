import { useState } from 'react'
import PropTypes from 'prop-types'
import NeuralDialog from './NeuralDialog'

export const ResetAiModal = ({ onClose, onConfirm, isResetting = false }) => {
  const [step, setStep] = useState(1)
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const reset = async () => {
    if (isResetting || phrase.trim() !== 'RESET MARK') return
    setError('')
    try {
      const result = await onConfirm()
      if (result === false) throw new Error('Data belum berhasil direset. Coba lagi.')
      setDone(true)
    } catch (failure) {
      setError(failure.message)
    }
  }
  return (
    <NeuralDialog
      title={done ? 'Data berhasil direset' : step === 1 ? 'Reset data Mark?' : 'Konfirmasi reset'}
      onClose={onClose}
      busy={isResetting}
      footer={
        done ? (
          <button type="button" onClick={onClose} className="btn btn-ghost rounded-full">
            Tutup
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={isResetting}
              onClick={
                step === 1
                  ? onClose
                  : () => {
                      setStep(1)
                      setPhrase('')
                      setError('')
                    }
              }
              className="btn btn-ghost rounded-full"
            >
              {step === 1 ? 'Batal' : 'Kembali'}
            </button>
            <button
              type="button"
              disabled={isResetting || (step === 2 && phrase.trim() !== 'RESET MARK')}
              onClick={step === 1 ? () => setStep(2) : reset}
              className="btn rounded-full border-error/30 bg-error/10 text-error"
            >
              {step === 1 ? 'Lanjutkan' : isResetting ? 'Mereset...' : 'Reset data'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm leading-relaxed text-white/65">
          Data Mark telah dikembalikan ke kondisi awal. Halaman akan dimuat ulang.
        </p>
      ) : step === 1 ? (
        <div className="space-y-4 text-sm leading-relaxed text-white/65">
          <p>Reset menghapus data berikut dan tidak dapat dibatalkan:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Memori dan riwayat percakapan.</li>
            <li>Dokumen tersimpan dan skill yang dipelajari.</li>
            <li>Perkembangan karakter serta riwayat tugas dan Minibot.</li>
          </ul>
          <p>
            Konfigurasi sistem, termasuk provider AI dan API key, tetap disimpan. Unduh cadangan
            terlebih dahulu jika data ini masih diperlukan.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-white/65">
            Untuk menghapus data secara permanen, ketik{' '}
            <strong className="font-mono text-white/85">RESET MARK</strong> di bawah.
          </p>
          <label className="block text-sm text-white/70">
            Teks konfirmasi
            <input
              key="reset-phrase"
              autoFocus
              disabled={isResetting}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="input input-bordered mt-2 w-full rounded-lg bg-transparent font-mono text-sm"
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}
    </NeuralDialog>
  )
}
ResetAiModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isResetting: PropTypes.bool
}
export default ResetAiModal
