import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import PropTypes from 'prop-types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { agentDate } from './agentPresentation'
import AgentConfirmDialog from './AgentConfirmDialog'

export default function AgentInspector({ subagent, onDeleteAgent }) {
  const [deleting, setDeleting] = useState(false)
  const tools = Array.isArray(subagent.allowedTools) ? subagent.allowedTools : []
  const failed = subagent.status === 'failed'
  return (
    <section
      aria-label="Detail agen"
      className="min-h-0 flex-1 space-y-8 overflow-y-auto py-7 pb-10 custom-scrollbar"
    >
      <section aria-labelledby="agent-goal-title">
        <h2 id="agent-goal-title" className="mb-3 text-sm font-medium text-white/90">
          Tugas
        </h2>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">
          {subagent.goal || 'Belum ada tugas.'}
        </p>
      </section>
      {subagent.finalAnswer && (
        <section aria-labelledby="agent-result-title">
          <h2
            id="agent-result-title"
            className={`mb-3 text-sm font-medium ${failed ? 'text-error' : 'text-white/90'}`}
          >
            {failed
              ? 'Kendala eksekusi'
              : subagent.status === 'killed'
                ? 'Hasil terakhir sebelum dihentikan'
                : subagent.status === 'completed'
                  ? 'Hasil akhir'
                  : 'Hasil sebelumnya'}
          </h2>
          <div
            className={`break-words text-sm leading-relaxed [&_p+p]:mt-3 [&_a]:text-primary [&_a]:underline [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 ${failed ? 'text-error/80' : 'text-white/65'}`}
          >
            <Markdown remarkPlugins={[remarkGfm]}>
              {typeof subagent.finalAnswer === 'string'
                ? subagent.finalAnswer
                : JSON.stringify(subagent.finalAnswer, null, 2)}
            </Markdown>
          </div>
        </section>
      )}
      <section aria-labelledby="agent-information-title">
        <h2
          id="agent-information-title"
          className="border-b border-white/10 pb-3 text-sm font-medium text-white/90"
        >
          Informasi agen
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-4">
          <dt className="text-white/40">Peran</dt>
          <dd className="mb-2 break-words text-white/70 sm:mb-0">
            {subagent.role || 'Spesialis tugas'}
          </dd>
          <dt className="text-white/40">Sesi asal</dt>
          <dd className="mb-2 break-words text-white/70 sm:mb-0">
            {subagent.parentSessionTitle || 'Tidak tercatat'}
          </dd>
          <dt className="text-white/40">Dibuat</dt>
          <dd className="mb-2 text-white/70 sm:mb-0">{agentDate(subagent.createdAt)}</dd>
          <dt className="text-white/40">Terakhir diperbarui</dt>
          <dd className="text-white/70">{agentDate(subagent.updatedAt)}</dd>
        </dl>
      </section>
      <section aria-labelledby="agent-tools-title">
        <h2 id="agent-tools-title" className="mb-3 text-sm font-medium text-white/90">
          Akses tool
        </h2>
        {tools.includes('*') ? (
          <p className="text-sm leading-relaxed text-white/65">
            Menggunakan tool yang tersedia untuk sub-agent di Mark, sesuai batasan eksekusinya.
          </p>
        ) : tools.length ? (
          <ul className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <li
                key={tool}
                className="max-w-full break-all rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-white/65"
              >
                {tool}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/65">Mengikuti pengaturan tool bawaan sub-agent.</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          Browser bawaan memakai sesi terpisah untuk setiap agen. Tool filesystem, aplikasi, dan
          integrasi tetap berjalan melalui layanan Mark.
        </p>
      </section>
      <details className="text-xs text-white/40">
        <summary className="w-fit cursor-pointer rounded-md py-1 focus-visible:outline-2 focus-visible:outline-primary">
          Identitas teknis
        </summary>
        <p className="mt-3 break-all font-mono">{subagent.id}</p>
      </details>
      <div className="flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
        <p className="text-xs leading-relaxed text-white/40">
          Menghapus agen juga menghapus riwayatnya.
          {subagent.status === 'running' ? ' Tugas yang sedang berjalan akan dihentikan.' : ''}
        </p>
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="btn btn-ghost shrink-0 rounded-full text-error"
        >
          <Trash2 size={15} />
          Hapus agen
        </button>
      </div>
      {deleting && (
        <AgentConfirmDialog
          title="Hapus agen?"
          description={`Agen “${subagent.name}” dan seluruh riwayatnya akan dihapus.${subagent.status === 'running' ? ' Tugas yang sedang berjalan akan dihentikan.' : ''}`}
          action="Hapus agen"
          onConfirm={onDeleteAgent}
          onClose={() => setDeleting(false)}
        />
      )}
    </section>
  )
}
AgentInspector.propTypes = {
  subagent: PropTypes.object.isRequired,
  onDeleteAgent: PropTypes.func.isRequired
}
