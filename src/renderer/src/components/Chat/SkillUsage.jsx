import PropTypes from 'prop-types'

export default function SkillUsage({ skills = [] }) {
  if (!skills.length) return null
  return (
    <details className="mb-3 text-xs text-white/50">
      <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-primary">
        Menggunakan {skills.map((skill) => skill.name).join(', ')}
      </summary>
      <ul className="mt-2 space-y-3 border-l border-white/10 pl-3">
        {skills.map((skill) => (
          <li key={skill.id} className="space-y-1 break-words">
            <p className="text-white/70">
              {skill.name} ·{' '}
              {skill.source === 'file'
                ? 'File lokal'
                : skill.source === 'builtin'
                  ? 'Bawaan Mark'
                  : 'Hasil pembelajaran'}
            </p>
            {skill.skillFile && <p className="break-all">{skill.skillFile}</p>}
            {skill.resources?.map((file) => (
              <p key={file} className="break-all">
                Referensi: {file}
              </p>
            ))}
            {skill.metadataWarnings?.map((warning) => (
              <p key={warning} className="text-warning">
                {warning}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  )
}
SkillUsage.propTypes = { skills: PropTypes.array }
