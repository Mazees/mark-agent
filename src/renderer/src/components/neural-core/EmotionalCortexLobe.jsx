import PropTypes from 'prop-types'
import { TRAIT_META, describeLevel, describePersonality } from './traitMeta'
import { neuralDate } from './neuralCoreData'

export const EmotionalCortexLobe = ({ traits }) => {
  return (
    <section aria-labelledby="character-title" className="space-y-8">
      <div>
        <h2 id="character-title" className="text-base font-medium text-white/90">
          Karakter Mark
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          {traits ? describePersonality(traits) : 'Belum ada data karakter yang tersimpan.'}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          {traits?.evalCount || 0} evaluasi
          {traits?.lastEvaluation ? ` · Diperbarui ${neuralDate(traits.lastEvaluation)}` : ''}
        </p>
      </div>
      <div className="divide-y divide-white/10">
        {TRAIT_META.map((trait) => {
          const raw = traits?.[trait.key] ?? 0.5
          const value = Number.isFinite(Number(raw)) ? Math.min(1, Math.max(0, Number(raw))) : 0.5
          const percent = Math.round(value * 100)
          return (
            <div key={trait.key} className="py-5 first:pt-0">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <h3 className="text-sm font-medium text-white/85">{trait.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">{trait.desc}</p>
                </div>
                <p className="shrink-0 text-right text-sm tabular-nums text-white/75">
                  {percent}%
                  <span className="mt-1 block text-xs text-white/40">{describeLevel(value)}</span>
                </p>
              </div>
              <meter aria-label={trait.label} min="0" max="1" value={value} className="sr-only" />
              <div
                aria-hidden="true"
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full bg-primary/80 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {traits?.reasoning && (
        <section className="border-t border-white/10 pt-6">
          <h3 className="text-sm font-medium text-white/85">Alasan perubahan terakhir</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/60">
            {traits.reasoning}
          </p>
        </section>
      )}
    </section>
  )
}
EmotionalCortexLobe.propTypes = { traits: PropTypes.object }
export default EmotionalCortexLobe
