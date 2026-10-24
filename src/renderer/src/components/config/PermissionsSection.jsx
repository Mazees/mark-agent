import { useState } from 'react'
import { Folder, Search, ShieldCheck, Terminal, X } from 'lucide-react'
import { configProps, controlClass } from './configStyles'

export const PermissionsSection = ({ config, setConfig }) => {
  const [search, setSearch] = useState('')
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
      <p className="text-xs leading-relaxed text-white/50">
        Hapus entri dari daftar, lalu simpan pengaturan untuk mencabut izinnya. Mark akan meminta
        konfirmasi lagi saat akses tersebut diperlukan.
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
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center">
          <ShieldCheck size={25} className="mx-auto mb-4 text-white/35" />
          <p className="text-sm text-white/75">Belum ada izin tersimpan.</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/45">
            Izin yang Anda berikan melalui pilihan “Izinkan Selamanya” di percakapan akan muncul di
            sini.
          </p>
        </div>
      )}
    </div>
  )
}
PermissionsSection.propTypes = configProps
export default PermissionsSection
