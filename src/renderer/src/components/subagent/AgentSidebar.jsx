import { Link } from 'react-router-dom'
import { Bot, Search } from 'lucide-react'
import PropTypes from 'prop-types'
import { agentStatus } from './agentPresentation'

export default function AgentSidebar({
  subagents,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  loading,
  error,
  onRetry
}) {
  const visible = subagents.filter((agent) => {
    const matches = [agent.name, agent.role, agent.goal]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase())
    return (
      matches &&
      (filter === 'all' ||
        (filter === 'stopped'
          ? ['failed', 'killed'].includes(agent.status)
          : agent.status === filter))
    )
  })
  return (
    <section aria-labelledby="subagent-list-title" className="mt-9">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <h2 id="subagent-list-title" className="text-sm font-medium text-white/75">
          Agen terdaftar <span className="ml-1 text-white/40">{!loading && subagents.length}</span>
        </h2>
        <label className="relative w-full sm:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            aria-label="Cari agen"
            placeholder="Cari nama, peran, atau tugas..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
          />
        </label>
      </div>
      <div aria-label="Filter status agen" className="mt-5 flex flex-wrap gap-2">
        {Object.entries({
          all: 'Semua',
          running: 'Berjalan',
          idle: 'Siap',
          completed: 'Selesai',
          stopped: 'Gagal / dihentikan'
        }).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilterChange(value)}
            className={`rounded-full px-4 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${filter === value ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white/75'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <div role="alert" className="py-10 text-sm">
          <p className="text-error">{error}</p>
          <button type="button" onClick={onRetry} className="btn btn-ghost mt-3 rounded-full">
            Coba lagi
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="py-12 text-sm text-white/45">
          Memuat agen...
        </p>
      ) : visible.length ? (
        <div className="mt-5 grid grid-cols-1 gap-x-12 md:grid-cols-2">
          {visible.map((agent) => {
            const status = agentStatus(agent.status)
            return (
              <Link
                key={agent.id}
                to={`/subagents/${encodeURIComponent(agent.id)}`}
                className="flex min-w-0 items-start gap-4 rounded-lg px-5 py-5 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10">
                  <Bot
                    size={25}
                    className={agent.status === 'running' ? 'text-primary' : 'text-white/50'}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-semibold text-white">{agent.name}</h3>
                  <p className="mt-1 line-clamp-1 text-xs text-white/40">
                    {agent.role || 'Spesialis tugas'}
                  </p>
                  <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-white/60">
                    {agent.goal || 'Belum ada tugas.'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className={`inline-flex items-center gap-1.5 ${status.color}`}>
                      {agent.status === 'running' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
                      )}
                      {status.label}
                    </span>
                    <span className="text-white/35">· {agent.turnCount || 0} langkah</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div role="status" className="py-12 text-sm leading-relaxed text-white/50">
          {subagents.length
            ? 'Tidak ada agen yang sesuai dengan pencarian atau filter ini.'
            : 'Belum ada sub-agent. Pilih Buat agen untuk memberikan tugas pertama.'}
        </div>
      )}
    </section>
  )
}
AgentSidebar.propTypes = {
  subagents: PropTypes.array.isRequired,
  query: PropTypes.string.isRequired,
  onQueryChange: PropTypes.func.isRequired,
  filter: PropTypes.string.isRequired,
  onFilterChange: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onRetry: PropTypes.func.isRequired
}
