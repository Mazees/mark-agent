import React, { useState, useMemo } from 'react'
import {
  Brain,
  Bot,
  Activity,
  Send,
  Terminal,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

// Primary MARK Theme (Forest Theme)
const PRIMARY = '#1fb854'
const PRIMARY_DARK = '#142e22'
const WHITE = '#ffffff'

export default function SubagentTopologyMap({
  subagents = [],
  selectedId = null,
  onSelectAgent = () => {},
  onOpenIntercom = () => {},
  onSendMessage = () => {}
}) {
  const [hoveredId, setHoveredId] = useState(null)
  const [quickInput, setQuickInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  // Filter agent untuk topologi:
  // Saat ada sub-agent yang sedang berjalan (running), HANYA tampilkan yang aktif agar diagram fokus & tidak penuh.
  // Saat semua tugas selesai / idle, tampilkan seluruh sub-agent yang standby.
  const displayAgents = useMemo(() => {
    const running = subagents.filter((a) => a.status === 'running')
    if (running.length > 0) {
      return running
    }
    return subagents
  }, [subagents])

  // Layout geometry for constellation placement
  const totalAgents = displayAgents.length
  const center = { x: 340, y: 240 }
  const radius = Math.min(180, Math.max(130, totalAgents * 24))

  const nodes = useMemo(() => {
    if (totalAgents === 0) return []
    return displayAgents.map((agent, index) => {
      const angle = (index / totalAgents) * 2 * Math.PI - Math.PI / 2
      const x = center.x + radius * Math.cos(angle)
      const y = center.y + radius * Math.sin(angle)
      return {
        ...agent,
        x,
        y,
        angle
      }
    })
  }, [displayAgents, totalAgents, center.x, center.y, radius])

  const selectedAgent = useMemo(
    () => subagents.find((a) => a.id === selectedId) || null,
    [subagents, selectedId]
  )

  const activeCount = subagents.filter((a) => a.status === 'running').length
  const idleCount = subagents.filter((a) => a.status === 'idle').length
  const completedCount = subagents.filter((a) => a.status === 'completed').length
  const failedCount = subagents.filter((a) => a.status === 'failed' || a.status === 'killed').length

  const handleQuickSend = async (e) => {
    e?.preventDefault()
    if (!quickInput.trim() || !selectedAgent || isSending) return
    setIsSending(true)
    try {
      await onSendMessage(selectedAgent.id, quickInput.trim())
      setQuickInput('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden gap-4 font-['Poppins',sans-serif]">
      {/* Visual Canvas Area */}
      <div className="flex-1 bg-base-200/50 rounded-2xl border border-base-content/10 relative overflow-hidden flex flex-col items-center justify-center p-4 backdrop-blur-md">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1fb8540d_0%,transparent_70%)] pointer-events-none" />

        {/* Top Minimal Telemetry Bar */}
        <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2 bg-base-300/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-base-content/5 text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-semibold text-[11px] tracking-wide text-base-content/80">
              Topology Network {activeCount > 0 ? '(Active Squad)' : '(Standby)'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            {activeCount > 0 && (
              <span className="px-2.5 py-1 bg-base-300/80 backdrop-blur-md rounded-lg border border-primary/30 flex items-center gap-1.5 text-primary shadow-sm font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                {activeCount} Aktif
              </span>
            )}
            {idleCount > 0 && (
              <span className="px-2.5 py-1 bg-base-300/80 backdrop-blur-md rounded-lg border border-base-content/5 flex items-center gap-1.5 text-base-content/80 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                {idleCount} Standby
              </span>
            )}
            {completedCount > 0 && (
              <span className="px-2.5 py-1 bg-base-300/80 backdrop-blur-md rounded-lg border border-base-content/5 flex items-center gap-1.5 text-base-content/80 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {completedCount} Selesai
              </span>
            )}
            {failedCount > 0 && (
              <span className="px-2.5 py-1 bg-base-300/80 backdrop-blur-md rounded-lg border border-error/30 text-error flex items-center gap-1.5 shadow-sm">
                {failedCount} Gagal
              </span>
            )}
          </div>
        </div>

        {totalAgents === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 z-10 text-base-content/40 space-y-2.5">
            <div className="w-14 h-14 rounded-2xl bg-base-300/80 border border-base-content/10 flex items-center justify-center text-primary shadow-inner">
              <Layers className="w-7 h-7 stroke-[1.5]" />
            </div>
            <div>
              <p className="font-semibold text-sm text-base-content/70">
                Belum Ada Sub-Agent
              </p>
              <p className="text-xs text-base-content/40 mt-0.5 max-w-sm">
                Saat Mark mendelegasikan tugas ke sub-agent, topologi tim akan muncul di sini.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* SVG Clean Topology Network */}
            <svg
              viewBox="0 0 680 480"
              className="w-full h-full max-w-[680px] max-h-[480px] select-none"
              style={{ overflow: 'visible' }}
            >
              {/* Single Clean Orbital Track - Slow Gentle Spin */}
              <circle
                cx={center.x}
                cy={center.y}
                r={radius}
                fill="none"
                stroke={PRIMARY}
                strokeOpacity="0.18"
                strokeWidth="1"
                strokeDasharray="4 6"
                className="animate-[spin_90s_linear_infinite]"
              />

              {/* Minimal Clean Connector Lines */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedId
                const isHovered = node.id === hoveredId
                const isRunning = node.status === 'running'
                const isFailed = node.status === 'failed' || node.status === 'killed'
                const lineColor = isFailed ? '#ef4444' : PRIMARY

                return (
                  <g key={`beam-${node.id}`}>
                    <line
                      x1={center.x}
                      y1={center.y}
                      x2={node.x}
                      y2={node.y}
                      stroke={lineColor}
                      strokeWidth={isSelected || isHovered ? 2 : 1}
                      strokeOpacity={isSelected || isHovered ? 0.9 : isFailed ? 0.6 : isRunning ? 0.6 : 0.25}
                      strokeDasharray={isRunning || isFailed ? '4 3' : undefined}
                    />

                    {/* Active Minimal Pulse */}
                    {isRunning && (
                      <circle
                        r="3"
                        fill={PRIMARY}
                        stroke={WHITE}
                        strokeWidth="0.8"
                      >
                        <animateMotion
                          path={`M ${center.x} ${center.y} L ${node.x} ${node.y}`}
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                )
              })}

              {/* Center Node: Mark (Lead Agent) */}
              <g transform={`translate(${center.x}, ${center.y})`} className="cursor-pointer">
                {/* Subtle Ambient Breath Ring */}
                <circle
                  r="34"
                  fill={PRIMARY}
                  fillOpacity="0.12"
                  className="animate-pulse"
                />

                {/* Node Core */}
                <circle
                  r="26"
                  fill={PRIMARY}
                  stroke={WHITE}
                  strokeWidth="2"
                />
                <foreignObject x="-16" y="-16" width="32" height="32">
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <Brain className="w-5 h-5" />
                  </div>
                </foreignObject>

                {/* Minimal Text Label */}
                <text
                  y="42"
                  textAnchor="middle"
                  fill={WHITE}
                  className="text-[10px] font-semibold tracking-wider font-mono"
                >
                  MARK (LEAD)
                </text>
              </g>

              {/* Satellite Nodes: Sub-Agents */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedId
                const isHovered = node.id === hoveredId
                const isRunning = node.status === 'running'
                const isFailed = node.status === 'failed' || node.status === 'killed'
                const nodeColor = isFailed ? '#ef4444' : PRIMARY

                return (
                  <g
                    key={`node-${node.id}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => onSelectAgent(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Invisible Hitbox */}
                    <circle r="30" fill="transparent" />

                    {/* Active/Hover Clean Ring with Gentle Spin */}
                    {(isSelected || isHovered) && (
                      <circle
                        r="25"
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="animate-[spin_10s_linear_infinite]"
                      />
                    )}

                    {/* Node Core Body */}
                    <circle
                      r={isSelected || isHovered ? 20 : 18}
                      fill={nodeColor}
                      stroke={WHITE}
                      strokeWidth={isSelected || isHovered ? 2 : 1.2}
                      className="transition-all duration-150"
                    />

                    {/* Icon Inside Node */}
                    <foreignObject x="-11" y="-11" width="22" height="22">
                      <div className="w-full h-full flex items-center justify-center text-white">
                        {isFailed ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-white" />
                        ) : isRunning ? (
                          <Activity className="w-3.5 h-3.5 animate-spin" />
                        ) : node.status === 'idle' ? (
                          <Bot className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        )}
                      </div>
                    </foreignObject>

                    {/* Clean Sub-agent Name Label */}
                    <text
                      y="34"
                      textAnchor="middle"
                      fill={isFailed ? '#fca5a5' : WHITE}
                      className="text-[9px] font-medium tracking-tight"
                    >
                      {node.name.length > 14 ? node.name.slice(0, 12) + '..' : node.name}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Right Telemetry / Inspector Drawer */}
      <div className="w-full md:w-80 flex flex-col bg-base-200/50 rounded-2xl border border-base-content/10 overflow-hidden flex-none backdrop-blur-md">
        <div className="p-3.5 border-b border-base-content/10 flex items-center justify-between bg-base-300/40">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs tracking-wide">Inspeksi Agen</span>
          </div>
          {selectedAgent && (
            <button
              type="button"
              onClick={() => onOpenIntercom(selectedAgent.id)}
              className="btn btn-ghost btn-xs gap-1 text-[10px] text-primary hover:bg-primary/10"
              title="Buka Chat Intercom Penuh"
            >
              Intercom <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        {selectedAgent ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
            {/* Agent Header Card */}
            <div className="p-3 bg-base-100/60 rounded-xl border border-base-content/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-bold text-xs flex-none">
                    {selectedAgent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-xs truncate">{selectedAgent.name}</h4>
                    <p className="text-[10px] opacity-60 truncate font-mono">{selectedAgent.role}</p>
                  </div>
                </div>
                <div className="flex-none">
                  {selectedAgent.status === 'running' ? (
                    <span className="badge badge-primary badge-xs gap-1 font-mono text-[9px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-content animate-ping" />
                      RUNNING
                    </span>
                  ) : selectedAgent.status === 'idle' ? (
                    <span className="badge badge-primary badge-outline badge-xs font-mono text-[9px]">
                      IDLE / STANDBY
                    </span>
                  ) : selectedAgent.status === 'failed' || selectedAgent.status === 'killed' ? (
                    <span className="badge badge-error badge-xs font-mono text-[9px]">FAILED</span>
                  ) : (
                    <span className="badge badge-primary badge-outline badge-xs font-mono text-[9px]">COMPLETED</span>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-base-content/70 font-mono bg-base-200/60 p-2.5 rounded-lg border border-base-content/5">
                <span className="text-primary font-bold block text-[9px] mb-0.5 uppercase tracking-wider">Misi / Goal:</span>
                <p className="line-clamp-2 leading-relaxed">{selectedAgent.goal}</p>
              </div>
            </div>

            {/* Live Progress / Output Preview */}
            <div className="flex-1 bg-base-100/40 rounded-xl border border-base-content/10 p-3 space-y-2 flex flex-col">
              <div className="flex items-center justify-between text-[10px] font-semibold text-base-content/70">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Laporan Terkini:
                </span>
                <span className="font-mono text-[9px]">Turn #{selectedAgent.turnCount || 0}</span>
              </div>

              <div className="flex-1 bg-base-200/50 rounded-lg p-2.5 text-[11px] font-mono leading-relaxed overflow-y-auto max-h-44 text-base-content/90 border border-base-content/5">
                {selectedAgent.finalAnswer ? (
                  <p className="whitespace-pre-wrap">{selectedAgent.finalAnswer}</p>
                ) : selectedAgent.status === 'running' ? (
                  <div className="flex items-center gap-2 text-primary opacity-80 py-2">
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Sedang memproses langkah...</span>
                  </div>
                ) : (
                  <span className="opacity-40 italic">Belum ada output yang tercatat.</span>
                )}
              </div>
            </div>

            {/* Quick Mentoring / Correction Dispatch */}
            <form onSubmit={handleQuickSend} className="space-y-1.5 pt-1">
              <label className="text-[10px] font-semibold text-base-content/70 flex items-center gap-1">
                <Send className="w-2.5 h-2.5 text-primary" /> Kirim Arahan Cepat (Lead Agent):
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Ketik instruksi koreksi..."
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  className="input input-xs input-bordered flex-1 rounded-lg text-[11px] bg-base-100/60 focus:border-primary"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!quickInput.trim() || isSending}
                  className="btn btn-primary btn-xs rounded-lg px-2.5"
                  title="Kirim Pesan ke Sub-Agent"
                >
                  {isSending ? <span className="loading loading-spinner loading-xs" /> : <Send className="w-3 h-3" />}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-base-content/40 space-y-2">
            <Bot className="w-8 h-8 stroke-[1.2] opacity-40 text-primary" />
            <p className="text-xs">Klik salah satu node sub-agent pada diagram di samping untuk memeriksa status & memberikan arahan langsung.</p>
          </div>
        )}
      </div>
    </div>
  )
}
