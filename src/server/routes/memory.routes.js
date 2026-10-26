import { subagentRuntime } from '../services/subagents/service.js'
import { Router } from 'express'
import { dbStore, normalizeSqliteId } from '../memory/db-store.js'
import { initOramaIndices } from '../memory/orama-store.js'
import { wsHub } from '../ws-hub.js'
import { sessionForClient, isInvalidMainWorkspace } from '../workspace-policy.js'
import { recoverTaskWorkflows } from '../services/task-workflow.js'

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
    const summaries = dbStore.sqlite
      .prepare(
        `
      SELECT id, title, workspace_root AS workspaceRoot, is_auto_mode AS isAutoMode, timestamp
      FROM sessions ORDER BY rowid ASC
    `
      )
      .all()
    return res.json({ success: true, data: summaries.map(sessionForClient) })
  }
  res.json({ success: true, data: dbStore.sessions.getAll().map(sessionForClient) })
})

memoryRouter.get('/sessions/:id', (req, res) => {
  const { id } = req.params
  if (req.query.summary === 'true') {
    const summary = dbStore.sqlite
      .prepare(
        `
      SELECT id, title, workspace_root AS workspaceRoot, is_auto_mode AS isAutoMode, timestamp
      FROM sessions WHERE id = ?
    `
      )
      .get(normalizeSqliteId(id))
    return res.json({ success: true, data: sessionForClient(summary) || null })
  }
  const session = dbStore.sessions.getById(id)
  res.json({ success: true, data: sessionForClient(session) })
})

memoryRouter.post('/sessions', (req, res) => {
  const item = { ...req.body }
  if (item.data != null) item.data = subagentRuntime.mergeReports(String(item.id || '1'), item.data)
  if (isInvalidMainWorkspace(item))
    return res
      .status(400)
      .json({ success: false, error: 'Workspace Main Thread tidak dapat diubah.' })
  const record = dbStore.sessions.insert(sessionForClient(item))
  res.json({ success: true, data: record })
})

memoryRouter.post('/sessions/batch', (req, res) => {
  const items = req.body || []
  if (items.some(isInvalidMainWorkspace))
    return res
      .status(400)
      .json({ success: false, error: 'Workspace Main Thread tidak dapat diubah.' })
  const records = dbStore.sessions.insertBatch(
    items.map((item) =>
      sessionForClient({
        ...item,
        ...(item.data == null
          ? {}
          : { data: subagentRuntime.mergeReports(String(item.id || '1'), item.data) })
      })
    )
  )
  res.json({ success: true, count: records.length, data: records })
})

memoryRouter.patch('/sessions/:id', (req, res) => {
  const id = normalizeSqliteId(req.params.id)
  const current = dbStore.sqlite
    .prepare(
      'SELECT id, title, workspace_root AS workspaceRoot, timestamp FROM sessions WHERE id = ?'
    )
    .get(id)
  if (!current)
    return res.status(404).json({ success: false, error: 'Percakapan tidak ditemukan.' })
  const { title = current.title, workspaceRoot = current.workspaceRoot } = req.body || {}
  if (
    typeof title !== 'string' ||
    !title.trim() ||
    (workspaceRoot !== null && typeof workspaceRoot !== 'string')
  ) {
    return res.status(400).json({ success: false, error: 'Judul atau workspace tidak valid.' })
  }
  if (isInvalidMainWorkspace({ id, workspaceRoot }))
    return res
      .status(400)
      .json({ success: false, error: 'Workspace Main Thread tidak dapat diubah.' })
  const updated = sessionForClient({
    ...current,
    title: title.trim(),
    workspaceRoot: workspaceRoot?.trim() || null,
    timestamp: Date.now()
  })
  dbStore.sqlite
    .prepare(
      'UPDATE sessions SET title = ?, workspace_root = ?, timestamp = ?, updated_at = ? WHERE id = ?'
    )
    .run(updated.title, updated.workspaceRoot, updated.timestamp, updated.timestamp, id)
  res.json({ success: true, data: updated })
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
    await subagentRuntime.stop()
    const result = dbStore.restoreFullDatabase(dumpData, { overwrite })
    recoverTaskWorkflows(dbStore)
    subagentRuntime.start()
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), imported: result.imported })
    res.json({ success: true, data: result })
  } catch (err) {
    subagentRuntime.start()
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/db/reset-ai', async (_req, res) => {
  try {
    await subagentRuntime.stop()
    const result = dbStore.resetAllExceptConfig()
    subagentRuntime.start()
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
