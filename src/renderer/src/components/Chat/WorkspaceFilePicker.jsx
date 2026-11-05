/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { Folder, FileText, ChevronRight, X, Search } from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
function Entries({ entries, sessionId, onOpen, documents, search }) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <Entry key={entry.path} entry={entry} {...{ sessionId, onOpen, documents, search }} />
      ))}
    </ul>
  )
}
function Entry({ entry, sessionId, onOpen, documents, search }) {
  const [children, setChildren] = useState(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState('')
  const expand = async () => {
    setOpen(!open)
    if (!children)
      try {
        setChildren(
          (await webApi.codingRequest('/workspace/tree', sessionId, { directory: entry.path }))
            .entries
        )
      } catch (e) {
        setError(e.message)
      }
  }
  return (
    <li>
      <button
        type="button"
        disabled={!entry.directory && documents && !entry.document}
        onClick={() => (entry.directory ? expand() : onOpen(entry))}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5 disabled:opacity-35"
      >
        {entry.directory ? (
          <>
            <ChevronRight size={12} className={open ? 'rotate-90' : ''} />
            <Folder size={15} />
          </>
        ) : (
          <FileText size={15} className="ml-5 shrink-0 text-white/45" />
        )}
        <span className="min-w-0 break-all">{search ? entry.path : entry.name}</span>
      </button>
      {error && (
        <p role="alert" className="px-3 text-error">
          {error}
        </p>
      )}
      {open && (
        <div className="ml-4 border-l border-white/5 pl-1">
          {children ? (
            <Entries entries={children} {...{ sessionId, onOpen, documents, search }} />
          ) : (
            <p className="p-2 text-white/45">Memuat…</p>
          )}
        </div>
      )}
    </li>
  )
}
export default function WorkspaceFilePicker({ sessionId, documents, onOpen, onClose }) {
  const dialog = useRef(null),
    input = useRef(null)
  const [search, setSearch] = useState(''),
    [entries, setEntries] = useState(null),
    [error, setError] = useState(''),
    [limited, setLimited] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    input.current.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    let disposed = false
    const timer = setTimeout(
      () =>
        webApi
          .codingRequest('/workspace/tree', sessionId, { search })
          .then((value) => {
            if (!disposed) {
              setEntries(value.entries)
              setLimited(value.limited)
              setError('')
            }
          })
          .catch((e) => {
            if (!disposed) setError(e.message)
          }),
      180
    )
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [sessionId, search])
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="m-auto max-h-[80dvh] w-[min(92vw,640px)] overflow-hidden rounded-2xl border border-white/10 bg-base-200 p-0 text-sm text-base-content shadow-xl backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between p-4">
        <h2 className="font-medium">{documents ? 'Buka dokumen' : 'Buka berkas workspace'}</h2>
        <button type="button" onClick={onClose} aria-label="Tutup pemilih berkas" className="p-1">
          <X size={18} />
        </button>
      </div>
      <div className="mx-4 flex items-center gap-2 rounded-lg border border-white/15 px-3">
        <Search size={15} className="text-white/40" />
        <input
          ref={input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau lokasi berkas…"
          aria-label="Cari berkas workspace"
          className="w-full bg-transparent py-2.5 outline-none"
        />
      </div>
      <div className="mt-3 max-h-[55dvh] overflow-y-auto px-3 pb-4 text-xs">
        {error ? (
          <p role="alert" className="p-3 text-error">
            {error}
          </p>
        ) : entries ? (
          <Entries
            key={search}
            entries={entries}
            {...{ sessionId, documents, search }}
            onOpen={(entry) => {
              onOpen(entry)
              onClose()
            }}
          />
        ) : (
          <p role="status" className="p-3 text-white/50">
            Memuat workspace…
          </p>
        )}
        {entries?.length === 0 && (
          <p className="p-3 text-white/50">Tidak ada berkas yang sesuai.</p>
        )}
        {limited && (
          <p className="p-3 text-white/50">
            Menampilkan 200 hasil pertama. Persempit pencarian untuk hasil lainnya.
          </p>
        )}
      </div>
    </dialog>
  )
}
