import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  LockKeyhole,
  Pencil,
  Plus,
  Power,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles
} from 'lucide-react'
import { webApi } from '../api/web-bridge'
import { getAddon } from '../api/addonRegistry'
import AddonDetail from './AddonDetail'
import PluginEditor from '../components/plugins/PluginEditor'

export default function Plugins() {
  const navigate = useNavigate()
  const { pluginName } = useParams()
  const [plugins, setPlugins] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const data = await webApi.getPlugins()
      setPlugins(Array.isArray(data) ? data : [])
    } catch (failure) {
      setError(failure.message || 'Daftar plugin belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const unsubscribe = webApi.onPluginsUpdated(loadData)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [loadData])

  const visiblePlugins = useMemo(() => {
    const term = query.trim().toLowerCase()
    return plugins
      .filter(
        (plugin) =>
          !term ||
          [
            plugin.name,
            plugin.displayName,
            plugin.description,
            ...(plugin.actions || []).map((action) => action.name)
          ]
            .join(' ')
            .toLowerCase()
            .includes(term)
      )
      .sort((left, right) =>
        (left.displayName || left.name).localeCompare(right.displayName || right.name)
      )
  }, [plugins, query])
  const plugin = plugins.find((item) => (item.folderName || item.name) === pluginName)
  const managedAddon = plugin?.managedByAddon ? getAddon(plugin.managedByAddon) : null
  const editable = plugin?.editable !== false && !plugin?.managedByAddon

  const run = async (operation) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await operation()
      if (result?.success === false)
        throw new Error(result.error || 'Perubahan plugin belum dapat disimpan.')
      await loadData()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const openEditor = (target = null) => {
    if (target && (target.editable === false || target.managedByAddon)) return
    setError('')
    setEditor({ plugin: target })
  }
  const editorDialog = editor && (
    <PluginEditor
      plugin={editor.plugin}
      onClose={() => setEditor(null)}
      onSaved={async (manifest) => {
        await loadData()
        setEditor(null)
        navigate(`/plugins/${encodeURIComponent(editor.plugin?.folderName || manifest.name)}`)
      }}
    />
  )

  if (pluginName && plugin) {
    const actions = [
      ...(managedAddon
        ? [
            {
              label: 'Kelola add-on',
              icon: Settings2,
              onClick: () => navigate(`/addons/${managedAddon.id}`)
            }
          ]
        : []),
      ...(editable
        ? [{ label: 'Edit plugin', icon: Pencil, onClick: () => openEditor(plugin) }]
        : []),
      ...(!plugin.managedByAddon
        ? [
            {
              label: plugin.isEnabled === false ? 'Aktifkan' : 'Nonaktifkan',
              icon: Power,
              kind: 'ghost',
              disabled: busy,
              onClick: () =>
                run(() =>
                  webApi.togglePlugin(plugin.folderName || plugin.name, plugin.isEnabled === false)
                )
            }
          ]
        : []),
      {
        label: 'Buka folder',
        icon: FolderOpen,
        kind: 'ghost',
        disabled: busy,
        onClick: () => run(() => webApi.openSpecificFolder(plugin.folderPath))
      }
    ]
    const author = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name
    return (
      <>
        <AddonDetail
          addon={{
            id: `plugin-${plugin.name}`,
            name: plugin.displayName || plugin.name,
            developer: plugin.developer || author,
            icon: managedAddon?.icon || 'plugin'
          }}
          backTo="/plugins"
          status={plugin.isEnabled === false ? 'inactive' : 'active'}
          actions={actions}
          feedback={
            error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )
          }
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">
            {plugin.description || 'Plugin ini belum memiliki deskripsi.'}
          </p>
          {!editable && (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-white/50">
              <LockKeyhole size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {plugin.managedByAddon
                  ? `Dikelola oleh ${managedAddon?.name || plugin.managedByAddon}. Pengaturan plugin dilakukan melalui add-on terkait.`
                  : 'Plugin ini tidak dapat diedit karena properti editable bernilai false. Tool yang aktif tetap dapat digunakan oleh Mark.'}
              </span>
            </p>
          )}
          <section aria-labelledby="plugin-actions">
            <h2
              id="plugin-actions"
              className="border-b border-white/10 pb-3 text-base font-medium text-white/90"
            >
              Aksi <span className="text-white/40">{plugin.actions?.length || 0}</span>
            </h2>
            <div className="divide-y divide-white/5">
              {(plugin.actions || []).map((action) => (
                <details key={action.name} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md text-sm focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={15}
                      className="shrink-0 text-white/40 transition-transform group-open:rotate-90"
                    />
                    <span className="min-w-0 break-words font-medium text-white/85">
                      {action.name}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3 pl-7 text-sm leading-relaxed text-white/55">
                    <p className="whitespace-pre-wrap break-words">
                      {action.description || 'Belum ada deskripsi aksi.'}
                    </p>
                    {action.triggerHint && (
                      <p className="whitespace-pre-wrap break-words">
                        <span className="text-white/75">Kapan digunakan: </span>
                        {action.triggerHint}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
            {!plugin.actions?.length && (
              <p className="py-5 text-sm text-white/45">Belum ada aksi yang terdaftar.</p>
            )}
          </section>
          <section aria-labelledby="plugin-information">
            <h2
              id="plugin-information"
              className="border-b border-white/10 pb-3 text-base font-medium text-white/90"
            >
              Informasi
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 py-5 text-sm">
              <dt className="text-white/40">Grup tool</dt>
              <dd className="break-all text-white/75">{plugin.name}</dd>
              <dt className="text-white/40">Versi</dt>
              <dd className="text-white/75">{plugin.version || '1.0.0'}</dd>
              <dt className="text-white/40">Penyuntingan</dt>
              <dd className="text-white/75">{editable ? 'Diizinkan' : 'Tidak diizinkan'}</dd>
              <dt className="text-white/40">Dependensi</dt>
              <dd className="break-words text-white/75">
                {(Array.isArray(plugin.dependencies)
                  ? plugin.dependencies.join(', ')
                  : plugin.dependencies) || 'Tidak ada'}
              </dd>
            </dl>
          </section>
        </AddonDetail>
        {editorDialog}
      </>
    )
  }

  return (
    <>
      <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
        <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
          <Link
            to="/"
            className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ArrowLeft size={17} />
            Kembali
          </Link>
          <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-2xl font-semibold text-white">Plugin Hub</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/50">
                Kelola plugin lokal dan tool yang tersedia untuk Mark.
              </p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                aria-label="Cari plugin"
                placeholder="Cari plugin..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
              />
            </label>
          </header>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn rounded-full border-white bg-white px-5 text-neutral-900 hover:bg-white/90"
              onClick={() => navigate('/chat', { state: { composerDraft: '/create-plugin ' } })}
            >
              <Sparkles size={16} />
              Buat dengan Mark
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full px-4"
              onClick={() => openEditor()}
            >
              <Plus size={16} />
              Buat manual
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full px-4"
              disabled={busy}
              onClick={() => run(() => webApi.openPluginFolder())}
            >
              <FolderOpen size={16} />
              Buka folder
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full px-4"
              disabled={busy || loading}
              onClick={() => run(() => webApi.reloadPlugins())}
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              Muat ulang
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-5 text-sm text-error">
              {error}
            </p>
          )}
          {pluginName ? (
            <section className="mt-12 text-sm text-white/55">
              <p role="status">
                {loading ? 'Memuat plugin...' : 'Plugin tidak ditemukan atau sudah dihapus.'}
              </p>
              <Link to="/plugins" className="mt-4 inline-block text-primary">
                Kembali ke Plugin Hub
              </Link>
            </section>
          ) : (
            <section aria-labelledby="installed-plugins" className="mt-12">
              <h2 id="installed-plugins" className="mb-5 text-sm font-medium text-white/75">
                Terpasang {!loading && <span className="ml-1 text-white/40">{plugins.length}</span>}
              </h2>
              {loading ? (
                <p role="status" className="py-8 text-sm text-white/45">
                  Memuat plugin...
                </p>
              ) : visiblePlugins.length ? (
                <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
                  {visiblePlugins.map((item) => {
                    const owner = getAddon(item.managedByAddon)
                    return (
                      <Link
                        key={item.folderName || item.name}
                        to={`/plugins/${encodeURIComponent(item.folderName || item.name)}`}
                        className="flex min-w-0 items-start gap-4 rounded-lg px-5 py-5 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10">
                          <Puzzle
                            size={25}
                            className={item.isEnabled === false ? 'text-white/35' : 'text-primary'}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold text-white">
                            {item.displayName || item.name}
                          </span>
                          {item.displayName && item.displayName !== item.name && (
                            <span className="mt-1 block break-all text-xs text-white/35">
                              {item.name}
                            </span>
                          )}
                          <span className="mt-1.5 line-clamp-2 break-words text-sm leading-relaxed text-white/50">
                            {item.description || 'Belum ada deskripsi.'}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span
                              className={
                                item.isEnabled === false ? 'text-white/40' : 'text-primary'
                              }
                            >
                              {item.isEnabled === false ? 'Nonaktif' : 'Aktif'}
                            </span>
                            <span className="text-white/35">
                              · {item.actions?.length || 0} aksi
                            </span>
                            {(item.editable === false || item.managedByAddon) && (
                              <span className="inline-flex items-center gap-1 text-white/40">
                                <LockKeyhole size={11} aria-hidden="true" />
                                {item.managedByAddon
                                  ? `Dikelola ${owner?.name || item.managedByAddon}`
                                  : 'Tidak dapat diedit'}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <p role="status" className="py-8 text-sm text-white/45">
                  {query.trim()
                    ? `Tidak ada plugin yang cocok dengan “${query}”.`
                    : 'Belum ada plugin terpasang. Pilih Buat dengan Mark atau Buat manual untuk mulai.'}
                </p>
              )}
            </section>
          )}
        </div>
      </main>
      {editorDialog}
    </>
  )
}
