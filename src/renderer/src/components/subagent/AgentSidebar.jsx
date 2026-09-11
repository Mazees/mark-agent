import React, { useState } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Cpu,
  Layers,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Terminal
} from 'lucide-react'

export default function AgentSidebar({
  subagents = [],
  selectedId = null,
  onSelectAgent = () => {},
  onOpenNewAgentModal = () => {},
  onDeleteAgent = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'running' | 'idle' | 'completed'

  const filteredAgents = subagents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.role && agent.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (agent.goal && agent.goal.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    if (filterTab === 'running') return agent.status === 'running'
    if (filterTab === 'idle') return agent.status === 'idle'
    if (filterTab === 'completed') return agent.status === 'completed'
    return true
  })

  const getStatusBadge = (status) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[10px] text-primary font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            Running
          </span>
        )
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-success font-mono font-medium">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Done
          </span>
        )
      case 'failed':
      case 'killed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-error font-mono font-medium">
            <AlertCircle className="w-2.5 h-2.5" />
            Stopped
          </span>
        )
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] text-base-content/50 font-mono">
            <Clock className="w-2.5 h-2.5" />
            Idle
          </span>
        )
    }
  }

  return (
    <aside className="w-72 md:w-80 flex flex-col bg-base-200/60 border-r border-base-content/10 flex-none select-none h-full overflow-hidden">
      {/* Header with New Agent Action */}
      <div className="p-3.5 border-b border-base-content/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wide uppercase text-base-content/90 font-mono">
              Bots & Agents
            </h2>
            <span className="text-[10px] text-base-content/50 font-mono">
              {subagents.length} terdaftar
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenNewAgentModal}
          className="btn btn-primary btn-xs rounded-xl gap-1 px-2.5 font-medium shadow-sm shadow-primary/20"
          title="Tambah Sub-Agent Baru"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[11px]">New Agent</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2.5 pb-1">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder="Cari agen atau peran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-xs w-full pl-8 pr-3 py-3 rounded-xl bg-base-100/60 border-base-content/10 text-[11px] focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-2.5 py-1.5">
        <div className="flex gap-1 p-0.5 bg-base-300/60 rounded-xl w-full border border-base-content/5">
          {['all', 'running', 'idle', 'completed'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterTab(tab)}
              className={`flex-1 py-1 text-[10px] font-medium rounded-lg transition-all capitalize font-mono ${
                filterTab === tab
                  ? 'bg-base-100 text-base-content shadow-sm font-semibold'
                  : 'text-base-content/50 hover:text-base-content'
              }`}
            >
              {tab === 'all' ? 'Semua' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar">
        {filteredAgents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-base-content/30 gap-2">
            <Layers className="w-7 h-7 stroke-[1.5]" />
            <p className="text-[11px] font-mono">Tidak ada agen ditemukan.</p>
          </div>
        ) : (
          filteredAgents.map((agent) => {
            const isSelected = agent.id === selectedId
            const isRunning = agent.status === 'running'

            return (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-primary/10 border-primary/40 shadow-sm'
                    : 'bg-base-100/40 border-base-content/5 hover:border-base-content/15 hover:bg-base-100/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-[10px] shrink-0 font-mono ${
                        isRunning
                          ? 'bg-primary/20 text-primary border border-primary/40 shadow-sm'
                          : isSelected
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-base-300 text-base-content/70 border border-base-content/10'
                      }`}
                    >
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-base-content/95 truncate">
                          {agent.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-base-content/50 truncate font-mono">
                        {agent.role || 'Technical Specialist'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteAgent(agent.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-base-content/40 hover:text-error transition-all p-1 rounded-md hover:bg-base-content/5"
                      title="Hapus Agen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-base-content/45 font-mono pt-1 border-t border-base-content/5 mt-1.5">
                  <div className="flex items-center gap-1">{getStatusBadge(agent.status)}</div>
                  <span>Langkah: {agent.turnCount || 0}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
