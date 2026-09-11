import { Router, raw } from 'express'
import { dbStore } from '../memory/db-store.js'
import { wsHub } from '../ws-hub.js'
import {
  listAllSkills,
  getSkillFileTree,
  readSkillFileContent,
  writeSkillFileContent,
  createSkillItem,
  renameSkillItem,
  deleteSkillItem,
  deleteFullSkill,
  installSkillPackage
} from '../../main/skills/skill-manager.js'

export const skillsRouter = Router()

// 1. Learned Skills Database API
skillsRouter.get('/learned-skills', (_req, res) => {
  res.json({ success: true, data: dbStore.learnedSkills.getAll() })
})

skillsRouter.post('/learned-skills', (req, res) => {
  const item = req.body
  const record = dbStore.learnedSkills.insert(item)
  res.json({ success: true, data: record })
})

skillsRouter.delete('/learned-skills/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.learnedSkills.delete(id)
  res.json({ success })
})

// 2. Pure Node.js Mark Skills File System API
skillsRouter.get('/skills', async (_req, res) => {
  try {
    const skills = await listAllSkills()
    res.json({ success: true, data: skills })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.get('/skills/:name/tree', async (req, res) => {
  const { name } = req.params
  try {
    const tree = await getSkillFileTree(name)
    res.json({ success: true, data: tree })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.get('/skills/:name/file', async (req, res) => {
  const { name } = req.params
  const filePath = req.query.filePath || 'SKILL.md'
  try {
    const content = await readSkillFileContent(name, filePath)
    res.json({ success: true, data: { content, filePath } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.post('/skills/:name/file', async (req, res) => {
  const { name } = req.params
  const { filePath = 'SKILL.md', content = '' } = req.body || {}
  try {
    await writeSkillFileContent(name, filePath, content)
    wsHub.broadcast('skills:updated', { name, filePath, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.post('/skills/:name/item', async (req, res) => {
  const { name } = req.params
  const { itemPath, isFolder = false } = req.body || {}
  try {
    await createSkillItem(name, itemPath, isFolder)
    wsHub.broadcast('skills:updated', { name, itemPath, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.post('/skills/:name/rename', async (req, res) => {
  const { name } = req.params
  const { oldPath, newPath } = req.body || {}
  try {
    const success = await renameSkillItem(name, oldPath, newPath)
    wsHub.broadcast('skills:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.delete('/skills/:name/item', async (req, res) => {
  const { name } = req.params
  const itemPath = req.query.itemPath || req.body?.itemPath
  try {
    const success = await deleteSkillItem(name, itemPath)
    wsHub.broadcast('skills:updated', { name, itemPath, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.delete('/skills/:name', async (req, res) => {
  const { name } = req.params
  try {
    const success = await deleteFullSkill(name)
    wsHub.broadcast('skills:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

skillsRouter.post(
  '/skills/install',
  raw({ type: 'application/zip', limit: '50mb' }),
  async (req, res) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)
      const overrideName = req.query.name || null
      const result = await installSkillPackage(buffer, overrideName)
      wsHub.broadcast('skills:updated', { ...result, timestamp: Date.now() })
      res.json(result)
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
)
