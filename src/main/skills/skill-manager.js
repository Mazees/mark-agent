import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import AdmZip from 'adm-zip'
import { getSkillsDirectory, getSkillRoot, resolveSkillFile } from './skill-paths.js'

export { getSkillsDirectory } from './skill-paths.js'

export { listFileSkills as listAllSkills } from './skill-registry.js'

export async function getSkillFileTree(skillFolderName) {
  const rootSkillPath = getSkillRoot(skillFolderName)
  if (!fs.existsSync(rootSkillPath)) return []

  async function walk(currentPath, relativePath = '') {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
    const nodes = []

    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
      const entryFullPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        const children = await walk(entryFullPath, entryRelPath)
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: 'folder',
          children
        })
      } else {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: 'file'
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'folder' ? -1 : 1
    })
  }

  return await walk(rootSkillPath)
}

export async function readSkillFileContent(skillFolderName, relativeFilePath) {
  const fullPath = resolveSkillFile(skillFolderName, relativeFilePath)

  if (!fs.existsSync(fullPath)) {
    return ''
  }
  return await fs.promises.readFile(fullPath, 'utf-8')
}

export async function writeSkillFileContent(skillFolderName, relativeFilePath, content) {
  const fullPath = resolveSkillFile(skillFolderName, relativeFilePath)

  const parentDir = path.dirname(fullPath)
  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true })
  }

  await fs.promises.writeFile(fullPath, content, 'utf-8')
  return true
}

export async function createSkillItem(skillFolderName, relativePath, isFolder = false) {
  const fullPath = resolveSkillFile(skillFolderName, relativePath)

  if (isFolder) {
    if (!fs.existsSync(fullPath)) {
      await fs.promises.mkdir(fullPath, { recursive: true })
    }
  } else {
    const parent = path.dirname(fullPath)
    if (!fs.existsSync(parent)) {
      await fs.promises.mkdir(parent, { recursive: true })
    }
    if (!fs.existsSync(fullPath)) {
      await fs.promises.writeFile(fullPath, '', 'utf-8')
    }
  }
  return true
}

export async function renameSkillItem(skillFolderName, oldRelativePath, newRelativePath) {
  const oldPath = resolveSkillFile(skillFolderName, oldRelativePath)
  const newPath = resolveSkillFile(skillFolderName, newRelativePath)

  if (fs.existsSync(oldPath)) {
    await fs.promises.rename(oldPath, newPath)
    return true
  }
  return false
}

export async function deleteSkillItem(skillFolderName, relativePath) {
  const fullPath = resolveSkillFile(skillFolderName, relativePath)

  if (fs.existsSync(fullPath)) {
    const stat = await fs.promises.stat(fullPath)
    if (stat.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(fullPath)
    }
    return true
  }
  return false
}

export async function deleteFullSkill(skillFolderName) {
  const fullPath = getSkillRoot(skillFolderName)
  if (fs.existsSync(fullPath)) {
    await fs.promises.rm(fullPath, { recursive: true, force: true })
    return true
  }
  return false
}

export async function installSkillPackage(zipBuffer, overrideName = null) {
  const dir = getSkillsDirectory()
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()

  let detectedName = overrideName
  if (!detectedName) {
    const skillEntry = entries.find(
      (e) => e.entryName === 'SKILL.md' || e.entryName.endsWith('/SKILL.md')
    )
    if (skillEntry) {
      try {
        const text = skillEntry.getData().toString('utf-8')
        const parsed = matter(text)
        if (parsed.data.name) detectedName = parsed.data.name
      } catch {
        detectedName = null
      }
    }
  }

  if (!detectedName) {
    detectedName = `skill-${Date.now()}`
  }

  const cleanFolderName = detectedName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  const targetFolder = path.join(dir, cleanFolderName)

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true })
  }

  zip.extractAllTo(targetFolder, true)
  return { success: true, folderName: cleanFolderName }
}
