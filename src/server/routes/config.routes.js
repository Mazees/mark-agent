import { Router } from 'express'
import { getActiveConfig, setActiveConfig, saveConfig, reloadConfig } from '../config-manager.js'
import { wsHub } from '../ws-hub.js'
import { getCurrentVersion } from '../services/updater.js'

export const configRouter = Router()

// 1. Health check
configRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'MARK',
    version: getCurrentVersion(),
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

// 3. Update Check API
configRouter.get('/version/check', async (_req, res) => {
  const { checkForUpdate } = await import('../services/updater.js')
  const info = await checkForUpdate()
  res.json({ success: true, data: info })
})
