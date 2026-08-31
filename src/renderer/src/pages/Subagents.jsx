import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  ArrowLeft,
  Plus,
  Cpu,
  Activity,
  X,
  LayoutGrid
} from 'lucide-react'
import AgentSidebar from '../components/subagent/AgentSidebar'
import AgentChatFeed from '../components/subagent/AgentChatFeed'
import AgentInspector from '../components/subagent/AgentInspector'
import SubagentTopologyMap from '../components/subagent/SubagentTopologyMap'
import { runSubagentTurn } from '../api/subagent/subagentExecutor'
import { subagentStore } from '../api/subagent/subagentStore'
import { useConfirm } from '../hooks/useConfirm'

export default function Subagents() {
  const navigate = useNavigate()
  const [selectedSubagentId, setSelectedSubagentId] = useState(null)
  const [subagents, setSubagents] = useState([])
  const [viewMode, setViewMode] = useState('workspace') // 'workspace' | 'topology'
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)

  // Modal State untuk Spawn Manual
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('')
  const [newAgentGoal, setNewAgentGoal] = useState('')
  const [isSpawning, setIsSpawning] = useState(false)

  const loadSubagents = async () => {
    try {
      const list = await subagentStore.listSubagents('all')
      setSubagents(list || [])
      if (!selectedSubagentId && list && list.length > 0) {
        setSelectedSubagentId(list[0].id)
      }
    } catch (err) {
      console.error('[Subagents] Load error:', err)
    }
  }

  useEffect(() => {
    loadSubagents()
    const interval = setInterval(loadSubagents, 1200)
    return () => clearInterval(interval)
  }, [selectedSubagentId])

  const activeCount = subagents?.filter((s) => s.status === 'running').length || 0
  const selectedAgent = subagents.find((s) => s.id === selectedSubagentId) || null

  const handleSendMessageFromTopology = async (id, messageText) => {
    try {
      await runSubagentTurn(id, messageText, 'user')
      await loadSubagents()
    } catch (err) {
      console.error('[Topology] Send error:', err)
    }
  }

  const handleSpawnManual = async (e) => {
    e.preventDefault()
    if (!newAgentName.trim() || !newAgentGoal.trim() || isSpawning) return

    setIsSpawning(true)
    try {
      const sub = await subagentStore.createSubagent({
        name: newAgentName.trim(),
        role: newAgentRole.trim() || 'Technical Specialist',
        goal: newAgentGoal.trim(),
        status: 'running'
      })

      // Jalankan initial turn di background secara otonom
      runSubagentTurn(sub.id, newAgentGoal.trim(), 'user').catch((err) => {
        console.error('[Subagent Spawn Error]', err)
      })

      setSelectedSubagentId(sub.id)
      setIsSpawnModalOpen(false)
      setNewAgentName('')
      setNewAgentRole('')
      setNewAgentGoal('')
      await loadSubagents()
    } catch (err) {
      console.error('[Spawn Subagent Failed]', err)
    } finally {
      setIsSpawning(false)
    }
  }

  const { confirm, ModalComponent } = useConfirm()

  const handleDeleteSubagent = async (id) => {
    const targetAgent = subagents.find((s) => s.id === id)
    const agentName = targetAgent?.name || 'Sub-Agent'
    const result = await confirm({
      title: 'Hapus Sub-Agent',
      message: `Apakah kamu yakin ingin menghapus sub-agent "${agentName}" beserta seluruh riwayat eksekusinya?`,
      isError: true,
      confirmText: 'Hapus',
      cancelText: 'Batal'
    })
    if (result?.isConfirmed) {
      // Update UI state seketika (optimistic update)
      setSubagents((prev) => prev.filter((s) => s.id !== id))
      if (selectedSubagentId === id) {
        const remaining = subagents.filter((s) => s.id !== id)
        setSelectedSubagentId(remaining.length > 0 ? remaining[0].id : null)
      }
      await subagentStore.deleteSubagent(id)
      await loadSubagents()
    }
  }

  return (
    <div className="h-screen w-screen bg-base-300 text-base-content overflow-hidden flex flex-col font-['Poppins',sans-serif]">
      {/* Top Navigation Bar */}
      <header className="h-13 bg-base-200/90 border-b border-base-content/10 px-4 flex items-center justify-between shrink-0 select-none z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-ghost btn-sm btn-circle"
            title="Kembali ke Beranda Mark"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-bold font-mono uppercase tracking-wider text-base-content">
                  Agent Workspace
                </h1>
                <span className="text-[10px] text-base-content/40 font-mono">/ Mission Control</span>
                {activeCount > 0 && (
                  <span className="badge badge-primary badge-xs gap-1 font-mono text-[9px] py-1.5">
                    <span className="w-1 h-1 rounded-full bg-base-100 animate-ping" />
                    {activeCount} active
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right View Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center p-0.5 bg-base-300/80 rounded-xl border border-base-content/10 font-mono text-xs">
            <button
              type="button"
              onClick={() => setViewMode('workspace')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'workspace'
                  ? 'bg-primary text-primary-content shadow-sm font-semibold'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
              title="Workspace Thread View (Hermes Style)"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Workspace
            </button>
            <button
              type="button"
              onClick={() => setViewMode('topology')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'topology'
                  ? 'bg-primary text-primary-content shadow-sm font-semibold'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
              title="Visual Constellation Map"
            >
              <Activity className="w-3.5 h-3.5" /> Topology
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsSpawnModalOpen(true)}
            className="btn btn-primary btn-xs rounded-xl gap-1 px-3 font-medium shadow-sm shadow-primary/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px]">New Agent</span>
          </button>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {viewMode === 'topology' ? (
          <div className="flex-1 p-4 overflow-hidden">
            <SubagentTopologyMap
              subagents={subagents}
              selectedId={selectedSubagentId}
              onSelectAgent={setSelectedSubagentId}
              onOpenIntercom={(id) => {
                setSelectedSubagentId(id)
                setViewMode('workspace')
              }}
              onSendMessage={handleSendMessageFromTopology}
            />
          </div>
        ) : (
          <div className="flex-1 flex w-full h-full overflow-hidden">
            {/* 1. Left Sidebar: Agent Roster */}
            <AgentSidebar
              subagents={subagents}
              selectedId={selectedSubagentId}
              onSelectAgent={setSelectedSubagentId}
              onOpenNewAgentModal={() => setIsSpawnModalOpen(true)}
              onDeleteAgent={handleDeleteSubagent}
            />

            {/* 2. Center Panel: Hermes Agent Chat Feed & Execution Log */}
            {selectedSubagentId ? (
              <AgentChatFeed
                subagentId={selectedSubagentId}
                onOpenInspector={() => setIsInspectorOpen(!isInspectorOpen)}
                onDeleteAgent={handleDeleteSubagent}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-base-content/30 gap-2.5 font-mono text-center">
                <div className="p-4 bg-base-200 rounded-2xl border border-base-content/10">
                  <Bot className="w-10 h-10 stroke-[1.5]" />
                </div>
                <p className="text-xs font-semibold text-base-content/60">
                  Pilih atau buat sub-agent untuk memulai Agent Workspace
                </p>
                <button
                  type="button"
                  onClick={() => setIsSpawnModalOpen(true)}
                  className="btn btn-primary btn-xs rounded-xl mt-2"
                >
                  <Plus className="w-3 h-3" /> Buat Sub-Agent Baru
                </button>
              </div>
            )}

            {/* 3. Right Panel: Agent Inspector */}
            {isInspectorOpen && selectedAgent && (
              <AgentInspector
                subagent={selectedAgent}
                onClose={() => setIsInspectorOpen(false)}
                onDeleteAgent={handleDeleteSubagent}
              />
            )}
          </div>
        )}
      </main>

      {/* Modal Spawn Agent */}
      {isSpawnModalOpen && (
        <div className="modal modal-open bg-black/60 backdrop-blur-sm z-50">
          <div className="modal-box bg-base-200 border border-base-content/10 rounded-2xl max-w-md shadow-2xl p-5 font-mono">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2 text-base-content/90">
                <Cpu className="w-4 h-4 text-primary" /> Spawn Sub-Agent Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsSpawnModalOpen(false)}
                className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSpawnManual} className="space-y-3">
              <div>
                <label className="label text-[11px] font-medium py-1 text-base-content/70">
                  Nama Agen
                </label>
                <input
                  type="text"
                  placeholder="misal: Developer / Mr Tester / Researcher"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 text-xs focus:outline-none focus:border-primary/50"
                  required
                />
              </div>
              <div>
                <label className="label text-[11px] font-medium py-1 text-base-content/70">
                  Role / Spesialisasi
                </label>
                <input
                  type="text"
                  placeholder="misal: Software Engineer / QA Tester"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 text-xs focus:outline-none focus:border-primary/50"
                  required
                />
              </div>
              <div>
                <label className="label text-[11px] font-medium py-1 text-base-content/70">
                  Tujuan & Instruksi Awal
                </label>
                <textarea
                  placeholder="Deskripsikan misi teknis yang harus diselesaikan sub-agent..."
                  value={newAgentGoal}
                  onChange={(e) => setNewAgentGoal(e.target.value)}
                  className="textarea textarea-sm textarea-bordered w-full rounded-xl h-24 text-xs bg-base-100/60 focus:outline-none focus:border-primary/50"
                  required
                />
              </div>
              <div className="modal-action pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSpawnModalOpen(false)}
                  disabled={isSpawning}
                  className="btn btn-ghost btn-xs rounded-xl px-3"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newAgentName.trim() || !newAgentGoal.trim() || isSpawning}
                  className="btn btn-primary btn-xs rounded-xl px-4 font-medium shadow-sm shadow-primary/20"
                >
                  {isSpawning ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    'Mulai Eksekusi'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ModalComponent />
    </div>
  )
}
