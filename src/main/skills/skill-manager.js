import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import AdmZip from 'adm-zip'

export function getSkillsDirectory() {
  const dir = path.join(os.homedir(), 'Documents', 'Mark Skills')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export async function listAllSkills() {
  const dir = getSkillsDirectory()
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFolderPath = path.join(dir, entry.name)
      const skillMdPath = path.join(skillFolderPath, 'SKILL.md')
      let name = entry.name
      let description = 'Custom Mark Skill'
      let author = 'User'
      let tags = []

      if (fs.existsSync(skillMdPath)) {
        try {
          const raw = await fs.promises.readFile(skillMdPath, 'utf-8')
          const parsed = matter(raw)
          if (parsed.data.name) name = parsed.data.name
          if (parsed.data.description) description = parsed.data.description
          if (parsed.data.author) author = parsed.data.author
          if (Array.isArray(parsed.data.tags)) tags = parsed.data.tags
        } catch (_) {}
      }

      skills.push({
        name,
        folderName: entry.name,
        description,
        author,
        tags,
        path: skillFolderPath,
        hasSkillMd: fs.existsSync(skillMdPath)
      })
    } else if (entry.name.endsWith('.md')) {
      // Auto-migrate standalone .md to folder format
      const cleanName = entry.name.replace('.md', '')
      const folderPath = path.join(dir, cleanName)
      const fullPath = path.join(dir, entry.name)
      if (!fs.existsSync(folderPath)) {
        await fs.promises.mkdir(folderPath, { recursive: true })
        const newFilePath = path.join(folderPath, 'SKILL.md')
        await fs.promises.rename(fullPath, newFilePath)
      }

      const skillMdPath = path.join(folderPath, 'SKILL.md')
      let name = cleanName
      let description = 'Custom Mark Skill'
      let author = 'User'
      let tags = []
      if (fs.existsSync(skillMdPath)) {
        try {
          const raw = await fs.promises.readFile(skillMdPath, 'utf-8')
          const parsed = matter(raw)
          if (parsed.data.name) name = parsed.data.name
          if (parsed.data.description) description = parsed.data.description
          if (parsed.data.author) author = parsed.data.author
          if (Array.isArray(parsed.data.tags)) tags = parsed.data.tags
        } catch (_) {}
      }

      skills.push({
        name,
        folderName: cleanName,
        description,
        author,
        tags,
        path: folderPath,
        hasSkillMd: true
      })
    }
  }
  return skills
}

export async function getSkillFileTree(skillFolderName) {
  const dir = getSkillsDirectory()
  const rootSkillPath = path.join(dir, skillFolderName)
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
  const dir = getSkillsDirectory()
  const fullPath = path.resolve(dir, skillFolderName, relativeFilePath)
  const rootSkillPath = path.resolve(dir, skillFolderName)

  if (!fullPath.startsWith(rootSkillPath)) {
    throw new Error('Akses direktori di luar batas skill dilarang.')
  }

  if (!fs.existsSync(fullPath)) {
    return ''
  }
  return await fs.promises.readFile(fullPath, 'utf-8')
}

export async function writeSkillFileContent(skillFolderName, relativeFilePath, content) {
  const dir = getSkillsDirectory()
  const fullPath = path.resolve(dir, skillFolderName, relativeFilePath)
  const rootSkillPath = path.resolve(dir, skillFolderName)

  if (!fullPath.startsWith(rootSkillPath)) {
    throw new Error('Akses direktori di luar batas skill dilarang.')
  }

  const parentDir = path.dirname(fullPath)
  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true })
  }

  await fs.promises.writeFile(fullPath, content, 'utf-8')
  return true
}

export async function createSkillItem(skillFolderName, relativePath, isFolder = false) {
  const dir = getSkillsDirectory()
  const fullPath = path.resolve(dir, skillFolderName, relativePath)
  const rootSkillPath = path.resolve(dir, skillFolderName)

  if (!fullPath.startsWith(rootSkillPath)) {
    throw new Error('Akses direktori tidak valid.')
  }

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
  const dir = getSkillsDirectory()
  const oldPath = path.resolve(dir, skillFolderName, oldRelativePath)
  const newPath = path.resolve(dir, skillFolderName, newRelativePath)
  const rootSkillPath = path.resolve(dir, skillFolderName)

  if (!oldPath.startsWith(rootSkillPath) || !newPath.startsWith(rootSkillPath)) {
    throw new Error('Akses direktori tidak valid.')
  }

  if (fs.existsSync(oldPath)) {
    await fs.promises.rename(oldPath, newPath)
    return true
  }
  return false
}

export async function deleteSkillItem(skillFolderName, relativePath) {
  const dir = getSkillsDirectory()
  const fullPath = path.resolve(dir, skillFolderName, relativePath)
  const rootSkillPath = path.resolve(dir, skillFolderName)

  if (!fullPath.startsWith(rootSkillPath)) {
    throw new Error('Akses direktori tidak valid.')
  }

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
  const dir = getSkillsDirectory()
  const fullPath = path.resolve(dir, skillFolderName)
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
    const skillEntry = entries.find((e) => e.entryName === 'SKILL.md' || e.entryName.endsWith('/SKILL.md'))
    if (skillEntry) {
      try {
        const text = skillEntry.getData().toString('utf-8')
        const parsed = matter(text)
        if (parsed.data.name) detectedName = parsed.data.name
      } catch (_) {}
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
