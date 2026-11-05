/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import './CodingDiff.jsx'
import { Save, RefreshCw } from 'lucide-react'
import { webApi } from '../../api/web-bridge.js'
const languages = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  py: 'python',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  xml: 'xml',
  txt: 'plaintext'
}
export default function WorkspaceEditor({ tab, sessionId, onDirty, register }) {
  const [data, setData] = useState(null),
    [content, setContent] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const state = useRef({}),
    queue = useRef(Promise.resolve()),
    timer = useRef(null),
    alive = useRef(true),
    cleared = useRef(false)
  state.current = { data, content }
  const read = useCallback(async () => {
    const value = await webApi.codingRequest('/workspace/file', sessionId, { path: tab.path })
    if (!alive.current) return
    setData(value)
    setContent(value.draft?.content ?? value.content)
    setError(
      value.draft?.content != null && value.draft.baseHash !== value.hash
        ? 'Draf dipulihkan, tetapi berkas di disk sudah berubah. Bandingkan isinya atau muat ulang sebelum menyimpan.'
        : ''
    )
  }, [sessionId, tab.path])
  useEffect(() => {
    alive.current = true
    read().catch((e) => {
      if (alive.current) setError(e.message)
    })
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      const current = state.current
      if (!cleared.current && current.data && current.content !== current.data.content) {
        queue.current = queue.current
          .catch(() => {})
          .then(() =>
            webApi.codingRequest(
              '/workspace/draft',
              sessionId,
              {
                root: current.data.root,
                path: tab.path,
                content: current.content,
                baseHash: current.data.draft?.baseHash ?? current.data.hash
              },
              'POST'
            )
          )
          .catch(() => {})
      }
    }
  }, [read, sessionId, tab.path])
  const draft = useCallback(
    (text, hash) => {
      const operation = () =>
        webApi.codingRequest(
          '/workspace/draft',
          sessionId,
          { root: state.current.data?.root, path: tab.path, content: text, baseHash: hash },
          'POST'
        )
      queue.current = queue.current.catch(() => {}).then(operation)
      return queue.current
    },
    [sessionId, tab.path]
  )
  const save = useCallback(async () => {
    const current = state.current
    if (!current.data) throw new Error('Berkas belum tersedia.')
    clearTimeout(timer.current)
    setBusy(true)
    try {
      await queue.current
      const value = await webApi.codingRequest(
        '/workspace/file',
        sessionId,
        {
          path: tab.path,
          root: current.data.root,
          content: current.content,
          expectedHash:
            current.data.draft?.content != null ? current.data.draft.baseHash : current.data.hash
        },
        'POST'
      )
      if (alive.current) {
        setData({ ...value, content: current.content, draft: null })
        setError('')
      }
      cleared.current = state.current.content === current.content
      onDirty(tab.id, false)
    } catch (e) {
      if (alive.current) setError(e.message)
      throw e
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [sessionId, tab.id, tab.path, onDirty])
  const discard = useCallback(async () => {
    clearTimeout(timer.current)
    await draft(null, null)
    cleared.current = true
    onDirty(tab.id, false)
  }, [draft, onDirty, tab.id])
  useEffect(() => {
    register(tab.id, { save, discard })
    return () => register(tab.id, null)
  }, [register, tab.id, save, discard])
  useEffect(() => {
    onDirty(tab.id, Boolean(data && content !== data.content))
  }, [data, content, onDirty, tab.id])
  const change = (text = '') => {
    cleared.current = false
    setContent(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        draft(text, state.current.data?.draft?.baseHash ?? state.current.data?.hash).catch((e) => {
          if (alive.current) setError(`Draf belum tersimpan: ${e.message}`)
        }),
      350
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-white/55">
          {data
            ? `${data.encoding.toUpperCase()} · ${data.newline === '\r\n' ? 'CRLF' : data.newline === '\r' ? 'CR' : 'LF'}`
            : 'Memuat berkas…'}
        </span>
        <button
          type="button"
          disabled={busy || !data}
          onClick={() => save().catch(() => {})}
          className="inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Save size={14} />
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button
          type="button"
          disabled={busy}
          title="Buang draf dan muat ulang dari disk"
          aria-label="Buang draf dan muat ulang dari disk"
          onClick={() => {
            if (window.confirm('Buang draf dan baca ulang berkas dari disk?'))
              discard()
                .then(read)
                .catch((e) => setError(e.message))
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {error && (
        <p role="alert" className="break-words p-3 text-xs text-error">
          {error}
        </p>
      )}
      {data && (
        <div className="min-h-0 flex-1">
          <Editor
            value={content}
            language={languages[tab.path.split('.').pop().toLowerCase()] || 'plaintext'}
            theme="vs-dark"
            onChange={change}
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
                save().catch(() => {})
              )
            }}
            options={{
              automaticLayout: true,
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 13,
              fontLigatures: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false
            }}
          />
        </div>
      )}
    </div>
  )
}
