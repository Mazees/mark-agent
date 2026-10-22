/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { Folder, FolderPlus, X } from 'lucide-react'
import { isMainSession, workspaceKey, workspaceName } from '@shared/workspaces.js'
import { webApi } from '../../api/web-bridge.js'

export default function SessionEditor({
  session,
  workspaces,
  defaultRoot,
  isRunning,
  onClose,
  onSave,
  onDelete
}) {
  const locked = isMainSession(session.id)
  const [title, setTitle] = useState(session.title || 'Percakapan Baru')
  const [root, setRoot] = useState(locked ? defaultRoot : session.workspaceRoot || null)
  const [showWorkspaces, setShowWorkspaces] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const busyRef = useRef(false)
  const dialogRef = useRef(null)
  const effectiveRoot = root || defaultRoot

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    return () => {
      dialog.close()
      previousFocus?.focus()
    }
  }, [])

  const perform = async (action) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e.message || 'Perubahan belum dapat disimpan.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const pickFolder = () =>
    perform(async () => {
      const selected = await webApi.selectDirectory()
      if (selected) {
        setRoot(workspaceKey(selected) === workspaceKey(defaultRoot) ? null : selected)
        setShowWorkspaces(false)
      }
    })

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      className="modal bg-black/50"
      aria-labelledby="session-editor-title"
    >
      <form
        className="modal-box bg-base-200 border border-white/10 max-w-lg p-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!locked && !confirmDelete && title.trim())
            perform(async () => {
              await onSave({ title: title.trim(), ...(isRunning ? {} : { workspaceRoot: root }) })
              onClose()
            })
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="session-editor-title" className="text-lg font-semibold text-white">
            Edit percakapan
          </h2>
          <button
            type="button"
            aria-label="Tutup pengaturan"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
          >
            <X size={18} />
          </button>
        </div>
        <label className="block text-xs text-white/60 mb-2" htmlFor="session-editor-name">
          Judul percakapan
        </label>
        <input
          id="session-editor-name"
          autoFocus
          value={locked ? 'Main Thread' : title}
          readOnly={locked}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          className="input w-full bg-base-300 border-white/15 focus:border-primary text-sm mb-5"
        />
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/60">Workspace</span>
          {!locked && (
            <button
              type="button"
              disabled={busy || isRunning || !defaultRoot}
              onClick={() => setShowWorkspaces(!showWorkspaces)}
              className="btn btn-ghost btn-xs text-primary"
              aria-expanded={showWorkspaces}
            >
              Ubah workspace
            </button>
          )}
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-base-300/60">
          <Folder size={18} className="text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm text-white">
              {!root || workspaceKey(root) === workspaceKey(defaultRoot)
                ? 'Percakapan Umum'
                : workspaceName(root)}
            </div>
            <p className="text-xs text-white/45 break-all mt-1">
              {effectiveRoot || 'Memuat lokasi folder...'}
            </p>
          </div>
        </div>
        {locked && (
          <p className="text-xs text-white/45 mt-2">
            Folder Main Thread tetap menggunakan Mark Workspace.
          </p>
        )}
        {isRunning && !locked && (
          <p className="text-xs text-white/45 mt-2">
            Workspace dapat diubah setelah proses percakapan selesai.
          </p>
        )}
        {showWorkspaces && !locked && !isRunning && (
          <div className="mt-2 border border-white/10 rounded-xl overflow-hidden">
            <div className="max-h-52 overflow-y-auto p-1" role="group" aria-label="Pilih workspace">
              {[{ root: null, name: 'Percakapan Umum', key: 'general' }, ...workspaces].map(
                (item) => {
                  const selected =
                    workspaceKey(item.root) === workspaceKey(root) ||
                    (!item.root && workspaceKey(root) === workspaceKey(defaultRoot))
                  return (
                    <button
                      type="button"
                      key={item.key}
                      disabled={busy}
                      onClick={() => {
                        setRoot(item.root)
                        setShowWorkspaces(false)
                      }}
                      aria-pressed={selected}
                      title={item.root || defaultRoot}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 ${selected ? 'text-primary bg-primary/10' : 'text-white/70'}`}
                    >
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-[11px] text-white/40 truncate">
                        {item.root || defaultRoot}
                      </span>
                    </button>
                  )
                }
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={pickFolder}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-primary hover:bg-white/5 border-t border-white/10"
            >
              <FolderPlus size={16} />
              Tambah folder
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-error mt-3">
            {error}
          </p>
        )}
        {confirmDelete && (
          <div className="mt-4 text-sm text-white/75" role="status">
            <p>Hapus percakapan ini? Folder dan berkasnya tetap tersimpan.</p>
          </div>
        )}
        <div className="flex justify-between items-center gap-2 mt-6">
          {!locked && !confirmDelete ? (
            <button
              type="button"
              disabled={busy || isRunning}
              onClick={() => setConfirmDelete(true)}
              className="btn btn-ghost btn-sm text-error"
            >
              Hapus percakapan
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => (confirmDelete ? setConfirmDelete(false) : onClose())}
              className="btn btn-ghost btn-sm"
            >
              {locked ? 'Tutup' : 'Batal'}
            </button>
            {confirmDelete ? (
              <button
                type="button"
                disabled={busy || isRunning}
                onClick={() =>
                  perform(async () => {
                    await onDelete()
                    onClose()
                  })
                }
                className="btn btn-error btn-sm"
              >
                {busy ? 'Menghapus...' : 'Hapus'}
              </button>
            ) : (
              !locked && (
                <button
                  type="submit"
                  disabled={busy || !title.trim() || !defaultRoot}
                  className="btn btn-primary btn-sm"
                >
                  {busy ? 'Menyimpan...' : 'Simpan'}
                </button>
              )
            )}
          </div>
        </div>
      </form>
    </dialog>
  )
}
