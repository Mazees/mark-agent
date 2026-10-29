/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import AddonDetail from './AddonDetail'
import { mcpRequest } from '../api/mcp'

const empty = {
  name: '',
  description: '',
  type: 'stdio',
  command: '',
  args: '[]',
  url: '',
  auth: 'none',
  token: '',
  env: '{}'
}
const field = 'input w-full rounded-lg border border-white/15 bg-transparent text-sm'
function parseJson(value, fallback) {
  return value.trim() ? JSON.parse(value) : fallback
}
function Form({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || empty),
    [error, setError] = useState(''),
    [json, setJson] = useState(''),
    [imports, setImports] = useState([]),
    [keptEnvKeys, setKeptEnvKeys] = useState(initial?.envKeys || [])
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const readImport = () => {
    try {
      const value = JSON.parse(json),
        servers = value.mcpServers || value
      if (!servers || Array.isArray(servers) || typeof servers !== 'object')
        throw new Error('Format mcpServers tidak valid.')
      setImports(Object.entries(servers).map(([name, config]) => ({ name, ...config })))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }
  const selectImport = (item) => {
    const local = Boolean(item.command)
    setForm({
      ...empty,
      name: item.name,
      type: local ? 'stdio' : 'http',
      command: item.command || '',
      args: JSON.stringify(item.args || []),
      url: item.url || '',
      env: JSON.stringify(item.env || {}, null, 2),
      auth: /^Bearer\s+/i.test(item.headers?.Authorization || item.headers?.authorization || '')
        ? 'bearer'
        : 'none',
      token: (item.headers?.Authorization || item.headers?.authorization || '').replace(
        /^Bearer\s+/i,
        ''
      )
    })
    setImports([])
  }
  const save = async (event) => {
    event.preventDefault()
    try {
      const args = parseJson(form.args, []),
        env = parseJson(form.env, {})
      if (!Array.isArray(args) || !env || Array.isArray(env) || typeof env !== 'object')
        throw new Error('Argumen harus array dan environment harus objek JSON.')
      const data = {
        name: form.name,
        description: form.description,
        type: form.type,
        command: form.command,
        args,
        url: form.url,
        auth: form.auth,
        envKeys: [...new Set([...keptEnvKeys, ...Object.keys(env)])]
      }
      const secrets = {}
      if (Object.keys(env).length) secrets.env = env
      if (form.token) secrets.token = form.token
      if (Object.keys(secrets).length) data.secrets = secrets
      await onSave(data)
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{initial ? 'Edit MCP' : 'Tambah MCP'}</h2>
        <button type="button" onClick={onCancel} aria-label="Tutup">
          <X size={18} />
        </button>
      </div>
      {!initial && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">Tempel JSON konfigurasi</summary>
          <textarea
            aria-label="JSON MCP"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className={`${field} mt-3 min-h-24`}
          />
          <button type="button" onClick={readImport} className="btn btn-sm mt-2">
            Tinjau server
          </button>
          <div className="mt-2 space-y-1">
            {imports.map((item) => (
              <button
                className="block text-sm text-primary"
                type="button"
                key={item.name}
                onClick={() => selectImport(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </details>
      )}
      <label className="block text-sm">
        Nama
        <input
          required
          maxLength={100}
          className={`${field} mt-2`}
          value={form.name}
          onChange={(e) => change('name', e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Deskripsi
        <input
          className={`${field} mt-2`}
          value={form.description}
          onChange={(e) => change('description', e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Koneksi
        <select
          className={`${field} mt-2 [color-scheme:dark] [&>option]:bg-[#1c1a1a] [&>option]:text-white`}
          value={form.type}
          onChange={(e) => change('type', e.target.value)}
        >
          <option value="stdio">Lokal (stdio)</option>
          <option value="http">Remote (Streamable HTTP)</option>
        </select>
      </label>
      {form.type === 'stdio' ? (
        <>
          <label className="block text-sm">
            Command
            <input
              className={`${field} mt-2`}
              value={form.command}
              onChange={(e) => change('command', e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Argumen (array JSON)
            <textarea
              className={`${field} mt-2 min-h-20`}
              value={form.args}
              onChange={(e) => change('args', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Environment (objek JSON; nilai disimpan sebagai rahasia)
            <textarea
              className={`${field} mt-2 min-h-20`}
              value={form.env}
              onChange={(e) => change('env', e.target.value)}
            />
          </label>
          {keptEnvKeys.length > 0 && (
            <div className="text-xs text-white/60">
              Tersimpan:{' '}
              {keptEnvKeys.map((key) => (
                <span key={key} className="mr-3 inline-flex gap-1">
                  {key}
                  <button
                    type="button"
                    aria-label={`Hapus ${key}`}
                    onClick={() => setKeptEnvKeys((keys) => keys.filter((item) => item !== key))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="block text-sm">
            URL
            <input
              type="url"
              required
              className={`${field} mt-2`}
              value={form.url}
              onChange={(e) => change('url', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Autentikasi
            <select
              className={`${field} mt-2 [color-scheme:dark] [&>option]:bg-[#1c1a1a] [&>option]:text-white`}
              value={form.auth}
              onChange={(e) => change('auth', e.target.value)}
            >
              <option value="none">Tanpa autentikasi</option>
              <option value="oauth">OAuth</option>
              <option value="bearer">Token</option>
            </select>
          </label>
          {form.auth === 'bearer' && (
            <label className="block text-sm">
              Token
              <input
                type="password"
                autoComplete="off"
                className={`${field} mt-2`}
                value={form.token}
                onChange={(e) => change('token', e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Batal
        </button>
        <button className="btn btn-primary" type="submit">
          Simpan
        </button>
      </div>
    </form>
  )
}
export function AddMcpDialog({ open, onClose, onAdded }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.querySelector('button, input, select, textarea')?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls = [
        ...dialog.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary'
        )
      ].filter((element) => element.getClientRects().length)
      if (!controls.length) return
      const first = controls[0],
        last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog?.addEventListener('keydown', handleKey)
    return () => {
      dialog?.removeEventListener('keydown', handleKey)
      document.querySelector('[data-add-plugin-trigger]')?.focus()
    }
  }, [open, onClose])
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          ref={dialogRef}
          aria-modal="true"
          aria-label="Tambah MCP"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/10 bg-base-200 p-6">
            <Form
              onCancel={() => onClose()}
              onSave={async (data) => {
                await mcpRequest('', { method: 'POST', body: data })
                onClose()
                onAdded()
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
function ConnectingIcon({ size, ...props }) {
  return <Loader2 size={size} {...props} className="motion-safe:animate-spin" />
}

export default function McpAddonDetail() {
  const { id } = useParams()
  const navigate = useNavigate(),
    [item, setItem] = useState(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    [connecting, setConnecting] = useState(false)
  const connectingRef = useRef(false)
  const refresh = () =>
    mcpRequest('/' + id)
      .then((r) => setItem(r.data))
      .catch((e) => setError(e.message))
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 2500)
    return () => clearInterval(timer)
  }, [id])
  if (!item) return <div className="p-8">{error || 'Memuat MCP…'}</div>
  const isConnecting = connecting || item.status === 'connecting'
  const connect = async () => {
    if (connectingRef.current || isConnecting) return
    const target = item.type === 'stdio' ? [item.command, ...item.args].join(' ') : item.url
    if (
      !window.confirm(`Hubungkan ke ${item.name}?\n${target}\n\nPastikan server ini kamu percayai.`)
    )
      return
    connectingRef.current = true
    setConnecting(true)
    setError('')
    try {
      const result = await mcpRequest('/' + id + '/connect', {
        method: 'POST',
        body: { trusted: true }
      })
      if (result.error && !result.data?.authorizationUrl) setError(result.error)
      await refresh()
    } catch (e) {
      setError(e.message)
      await refresh()
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }
  const toggle = async (name) => {
    const enabled = item.tools.filter((t) => t.enabled).map((t) => t.name)
    const next = enabled.includes(name) ? enabled.filter((x) => x !== name) : [...enabled, name]
    try {
      await mcpRequest('/' + id + '/tools', { method: 'POST', body: { enabledTools: next } })
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }
  const remove = async () => {
    if (!window.confirm(`Hapus ${item.name}?`)) return
    try {
      await mcpRequest('/' + id, { method: 'DELETE' })
      navigate('/plugins')
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <AddonDetail
      backTo="/plugins"
      addon={{
        id: item.id,
        name: item.name,
        description: item.description,
        icon: 'plugin'
      }}
      status={!item.enabled ? 'inactive' : isConnecting ? 'connecting' : item.status}
      actions={[
        {
          label: isConnecting
            ? 'Menghubungkan…'
            : item.status === 'connected'
              ? 'Hubungkan ulang'
              : 'Hubungkan',
          icon: isConnecting ? ConnectingIcon : undefined,
          onClick: connect,
          disabled: !item.enabled || isConnecting
        },
        ...(item.status === 'connected' || item.status === 'needs-login'
          ? [
              {
                label: 'Putuskan',
                disabled: isConnecting,
                onClick: async () => {
                  await mcpRequest('/' + id + '/disconnect', { method: 'POST' })
                  await refresh()
                }
              }
            ]
          : []),
        {
          label: item.enabled ? 'Nonaktifkan' : 'Aktifkan',
          disabled: isConnecting,
          onClick: async () => {
            await mcpRequest('/' + id + '/enabled', {
              method: 'POST',
              body: { enabled: !item.enabled }
            })
            await refresh()
          }
        },
        { label: 'Edit', disabled: isConnecting, onClick: () => setEditing(true) },
        { label: 'Hapus', kind: 'danger', disabled: isConnecting, onClick: remove }
      ]}
      feedback={
        isConnecting ? (
          <div
            role="status"
            aria-live="polite"
            className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-4"
          >
            <div className="flex items-start gap-3">
              <Loader2
                size={19}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-primary motion-safe:animate-spin"
              />
              <div>
                <p className="text-sm font-medium text-white/90">Menghubungkan ke {item.name}</p>
                <p className="mt-1 text-sm text-white/50">
                  Menunggu server merespons dan memuat daftar tool.
                </p>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="mt-4 h-0.5 overflow-hidden rounded-full bg-primary/10"
            >
              <div className="h-full w-1/3 rounded-full bg-primary/70 motion-safe:animate-pulse" />
            </div>
          </div>
        ) : (
          error && (
            <p role="alert" className="text-error text-sm">
              {error}
            </p>
          )
        )
      }
    >
      {editing ? (
        <Form
          initial={{ ...item, args: JSON.stringify(item.args), env: '{}', token: '' }}
          onCancel={() => setEditing(false)}
          onSave={async (data) => {
            await mcpRequest('/' + id, { method: 'PATCH', body: data })
            setEditing(false)
            await refresh()
          }}
        />
      ) : (
        <>
          <p className="text-sm text-white/65">{item.description}</p>
          {item.authorizationUrl && (
            <a
              className="text-primary underline"
              href={item.authorizationUrl}
              target="_blank"
              rel="noreferrer"
            >
              Lanjutkan login OAuth
            </a>
          )}
          <div>
            <h2 className="text-base font-medium">Tool</h2>
            {item.tools.length ? (
              item.tools.map((tool) => (
                <label
                  key={tool.name}
                  className="flex items-start justify-between gap-4 border-b border-white/10 py-4"
                >
                  <span>
                    <span className="block text-sm">{tool.title || tool.name}</span>
                    <span className="mt-1 block text-xs text-white/50">{tool.description}</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={`Aktifkan ${tool.name}`}
                    checked={tool.enabled}
                    onChange={() => toggle(tool.name)}
                    className="toggle toggle-primary toggle-sm"
                  />
                </label>
              ))
            ) : (
              <p className="mt-3 text-sm text-white/45">Hubungkan server untuk melihat tool.</p>
            )}
          </div>
        </>
      )}
    </AddonDetail>
  )
}
