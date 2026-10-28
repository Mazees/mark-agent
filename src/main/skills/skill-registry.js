import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { getSkillsDirectory } from './skill-paths.js'

const hash = (text) => createHash('sha256').update(text).digest('hex')
const cache = new Map()
const inside = (root, target) => {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
}

async function descriptor(folderName) {
  const basePath = await fs.realpath(path.join(getSkillsDirectory(), folderName))
  const skillFile = await fs.realpath(path.join(basePath, 'SKILL.md'))
  if (!inside(basePath, skillFile)) throw new Error('SKILL.md berada di luar folder skill.')
  const raw = await fs.readFile(skillFile, 'utf8')
  let extra = ''
  try {
    const metadataFile = await fs.realpath(path.join(basePath, 'agents', 'openai.yaml'))
    if (!inside(basePath, metadataFile)) throw new Error('Metadata berada di luar folder skill.')
    extra = await fs.readFile(metadataFile, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const contentHash = hash(raw + '\0' + extra)
  const key = skillFile + '\0' + contentHash
  if (cache.has(key)) return { ...cache.get(key), folderName }
  let data = {},
    metadata = {},
    content = raw
  const warnings = []
  try {
    const parsed = matter(raw)
    data = parsed.data
    content = parsed.content.trim()
  } catch {
    warnings.push('Frontmatter YAML tidak valid.')
  }
  if (typeof data.name !== 'string' || !data.name.trim())
    warnings.push('Metadata name belum diisi.')
  if (typeof data.description !== 'string' || !data.description.trim())
    warnings.push('Metadata description belum diisi.')
  if (extra) {
    try {
      metadata = matter('---\n' + extra + '\n---\n').data
    } catch {
      warnings.push('agents/openai.yaml tidak valid.')
    }
  }
  const record = {
    id:
      'file:' +
      hash(process.platform === 'win32' ? skillFile.toLowerCase() : skillFile).slice(0, 24),
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : folderName,
    description: typeof data.description === 'string' ? data.description : '',
    title: metadata.interface?.display_name || null,
    source: 'file',
    folderName,
    path: basePath,
    basePath,
    skillFile,
    contentHash,
    content,
    author: typeof data.author === 'string' ? data.author : '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    hasSkillMd: true,
    metadataWarnings: warnings,
    allowImplicitInvocation:
      !warnings.length && metadata.policy?.allow_implicit_invocation !== false,
    dependencies: Array.isArray(metadata.dependencies?.tools) ? metadata.dependencies.tools : [],
    allowedTools: typeof data['allowed-tools'] === 'string' ? data['allowed-tools'] : null
  }
  cache.set(key, record)
  if (cache.size > 128) cache.delete(cache.keys().next().value)
  return record
}

export async function listFileSkills() {
  const entries = await fs.readdir(getSkillsDirectory(), { withFileTypes: true })
  const records = await Promise.all(
    entries
      .filter(
        (entry) => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink())
      )
      .map(async (entry) => {
        try {
          const { content, ...metadata } = await descriptor(entry.name)
          void content
          return metadata
        } catch (error) {
          if (error.code === 'ENOENT') return null
          return {
            id: 'file-error:' + hash(entry.name).slice(0, 24),
            name: entry.name,
            folderName: entry.name,
            description: '',
            source: 'file',
            path: path.join(getSkillsDirectory(), entry.name),
            hasSkillMd: false,
            allowImplicitInvocation: false,
            metadataWarnings: ['Skill belum dapat dibaca.']
          }
        }
      })
  )
  const unique = new Map()
  for (const record of records.filter(Boolean)) {
    const previous = unique.get(record.id)
    unique.set(record.id, {
      ...record,
      aliases: [...new Set([...(previous?.aliases || []), record.folderName])]
    })
  }
  return [...unique.values()]
}

export async function readFileSkill(reference, relativePath = null) {
  let record = null
  if (
    typeof reference === 'string' &&
    reference !== '.' &&
    reference !== '..' &&
    !/[\\/:]/.test(reference)
  ) {
    try {
      record = await descriptor(reference)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  if (!record) {
    const catalog = await listFileSkills()
    const matches = catalog.filter(
      (skill) =>
        skill.id === reference ||
        skill.folderName === reference ||
        skill.name.toLowerCase() === String(reference).toLowerCase()
    )
    const exact = matches.find((skill) => skill.id === reference)
    if (!exact && matches.length > 1)
      throw new Error('Nama skill ambigu. Gunakan skill_id dari katalog.')
    const match = exact || matches[0]
    if (!match) throw new Error('Skill tidak ditemukan: ' + reference)
    record = await descriptor(match.folderName)
  }
  if (!relativePath || relativePath === 'SKILL.md') return record
  if (
    typeof relativePath !== 'string' ||
    path.isAbsolute(relativePath) ||
    /^[a-z]:/i.test(relativePath)
  )
    throw new Error('Gunakan lokasi referensi relatif terhadap folder skill.')
  const resourcePath = await fs.realpath(path.resolve(record.basePath, relativePath))
  if (!inside(record.basePath, resourcePath))
    throw new Error('Referensi berada di luar folder skill.')
  const content = await fs.readFile(resourcePath, 'utf8')
  return {
    ...record,
    content,
    resourcePath,
    relativePath,
    isResource: true,
    contentHash: hash(content)
  }
}
