/* eslint-disable react/prop-types */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Plus,
  Globe,
  FileText,
  FileDiff,
  SquareTerminal,
  BookOpen,
  Maximize2,
  Minimize2,
  Square
} from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
import { browserSessionId } from '../../api/browser-panel.js'
import BrowserPanel from '../BrowserPanel.jsx'
import WorkspaceFilePicker from './WorkspaceFilePicker.jsx'
const Editor = lazy(() => import('./WorkspaceEditor.jsx'))
const Diff = lazy(() => import('./WorkspaceDiff.jsx'))
const Document = lazy(() => import('./WorkspaceDocument.jsx'))
const Terminal = lazy(() => import('./WorkspaceTerminal.jsx'))
const icons = {
  browser: Globe,
  editor: FileText,
  diff: FileDiff,
  document: BookOpen,
  terminal: SquareTerminal
}
const basename = (value = '') => value.split(/[\\/]/).pop()
export default function CodingPanel({
  sessionId,
  request,
  onClose,
  narrow,
  expanded,
  onExpand,
  onResume
}) {
  const [panel, setPanel] = useState(null),
    [error, setError] = useState(''),
    [menu, setMenu] = useState(false),
    [picker, setPicker] = useState(null),
    [dirty, setDirty] = useState({}),
    [closing, setClosing] = useState(null),
    [busy, setBusy] = useState(false),
    [terminals, setTerminals] = useState([])
  const actions = useRef(new Map()),
    strip = useRef(null),
    menuRef = useRef(null),
    previousRequest = useRef(null),
    queue = useRef(Promise.resolve()),
    state = useRef(null),
    dialog = useRef(null)
  state.current = panel
  const register = useCallback((id, value) => {
    if (value) actions.current.set(id, value)
    else actions.current.delete(id)
  }, [])
  const onDirty = useCallback(
    (id, value) =>
      setDirty((previous) => (previous[id] === value ? previous : { ...previous, [id]: value })),
    []
  )
  const persist = useCallback(
    (next) => {
      setPanel(next)
      queue.current = queue.current
        .catch(() => {})
        .then(() => webApi.codingRequest('/workspace/panel', sessionId, next, 'POST'))
        .catch((e) => setError(`Tab belum tersimpan: ${e.message}`))
    },
    [sessionId]
  )
  useEffect(() => {
    let disposed = false
    webApi
      .codingRequest('/workspace/panel', sessionId)
      .then((value) => {
        if (!disposed) setPanel(value)
      })
      .catch((e) => {
        if (!disposed) setError(e.message)
      })
    return () => {
      disposed = true
    }
  }, [sessionId])
  const refreshTerminals = useCallback(
    () =>
      webApi
        .codingRequest('/terminals', sessionId)
        .then((values) => setTerminals(values.filter((t) => t.interactive))),
    [sessionId]
  )
  useEffect(() => {
    let disposed = false
    const update = () =>
      webApi
        .codingRequest('/terminals', sessionId)
        .then((values) => {
          if (!disposed) setTerminals(values.filter((t) => t.interactive))
        })
        .catch((e) => {
          if (!disposed) setError(e.message)
        })
    update()
    const off = webApi.onCodingUpdate((event) => {
      if (String(event.sessionId) === String(sessionId)) update()
    })
    return () => {
      disposed = true
      off()
    }
  }, [sessionId])
  const openTab = useCallback(
    (tab) => {
      const current = state.current
      if (!current) return
      persist({
        ...current,
        tabs: current.tabs.some((item) => item.id === tab.id)
          ? current.tabs
          : [...current.tabs, tab],
        activeId: tab.id
      })
      setMenu(false)
    },
    [persist]
  )
  useEffect(() => {
    if (!panel || !request || request === previousRequest.current || (request.sessionId && String(request.sessionId) !== String(sessionId))) return
    previousRequest.current = request
    if (request.type === 'diff' && request.path && request.runId)
      openTab({
        type: 'diff',
        id: `diff:${request.runId}:${request.path}`,
        path: request.path,
        runId: request.runId
      })
    else if (request.type === 'browser') persist({ ...state.current, activeId: 'browser' })
  }, [panel, request, openTab, persist, sessionId])
  useEffect(() => {
    if (!menu) return
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])
  useEffect(() => {
    if (closing) dialog.current?.showModal()
  }, [closing])
  const select = (id) => persist({ ...state.current, activeId: id })
  const remove = (id) => {
    const current = state.current,
      index = current.tabs.findIndex((tab) => tab.id === id),
      tabs = current.tabs.filter((tab) => tab.id !== id)
    persist({
      ...current,
      tabs,
      activeId:
        current.activeId === id ? tabs[Math.max(0, index - 1)]?.id || 'browser' : current.activeId
    })
    setClosing(null)
  }
  const closeTab = (id) => (dirty[id] ? setClosing(id) : remove(id))
  const newTerminal = async () => {
    setBusy(true)
    setMenu(false)
    try {
      const value = await webApi.codingRequest('/terminals', sessionId, {}, 'POST')
      await refreshTerminals()
      openTab({ type: 'terminal', id: `terminal:${value.id}`, terminalId: value.id })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const tabs = [{ id: 'browser', type: 'browser' }, ...(panel?.tabs || [])]
  const active = tabs.find((tab) => tab.id === panel?.activeId) || tabs[0]
  const terminal = terminals.find((item) => item.id === active.terminalId)
  const title = (tab) =>
    tab.type === 'browser'
      ? 'Browser'
      : tab.type === 'terminal'
        ? `Terminal ${Math.max(1, terminals.findIndex((t) => t.id === tab.terminalId) + 1)}`
        : basename(tab.path)
  const keyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === active.id)
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    select(tabs[target].id)
    strip.current?.querySelectorAll('[role="tab"]')[target]?.focus()
  }
  const closeEditor = async (save) => {
    setBusy(true)
    try {
      const action = actions.current.get(closing)
      if (!action) throw new Error('Editor belum siap.')
      await (save ? action.save() : action.discard())
      remove(closing)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col bg-base-100 text-sm [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-primary [&_button:focus-visible]:outline-offset-[-2px]"
      aria-label="Workspace"
    >
      <header className="flex min-h-12 min-w-0 items-center gap-1 border-b border-white/10 px-2">
        <div
          ref={strip}
          role="tablist"
          aria-label="Tab workspace"
          onKeyDown={keyboard}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5 custom-scrollbar"
        >
          {tabs.map((tab) => {
            const Icon = icons[tab.type]
            return (
              <div
                key={tab.id}
                className={`flex max-w-56 shrink-0 items-center rounded-lg ${active.id === tab.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active.id === tab.id}
                  tabIndex={active.id === tab.id ? 0 : -1}
                  title={tab.path || title(tab)}
                  onClick={() => select(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' && tab.id !== 'browser') closeTab(tab.id)
                  }}
                  className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-xs"
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="truncate">{title(tab)}</span>
                  {dirty[tab.id] && (
                    <span
                      aria-label="Belum disimpan"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </button>
                {tab.id !== 'browser' && (
                  <button
                    type="button"
                    aria-label={`Tutup ${title(tab)}`}
                    onClick={() => closeTab(tab.id)}
                    className="mr-1 rounded p-1 hover:bg-white/10"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            disabled={busy || !panel}
            aria-label="Tambah tab workspace"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            className="rounded-lg p-2 hover:bg-white/5 disabled:opacity-30"
          >
            <Plus size={17} />
          </button>
          {menu && (
            <div
              role="menu"
              aria-label="Tambah tab"
              onKeyDown={(e) => {
                const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')]
                if (e.key === 'Escape') {
                  setMenu(false)
                  menuRef.current.querySelector('button').focus()
                }
                if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                  e.preventDefault()
                  items[
                    (items.indexOf(document.activeElement) +
                      (e.key === 'ArrowDown' ? 1 : -1) +
                      items.length) %
                      items.length
                  ]?.focus()
                }
              }}
              className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-white/10 bg-base-200 p-1.5 text-xs shadow-xl"
            >
              {[
                ['Buka berkas', FileText, () => setPicker('editor')],
                ['Buka dokumen', BookOpen, () => setPicker('document')],
                ['Terminal baru', SquareTerminal, newTerminal]
              ].map(([label, Icon, action]) => (
                <button
                  role="menuitem"
                  type="button"
                  key={label}
                  onClick={() => {
                    setMenu(false)
                    action()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
              {terminals
                .filter(
                  (t) =>
                    ['running', 'starting'].includes(t.status) &&
                    !panel.tabs.some((tab) => tab.terminalId === t.id)
                )
                .map((t, i) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={t.id}
                    onClick={() =>
                      openTab({ type: 'terminal', id: `terminal:${t.id}`, terminalId: t.id })
                    }
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                  >
                    Buka terminal aktif {i + 1}
                  </button>
                ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={expanded ? 'Perkecil panel' : 'Perbesar panel'}
          onClick={onExpand}
          className="hidden rounded p-2 text-white/45 hover:bg-white/5 sm:block"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          aria-label={narrow ? 'Kembali ke percakapan' : 'Tutup panel workspace'}
          onClick={onClose}
          className="rounded p-2 text-white/45 hover:bg-white/5"
        >
          <X size={16} />
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-error/20 p-3 text-xs text-error"
        >
          <p className="min-w-0 flex-1 break-words">{error}</p>
          <button type="button" aria-label="Tutup pesan kesalahan" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {!panel ? (
        <p role="status" className="p-5 text-xs text-white/50">
          {error ? 'Panel belum dapat dimuat.' : 'Memuat tab workspace…'}
        </p>
      ) : (
        <>
          {active.path && (
            <div
              title={`${panel.root}/${active.path}`}
              className="truncate border-b border-white/5 px-3 py-2 text-xs text-white/50"
            >
              {panel.root} / {active.path}
              {active.type === 'diff' && (
                <span className="ml-2 text-white/35">· Diff giliran · hanya baca</span>
              )}
            </div>
          )}
          <Suspense
            fallback={
              <p role="status" className="p-4 text-xs text-white/50">
                Memuat penampil…
              </p>
            }
          >
            {panel.tabs
              .filter((t) => t.type === 'editor')
              .map((tab) => (
                <div
                  key={tab.id}
                  hidden={active.id !== tab.id}
                  className={`${active.id === tab.id ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}
                >
                  <Editor {...{ tab, sessionId, onDirty, register }} />
                </div>
              ))}
            {active.type === 'browser' && (
              <div className="min-h-0 flex-1">
                <BrowserPanel
                  sessionId={browserSessionId(sessionId)}
                  onClose={onClose}
                  expanded={expanded || narrow}
                  onExpand={onExpand}
                  onResume={onResume}
                />
              </div>
            )}
            {active.type === 'diff' && (
              <div className="min-h-0 flex-1">
                <Diff key={active.id} tab={active} sessionId={sessionId} />
              </div>
            )}
            {active.type === 'document' && (
              <div className="min-h-0 flex-1">
                <Document key={active.id} tab={active} sessionId={sessionId} />
              </div>
            )}
            {active.type === 'terminal' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-xs text-white/50">
                  <span className="min-w-0 flex-1 truncate" title={terminal?.root}>
                    {terminal?.root || panel.root} · {terminal?.status || 'Terminal tidak tersedia'}
                  </span>
                  <button
                    type="button"
                    disabled={!terminal || !['running', 'starting'].includes(terminal.status)}
                    onClick={() =>
                      webApi
                        .codingRequest(
                          `/terminals/${encodeURIComponent(terminal.id)}/stop`,
                          sessionId,
                          {},
                          'POST'
                        )
                        .then(refreshTerminals)
                        .catch((e) => setError(e.message))
                    }
                    className="inline-flex items-center gap-1 text-error disabled:opacity-30"
                  >
                    <Square size={12} />
                    Hentikan
                  </button>
                </div>
                {terminal ? (
                  <Terminal key={terminal.id} terminal={terminal} sessionId={sessionId} />
                ) : (
                  <p className="p-4 text-xs text-white/50">
                    Sesi terminal ini sudah berakhir. Gunakan + untuk membuat terminal baru.
                  </p>
                )}
              </div>
            )}
          </Suspense>
        </>
      )}
      {picker && (
        <WorkspaceFilePicker
          {...{ sessionId }}
          documents={picker === 'document'}
          onClose={() => setPicker(null)}
          onOpen={(entry) =>
            openTab({
              type: entry.document ? 'document' : 'editor',
              id: `${entry.document ? 'document' : 'editor'}:${entry.path}`,
              path: entry.path
            })
          }
        />
      )}
      {closing && (
        <dialog
          ref={dialog}
          onCancel={() => setClosing(null)}
          className="m-auto w-[min(90vw,400px)] rounded-xl border border-white/10 bg-base-200 p-5 text-sm text-base-content backdrop:bg-black/60"
        >
          <h2 className="font-medium">Simpan perubahan sebelum menutup?</h2>
          <p className="mt-2 break-all text-xs text-white/55">
            {panel.tabs.find((tab) => tab.id === closing)?.path}
          </p>
          <div className="mt-5 flex justify-end gap-3 text-xs">
            <button type="button" disabled={busy} onClick={() => setClosing(null)}>
              Batal
            </button>
            <button type="button" disabled={busy} onClick={() => closeEditor(false)}>
              Buang
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-2 text-primary-content"
              onClick={() => closeEditor(true)}
            >
              Simpan
            </button>
          </div>
        </dialog>
      )}
    </section>
  )
}
