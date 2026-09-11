import { Router } from 'express'
import { dbStore } from '../memory/db-store.js'

export const subagentsRouter = Router()

// PENTING: Rute spesifik (/messages) HARUS didaftarkan sebelum wildcard (/:id)
subagentsRouter.get('/subagents/messages', (_req, res) => {
  res.json({ success: true, data: dbStore.subagentMessages.getAll() })
})

subagentsRouter.get('/subagents/messages/:id', (req, res) => {
  const { id } = req.params
  const msg = dbStore.subagentMessages.getById(id)
  res.json({ success: true, data: msg })
})

subagentsRouter.post('/subagents/messages', (req, res) => {
  const item = req.body
  const record = dbStore.subagentMessages.insert(item)
  res.json({ success: true, data: record })
})

subagentsRouter.post('/subagents/messages/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.subagentMessages.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

subagentsRouter.delete('/subagents/messages/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.subagentMessages.delete(id)
  res.json({ success })
})

subagentsRouter.get('/subagents', (_req, res) => {
  res.json({ success: true, data: dbStore.subagents.getAll() })
})

subagentsRouter.get('/subagents/:id', (req, res) => {
  const { id } = req.params
  const agent = dbStore.subagents.getById(id)
  res.json({ success: true, data: agent })
})

subagentsRouter.get('/subagents/:id/messages', (req, res) => {
  const { id } = req.params
  const messages = dbStore.subagentMessages
    .getAll()
    .filter((m) => m.subagent_id === id)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
  res.json({ success: true, data: messages })
})

subagentsRouter.post('/subagents', (req, res) => {
  const item = req.body
  const record = dbStore.subagents.insert(item)
  res.json({ success: true, data: record })
})

subagentsRouter.post('/subagents/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.subagents.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

subagentsRouter.delete('/subagents/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.subagents.delete(id)
  res.json({ success })
})
