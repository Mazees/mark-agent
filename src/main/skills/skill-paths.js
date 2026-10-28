import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getSkillsDirectory() {
  const directory = path.join(os.homedir(), '.agents', 'skills')
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

export function getLegacySkillsDirectory() {
  return path.join(os.homedir(), 'Documents', 'Mark Skills')
}

export function getSkillRoot(name) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name === '.' ||
    name === '..' ||
    /[\\/:]/.test(name)
  )
    throw new Error('Nama folder skill tidak valid.')
  return path.join(getSkillsDirectory(), name)
}

export function resolveSkillFile(name, relativePath) {
  const root = getSkillRoot(name)
  if (typeof relativePath !== 'string' || !relativePath.trim())
    throw new Error('Lokasi file skill tidak valid.')
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  )
    throw new Error('Lokasi file harus berada di dalam folder skill.')
  return target
}
