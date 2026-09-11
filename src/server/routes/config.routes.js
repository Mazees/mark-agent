import { Router } from 'express'
import { getActiveConfig, setActiveConfig, saveConfig, reloadConfig } from '../config-manager.js'
import { wsHub } from '../ws-hub.js'

export const configRouter = Router()

// 1. Health check
configRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'MARK',
    version: '5.0.0',
    uptime: process.uptime(),
    timestamp: Date.now()
  })
})

// 2. Configuration API
configRouter.get('/config', (_req, res) => {
  res.json({ success: true, data: reloadConfig() })
})

configRouter.post('/config', (req, res) => {
  const current = reloadConfig()
  const updated = { ...current, ...req.body }
  const success = saveConfig(updated)
  if (success) {
    setActiveConfig(updated)
    wsHub.broadcast('config:updated', updated)
    res.json({ success: true, data: updated })
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' })
  }
})
