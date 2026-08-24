import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  ArrowLeft,
  Plus,
  Trash2,
  Cpu,
  Activity,
  CheckCircle,
  X,
  Radio,
  Layers
} from 'lucide-react'
import SubagentIntercom from '../components/subagent/SubagentIntercom'
import SubagentTopologyMap from '../components/subagent/SubagentTopologyMap'
import { runSubagentTurn } from '../api/subagent/subagentExecutor'
import { subagentStore } from '../api/subagent/subagentStore'
import { useConfirm } from '../hooks/useConfirm'

export default function Subagents() {
  const navigate = useNavigate()
  const [selectedSubagentId, setSelectedSubagentId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [subagents, setSubagents] = useState([])
  const [viewMode, setViewMode] = useState('topology') // 'topology' | 'intercom'

  // Modal State untuk Spawn Manual
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('')
  const [newAgentGoal, setNewAgentGoal] = useState('')
  const [isSpawning, setIsSpawning] = useState(false)

  const loadSubagents = async () => {
    try {
      const list = await subagentStore.listSubagents(filterStatus)
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
  }, [filterStatus, selectedSubagentId])

  const activeCount = subagents?.filter((s) => s.status === 'running').length || 0

  const handleSendMessageFromTopology = async (id, messageText) => {
    try {
      await runSubagentTurn(id, messageText)
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

      // Jalankan initial turn
      runSubagentTurn(sub.id, newAgentGoal.trim()).catch((err) => {
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

  const handleDeleteSubagent = async (id, e) => {
    e.stopPropagation()
    const result = await confirm({
      title: 'Hapus Sub-Agent',
      message: 'Apakah kamu yakin ingin menghapus sub-agent ini beserta riwayatnya?',
      isError: true,
      confirmText: 'Hapus',
      cancelText: 'Batal'
    })
    if (result?.isConfirmed) {
      await subagentStore.deleteSubagent(id)
      if (selectedSubagentId === id) {
        setSelectedSubagentId(null)
      }
      await loadSubagents()
    }
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-hidden flex flex-col">
        <div className="max-w-6xl mx-auto px-4 py-8 pb-10 space-y-6 w-full flex-1 flex flex-col overflow-hidden">
          {/* Page Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.2em"
                  height="1.2em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold">Sub-Agents</h1>
                  <span className="text-xs text-base-content/40 font-mono">/ Mission Control</span>
                  {activeCount > 0 && (
                    <span className="badge badge-warning badge-sm gap-1.5 font-mono text-[11px] rounded-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning-content animate-ping" />
                      {activeCount} active
                    </span>
                  )}
                </div>
                <p className="opacity-50 text-sm mt-1">
                  Pantau dan kelola tim Sub-Agent yang berjalan di background.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* View Mode Toggle: Topologi vs Intercom */}
              <div className="flex items-center p-0.5 bg-base-200/80 rounded-xl border border-base-content/10 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('topology')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'topology'
                      ? 'bg-primary text-primary-content shadow-sm'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  title="Tampilan Topologi Visual"
                >
                  <Activity className="w-3.5 h-3.5" /> Topologi
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('intercom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'intercom'
                      ? 'bg-primary text-primary-content shadow-sm'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  title="Tampilan Intercom Feed"
                >
                  <Bot className="w-3.5 h-3.5" /> Intercom
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSpawnModalOpen(true)}
                className="btn btn-primary btn-sm rounded-xl gap-1.5 px-3 font-medium shadow-sm shadow-primary/20"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <Plus className="w-3.5 h-3.5" /> New Agent
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden rounded-2xl bg-base-200/50 border border-base-content/10 p-4 gap-4 backdrop-blur-md">
            {viewMode === 'topology' ? (
              <SubagentTopologyMap
                subagents={subagents}
                selectedId={selectedSubagentId}
                onSelectAgent={setSelectedSubagentId}
                onOpenIntercom={(id) => {
                  setSelectedSubagentId(id)
                  setViewMode('intercom')
                }}
                onSendMessage={handleSendMessageFromTopology}
              />
            ) : (
              <>
                {/* Left Panel: Clean Agent List */}
                <div className="w-72 flex flex-col bg-base-200/40 rounded-2xl border border-base-content/5 overflow-hidden flex-none">
                    {/* Filter Tabs */}
                    <div className="p-2 border-b border-base-content/5 flex items-center justify-between">
                      <div className="flex gap-1 p-0.5 bg-base-300/60 rounded-xl w-full">
                        <button
                          type="button"
                          onClick={() => setFilterStatus('all')}
                          className={`flex-1 py-1 text-[10px] font-medium rounded-lg transition-all ${
                            filterStatus === 'all'
                              ? 'bg-base-100 text-base-content shadow-sm font-semibold'
                              : 'text-base-content/50 hover:text-base-content'
                          }`}
                        >
                          Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterStatus('running')}
                          className={`flex-1 py-1 text-[10px] font-medium rounded-lg transition-all ${
                            filterStatus === 'running'
                              ? 'bg-base-100 text-primary shadow-sm font-semibold'
                              : 'text-base-content/50 hover:text-base-content'
                          }`}
                        >
                          Running
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterStatus('idle')}
                          className={`flex-1 py-1 text-[10px] font-medium rounded-lg transition-all ${
                            filterStatus === 'idle'
                              ? 'bg-base-100 text-base-content shadow-sm font-semibold'
                              : 'text-base-content/50 hover:text-base-content'
                          }`}
                        >
                          Idle
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterStatus('completed')}
                          className={`flex-1 py-1 text-[10px] font-medium rounded-lg transition-all ${
                            filterStatus === 'completed'
                              ? 'bg-base-100 text-success shadow-sm font-semibold'
                              : 'text-base-content/50 hover:text-base-content'
                          }`}
                        >
                          Selesai
                        </button>
                      </div>
                    </div>

                    {/* List Body */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                      {!subagents || subagents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-base-content/30 gap-2">
                          <Layers className="w-6 h-6 stroke-[1.5]" />
                          <p className="text-[11px]">Belum ada sub-agent.</p>
                        </div>
                      ) : (
                        subagents.map((agent) => {
                          const isSelected = agent.id === selectedSubagentId
                          const isRunning = agent.status === 'running'
                          const isIdle = agent.status === 'idle'
                          return (
                            <div
                              key={agent.id}
                              onClick={() => setSelectedSubagentId(agent.id)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                                isSelected
                                  ? 'bg-primary/10 border-primary/40 shadow-sm'
                                  : 'bg-base-100/40 border-base-content/5 hover:border-base-content/15 hover:bg-base-100/70'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-2 h-2 rounded-full flex-none ${
                                      isRunning
                                        ? 'bg-primary animate-ping'
                                        : isIdle
                                          ? 'bg-primary/70'
                                          : agent.status === 'completed'
                                            ? 'bg-success'
                                            : agent.status === 'failed' || agent.status === 'killed'
                                              ? 'bg-error'
                                              : 'bg-base-content/40'
                                    }`}
                                  />
                                  <span className="font-semibold text-xs truncate">{agent.name}</span>
                                </div>
                              <button
                                onClick={(e) => handleDeleteSubagent(agent.id, e)}
                                className="opacity-0 group-hover:opacity-100 text-base-content/40 hover:text-error transition-all p-0.5"
                                title="Hapus"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            <p className="text-[11px] text-base-content/50 truncate pl-4 mb-2">
                              {agent.role || 'Specialist'}
                            </p>

                            <div className="flex items-center justify-between text-[10px] text-base-content/40 font-mono pl-4">
                              <span>Langkah: {agent.turnCount || 0}</span>
                              <span>
                                {new Date(agent.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Intercom Conversation */}
                <div className="flex-1 flex flex-col bg-base-200/30 rounded-2xl border border-base-content/5 overflow-hidden">
                  {selectedSubagentId ? (
                    <SubagentIntercom
                      subagentId={selectedSubagentId}
                      onClose={() => setSelectedSubagentId(null)}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-base-content/30 gap-2.5 p-8 text-center">
                      <div className="p-3.5 bg-base-200/60 rounded-2xl border border-base-content/5">
                        <Bot className="w-8 h-8 stroke-[1.5] text-base-content/40" />
                      </div>
                      <p className="text-xs font-medium text-base-content/50">
                        Pilih sub-agent di sisi kiri untuk memantau eksekusi live.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal Spawn Agent */}
      {isSpawnModalOpen && (
        <div className="modal modal-open bg-black/60 backdrop-blur-sm z-50">
          <div className="modal-box bg-base-200 border border-base-content/10 rounded-2xl max-w-md shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
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
                <label className="label text-[11px] font-medium py-1 text-base-content/70">Nama Agen</label>
                <input
                  type="text"
                  placeholder="misal: Code-Refactorer / Web-Researcher"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 text-xs"
                  required
                />
              </div>
              <div>
                <label className="label text-[11px] font-medium py-1 text-base-content/70">Role / Spesialisasi</label>
                <input
                  type="text"
                  placeholder="misal: Frontend Developer / Researcher"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 text-xs"
                  required
                />
              </div>
              <div>
                <label className="label text-[11px] font-medium py-1 text-base-content/70">Tujuan & Instruksi Misi</label>
                <textarea
                  placeholder="Deskripsikan instruksi teknis yang harus diselesaikan sub-agent..."
                  value={newAgentGoal}
                  onChange={(e) => setNewAgentGoal(e.target.value)}
                  className="textarea textarea-sm textarea-bordered w-full rounded-xl h-24 text-xs bg-base-100/60"
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
                  {isSpawning ? <span className="loading loading-spinner loading-xs" /> : 'Mulai Eksekusi'}
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
