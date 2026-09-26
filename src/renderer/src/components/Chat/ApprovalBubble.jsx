/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react'
import { useApproval, extractToolTarget } from '../../contexts/ApprovalContext'
import FileDiffModal from './FileDiffModal'

const FILE_TOOLS = ['write-file', 'replace-content', 'replace-lines', 'delete-file']

export const ApprovalBubble = ({
  approvalId,
  tool = '',
  message = '',
  query = null,
  status = 'pending'
}) => {
  const { resolveApproval } = useApproval()
  const [showDiffModal, setShowDiffModal] = useState(false)
  const bubbleRef = useRef(null)

  // Auto-scroll ke bubble persetujuan jika status pending
  useEffect(() => {
    if (status === 'pending' && bubbleRef.current) {
      const scrollTimer = setTimeout(() => {
        bubbleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 60)
      return () => clearTimeout(scrollTimer)
    }
  }, [status, approvalId])

  // Hilang seketika setelah di-acc atau ditolak
  if (status !== 'pending') {
    return null
  }

  const targetInfo = extractToolTarget(tool, query)
  const isFileTool = FILE_TOOLS.includes(tool)
  const previewValue =
    targetInfo.value ||
    message ||
    (typeof query === 'string' ? query : JSON.stringify(query, null, 2))

  const handleDecision = (decisionType) => {
    setShowDiffModal(false)
    if (resolveApproval) {
      resolveApproval(approvalId, decisionType)
    }
  }

  return (
    <div
      ref={bubbleRef}
      className="my-2.5 p-3.5 pb-4 rounded-xl bg-base-300/60 border border-white/10 space-y-3 text-xs text-base-content select-text shadow-md"
    >
      {/* Header persetujuan */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-white/90 text-xs tracking-wide">
            Persetujuan Eksekusi
          </span>
          {tool && (
            <span className="bg-warning/10 text-warning px-2 py-0.5 rounded text-[11px] font-mono font-medium">
              {tool}
            </span>
          )}
        </div>

        {isFileTool && (
          <button
            type="button"
            onClick={() => setShowDiffModal(true)}
            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-mono text-xs transition-colors cursor-pointer"
          >
            Review
          </button>
        )}
      </div>

      <p className="text-white/60 text-[11px]">
        Mark meminta izin untuk mengeksekusi operasi berikut:
      </p>

      {/* Parameter / Command Preview */}
      <div className="bg-black/30 rounded-lg p-2.5 font-mono text-[11px] text-white/90 space-y-1">
        {targetInfo.value && (
          <div className="text-[10px] uppercase font-bold text-warning/70 select-none">
            {targetInfo.type === 'command' ? 'Perintah Shell' : 'Target Berkas'}
          </div>
        )}
        <div className="text-white/90 whitespace-pre-wrap break-all leading-relaxed">
          {previewValue}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
        <button
          type="button"
          onClick={() => handleDecision('reject')}
          className="btn btn-ghost btn-xs text-error/80 hover:text-error hover:bg-error/10 rounded-lg px-3"
        >
          Tolak
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleDecision('approve_session')}
            className="btn btn-ghost btn-xs text-warning/80 hover:text-warning hover:bg-warning/10 rounded-lg px-2.5"
          >
            Izinkan Sesi Ini
          </button>
          <button
            type="button"
            onClick={() => handleDecision('approve_always')}
            className="btn btn-ghost btn-xs text-white/40 hover:text-error hover:bg-error/10 rounded-lg px-2.5"
          >
            Izinkan Selamanya
          </button>
          <button
            type="button"
            onClick={() => handleDecision('approve_once')}
            className="btn btn-primary btn-xs text-black font-semibold rounded-lg px-3 shadow-sm"
          >
            Izinkan Sekali
          </button>
        </div>
      </div>

      {/* Floating Diff Modal */}
      {isFileTool && (
        <FileDiffModal
          isOpen={showDiffModal}
          onClose={() => setShowDiffModal(false)}
          tool={tool}
          query={query}
          onResolve={handleDecision}
        />
      )}
    </div>
  )
}

export default ApprovalBubble
