import { Bot, ChevronRight } from 'lucide-react'
import PropTypes from 'prop-types'
import { agentStatus } from './agentPresentation'

export default function SubagentTopologyMap({ subagents, onOpenAgent, loading, error, onRetry }) {
  return (
    <section aria-labelledby="agent-topology-title" className="mt-9 pb-8">
      <h2 id="agent-topology-title" className="text-sm font-medium text-white/80">
        Topologi tim
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-white/45">
        Mark mendelegasikan tugas kepada agen berikut. Pilih agen untuk melihat aktivitas dan
        memberikan instruksi.
      </p>
      {error ? (
        <div role="alert" className="py-10 text-sm text-error">
          {error}
          <button type="button" onClick={onRetry} className="btn btn-ghost ml-3 rounded-full">
            Coba lagi
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="py-12 text-sm text-white/45">
          Memuat topologi...
        </p>
      ) : (
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 text-primary">
              <Bot size={25} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Mark</h3>
              <p className="mt-1 text-xs text-white/40">Agen utama</p>
            </div>
          </div>
          {subagents.length ? (
            <ul className="ml-6 border-l border-white/10 py-2">
              {subagents.map((agent) => {
                const status = agentStatus(agent.status)
                return (
                  <li
                    key={agent.id}
                    className="relative py-2 pl-6 before:absolute before:left-0 before:top-10 before:w-6 before:border-t before:border-white/10 sm:pl-8 sm:before:w-8"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenAgent(agent.id)}
                      className="flex w-full min-w-0 items-center gap-4 rounded-lg border border-white/10 px-4 py-4 text-left hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Bot size={20} className="shrink-0 text-white/40" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium text-white/90">
                          {agent.name}
                        </span>
                        <span className="mt-1 block line-clamp-1 text-xs text-white/40">
                          {agent.role || 'Spesialis tugas'}
                        </span>
                        <span className={`mt-2 block text-xs ${status.color}`}>{status.label}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-white/35" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p role="status" className="mt-8 text-sm text-white/45">
              Belum ada sub-agent dalam tim. Buat agen untuk memulai.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
SubagentTopologyMap.propTypes = {
  subagents: PropTypes.array.isRequired,
  onOpenAgent: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onRetry: PropTypes.func.isRequired
}
