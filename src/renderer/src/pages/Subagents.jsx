import AgentJobs from '../components/subagent/AgentJobs.jsx'
import { onSubagentChange, subagentRequest } from '../api/subagent/client.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, LayoutList, Network, Plus, Square } from 'lucide-react'
import AgentSidebar from '../components/subagent/AgentSidebar'
import AgentChatFeed from '../components/subagent/AgentChatFeed'
import AgentInspector from '../components/subagent/AgentInspector'
import SubagentTopologyMap from '../components/subagent/SubagentTopologyMap'
import AgentCreateDialog from '../components/subagent/AgentCreateDialog'
import { agentStatus } from '../components/subagent/agentPresentation'
import { runSubagentTurn, killSubagentExecution } from '../api/subagent/subagentExecutor'
import { subagentStore } from '../api/subagent/subagentStore'

export default function Subagents() {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const [subagents, setSubagents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('list')
  const [tab, setTab] = useState('activity')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [creating, setCreating] = useState(false)
  const mounted = useRef(false)
  const revision = useRef(0)
  const loadData = useCallback(async () => {
    const current = ++revision.current
    try {
      const [list, nextJobs] = await Promise.all([
        subagentStore.listSubagents('all'),
        agentId ? subagentStore.listJobs(agentId) : Promise.resolve([])
      ])
      if (!mounted.current || revision.current !== current) return
      setSubagents(Array.isArray(list) ? list : [])
      setJobs(nextJobs)
      setError('')
    } catch (failure) {
      if (mounted.current && revision.current === current)
        setError(failure.message || 'Daftar Minibot belum dapat dimuat.')
    } finally {
      if (mounted.current && revision.current === current) setLoading(false)
    }
  }, [agentId])
  useEffect(() => {
    mounted.current = true
    let timer
    let cancelled = false
    const poll = async () => {
      await loadData()
      if (!cancelled) timer = setTimeout(poll, 10000)
    }
    poll()
    const unsubscribe = onSubagentChange(loadData)
    return () => {
      unsubscribe()
      mounted.current = false
      cancelled = true
      clearTimeout(timer)
    }
  }, [loadData])
  const agent = subagents.find((item) => item.id === agentId)
  const selectedJob =
    jobs.find((j) => j.id === selectedJobId) ||
    jobs.find((j) => j.id === agent?.activeJobId) ||
    jobs.at(-1)
  const displayedAgent = selectedJob
    ? {
        ...agent,
        status: selectedJob.status,
        goal: selectedJob.goal,
        finalAnswer: selectedJob.result,
        turnCount: selectedJob.turnCount,
        jobId: selectedJob.id,
        parentSessionId: selectedJob.parentSessionId,
        parentSessionTitle: selectedJob.parentSessionTitle
      }
    : agent
  const activeCount = subagents.filter((item) => item.status === 'running').length
  const openAgent = (id) => {
    setCreating(false)
    setTab('activity')
    setSelectedJobId(null)
    navigate(`/subagents/${encodeURIComponent(id)}`)
  }
  const createAgent = async (values) => {
    const created = await subagentStore.createSubagent(values)
    if (!created?.id) throw new Error('Minibot belum dapat dibuat. Coba lagi.')
    await runSubagentTurn(created.id, values.goal, 'user', { newJob: true })
    await loadData()
    openAgent(created.id)
  }
  const stopAgent = async () => {
    try {
      if (selectedJob) await subagentRequest('/jobs/' + selectedJob.id + '/cancel', {})
      else await killSubagentExecution(agent.id)
      await loadData()
    } catch (failure) {
      setError(failure.message)
    }
  }
  const deleteAgent = async () => {
    await subagentStore.deleteSubagent(agent.id)
    await loadData()
    navigate('/subagents')
  }
  const status = agentStatus(displayedAgent?.status)
  return (
    <main className="flex h-screen min-w-0 flex-col overflow-hidden bg-base-300 text-base-content">
      <div
        className={`mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-5 pt-7 sm:px-8 sm:pt-10 ${agentId ? '' : 'overflow-y-auto pb-10 custom-scrollbar'}`}
      >
        <Link
          to={agentId ? '/subagents' : '/'}
          className="mb-9 inline-flex w-fit shrink-0 items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={17} /> Kembali
        </Link>
        {agentId ? (
          agent ? (
            <>
              <header className="shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 text-primary">
                      <Bot size={29} />
                    </span>
                    <div className="min-w-0">
                      <h1 className="break-words text-xl font-semibold text-white sm:text-2xl">
                        {agent.name}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span role="status" className={status.color}>
                          {status.label}
                        </span>
                        <span className="text-white/40">
                          {displayedAgent.turnCount || 0} langkah
                        </span>
                      </div>
                    </div>
                  </div>
                  {selectedJob?.status === 'running' && (
                    <button
                      type="button"
                      onClick={stopAgent}
                      className="btn btn-ghost shrink-0 rounded-full text-error"
                    >
                      <Square size={15} /> Hentikan
                    </button>
                  )}
                </div>
                <p className="mt-4 line-clamp-1 text-sm text-white/50">
                  {agent.role || 'Spesialis tugas'}
                </p>
                <div
                  aria-label="Bagian Minibot"
                  className="mt-6 flex gap-6 border-b border-white/10"
                >
                  {[
                    ['activity', 'Aktivitas'],
                    ['details', 'Detail Minibot']
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={tab === id}
                      onClick={() => setTab(id)}
                      className={`border-b-2 pb-3 text-sm focus-visible:outline-2 focus-visible:outline-primary ${tab === id ? 'border-primary text-white' : 'border-transparent text-white/45 hover:text-white/75'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {error && (
                  <p role="alert" className="py-3 text-sm text-error">
                    {error}
                  </p>
                )}
              </header>
              <div className={tab === 'activity' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                <AgentJobs
                  jobs={jobs}
                  selectedId={selectedJob?.id}
                  onSelect={setSelectedJobId}
                  onRefresh={loadData}
                />
                <AgentChatFeed
                  key={selectedJob?.id || agent.id}
                  subagent={displayedAgent}
                  onRefresh={loadData}
                />
              </div>
              {tab === 'details' && (
                <AgentInspector
                  key={agent.id}
                  subagent={displayedAgent}
                  onDeleteAgent={deleteAgent}
                />
              )}
            </>
          ) : (
            <div role="status" className="py-12 text-sm text-white/50">
              {loading ? 'Memuat Minibot...' : error || 'Minibot tidak ditemukan atau sudah dihapus.'}
            </div>
          )
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <h1 className="text-2xl font-semibold text-white">Minibots</h1>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Kelola Minibot yang membantu Mark mengerjakan tugas secara mandiri.
                </p>
                <p className="mt-2 text-xs text-white/35">
                  {activeCount > 0 ? `${activeCount} Minibot sedang berjalan` : 'Siap menerima tugas'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn w-fit shrink-0 rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
              >
                <Plus size={17} /> Buat Minibot
              </button>
            </header>
            <div aria-label="Tampilan Minibot" className="mt-7 flex gap-2">
              {[
                ['list', 'Daftar', LayoutList],
                ['topology', 'Topologi', Network]
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${view === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'}`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            {view === 'list' ? (
              <AgentSidebar
                subagents={subagents}
                query={query}
                onQueryChange={setQuery}
                filter={filter}
                onFilterChange={setFilter}
                loading={loading}
                error={error}
                onRetry={loadData}
              />
            ) : (
              <SubagentTopologyMap
                subagents={subagents}
                onOpenAgent={openAgent}
                loading={loading}
                error={error}
                onRetry={loadData}
              />
            )}
          </>
        )}
      </div>
      {creating && (
        <AgentCreateDialog
          subagents={subagents}
          onCreate={createAgent}
          onClose={() => setCreating(false)}
          onOpenAgent={openAgent}
        />
      )}
    </main>
  )
}
