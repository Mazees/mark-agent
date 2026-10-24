import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronRight, Plus, Trash2, Undo2, X } from 'lucide-react'
import PropTypes from 'prop-types'
import { webApi } from '../../api/web-bridge'

const Editor = lazy(() => import('./PluginCodeEditor'))
const newAction = (action = {}) => ({
  name: '',
  description: '',
  triggerHint: '',
  code: '',
  ...action,
  editorId: crypto.randomUUID()
})
const inputClass = 'input input-bordered mt-2 w-full rounded-lg bg-transparent text-sm'

export default function PluginEditor({ plugin, onClose, onSaved }) {
  const dialog = useRef(null)
  const [tab, setTab] = useState('info')
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removed, setRemoved] = useState(null)
  const [form, setForm] = useState(() => ({
    name: plugin?.name || '',
    displayName: plugin?.displayName || '',
    description: plugin?.description || '',
    dependencies: Array.isArray(plugin?.dependencies)
      ? plugin.dependencies.join(', ')
      : plugin?.dependencies || '',
    editable: plugin?.editable !== false,
    actions: plugin?.actions?.length ? plugin.actions.map(newAction) : [newAction()]
  }))
  const action = form.actions[selected]

  useEffect(() => {
    const current = dialog.current
    current.showModal()
    return () => {
      if (current.open) current.close()
    }
  }, [])

  const update = (field, value) => {
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }
  const updateAction = (field, value) => {
    setError('')
    setForm((current) => ({
      ...current,
      actions: current.actions.map((item, index) =>
        index === selected ? { ...item, [field]: value } : item
      )
    }))
  }
  const addAction = () => {
    setSelected(form.actions.length)
    setTab('actions')
    setError('')
    setForm((current) => ({ ...current, actions: [...current.actions, newAction()] }))
  }
  const removeAction = () => {
    if (form.actions.length === 1) return
    setRemoved({ action, index: selected })
    update(
      'actions',
      form.actions.filter((_, index) => index !== selected)
    )
    setSelected(Math.max(0, selected - 1))
  }
  const undoRemoval = () => {
    const next = [...form.actions]
    const position = Math.min(removed.index, next.length)
    next.splice(position, 0, removed.action)
    update('actions', next)
    setSelected(position)
    setTab('actions')
    setRemoved(null)
  }
  const invalid = (message, section, index, field) => {
    setError(message)
    setTab(section)
    if (index !== null) setSelected(index)
    if (field)
      requestAnimationFrame(() => dialog.current?.querySelector(`[name="${field}"]`)?.focus())
  }
  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (plugin && (plugin.editable === false || plugin.managedByAddon)) {
      setError('Plugin ini tidak dapat diedit.')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(form.name)) {
      invalid(
        'Isi nama plugin dengan huruf, angka, tanda hubung, atau garis bawah.',
        'info',
        null,
        'plugin-name'
      )
      return
    }
    const names = new Set()
    for (const [index, item] of form.actions.entries()) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(item.name)) {
        invalid(
          `Periksa nama aksi ${index + 1}. Gunakan huruf, angka, tanda hubung, atau garis bawah.`,
          'actions',
          index,
          'action-name'
        )
        return
      }
      if (names.has(item.name.toLowerCase())) {
        invalid('Setiap aksi harus memiliki nama yang berbeda.', 'actions', index, 'action-name')
        return
      }
      names.add(item.name.toLowerCase())
      if (!item.code.trim()) {
        invalid(`Kode untuk aksi ${item.name} belum diisi.`, 'actions', index)
        return
      }
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
        new AsyncFunction('query', item.code)
      } catch (failure) {
        invalid(`Kode ${item.name} belum valid: ${failure.message}`, 'actions', index)
        return
      }
    }
    setBusy(true)
    try {
      const result = await webApi.createPlugin({
        ...form,
        actions: form.actions.map((item) => {
          const saved = { ...item }
          delete saved.editorId
          return saved
        }),
        isEdit: !!plugin
      })
      if (!result?.success) throw new Error(result?.error || 'Plugin belum dapat disimpan.')
      await onSaved(result.data)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="plugin-editor-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={save}
        noValidate
        className="modal-box flex h-[min(800px,90dvh)] max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden border border-white/10 bg-base-300 p-0"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 py-5 sm:px-7">
          <div>
            <h2 id="plugin-editor-title" className="text-lg font-semibold text-white">
              {plugin ? 'Edit plugin' : 'Buat plugin'}
            </h2>
            <p className="mt-1 text-sm text-white/45">
              {plugin
                ? plugin.displayName || plugin.name
                : 'Atur informasi plugin, lalu tambahkan aksi yang diperlukan.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup editor"
            className="btn btn-ghost btn-sm btn-circle shrink-0"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div
          role="tablist"
          aria-label="Bagian editor plugin"
          className="flex shrink-0 gap-6 border-b border-white/10 px-5 sm:px-7"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next =
              event.key === 'Home'
                ? 'info'
                : event.key === 'End'
                  ? 'actions'
                  : tab === 'info'
                    ? 'actions'
                    : 'info'
            setTab(next)
            dialog.current?.querySelector(`#plugin-tab-${next}`)?.focus()
          }}
        >
          {[
            ['info', 'Informasi plugin'],
            ['actions', `Aksi (${form.actions.length})`]
          ].map(([id, label]) => (
            <button
              key={id}
              id={`plugin-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`plugin-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              type="button"
              disabled={busy}
              onClick={() => setTab(id)}
              className={`border-b-2 pb-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${tab === id ? 'border-primary text-white' : 'border-transparent text-white/45 hover:text-white/75'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset disabled={busy} className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {tab === 'info' ? (
            <section
              role="tabpanel"
              id="plugin-panel-info"
              aria-labelledby="plugin-tab-info"
              className="h-full overflow-y-auto px-5 py-6 sm:px-7 custom-scrollbar"
            >
              <div className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm text-white/75">
                    Nama plugin{' '}
                    <input
                      name="plugin-name"
                      className={inputClass}
                      value={form.name}
                      disabled={!!plugin}
                      onChange={(event) => update('name', event.target.value)}
                      placeholder="contoh-plugin"
                      autoFocus={!plugin}
                    />
                    <span className="mt-2 block text-xs leading-relaxed text-white/40">
                      Menjadi nama grup tool. Tidak dapat diubah setelah dibuat.
                    </span>
                  </label>
                  <label className="block text-sm text-white/75">
                    Nama tampilan <span className="text-white/35">(opsional)</span>
                    <input
                      className={inputClass}
                      value={form.displayName}
                      onChange={(event) => update('displayName', event.target.value)}
                      placeholder="Contoh Plugin"
                    />
                  </label>
                </div>
                <label className="block text-sm text-white/75">
                  Deskripsi{' '}
                  <textarea
                    className="textarea textarea-bordered mt-2 w-full rounded-lg bg-transparent text-sm leading-relaxed"
                    rows={4}
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="Jelaskan fungsi plugin dan kapan Mark perlu menggunakannya."
                  />
                </label>
                <label className="block text-sm text-white/75">
                  Dependensi <span className="text-white/35">(opsional)</span>
                  <input
                    className={inputClass}
                    value={form.dependencies}
                    onChange={(event) => update('dependencies', event.target.value)}
                    placeholder="axios, cheerio"
                  />
                  <span className="mt-2 block text-xs leading-relaxed text-white/40">
                    Pisahkan nama library dengan koma. Kosongkan jika tidak diperlukan.
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost rounded-full px-4"
                  onClick={() => setTab('actions')}
                >
                  Atur aksi <ChevronRight size={16} />
                </button>
              </div>
            </section>
          ) : (
            <section
              role="tabpanel"
              id="plugin-panel-actions"
              aria-labelledby="plugin-tab-actions"
              className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]"
            >
              <aside className="hidden min-h-0 flex-col border-r border-white/10 md:flex">
                <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                  <nav aria-label="Daftar aksi" className="space-y-1">
                    {form.actions.map((item, index) => (
                      <button
                        key={item.editorId}
                        type="button"
                        aria-current={selected === index ? 'true' : undefined}
                        onClick={() => setSelected(index)}
                        title={item.name || `Aksi ${index + 1}`}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${selected === index ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:bg-white/[0.03] hover:text-white/75'}`}
                      >
                        <span className="text-xs text-white/30">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{item.name || 'Aksi baru'}</span>
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="shrink-0 border-t border-white/10 p-3">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-full justify-start rounded-lg"
                    onClick={addAction}
                  >
                    <Plus size={15} />
                    Tambah aksi
                  </button>
                </div>
              </aside>
              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 custom-scrollbar">
                <div className="mb-5 flex items-end gap-3 md:hidden">
                  <label className="min-w-0 flex-1 text-xs text-white/45">
                    Pilih aksi
                    <select
                      aria-label="Pilih aksi"
                      className="select select-bordered mt-2 w-full rounded-lg bg-base-300 text-sm"
                      value={selected}
                      onChange={(event) => setSelected(Number(event.target.value))}
                    >
                      {form.actions.map((item, index) => (
                        <option key={item.editorId} value={index}>
                          {item.name || `Aksi ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label="Tambah aksi"
                    className="btn btn-ghost btn-square"
                    onClick={addAction}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-end gap-3">
                    <label className="min-w-0 flex-1 text-sm text-white/75">
                      Nama aksi
                      <input
                        name="action-name"
                        className={inputClass}
                        value={action.name}
                        onChange={(event) => updateAction('name', event.target.value)}
                        placeholder="nama-aksi"
                      />
                    </label>
                    {form.actions.length > 1 && (
                      <button
                        type="button"
                        aria-label="Hapus aksi ini"
                        className="btn btn-ghost btn-square mb-0.5 text-white/40 hover:text-error"
                        onClick={removeAction}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  <label className="block text-sm text-white/75">
                    Deskripsi aksi
                    <input
                      className={inputClass}
                      value={action.description}
                      onChange={(event) => updateAction('description', event.target.value)}
                      placeholder="Jelaskan hasil atau kegunaan aksi ini."
                    />
                  </label>
                  <details>
                    <summary className="cursor-pointer text-xs text-white/45">
                      Petunjuk penggunaan <span className="text-white/30">(opsional)</span>
                    </summary>
                    <input
                      aria-label="Kapan aksi digunakan"
                      className={inputClass}
                      value={action.triggerHint}
                      onChange={(event) => updateAction('triggerHint', event.target.value)}
                      placeholder="Contoh: saat pengguna meminta ringkasan halaman."
                    />
                  </details>
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-white/75">Kode Node.js</span>
                      <span className="font-mono text-xs text-white/35">
                        async ({'{ query }'}) =&gt; {'{ … }'}
                      </span>
                    </div>
                    <div
                      id="plugin-code"
                      className="h-[280px] overflow-hidden rounded-lg border border-white/10 bg-[#1e1e1e]"
                    >
                      <Suspense
                        fallback={
                          <p role="status" className="p-6 text-sm text-white/40">
                            Memuat editor...
                          </p>
                        }
                      >
                        <Editor
                          key={action.editorId}
                          height="100%"
                          path={`${action.editorId}.js`}
                          language="javascript"
                          theme="vs-dark"
                          defaultValue={action.code}
                          onChange={(value) => updateAction('code', value || '')}
                          options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                            padding: { top: 12, bottom: 12 },
                            automaticLayout: true,
                            readOnly: busy,
                            wordWrap: 'on',
                            ariaLabel: 'Kode aksi'
                          }}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </fieldset>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            {error ? (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            ) : removed ? (
              <div className="flex items-center gap-2 text-xs text-white/45">
                <span>Aksi dihapus.</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-white/75 underline-offset-4 hover:underline"
                  disabled={busy}
                  onClick={undoRemoval}
                >
                  <Undo2 size={12} />
                  Urungkan
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/35">
                {form.actions.length} aksi · {plugin ? 'Perubahan belum disimpan' : 'Plugin baru'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              className="btn btn-ghost rounded-full"
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
            >
              {busy ? 'Menyimpan...' : 'Simpan plugin'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  )
}

PluginEditor.propTypes = {
  plugin: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired
}
