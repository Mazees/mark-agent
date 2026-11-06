import { Router } from 'express'
import { dbStore, normalizeSqliteId } from '../memory/db-store.js'
import { resolveEffort, validEffort } from '../../shared/agent/effort.js'

export const effortRouter = Router()
effortRouter.get('/sessions/:id/effort', (req, res) => {
  const session = dbStore.sessions.getById(req.params.id)
  res.json({ success: true, data: { effortLevel: resolveEffort(session?.effortLevel) } })
})
effortRouter.post('/sessions/:id/effort', (req, res) => {
  if (!validEffort(req.body?.effortLevel))
    return res.status(400).json({ success: false, error: 'Tingkat effort tidak valid.' })
  const id = normalizeSqliteId(req.params.id)
  const effortLevel = req.body.effortLevel
  try {
    const old = dbStore.sessions.getById(id)
    if (old)
      dbStore.sqlite
        .prepare('UPDATE sessions SET effort_level = ? WHERE id = ?')
        .run(effortLevel, id)
    else dbStore.sessions.insert({ id, title: 'Percakapan baru', data: [], effortLevel })
    res.json({ success: true, data: { effortLevel } })
  } catch {
    res.status(500).json({ success: false, error: 'Pilihan effort belum dapat disimpan.' })
  }
})
