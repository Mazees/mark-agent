import fs from 'node:fs/promises'
import path from 'node:path'
import { getSkillsDirectory, getLegacySkillsDirectory } from './skill-paths.js'

let activeMigration = null

async function legacyEntries() {
  try {
    return (await fs.readdir(getLegacySkillsDirectory(), { withFileTypes: true })).filter(
      (entry) =>
        !entry.name.startsWith('.') &&
        (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith('.md')))
    )
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const folderName = (entry) => (entry.isDirectory() ? entry.name : entry.name.slice(0, -3))

export async function getSkillMigrationStatus() {
  const directory = getSkillsDirectory()
  const entries = await legacyEntries()
  const existing = new Set((await fs.readdir(directory)).map((name) => name.toLowerCase()))
  return {
    directory,
    source: getLegacySkillsDirectory(),
    pending: entries.length,
    conflicts: entries
      .filter((entry) => existing.has(folderName(entry).toLowerCase()))
      .map((entry) => entry.name)
  }
}

async function runMigration() {
  const status = await getSkillMigrationStatus()
  const report = {
    success: true,
    directory: status.directory,
    source: status.source,
    migrated: [],
    conflicts: [],
    failed: []
  }
  const existing = new Set((await fs.readdir(status.directory)).map((name) => name.toLowerCase()))
  for (const entry of await legacyEntries()) {
    const name = folderName(entry)
    if (!name || name === '.' || name === '..' || existing.has(name.toLowerCase())) {
      report.conflicts.push(entry.name)
      continue
    }
    const source = path.resolve(status.source, entry.name)
    const target = path.resolve(status.directory, name)
    if (
      path.dirname(source) !== path.resolve(status.source) ||
      path.dirname(target) !== path.resolve(status.directory)
    ) {
      report.failed.push({ name: entry.name, error: 'Lokasi migrasi tidak valid.' })
      continue
    }
    try {
      if (entry.isDirectory()) {
        await fs.rename(source, target)
      } else {
        await fs.mkdir(target)
        try {
          await fs.rename(source, path.join(target, 'SKILL.md'))
        } catch (error) {
          await fs.rmdir(target).catch(() => {})
          throw error
        }
      }
      existing.add(name.toLowerCase())
      report.migrated.push(name)
    } catch (error) {
      report.failed.push({ name: entry.name, error: error.message })
    }
  }
  report.pending = (await legacyEntries()).length
  return report
}

export function migrateLegacySkills() {
  if (!activeMigration)
    activeMigration = runMigration().finally(() => {
      activeMigration = null
    })
  return activeMigration
}
