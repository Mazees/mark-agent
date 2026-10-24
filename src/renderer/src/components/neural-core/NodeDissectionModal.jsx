import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import PropTypes from 'prop-types'
import NeuralDialog from './NeuralDialog'

export const NodeDissectionModal = ({ node, onClose, onDeleteNode }) => {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canDelete = ['memory', 'archive', 'skill'].includes(node.kind)
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onDeleteNode(node)
      onClose()
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }
  return (
    <NeuralDialog
      title={confirming ? 'Hapus data ini?' : node.typeLabel || 'Detail memori'}
      subtitle={confirming ? undefined : node.date}
      onClose={onClose}
      busy={busy}
      footer={
        confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="btn btn-ghost rounded-full"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="btn rounded-full border-error/30 bg-error/10 text-error"
            >
              {busy ? 'Menghapus...' : 'Hapus data'}
            </button>
          </>
        ) : (
          <>
            {canDelete && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn btn-ghost mr-auto rounded-full text-error"
              >
                <Trash2 size={15} />
                Hapus data
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-ghost rounded-full">
              Tutup
            </button>
          </>
        )
      }
    >
      {confirming ? (
        <p className="text-sm leading-relaxed text-white/65">
          Data “{node.name}” akan dihapus dari penyimpanan Mark. Tindakan ini tidak dapat
          dibatalkan.
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/75">
            {node.fullText || node.description || node.name}
          </p>
          {node.kind === 'disk-skill' && (
            <p className="mt-5 text-xs leading-relaxed text-white/40">
              Ini adalah deskripsi skill dari folder lokal. Kelola berkas dan panduannya melalui
              halaman Skills.
            </p>
          )}
          <details className="mt-6 text-xs text-white/35">
            <summary className="w-fit cursor-pointer rounded-md py-1 focus-visible:outline-2 focus-visible:outline-primary">
              Identitas data
            </summary>
            <p className="mt-2 break-all font-mono">{node.recordId}</p>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </NeuralDialog>
  )
}
NodeDissectionModal.propTypes = {
  node: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onDeleteNode: PropTypes.func.isRequired
}
export default NodeDissectionModal
