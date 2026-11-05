/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Plus,
  Square,
  RefreshCw,
  ArrowUpRight,
  FileDiff,
  SquareTerminal,
  Globe
} from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
import { browserCommand, browserSessionId } from '../../api/browser-panel.js'
import BrowserPanel from '../BrowserPanel.jsx'
import CodingChanges from './CodingChanges.jsx'
import '@xterm/xterm/css/xterm.css'

const TERMINAL_FONT = 'Consolas, "Courier New", monospace'
const statusText = {
  passed: 'Lolos',
  failed: 'Gagal',
  not_checked: 'Belum diperiksa',
  running: 'Berjalan',
  completed: 'Selesai',
  stopped: 'Dihentikan',
  waiting: 'Menunggu bantuan',
  interrupted: 'Terputus',
  starting: 'Memulai',
  not_applicable: 'Tidak berlaku'
}
function TerminalView({ terminal, sessionId }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false,
      term,
      observer,
      subscriptions = [],
      sequence = 0,
      connecting = true,
      writable = false,
      pending = []
    const show = (chunk) => {
      if (chunk.sequence > sequence) {
        if (!connecting && chunk.sequence > sequence + 1) {
          pending.push(chunk)
          void connect()
          return
        }
        term.write(chunk.data)
        sequence = chunk.sequence
      }
    }
    const connect = async () => {
      connecting = true
      try {
        const state = await webApi.terminalRequest(terminal.id, sessionId, 'subscribe', {
          afterSequence: sequence
        })
        if (disposed) return
        writable = state.status === 'running'
        term.options.disableStdin = !writable
        if (state.truncated) term.writeln('\r\n[Bagian log lama sudah keluar dari buffer.]\r\n')
        for (const chunk of state.chunks) show(chunk)
        for (const chunk of pending.sort((a, b) => a.sequence - b.sequence)) show(chunk)
        pending = []
        connecting = false
        setError('')
      } catch (e) {
        if (!disposed) setError(e.message)
      }
    }
    ;(async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit')
      ])
      if (disposed) return
      term = new Terminal({
        fontSize: 12,
        fontFamily: TERMINAL_FONT,
        scrollback: 3000,
        theme: { background: '#100d0d', foreground: '#d4d4d4' }
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(container.current)
      const send = (action, values) =>
        webApi.terminalRequest(terminal.id, sessionId, action, values).catch((e) => {
          if (!disposed) setError(e.message)
        })
      subscriptions.push(
        webApi.onTerminal('output', (chunk) => {
          if (chunk.terminalId === terminal.id) {
            if (connecting) pending.push(chunk)
            else show(chunk)
          }
        })
      )
      subscriptions.push(
        webApi.onTerminal('exit', (event) => {
          if (event.terminalId === terminal.id) {
            writable = false
            term.options.disableStdin = true
            void connect()
            term.writeln(
              `\r\n[${statusText[event.status] || event.status}; exit ${event.exitCode ?? '-'}]\r\n`
            )
          }
        })
      )
      subscriptions.push(
        webApi.onTerminal('state', (event) => {
          if (event.terminalId === terminal.id) {
            writable = event.status === 'running'
            term.options.disableStdin = !writable
            setError('')
          }
        })
      )
      subscriptions.push(webApi.onBrowserReconnect(connect))
      const input = term.onData((data) => send('input', { data }))
      subscriptions.push(() => input.dispose())
      observer = new ResizeObserver(() => {
        if (container.current?.clientWidth) {
          fit.fit()
          if (writable) send('resize', { cols: term.cols, rows: term.rows })
        }
      })
      await connect()
      if (disposed) return
      fit.fit()
      if (writable) send('resize', { cols: term.cols, rows: term.rows })
      observer.observe(container.current)
    })().catch((e) => {
      if (!disposed) setError(e.message)
    })
    return () => {
      disposed = true
      for (const off of subscriptions) off()
      observer?.disconnect()
      term?.dispose()
      webApi.terminalRequest(terminal.id, sessionId, 'unsubscribe').catch(() => {})
    }
  }, [terminal.id, sessionId])
  return (
    <div className="flex flex-col min-h-0 h-full">
      {error && (
        <p role="alert" className="p-3 text-xs text-error">
          {error}
        </p>
      )}
      <div
        ref={container}
        className="mark-terminal flex-1 min-h-0 p-2"
        style={{ '--mark-terminal-font': TERMINAL_FONT }}
        aria-label="Terminal interaktif"
      />
    </div>
  )
}
export default function CodingPanel({
  sessionId,
  tab,
  onTab,
  onClose,
  narrow,
  expanded,
  onExpand,
  onResume,
  onWorkspaceChange,
  sessionBusy,
  selectedRunId
}) {
  const [runs, setRuns] = useState([]),
    [terminals, setTerminals] = useState([]),
    [project, setProject] = useState(null)
  const [scope, setScope] = useState('latest'),
    [workspaceDiff, setWorkspaceDiff] = useState(null),
    [diff, setDiff] = useState(null)
  const [terminalId, setTerminalId] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [runId, setRunId] = useState(selectedRunId || null)
  useEffect(() => {
    setRunId(selectedRunId || null)
    setScope('latest')
    setDiff(null)
  }, [selectedRunId])
  const generation = useRef(0)
  const autoTerminalRequested = useRef(false)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const [nextRuns, nextTerminals, nextProject, nextDiff] = await Promise.all([
        webApi.codingRequest('/coding/runs', sessionId),
        webApi.codingRequest('/terminals', sessionId),
        webApi.codingRequest('/workspace/context', sessionId, {}, 'POST'),
        webApi.codingRequest('/coding/workspace-diff', sessionId)
      ])
      if (current !== generation.current) return
      setRuns(nextRuns)
      setTerminals(nextTerminals)
      setProject(nextProject)
      setWorkspaceDiff(nextDiff)
      setTerminalId((id) =>
        nextTerminals.some((t) => t.id === id) ? id : nextTerminals[0]?.id || null
      )
    } catch (e) {
      if (current === generation.current) setError(e.message)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [sessionId])
  useEffect(() => {
    setRuns([])
    setDiff(null)
    setTerminalId(null)
    setLoading(true)
    setError('')
    refresh()
    let timer
    const off = webApi.onCodingUpdate((event) => {
      if (String(event.sessionId) === String(sessionId)) {
        clearTimeout(timer)
        timer = setTimeout(refresh, 100)
      }
    })
    const reconnect = webApi.onBrowserReconnect(refresh)
    const workspaceChanged = (event) => {
      if (String(event.detail?.sessionId) === String(sessionId)) {
        setDiff(null)
        refresh()
      }
    }
    window.addEventListener('coding-workspace-changed', workspaceChanged)
    return () => {
      generation.current = -1
      clearTimeout(timer)
      off()
      reconnect()
      window.removeEventListener('coding-workspace-changed', workspaceChanged)
    }
  }, [refresh, sessionId])
  const projectReady = Boolean(project)
  useEffect(() => {
    if (
      tab !== 'terminal' ||
      loading ||
      !projectReady ||
      terminals.length ||
      autoTerminalRequested.current
    )
      return
    autoTerminalRequested.current = true
    let disposed = false
    setBusy(true)
    webApi
      .codingRequest('/terminals', sessionId, { onlyIfEmpty: true }, 'POST')
      .then(async (terminal) => {
        if (!disposed) setTerminalId(terminal.id)
        await refresh()
      })
      .catch((error) => {
        if (!disposed) setError(error.message)
      })
      .finally(() => setBusy(false))
    return () => {
      disposed = true
    }
  }, [tab, loading, projectReady, terminals.length, sessionId, refresh])
  const act = async (action) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const latest = runId ? runs.find((run) => run.id === runId) : runs[0],
    files = scope === 'latest' ? latest?.files || [] : workspaceDiff?.files || []
  const terminal = terminals.find((t) => t.id === terminalId)
  const openDiff = (file) =>
    act(async () => {
      const result =
        scope === 'latest'
          ? await webApi.codingRequest(
              `/coding/runs/${encodeURIComponent(latest.id)}/diff`,
              sessionId,
              { path: file.path }
            )
          : await webApi.codingRequest('/coding/workspace-diff', sessionId, { path: file.path })
      setDiff(result)
    })
  const preview = (process, url) =>
    act(async () => {
      const ready = await webApi.codingRequest(
        `/terminals/${encodeURIComponent(process.id)}/preview`,
        sessionId,
        { url },
        'POST'
      )
      if (!ready.ready) throw new Error(`Preview belum siap (HTTP ${ready.status}).`)
      await browserCommand(browserSessionId(sessionId), 'navigate', { url: ready.url })
      onTab('browser')
    })
  const undo = (filePath) =>
    act(async () => {
      await webApi.codingRequest(
        `/coding/runs/${encodeURIComponent(latest.id)}/undo`,
        sessionId,
        filePath ? { path: filePath } : {},
        'POST'
      )
      setDiff(null)
    })
  const changeWorktree = () =>
    act(async () => {
      await webApi.codingRequest(
        project?.worktree?.active ? '/coding/worktree/return' : '/coding/worktree',
        sessionId,
        {},
        'POST'
      )
      setDiff(null)
      onWorkspaceChange?.()
    })
  return (
    <aside
      className="h-full min-h-0 flex flex-col bg-base-300 border-l border-white/10 text-sm [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-primary [&_button:focus-visible]:outline-offset-2"
      aria-label="Workspace coding"
    >
      <div className="flex items-center gap-1 border-b border-white/10 p-2 shrink-0">
        <div
          role="tablist"
          aria-label="Panel workspace"
          className="flex gap-1 flex-1 min-w-0"
          onKeyDown={(event) => {
            const tabs = [...event.currentTarget.querySelectorAll('[role=tab]')],
              current = tabs.indexOf(document.activeElement)
            const next =
              event.key === 'ArrowRight'
                ? (current + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (current + tabs.length - 1) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : null
            if (next != null) {
              event.preventDefault()
              tabs[next].focus()
              tabs[next].click()
            }
          }}
        >
          {[
            ['changes', 'Perubahan', FileDiff],
            ['terminal', 'Terminal', SquareTerminal],
            ['browser', 'Browser', Globe]
          ].map(([id, label, Icon]) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-label={label}
              tabIndex={tab === id ? 0 : -1}
              key={id}
              onClick={() => onTab(id)}
              className={`min-w-0 flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs ${tab === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
            >
              <Icon size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Muat ulang workspace"
          onClick={refresh}
          className="p-2 text-white/50"
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          aria-label="Tutup panel workspace"
          onClick={onClose}
          className="p-2 text-white/50"
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="p-3 text-xs text-error break-words">
          {error}
        </p>
      )}
      {tab === 'browser' ? (
        <div className="flex-1 min-h-0">
          <BrowserPanel
            sessionId={browserSessionId(sessionId)}
            onClose={onClose}
            expanded={expanded || narrow}
            onExpand={onExpand}
            onResume={onResume}
          />
        </div>
      ) : (
        <>
          {tab === 'terminal' ? (
            <>
              <div className="flex gap-2 items-center p-2 border-b border-white/5">
                <select
                  aria-label="Pilih terminal"
                  className="select select-sm flex-1 min-w-0 text-xs bg-base-200"
                  value={terminalId || ''}
                  onChange={(e) => setTerminalId(e.target.value)}
                >
                  {!terminals.length && <option value="">Belum ada terminal</option>}
                  {terminals.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.interactive ? 'PowerShell' : t.command.slice(0, 50)} ·{' '}
                      {statusText[t.status] || t.status}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Terminal baru"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const t = await webApi.codingRequest('/terminals', sessionId, {}, 'POST')
                      setTerminalId(t.id)
                    })
                  }
                  className="p-2"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  title="Hentikan proses"
                  disabled={busy || !['running', 'starting'].includes(terminal?.status)}
                  onClick={() =>
                    act(() =>
                      webApi.codingRequest(
                        `/terminals/${encodeURIComponent(terminal.id)}/stop`,
                        sessionId,
                        {},
                        'POST'
                      )
                    )
                  }
                  className="p-2 disabled:opacity-30"
                >
                  <Square size={14} />
                </button>
              </div>
              {terminal?.urls?.length > 0 && (
                <div className="p-2 space-y-1">
                  {terminal.urls.map((url) => (
                    <button
                      type="button"
                      key={url}
                      onClick={() => preview(terminal, url)}
                      className="flex items-center gap-2 text-xs text-primary break-all text-left"
                    >
                      <ArrowUpRight size={13} className="shrink-0" />
                      {url}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0">
                {terminal ? (
                  <TerminalView
                    key={`${sessionId}:${terminal.id}`}
                    terminal={terminal}
                    sessionId={sessionId}
                  />
                ) : (
                  <p role="status" className="p-5 text-xs text-white/60">
                    {loading || busy
                      ? 'Menyiapkan terminal...'
                      : 'Gunakan tombol tambah untuk membuka terminal PowerShell.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <CodingChanges
              selectionMissing={!loading && Boolean(runId) && !latest}
              scope={scope}
              onScopeChange={(value) => {
                setScope(value)
                setDiff(null)
              }}
              runs={runs}
              run={latest}
              onRunChange={(value) => {
                setRunId(value)
                setDiff(null)
              }}
              files={files}
              diff={diff}
              onOpenFile={openDiff}
              onCloseDiff={() => setDiff(null)}
              onUndo={undo}
              loading={loading}
              busy={busy}
              sessionBusy={sessionBusy}
              project={project}
              workspaceDiff={workspaceDiff}
              onWorktree={changeWorktree}
            />
          )}
        </>
      )}
    </aside>
  )
}
