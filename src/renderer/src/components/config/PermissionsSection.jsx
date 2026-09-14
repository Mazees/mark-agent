import { useState, useEffect } from 'react'
import { ShieldCheck, Terminal, Folder, Trash2, ShieldAlert } from 'lucide-react'
import { getAlwaysAllowedPaths, removeAlwaysAllowedPath } from '../../api/db'

export const PermissionsSection = () => {
  const [paths, setPaths] = useState([])
  const [isDeleting, setIsDeleting] = useState(null)

  const loadPaths = async () => {
    try {
      const list = await getAlwaysAllowedPaths()
      setPaths(Array.isArray(list) ? list : [])
    } catch (_) {
      setPaths([])
    }
  }

  useEffect(() => {
    loadPaths()

    const handleConfigUpdated = (e) => {
      if (Array.isArray(e.detail?.alwaysAllowedPaths)) {
        setPaths(e.detail.alwaysAllowedPaths)
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)
    return () => window.removeEventListener('config-updated', handleConfigUpdated)
  }, [])

  const handleDelete = async (target) => {
    setIsDeleting(target)
    try {
      const updated = await removeAlwaysAllowedPath(target)
      setPaths(Array.isArray(updated) ? updated : [])
    } catch (e) {
      console.error('Gagal menghapus izin whitelist:', e)
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <section className="space-y-4 p-2 -mx-2 rounded-lg">
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning" />
          Keamanan & Izin Tool (Whitelist)
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Daftar folder dan perintah shell yang diizinkan selamanya tanpa memunculkan permintaan
          konfirmasi.
        </p>
      </div>

      <div className="space-y-2">
        {paths.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 bg-base-200/50 rounded-xl border border-white/5 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-white/30" />
            <p className="text-xs font-medium text-white/60">
              Belum ada izin permanen yang tersimpan.
            </p>
            <p className="text-[11px] text-white/40 max-w-sm">
              Ketika Mark meminta izin di percakapan, Anda dapat memilih "Izinkan Selamanya" untuk
              mendaftarkannya ke sini.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {paths.map((item) => {
              const isCommand = String(item).startsWith('cmd:')
              const displayVal = isCommand ? item.slice(4) : item

              return (
                <div
                  key={item}
                  className="flex items-center justify-between p-3 bg-base-200/80 rounded-xl border border-white/5 hover:border-white/10 transition-all gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="p-1.5 rounded-lg bg-black/40 text-white/70 shrink-0">
                      {isCommand ? (
                        <Terminal className="w-3.5 h-3.5 text-warning" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge badge-xs font-mono text-[9px] px-1.5 py-0.5 ${
                            isCommand
                              ? 'bg-warning/15 text-warning border-warning/30'
                              : 'bg-primary/15 text-primary border-primary/30'
                          }`}
                        >
                          {isCommand ? 'Perintah Shell' : 'Folder / Berkas'}
                        </span>
                      </div>
                      <span
                        className="font-mono text-xs text-white/90 truncate mt-0.5"
                        title={displayVal}
                      >
                        {displayVal}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={isDeleting === item}
                    className="btn btn-ghost btn-xs text-error hover:bg-error/20 p-1.5 h-auto rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Cabut Izin Permanen"
                  >
                    {isDeleting === item ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default PermissionsSection
