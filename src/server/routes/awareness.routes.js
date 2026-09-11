import { Router } from 'express'
import {
  getActivityBuffer,
  clearActivityBuffer,
  getSystemIdleSeconds
} from '../tools/awareness-tracker.js'
import { captureDesktopScreenshotsBase64 } from '../tools/screen-service.js'

export const awarenessRouter = Router()

awarenessRouter.get('/awareness/activity-buffer', (_req, res) => {
  res.json({ success: true, data: getActivityBuffer() })
})

awarenessRouter.post('/awareness/clear-buffer', (_req, res) => {
  clearActivityBuffer()
  res.json({ success: true })
})

awarenessRouter.get('/awareness/idle-time', async (_req, res) => {
  try {
    const idleSeconds = await getSystemIdleSeconds()
    res.json({ success: true, idleSeconds })
  } catch (_) {
    res.json({ success: true, idleSeconds: 0 })
  }
})

awarenessRouter.post('/os/screenshot', async (_req, res) => {
  try {
    const screens = await captureDesktopScreenshotsBase64()
    res.json({ success: true, data: screens })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

awarenessRouter.post('/system/notify', async (req, res) => {
  const { title = 'Mark', body = '' } = req.body || {}
  try {
    const { showNativeNotification } = await import('../services/notification-service.js')
    showNativeNotification(title, body)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
