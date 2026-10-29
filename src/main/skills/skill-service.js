import { createHash } from 'node:crypto'
import { NATIVE_SKILLS } from '../../shared/agent/native-skills.js'
import { listFileSkills, readFileSkill } from './skill-registry.js'

const version = (value) => createHash('sha256').update(value).digest('hex')
const metadata = ({ content, ...skill }) => {
  void content
  return skill
}
export function createSkillService({
  listFiles = listFileSkills,
  readFile = readFileSkill,
  getLearned = async () => [],
  builtins = NATIVE_SKILLS
} = {}) {
  const builtinRecords = () =>
    builtins.map((skill) => ({
      ...skill,
      id: 'builtin:' + skill.name,
      source: 'builtin',
      basePath: null,
      skillFile: null,
      contentHash: version(skill.content),
      metadataWarnings: [],
      allowImplicitInvocation: true
    }))
  const learnedRecords = async () =>
    (await getLearned()).map((skill) => ({
      id: 'learned:' + skill.id,
      name: skill.name || skill.id,
      description: skill.description || '',
      source: 'learned',
      basePath: null,
      skillFile: null,
      content: skill.content || '',
      contentHash: version(skill.content || ''),
      metadataWarnings: [],
      allowImplicitInvocation: true
    }))
  const catalog = async () => [
    ...builtinRecords().map(metadata),
    ...(await listFiles()),
    ...(await learnedRecords()).map(metadata)
  ]
  const read = async (reference, relativePath = null) => {
    if (typeof reference !== 'string' || !reference.trim())
      throw new Error('Isi skill_id atau skill_name.')
    const all = await catalog()
    let match = all.find((skill) => skill.id === reference)
    if (!match) {
      const candidates = all.filter(
        (skill) =>
          skill.name.toLowerCase() === reference.toLowerCase() ||
          skill.folderName?.toLowerCase() === reference.toLowerCase() ||
          skill.aliases?.some((alias) => alias.toLowerCase() === reference.toLowerCase())
      )
      const reserved = candidates.find((skill) => skill.source === 'builtin')
      if (!reserved && candidates.length > 1)
        throw new Error(
          'Nama skill ambigu. Pilih skill_id: ' + candidates.map((skill) => skill.id).join(', ')
        )
      match = reserved || candidates[0]
    }
    if (!match) throw new Error('Skill tidak ditemukan: ' + reference)
    if (match.source === 'file') return readFile(match.folderName || match.id, relativePath)
    if (relativePath) throw new Error('Skill ini tidak memiliki folder referensi.')
    return [...builtinRecords(), ...(await learnedRecords())].find((skill) => skill.id === match.id)
  }
  const search = async (query = '', limit = 20) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const all = await catalog()
    const matches = all.filter((skill) =>
      terms.every((term) =>
        [skill.name, skill.description, skill.folderName].join(' ').toLowerCase().includes(term)
      )
    )
    return {
      total: matches.length,
      skills: matches.slice(0, Math.min(50, Math.max(1, Number(limit) || 20)))
    }
  }
  return { catalog, read, search }
}

export const skillService = createSkillService({
  getLearned: async () => {
    const { dbStore } = await import('../../server/memory/db-store.js')
    return dbStore.learnedSkills.getAll()
  }
})
