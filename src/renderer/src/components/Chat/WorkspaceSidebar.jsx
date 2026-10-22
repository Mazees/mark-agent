/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react'
import { ArrowLeft, Folder, FolderPlus, Loader2, Plus, Search, Settings } from 'lucide-react'
import { groupWorkspaceSessions, isMainSession, workspaceKey } from '@shared/workspaces.js'
import SessionEditor from './SessionEditor.jsx'

export default function WorkspaceSidebar({
  sessions,
  defaultRoot,
  activeId,
  runningIds,
  loading,
  error,
  busy,
  onRetry,
  onClose,
  onSelect,
  onCreate,
  onAddWorkspace,
  onSave,
  onDelete
}) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [editing, setEditing] = useState(null)
  const grouped = useMemo(
    () => groupWorkspaceSessions(sessions, defaultRoot, query),
    [sessions, defaultRoot, query]
  )
  const allGroups = useMemo(
    () => groupWorkspaceSessions(sessions, defaultRoot),
    [sessions, defaultRoot]
  )
  const activeSession = sessions.find((s) => String(s.id) === String(activeId))
  const activeKey = workspaceKey(activeSession?.workspaceRoot)
  const running = (id) => runningIds.map(String).includes(String(id))
  const renderSession = (session) => {
    const main = isMainSession(session.id)
    const active = String(session.id) === String(activeId)
    return (
      <div
        key={session.id}
        className={`group/session flex items-center gap-1 rounded-lg ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
      >
        <button
          type="button"
          onClick={() => onSelect(session.id)}
          aria-current={active ? 'page' : undefined}
          className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-left"
        >
          <span className={`text-[13px] truncate ${active ? 'text-primary' : 'text-white/75'}`}>
            {main ? 'Main Thread' : session.title || 'Percakapan Baru'}
          </span>
          {running(session.id) && (
            <Loader2 size={13} className="shrink-0 animate-spin text-primary ml-auto" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(session)}
          title="Pengaturan percakapan"
          aria-label={`Pengaturan ${main ? 'Main Thread' : session.title || 'percakapan'}`}
          className="p-2 mr-1 text-white/40 hover:text-primary opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Settings size={14} />
        </button>
      </div>
    )
  }
  const general = grouped.general.some((s) => isMainSession(s.id))
    ? grouped.general
    : [{ id: '1', title: 'Main Thread' }, ...grouped.general]
  return (
    <>
      <aside className="w-80 max-w-[42vw] border-r border-white/10 bg-base-200/50 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Tutup Chat Studio"
            >
              <ArrowLeft size={19} />
            </button>
            <h2 className="text-sm font-semibold text-white">Chat Studio</h2>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
            />
            <input
              aria-label="Cari percakapan atau workspace"
              placeholder="Cari percakapan..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full h-9 pl-9 pr-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-white/80 placeholder:text-white/35 outline-none focus:border-primary/40 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 space-y-4">
          <section>
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-xs font-medium text-white/40">Percakapan Umum</h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => onCreate(null)}
                title="Percakapan baru"
                aria-label="Percakapan baru di Percakapan Umum"
                className="p-1 text-white/45 hover:text-primary disabled:opacity-30"
              >
                <Plus size={15} />
              </button>
            </div>
            {general.map(renderSession)}
          </section>
          <section>
            <h3 className="px-2 mb-2 text-xs font-medium text-white/40">Workspaces</h3>
            {grouped.workspaces.map((group) => {
              const expanded =
                !!query.trim() ||
                !collapsed[group.key]?.closed ||
                (group.key === activeKey && collapsed[group.key]?.activeId !== activeId)
              return (
                <div key={group.key} className="mb-2">
                  <div className="group/workspace flex items-center gap-1 rounded-lg hover:bg-white/5">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      title={group.root}
                      onClick={() =>
                        setCollapsed((prev) => ({
                          ...prev,
                          [group.key]: { closed: expanded, activeId }
                        }))
                      }
                      className="flex items-center gap-2 min-w-0 flex-1 p-2 text-xs text-white/65"
                    >
                      <Folder size={15} className="text-white/60 shrink-0" />
                      <span className="truncate">{group.name}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCreate(group.root)}
                      title={`Percakapan baru di ${group.name}`}
                      aria-label={`Percakapan baru di ${group.name}`}
                      className="p-2 text-white/40 hover:text-primary opacity-0 group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="ml-6 mt-0.5">{group.sessions.map(renderSession)}</div>
                  )}
                </div>
              )
            })}
            {!grouped.workspaces.length && !loading && (
              <p className="text-xs text-white/35 px-2 py-2">
                {query.trim()
                  ? 'Tidak ada workspace yang cocok.'
                  : 'Tambahkan folder untuk memulai workspace.'}
              </p>
            )}
            <button
              type="button"
              disabled={busy || !defaultRoot}
              onClick={onAddWorkspace}
              className="flex items-center gap-2 px-2 py-2 text-xs text-white/50 hover:text-primary disabled:opacity-30"
            >
              <FolderPlus size={14} />
              Tambah Workspace
            </button>
          </section>
          {loading && (
            <p role="status" className="px-2 text-xs text-white/40">
              Memuat daftar sesi...
            </p>
          )}
          {error && (
            <div role="alert" className="px-2 text-xs text-error">
              <p>{error}</p>
              <button type="button" onClick={onRetry} className="btn btn-ghost btn-xs mt-2">
                Coba lagi
              </button>
            </div>
          )}
        </div>
      </aside>
      {editing && (
        <SessionEditor
          key={editing.id}
          session={editing}
          defaultRoot={defaultRoot}
          workspaces={allGroups.workspaces}
          isRunning={running(editing.id)}
          onClose={() => setEditing(null)}
          onSave={(updates) => onSave(editing.id, updates)}
          onDelete={() => onDelete(editing.id)}
        />
      )}
    </>
  )
}
