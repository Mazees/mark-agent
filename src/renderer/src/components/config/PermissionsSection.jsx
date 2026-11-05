import { useState, useEffect, useCallback } from 'react'
import { Folder, Search, ShieldCheck, Terminal, X } from 'lucide-react'
import { configProps, controlClass } from './configStyles'
import { webApi } from '../../api/web-bridge.js'

export const PermissionsSection = ({ config, setConfig }) => {
  const [search, setSearch] = useState('')
  const [grants, setGrants] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setGrants(await webApi.getToolGrants())
      setError('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  const revoke = async (id) => {
    try {
      await webApi.removeToolGrant(id)
      await load()
    } catch (cause) {
      setError(cause.message)
    }
  }
  const paths = Array.isArray(config.alwaysAllowedPaths)
    ? config.alwaysAllowedPaths.filter((item) => typeof item === 'string')
    : []
  const filtered = paths.filter((item) =>
    item.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )
  const remove = (target) =>
    setConfig((previous) => ({
      ...previous,
      alwaysAllowedPaths: previous.alwaysAllowedPaths.filter((item) => item !== target)
    }))
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium">Izin aktif</h3>
        <p className="mt-2 text-xs leading-relaxed text-base-content/75">
          Izin ini diperiksa bersama oleh Mark dan Minibot. Menghapus izin langsung mencabutnya
          untuk tindakan berikutnya, tanpa mengurungkan pekerjaan sebelumnya.
        </p>
        {loading && (
          <p role="status" className="mt-3 text-xs">
            Memuat izin…
          </p>
        )}
        {error && (
          <div role="alert" className="mt-3 text-xs text-error">
            {error}
            <button type="button" className="btn btn-ghost btn-xs ml-2" onClick={load}>
              Coba lagi
            </button>
          </div>
        )}
        {!loading && !error && grants.length === 0 && (
          <p className="mt-4 text-sm text-base-content/70">Belum ada izin yang disimpan.</p>
        )}
        <ul className="mt-3 divide-y divide-white/10">
          {grants.map((grant) => (
            <li key={grant.id} className="flex items-start gap-3 py-3">
              <ShieldCheck size={17} className="mt-1 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-medium">{grant.tool}</p>
                <p className="mt-1 break-all text-xs text-base-content/75">
                  {grant.kind === 'folder' ? grant.target : 'Tool dan argumen yang telah diizinkan'}
                </p>
                <p className="mt-1 text-xs text-base-content/70">
                  {grant.session_id ? 'Sesi ' + grant.session_id : 'Berlaku permanen'}
                </p>
              </div>
              <button
                type="button"
                aria-label={'Cabut izin ' + grant.tool}
                onClick={() => revoke(grant.id)}
                className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-error"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {paths.length > 0 && <h3 className="text-sm font-medium">Izin versi sebelumnya</h3>}
      <p className="text-xs leading-relaxed text-white/50">
        Folder absolut yang masih valid dipertahankan sebagai izin aktif. Entri lama yang ambigu
        memerlukan izin baru melalui chat. Untuk membersihkan daftar lama, hapus entri lalu simpan
        pengaturan; pencabutan izin aktif dilakukan pada daftar di atas.
      </p>
      {paths.length > 0 ? (
        <>
          <label className={`input flex items-center gap-3 ${controlClass}`}>
            <Search size={16} className="shrink-0 text-white/40" />
            <input
              aria-label="Cari izin tersimpan"
              className="min-w-0 flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari folder atau perintah…"
            />
          </label>
          <p className="text-xs text-white/40">
            {filtered.length} dari {paths.length} izin
          </p>
          <ul className="divide-y divide-white/10">
            {filtered.map((item) => {
              const command = item.startsWith('cmd:')
              return (
                <li key={item} className="flex items-start gap-3 py-4 first:pt-0">
                  {command ? (
                    <Terminal size={18} className="mt-1 shrink-0 text-white/40" />
                  ) : (
                    <Folder size={18} className="mt-1 shrink-0 text-white/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/45">
                      {command ? 'Perintah shell' : 'Folder atau berkas'}
                    </p>
                    <p className="mt-1 break-all text-sm leading-relaxed text-white/80">
                      {command ? item.slice(4) : item}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label={`Hapus izin ${command ? item.slice(4) : item}`}
                    title="Hapus dari daftar"
                    className="btn btn-ghost btn-sm btn-circle shrink-0 text-white/50 hover:text-error"
                  >
                    <X size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
          {filtered.length === 0 && (
            <p className="py-6 text-sm text-white/50">
              Tidak ada izin yang cocok dengan pencarian.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}
PermissionsSection.propTypes = configProps
export default PermissionsSection
