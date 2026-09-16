/* eslint-disable react/prop-types */
import React from 'react'
import { ShieldAlert, CheckCircle2, XCircle, Terminal, FileCode } from 'lucide-react'
import { useApproval, extractToolTarget } from '../../contexts/ApprovalContext'

export const ApprovalBubble = ({
  approvalId,
  tool = '',
  message = '',
  query = null,
  status = 'pending',
  timestamp = ''
}) => {
  const { resolveApproval } = useApproval()
  const isPending = status === 'pending'
  const targetInfo = extractToolTarget(tool, query)

  return (
    <div className="w-full rounded-2xl">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-white tracking-wide">
            Persetujuan Eksekusi Tool
          </span>
        </div>
        {tool && (
          <span className="badge badge-sm bg-black/40 text-warning border-warning/40 font-mono text-[10px] font-semibold">
            {tool}
          </span>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-3 text-xs leading-relaxed text-base-content">
        <p className="text-white/80">
          Mark meminta izin untuk mengeksekusi operasi sistem berikut:
        </p>

        {/* Monospace Parameter / Command Preview */}
        <div className="bg-black/40 rounded-xl p-3 border border-white/5 font-mono text-[11px] text-white/90 overflow-x-auto max-h-48 custom-scrollbar">
          {targetInfo.value ? (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-bold text-warning/70 flex items-center gap-1.5 select-none">
                {targetInfo.type === 'command' ? (
                  <>
                    <Terminal className="w-3 h-3" />
                    <span>Perintah Shell:</span>
                  </>
                ) : (
                  <>
                    <FileCode className="w-3 h-3" />
                    <span>Target Berkas:</span>
                  </>
                )}
              </div>
              <div className="text-white whitespace-pre-wrap break-all">{targetInfo.value}</div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-all">
              {message || (typeof query === 'string' ? query : JSON.stringify(query, null, 2))}
            </div>
          )}
        </div>

        {/* Footer Actions / Status */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
          {isPending ? (
            <>
              <button
                type="button"
                onClick={() => resolveApproval(approvalId, 'reject')}
                className="btn btn-ghost btn-xs text-error hover:bg-error/10 border border-error/20 rounded-lg px-3 cursor-pointer"
              >
                Tolak
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => resolveApproval(approvalId, 'approve_once')}
                  className="btn btn-outline btn-xs rounded-lg px-2.5 cursor-pointer text-white/80 hover:text-white"
                >
                  Izinkan Sekali
                </button>
                <button
                  type="button"
                  onClick={() => resolveApproval(approvalId, 'approve_session')}
                  className="btn btn-outline btn-warning btn-xs rounded-lg px-2.5 cursor-pointer"
                >
                  Izinkan Sesi Ini
                </button>
                <button
                  type="button"
                  onClick={() => resolveApproval(approvalId, 'approve_always')}
                  className="btn btn-error btn-xs shadow-md rounded-lg px-2.5 font-semibold cursor-pointer"
                >
                  Izinkan Selamanya
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {status === 'approved_once' && (
                  <span className="badge badge-sm bg-white/10 text-white/90 border-white/20 gap-1.5 text-[10px] font-medium py-1 px-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white/70" />
                    Diizinkan Sekali
                  </span>
                )}
                {status === 'approved_session' && (
                  <span className="badge badge-sm bg-warning/15 text-warning border-warning/30 gap-1.5 text-[10px] font-medium py-1 px-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-warning" />
                    Diizinkan Sesi Ini
                  </span>
                )}
                {status === 'approved_always' && (
                  <span className="badge badge-sm bg-success/15 text-success border-success/30 gap-1.5 text-[10px] font-medium py-1 px-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    Diizinkan Selamanya
                  </span>
                )}
                {status === 'rejected' && (
                  <span className="badge badge-sm bg-error/15 text-error border-error/30 gap-1.5 text-[10px] font-medium py-1 px-2.5">
                    <XCircle className="w-3.5 h-3.5 text-error" />
                    Eksekusi Ditolak
                  </span>
                )}
              </div>
              {timestamp && (
                <span className="text-[10px] text-white/40 font-normal">{timestamp}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ApprovalBubble
