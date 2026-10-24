import { GraduationCap, Search } from 'lucide-react'
import PropTypes from 'prop-types'
import { neuralDate } from './neuralCoreData'

export const ProceduralMatrixLobe = ({
  learnedSkills = [],
  skillSearch,
  setSkillSearch,
  onSelectSkill
}) => {
  const term = skillSearch.trim().toLowerCase()
  const skills = learnedSkills.filter((skill) =>
    [skill.name, skill.description].join(' ').toLowerCase().includes(term)
  )
  return (
    <section aria-labelledby="learned-skills-title">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <h2 id="learned-skills-title" className="text-base font-medium text-white/90">
            Skill yang dipelajari <span className="ml-1 text-white/40">{learnedSkills.length}</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Panduan yang disimpan Mark dari tugas dan pengalaman sebelumnya.
          </p>
        </div>
        <label className="relative w-full shrink-0 sm:w-64">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            aria-label="Cari skill yang dipelajari"
            value={skillSearch}
            onChange={(event) => setSkillSearch(event.target.value)}
            placeholder="Cari skill..."
            className="h-10 w-full rounded-full border border-white/15 bg-transparent pl-10 pr-4 text-sm outline-none focus:border-primary/60"
          />
        </label>
      </header>
      {skills.length ? (
        <div className="mt-6 grid grid-cols-1 gap-x-10 md:grid-cols-2">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onSelectSkill(skill)}
              className="flex min-w-0 items-start gap-4 rounded-lg px-4 py-5 text-left hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 text-primary">
                <GraduationCap size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-white/90">
                  {skill.name}
                </span>
                <span className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-white/55">
                  {skill.description || 'Belum ada deskripsi.'}
                </span>
                <span className="mt-2 block text-xs text-white/35">
                  {neuralDate(skill.updatedAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p role="status" className="py-12 text-sm leading-relaxed text-white/45">
          {term
            ? 'Tidak ada skill yang sesuai dengan pencarian ini.'
            : 'Belum ada skill yang dipelajari. Panduan yang disimpan Mark akan muncul di sini.'}
        </p>
      )}
    </section>
  )
}
ProceduralMatrixLobe.propTypes = {
  learnedSkills: PropTypes.array,
  skillSearch: PropTypes.string.isRequired,
  setSkillSearch: PropTypes.func.isRequired,
  onSelectSkill: PropTypes.func.isRequired
}
export default ProceduralMatrixLobe
