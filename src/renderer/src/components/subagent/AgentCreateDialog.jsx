import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { X } from 'lucide-react'

export default function AgentCreateDialog({ subagents, onCreate, onClose, onOpenAgent }) {
  const dialog = useRef(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = subagents.find(
    (agent) =>
      agent.name.replace(/^@/, '').trim().toLowerCase() ===
      name.replace(/^@/, '').trim().toLowerCase()
  )

  useEffect(() => {
    const current = dialog.current
    current.showModal()
    return () => {
      if (current.open) current.close()
    }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (busy || existing) return
    if (!name.trim() || !goal.trim()) {
      setError('Isi nama dan tugas Minibot terlebih dahulu.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onCreate({
        name: name.trim(),
        role: role.trim() || 'Spesialis tugas',
        goal: goal.trim()
      })
    } catch (failure) {
      setError(failure.message || 'Minibot belum dapat dibuat. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="create-agent-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="modal-box max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-base-300 p-0 custom-scrollbar"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="create-agent-title" className="text-lg font-semibold text-white">
              Buat Minibot
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Berikan tugas khusus yang dapat dikerjakan Minibot secara mandiri.
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup formulir"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle shrink-0"
          >
            <X size={18} />
          </button>
        </header>
        <fieldset disabled={busy} className="space-y-5 px-6 py-6">
          <label className="block text-sm text-white/75">
            Nama Minibot
            <input
              name="agent-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contoh: Peneliti produk"
              className="input input-bordered mt-2 w-full rounded-lg bg-transparent text-sm"
            />
          </label>
          {existing && (
            <p className="text-sm leading-relaxed text-white/55">
              Nama ini sudah digunakan.{' '}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => onOpenAgent(existing.id)}
              >
                Buka Minibot tersebut
              </button>{' '}
              untuk melihat aktivitas atau memberi tugas baru.
            </p>
          )}
          <label className="block text-sm text-white/75">
            Peran <span className="text-white/35">(opsional)</span>
            <input
              name="agent-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Contoh: Riset dan perbandingan produk"
              className="input input-bordered mt-2 w-full rounded-lg bg-transparent text-sm"
            />
          </label>
          <label className="block text-sm text-white/75">
            Tugas
            <textarea
              name="agent-goal"
              required
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Jelaskan tujuan, batasan, dan hasil yang Anda perlukan."
              rows={5}
              className="textarea textarea-bordered mt-2 w-full rounded-lg bg-transparent text-sm leading-relaxed"
            />
          </label>
          <p className="text-xs leading-relaxed text-white/40">
            Minibot langsung mulai bekerja setelah dibuat. Progres dan hasilnya dapat dilihat pada tab
            Aktivitas.
          </p>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </fieldset>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost rounded-full"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy || !!existing || !name.trim() || !goal.trim()}
            className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
          >
            {busy ? 'Membuat Minibot...' : 'Buat dan mulai'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

AgentCreateDialog.propTypes = {
  subagents: PropTypes.array.isRequired,
  onCreate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenAgent: PropTypes.func.isRequired
}
