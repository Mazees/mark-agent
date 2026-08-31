import {
  FaFire,
  FaBrain,
  FaClock,
  FaCommentDots,
  FaChevronRight,
  FaShieldAlt,
  FaChartBar,
  FaTheaterMasks,
  FaRobot,
  FaDatabase,
  FaDownload,
  FaUpload,
  FaTrash
} from 'react-icons/fa'
import { TRAIT_META, describeLevel, describePersonality } from './traitMeta'

export const EmotionalCortexLobe = ({
  traits,
  isFullView = false,
  onNavigateToFull,
  onResetAi,
  onExportDatabase,
  onRestoreDatabase,
  isExportingDb = false,
  isRestoringDb = false
}) => {
  if (isFullView) {
    return (
      <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar max-w-5xl mx-auto w-full pb-12">
        {/* Personality Status Banner */}
        <div className="p-6 rounded-2xl bg-base-200/70 border border-white/5 backdrop-blur-md shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-bold text-primary flex items-center gap-2 uppercase tracking-wider">
              <FaBrain className="text-primary" /> Status Kepribadian & Karakter Mark
            </span>
            {traits?.evalCount > 0 && (
              <span className="text-xs font-mono text-base-content/50 flex items-center gap-2">
                <FaClock /> Evaluasi ke-{traits.evalCount}
              </span>
            )}
          </div>
          <p className="text-base text-base-content/90 leading-relaxed font-sans font-medium">
            {describePersonality(traits)}
          </p>
          {traits?.lastEvaluation && (
            <p className="text-xs text-base-content/40 mt-3 font-mono">
              Terakhir diperbarui:{' '}
              {new Date(traits.lastEvaluation).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}
            </p>
          )}
        </div>

        {/* 5 Trait Rings Grid */}
        <div>
          <h3 className="text-xs font-bold font-mono text-base-content/60 uppercase tracking-wider mb-3">
            5 Dimensi Sifat & Karakter
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {TRAIT_META.map((t) => {
              const val = traits?.[t.key] ?? 0.5
              const pct = Math.round(val * 100)
              const r = 38
              const circ = 2 * Math.PI * r
              const offset = circ - (pct / 100) * circ
              return (
                <div
                  key={t.key}
                  className={`p-4 rounded-2xl bg-base-200/50 border border-white/5 ring-1 ${t.ring} flex flex-col items-center text-center gap-3 transition-all hover:bg-base-200/80 shadow-md`}
                >
                  <div className="relative w-24 h-24">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r={r}
                        fill="none"
                        strokeWidth="5"
                        className="stroke-white/5"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={r}
                        fill="none"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        stroke={t.hex}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className={`absolute inset-0 flex flex-col items-center justify-center ${t.color}`}>
                      <t.icon className="text-xl mb-0.5 opacity-90" />
                      <span className="text-xs font-bold font-mono text-base-content">{pct}%</span>
                    </div>
                  </div>
                  <div>
                    <p className={`text-xs font-bold font-mono ${t.color}`}>{t.label}</p>
                    <p className="text-[10px] text-base-content/50 leading-tight mt-0.5">{t.desc}</p>
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-base-300 border border-white/5 text-base-content/70">
                      {describeLevel(val)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Reasoning Log */}
        {traits?.reasoning && (
          <div className="p-5 rounded-2xl bg-base-200/60 border border-white/5 backdrop-blur-md">
            <p className="text-xs font-mono font-bold text-base-content/60 mb-2 flex items-center gap-2">
              <FaCommentDots className="text-primary" /> ALASAN PERUBAHAN SIKAP TERAKHIR:
            </p>
            <p className="text-sm text-base-content/80 italic font-sans leading-relaxed bg-base-300/60 p-4 rounded-xl border border-white/5">
              &ldquo;{traits.reasoning}&rdquo;
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div>
          <h3 className="text-xs font-bold font-mono text-base-content/60 uppercase tracking-wider mb-3">
            Ringkasan Statistik Sifat
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                label: 'Total Evaluasi',
                value: traits?.evalCount || 0,
                icon: FaChartBar,
                color: 'text-primary',
                sub: 'Frekuensi adaptasi'
              },
              {
                label: 'Kehangatan',
                value: ((traits?.warmth || 0.5) * 100).toFixed(0) + '%',
                icon: FaFire,
                color: 'text-error',
                sub: describeLevel(traits?.warmth || 0.5)
              },
              {
                label: 'Kepercayaan',
                value: ((traits?.trust || 0.5) * 100).toFixed(0) + '%',
                icon: FaShieldAlt,
                color: 'text-success',
                sub: describeLevel(traits?.trust || 0.5)
              },
              {
                label: 'Sarkasme',
                value: ((traits?.sarcasm_level || 0.5) * 100).toFixed(0) + '%',
                icon: FaTheaterMasks,
                color: 'text-warning',
                sub: describeLevel(traits?.sarcasm_level || 0.5)
              },
              {
                label: 'Kepatuhan',
                value: ((traits?.obedience || 0.5) * 100).toFixed(0) + '%',
                icon: FaRobot,
                color: 'text-secondary',
                sub: describeLevel(traits?.obedience || 0.5)
              }
            ].map((stat, i) => {
              const StatIcon = stat.icon
              return (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-base-200/50 border border-white/5 hover:bg-base-200/80 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <StatIcon className={`text-sm ${stat.color}`} />
                    <span className="text-[11px] text-base-content/50 leading-none">{stat.label}</span>
                  </div>
                  <p className={`text-lg font-bold font-mono leading-none ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-base-content/40 mt-1.5 leading-none">{stat.sub}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pencadangan, Migrasi & Pemulihan Database */}
        <div className="p-5 rounded-2xl bg-base-200/70 border border-white/5 backdrop-blur-md shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold font-mono text-base-content/80 uppercase tracking-wider flex items-center gap-2">
              <FaDatabase className="text-primary" /> Pencadangan & Migrasi Database
            </h4>
            <p className="text-xs text-base-content/60 mt-1 max-w-xl">
              Simpan atau pulihkan seluruh memori kognitif, keahlian mandiri, arsip percakapan, dan dokumen Mark dalam format JSON untuk cadangan atau migrasi antar perangkat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onExportDatabase && (
              <button
                type="button"
                onClick={onExportDatabase}
                disabled={isExportingDb || isRestoringDb}
                className="btn btn-sm btn-outline btn-primary rounded-xl font-mono text-xs shadow-sm flex items-center gap-2"
              >
                {isExportingDb ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <FaDownload size={11} />
                )}
                Backup Database (JSON)
              </button>
            )}
            {onRestoreDatabase && (
              <button
                type="button"
                onClick={onRestoreDatabase}
                disabled={isExportingDb || isRestoringDb}
                className="btn btn-sm btn-outline btn-warning rounded-xl font-mono text-xs shadow-sm flex items-center gap-2"
              >
                {isRestoringDb ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <FaUpload size={11} />
                )}
                Restore Database
              </button>
            )}
            <button
              type="button"
              onClick={onResetAi}
              disabled={isExportingDb || isRestoringDb}
              className="btn btn-sm btn-outline btn-error rounded-xl font-mono text-xs shadow-sm flex items-center gap-1.5"
            >
              <FaTrash size={11} />
              Reset Total AI
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Embedded Column
  return (
    <div className="lg:col-span-4 bg-base-200/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col min-h-0 overflow-y-auto custom-scrollbar shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-bold font-mono text-base-content">
          <FaFire className="text-error" /> SIFAT & KARAKTER
        </div>
        {onNavigateToFull && (
          <button
            type="button"
            onClick={onNavigateToFull}
            className="text-[10px] font-mono text-base-content/50 hover:text-base-content flex items-center gap-1 cursor-pointer transition-colors"
          >
            Lihat Penuh <FaChevronRight size={8} />
          </button>
        )}
      </div>

      {/* Ringkasan Kepribadian */}
      <div className="p-3 bg-base-300/60 rounded-xl border border-white/5 mb-3 text-xs text-base-content/80 leading-relaxed font-sans">
        <span className="font-bold text-primary block mb-1 font-mono text-[10px] uppercase">
          SIKAP MARK SAAT INI:
        </span>
        {describePersonality(traits)}
      </div>

      {/* 5 Trait Progress Bars */}
      <div className="space-y-2.5 flex-1">
        {TRAIT_META.map((t) => {
          const val = traits?.[t.key] ?? 0.5
          const pct = Math.round(val * 100)
          return (
            <div
              key={t.key}
              className="p-2.5 bg-base-300/40 rounded-xl border border-white/5 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className={`flex items-center gap-1.5 font-medium ${t.color}`}>
                  <t.icon className="text-xs" /> {t.label}
                </span>
                <span className="font-semibold text-base-content/70">
                  {pct}% ({describeLevel(val)})
                </span>
              </div>
              <div className="w-full h-1.5 bg-base-content/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: t.hex }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Database Backup, Restore & Reset Buttons */}
      <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {onExportDatabase && (
            <button
              type="button"
              onClick={onExportDatabase}
              disabled={isExportingDb || isRestoringDb}
              className="btn btn-xs btn-outline btn-primary rounded-lg font-mono text-[10px] flex items-center justify-center gap-1.5"
              title="Backup Database ke JSON"
            >
              {isExportingDb ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <FaDownload size={9} />
              )}
              Backup JSON
            </button>
          )}
          {onRestoreDatabase && (
            <button
              type="button"
              onClick={onRestoreDatabase}
              disabled={isExportingDb || isRestoringDb}
              className="btn btn-xs btn-outline btn-warning rounded-lg font-mono text-[10px] flex items-center justify-center gap-1.5"
              title="Pulihkan Database dari JSON"
            >
              {isRestoringDb ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <FaUpload size={9} />
              )}
              Restore JSON
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onResetAi}
          disabled={isExportingDb || isRestoringDb}
          className="w-full py-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/20 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <FaTrash size={10} /> Reset Total AI
        </button>
      </div>
    </div>
  )
}

export default EmotionalCortexLobe
