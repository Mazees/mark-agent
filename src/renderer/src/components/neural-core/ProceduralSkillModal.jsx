import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { Trash2 } from 'lucide-react'
import PropTypes from 'prop-types'
import { CodeBlock } from '../Chat/CodeBlock'
import NeuralDialog from './NeuralDialog'
import { neuralDate } from './neuralCoreData'

export const ProceduralSkillModal = ({ skill, onClose, onDeleteSkill }) => {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onDeleteSkill(skill)
      onClose()
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }
  return (
    <NeuralDialog
      title={confirming ? 'Hapus skill?' : skill.name}
      subtitle={confirming ? undefined : `Skill yang dipelajari · ${neuralDate(skill.updatedAt)}`}
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
              {busy ? 'Menghapus...' : 'Hapus skill'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn btn-ghost mr-auto rounded-full text-error"
            >
              <Trash2 size={15} />
              Hapus skill
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost rounded-full">
              Tutup
            </button>
          </>
        )
      }
    >
      {confirming ? (
        <p className="text-sm leading-relaxed text-white/65">
          Panduan “{skill.name}” akan dihapus dari skill yang dipelajari Mark.
        </p>
      ) : (
        <>
          <p className="mb-5 text-sm leading-relaxed text-white/55">
            {skill.description || 'Belum ada deskripsi.'}
          </p>
          <div className="break-words text-sm leading-relaxed text-white/80 custom-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[
                [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
              ]}
              components={{ code: CodeBlock }}
            >
              {skill.content || 'Belum ada isi panduan.'}
            </ReactMarkdown>
          </div>
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
ProceduralSkillModal.propTypes = {
  skill: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onDeleteSkill: PropTypes.func.isRequired
}
export default ProceduralSkillModal
