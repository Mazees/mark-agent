import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { RefreshCw, Search } from 'lucide-react'
import { webApi } from '../../api/web-bridge'
import {
  builtinToolGroups,
  guideToolGroups,
  toolSearchText,
  uniqueToolCount
} from './guidebookTools'

export default function ToolReference({ initialQuery = '' }) {
  const [groups, setGroups] = useState(builtinToolGroups)
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await webApi.getGroupTools({ forceRefresh: true })
        if (
          !result?.schema ||
          typeof result.schema !== 'object' ||
          !Object.keys(result.schema).length
        )
          throw new Error()
        if (active) {
          const next = guideToolGroups(result.schema)
          setGroups(next)
          setCategory((current) =>
            current === 'all' || next.some((group) => group.id === current) ? current : 'all'
          )
          setFailed(false)
        }
      } catch {
        if (active) setFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const unsubscribe = webApi.onPluginsUpdated?.(retry)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [revision, retry])

  const filtered = useMemo(() => {
    const words = query.toLocaleLowerCase('id-ID').trim().split(/\s+/).filter(Boolean)
    return groups
      .filter((group) => category === 'all' || category === group.id)
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => {
          const text = toolSearchText([{ ...group, tools: [tool] }]).toLocaleLowerCase('id-ID')
          return words.every((word) => text.includes(word))
        })
      }))
      .filter((group) => group.tools.length)
  }, [groups, query, category])

  return (
    <section aria-label="Katalog tool Mark" className="mt-9 border-t border-white/10 pt-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium text-white/90">{uniqueToolCount(groups)} tool unik</h3>
        <p role="status" className="text-xs text-white/45">
          {loading
            ? 'Memuat grup aktif…'
            : failed
              ? 'Referensi bawaan'
              : 'Termasuk grup dan plugin aktif'}
        </p>
      </div>
      {failed && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-relaxed text-white/55"
        >
          <p>Daftar grup aktif belum dapat dimuat. Referensi bawaan tetap tersedia.</p>
          <button type="button" onClick={retry} className="btn btn-ghost btn-sm rounded-full">
            <RefreshCw size={14} />
            Coba lagi
          </button>
        </div>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="input flex w-full items-center gap-2 rounded-lg border-white/15 bg-transparent text-sm">
          <Search size={15} className="shrink-0 text-white/40" />
          <input
            aria-label="Cari tool"
            className="min-w-0 flex-1"
            placeholder="Nama, fungsi, atau parameter…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Grup tool"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="select w-full rounded-lg border-white/15 bg-base-200 text-sm"
        >
          <option value="all">Semua grup</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title} ({group.tools.length})
            </option>
          ))}
        </select>
      </div>
      <p aria-live="polite" className="mt-3 text-xs text-white/40">
        {uniqueToolCount(filtered)} tool cocok · Buka nama tool untuk melihat detail.
      </p>
      {filtered.length ? (
        <div className="mt-7 space-y-8">
          {filtered.map((group) => (
            <section key={group.id} aria-label={group.title}>
              <div className="mb-3">
                <h4 className="text-sm font-medium text-white/85">
                  {group.title}
                  <span className="ml-2 text-xs font-normal text-white/40">
                    {group.tools.length}
                  </span>
                </h4>
                <p className="mt-1 text-xs text-white/40">
                  {group.id}
                  {group.kind === 'plugin' ? ' · Plugin aktif' : ''}
                </p>
              </div>
              <div className="divide-y divide-white/10 border-y border-white/10">
                {group.tools.map((tool) => (
                  <details key={tool.name} className="group py-3">
                    <summary className="cursor-pointer break-all py-1 text-sm text-white/80 focus-visible:outline-2 focus-visible:outline-primary">
                      <code>{tool.name}</code>
                    </summary>
                    <div className="pb-2 pl-4 pt-3">
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-white/60">
                        {tool.description || 'Tidak ada deskripsi tambahan.'}
                      </p>
                      {tool.parameters?.properties && (
                        <dl className="mt-5 space-y-4">
                          {Object.entries(tool.parameters.properties).map(([name, parameter]) => (
                            <div key={name}>
                              <dt className="flex flex-wrap items-baseline gap-x-2 text-xs">
                                <code className="text-white/85">{name}</code>
                                <span className="text-white/40">
                                  {Array.isArray(parameter.type)
                                    ? parameter.type.join(' / ')
                                    : parameter.type || 'nilai'}
                                </span>
                                {tool.parameters.required?.includes(name) && (
                                  <span className="text-primary">Wajib</span>
                                )}
                              </dt>
                              <dd className="mt-1 break-words text-xs leading-relaxed text-white/55">
                                {parameter.description || 'Lihat skema lengkap untuk format nilai.'}
                                {parameter.enum && (
                                  <span className="mt-1 block break-all text-white/45">
                                    Pilihan:{' '}
                                    {parameter.enum.map((value) => String(value)).join(', ')}
                                  </span>
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {tool.parameters && (
                        <details className="mt-5">
                          <summary className="cursor-pointer text-xs text-white/50">
                            Skema parameter lengkap
                          </summary>
                          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-white/5 p-4 text-xs leading-relaxed">
                            <code>{JSON.stringify(tool.parameters, null, 2)}</code>
                          </pre>
                        </details>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p role="status" className="py-10 text-sm text-white/50">
          Tidak ada tool yang cocok. Coba kata kunci atau grup lain.
        </p>
      )}
    </section>
  )
}
ToolReference.propTypes = { initialQuery: PropTypes.string }
