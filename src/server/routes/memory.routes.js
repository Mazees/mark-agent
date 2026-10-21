import { Router } from 'express'
import { dbStore, normalizeSqliteId } from '../memory/db-store.js'
import { initOramaIndices } from '../memory/orama-store.js'
import { wsHub } from '../ws-hub.js'

export const memoryRouter = Router()

// 1. Memories
memoryRouter.get('/memories', (_req, res) => {
  res.json({ success: true, data: dbStore.memories.getAll() })
})

memoryRouter.post('/memories', (req, res) => {
  const item = req.body
  const record = dbStore.memories.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.delete('/memories/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.memories.delete(id)
  res.json({ success })
})

// 2. Chat Turns
memoryRouter.get('/turns', (_req, res) => {
  res.json({ success: true, data: dbStore.chatTurns.getAll() })
})

memoryRouter.post('/turns', (req, res) => {
  const item = req.body
  const record = dbStore.chatTurns.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.post('/turns/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.chatTurns.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

// 3. Sessions
memoryRouter.get('/sessions', (req, res) => {
  if (req.query.summary === 'true') {
    const summaries = dbStore.sqlite.prepare(`
      SELECT id, title, workspace_root AS workspaceRoot, is_auto_mode AS isAutoMode, timestamp
      FROM sessions ORDER BY rowid ASC
    `).all()
    return res.json({ success: true, data: summaries })
  }
  res.json({ success: true, data: dbStore.sessions.getAll() })
})

memoryRouter.get('/sessions/:id', (req, res) => {
  const { id } = req.params
  if (req.query.summary === 'true') {
    const summary = dbStore.sqlite.prepare(`
      SELECT id, title, workspace_root AS workspaceRoot, is_auto_mode AS isAutoMode, timestamp
      FROM sessions WHERE id = ?
    `).get(normalizeSqliteId(id))
    return res.json({ success: true, data: summary || null })
  }
  const session = dbStore.sessions.getById(id)
  res.json({ success: true, data: session })
})

memoryRouter.post('/sessions', (req, res) => {
  const item = req.body
  const record = dbStore.sessions.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.post('/sessions/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.sessions.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

memoryRouter.delete('/sessions/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.sessions.delete(id)
  dbStore.sessionCompact.delete(id)
  res.json({ success })
})

// 3b. Session Compact
memoryRouter.get('/session-compact/:id', (req, res) => {
  try {
    const { id } = req.params
    const compact = dbStore.sessionCompact.getById(id)
    res.json({ success: true, data: compact || null })
  } catch (err) {
    console.error('[memory.routes] Error GET /session-compact/:id:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/session-compact', (req, res) => {
  try {
    const item = req.body
    const record = dbStore.sessionCompact.insert(item)
    res.json({ success: true, data: record })
  } catch (err) {
    console.error('[memory.routes] Error POST /session-compact:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.delete('/session-compact/:id', (req, res) => {
  try {
    const { id } = req.params
    const success = dbStore.sessionCompact.delete(id)
    res.json({ success })
  } catch (err) {
    console.error('[memory.routes] Error DELETE /session-compact/:id:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// 4. Chat Archives
memoryRouter.get('/archives', (_req, res) => {
  res.json({ success: true, data: dbStore.chatArchives.getAll() })
})

memoryRouter.post('/archives', (req, res) => {
  const item = req.body
  const record = dbStore.chatArchives.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.delete('/archives/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.chatArchives.delete(id)
  res.json({ success })
})

// 6. Relationships 4D
memoryRouter.get('/relationships/:userId', (req, res) => {
  const { userId } = req.params
  const rel = dbStore.relationships.getById(userId)
  res.json({ success: true, data: rel })
})

memoryRouter.post('/relationships', (req, res) => {
  const item = req.body
  const record = dbStore.relationships.insert(item)
  res.json({ success: true, data: record })
})

// 7. Database Backup & Restore API
memoryRouter.get('/db/export', (_req, res) => {
  try {
    const dump = dbStore.exportFullDatabase()
    res.json({ success: true, data: dump })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/db/restore', async (req, res) => {
  const { dumpData, overwrite = true } = req.body || {}
  if (!dumpData) {
    return res.status(400).json({ success: false, error: 'dumpData tidak boleh kosong' })
  }
  try {
    const result = dbStore.restoreFullDatabase(dumpData, { overwrite })
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), imported: result.imported })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/db/reset-ai', async (_req, res) => {
  try {
    const result = dbStore.resetAllExceptConfig()
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), reset: true })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 8. Vector Embedding API
memoryRouter.post('/vector', async (req, res) => {
  const { text } = req.body || {}
  try {
    const { generateVector } = await import('../memory/vector-engine.js')
    const vector = await generateVector(text)
    res.json({ success: true, vector })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
