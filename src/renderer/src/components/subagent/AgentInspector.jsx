import React, { useState } from 'react'
import {
  X,
  Cpu,
  Shield,
  Terminal,
  CheckCircle2,
  Trash2
} from 'lucide-react'

export default function AgentInspector({ subagent, onClose, onDeleteAgent }) {
  const [activeTab, setActiveTab] = useState('details') // 'details' | 'tools'

  if (!subagent) return null

  const isRunning = subagent.status === 'running'
  const isCompleted = subagent.status === 'completed'

  return (
    <aside className="w-80 flex flex-col bg-base-200/60 border-l border-base-content/10 flex-none h-full overflow-hidden select-none">
      {/* Inspector Header */}
      <div className="p-3.5 border-b border-base-content/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wide uppercase text-base-content/90 font-mono">
              Agent Inspector
            </h2>
            <span className="text-[10px] text-base-content/50 font-mono">
              ID: {subagent.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onDeleteAgent && (
            <button
              type="button"
              onClick={() => onDeleteAgent(subagent.id)}
              className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-error transition-colors"
              title="Hapus Agen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
              title="Tutup Panel Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2">
        <div className="flex gap-1 p-0.5 bg-base-300/60 rounded-xl w-full border border-base-content/5 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-1 font-medium rounded-lg transition-all ${
              activeTab === 'details'
                ? 'bg-base-100 text-base-content shadow-sm font-semibold'
                : 'text-base-content/50 hover:text-base-content'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`flex-1 py-1 font-medium rounded-lg transition-all ${
              activeTab === 'tools'
                ? 'bg-base-100 text-base-content shadow-sm font-semibold'
                : 'text-base-content/50 hover:text-base-content'
            }`}
          >
            Tools & Sandbox
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs custom-scrollbar font-mono">
        {activeTab === 'details' && (
          <>
            {/* Identity Card */}
            <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-base-content/40 uppercase">Status</span>
                <span
                  className={`badge badge-xs font-mono text-[9px] py-2 gap-1 ${
                    isRunning
                      ? 'badge-primary'
                      : isCompleted
                        ? 'badge-success'
                        : 'badge-ghost text-base-content/60'
                  }`}
                >
                  {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-base-100 animate-ping" />}
                  {subagent.status}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-base-content/40 uppercase block mb-0.5">Role</span>
                <p className="font-semibold text-base-content/90 text-xs">
                  {subagent.role || 'Technical Specialist'}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-base-content/40 uppercase block mb-0.5">Goal</span>
                <p className="text-base-content/80 text-[11px] leading-relaxed whitespace-pre-wrap bg-base-200/50 p-2 rounded-lg border border-base-content/5">
                  {subagent.goal || '-'}
                </p>
              </div>
            </div>

            {/* Metrics */}
            <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-2">
              <span className="text-[10px] text-base-content/40 uppercase block">Telemetry</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-base-200/50 rounded-lg border border-base-content/5">
                  <span className="text-[10px] text-base-content/50 block">Turns</span>
                  <span className="font-bold text-primary text-sm">{subagent.turnCount || 0}</span>
                </div>
                <div className="p-2 bg-base-200/50 rounded-lg border border-base-content/5">
                  <span className="text-[10px] text-base-content/50 block">Sandbox</span>
                  <span className="font-bold text-accent text-sm">Puppeteer</span>
                </div>
              </div>

              <div className="text-[10px] text-base-content/40 space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>Dibuat:</span>
                  <span>{new Date(subagent.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Terakhir aktif:</span>
                  <span>{new Date(subagent.updatedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Final Answer / Artifact if available */}
            {subagent.finalAnswer && (
              <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-1.5">
                <span className="text-[10px] text-success uppercase font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Laporan Akhir
                </span>
                <p className="text-[11px] text-base-content/85 whitespace-pre-wrap leading-relaxed bg-base-200/60 p-2 rounded-lg max-h-48 overflow-y-auto">
                  {subagent.finalAnswer}
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-3">
            <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-2">
              <div className="flex items-center gap-1.5 text-primary text-[11px] font-semibold">
                <Shield className="w-3.5 h-3.5" />
                <span>Sandbox Security</span>
              </div>
              <p className="text-[10px] text-base-content/60 leading-relaxed">
                Sub-agent berjalan dengan isolasi session Puppeteer dan registry tool native.
              </p>
            </div>

            <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-2">
              <span className="text-[10px] text-base-content/40 uppercase block">Allowed Tools</span>
              <div className="flex flex-wrap gap-1">
                {Array.isArray(subagent.allowedTools) && subagent.allowedTools.includes('*') ? (
                  <span className="badge badge-primary badge-sm text-[10px] font-mono">
                    All Tools Allowed (*)
                  </span>
                ) : Array.isArray(subagent.allowedTools) && subagent.allowedTools.length > 0 ? (
                  subagent.allowedTools.map((t, idx) => (
                    <span
                      key={idx}
                      className="badge badge-ghost badge-sm text-[10px] font-mono text-base-content/80 border-base-content/10"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-base-content/40">Default Core Tools</span>
                )}
              </div>
            </div>

            <div className="p-3 bg-base-100/50 rounded-xl border border-base-content/10 space-y-1.5">
              <span className="text-[10px] text-base-content/40 uppercase block">Inter-Agent Routing</span>
              <div className="space-y-1 text-[10px] text-base-content/70">
                <div className="flex items-center gap-1 text-accent">
                  <Terminal className="w-3 h-3" />
                  <span>message_agent</span>
                </div>
                <p className="text-[10px] text-base-content/50 pl-4">
                  Dapat memanggil sub-agent spesialis lain secara mandiri.
                </p>
                <div className="flex items-center gap-1 text-primary pt-1">
                  <Terminal className="w-3 h-3" />
                  <span>report_to_lead</span>
                </div>
                <p className="text-[10px] text-base-content/50 pl-4">
                  Mengirim push notification hasil pekerjaan ke Lead Agent Mark.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
