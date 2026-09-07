import { Router } from 'express'
import {
  connectGoogle,
  disconnectGoogle,
  getGoogleStatus
} from '../../main/google/google-service.js'
import {
  startTelegramBot,
  stopTelegramBot,
  getConnectionStatus as getTelegramStatus,
  sendTelegramMessage,
  sendTelegramToAdmins,
  sendTelegramScreenshot,
  triggerTelegramMusicDownload,
  finishAgentExecution,
  uiMessageHistory as tgMessageHistory
} from '../../main/telegram/telegram-service.js'

export const integrationsRouter = Router()

// 1. Google Workspace OAuth API
integrationsRouter.get('/google/status', async (_req, res) => {
  try {
    const isConnected = await getGoogleStatus()
    res.json({ success: true, isConnected })
  } catch (err) {
    res.json({ success: false, isConnected: false, error: err.message })
  }
})

integrationsRouter.post('/google/connect', async (req, res) => {
  const { clientId, clientSecret } = req.body || {}
  try {
    const success = await connectGoogle(clientId, clientSecret)
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

integrationsRouter.post('/google/disconnect', async (_req, res) => {
  try {
    const success = await disconnectGoogle()
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 2. Telegram Bot Controller API
integrationsRouter.get('/telegram/status', (_req, res) => {
  res.json({ success: true, ...getTelegramStatus() })
})

integrationsRouter.get('/telegram/history', (_req, res) => {
  res.json({ success: true, data: tgMessageHistory })
})

integrationsRouter.post('/telegram/start', async (req, res) => {
  const { token } = req.body || {}
  try {
    await startTelegramBot(token)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

integrationsRouter.post('/telegram/stop', (_req, res) => {
  stopTelegramBot()
  res.json({ success: true })
})

integrationsRouter.post('/telegram/send', async (req, res) => {
  const { chatId, message } = req.body || {}
  const result = await sendTelegramMessage(chatId, message)
  res.json(result)
})

integrationsRouter.post('/telegram/agent-done', async (req, res) => {
  try {
    await finishAgentExecution(req.body || {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

integrationsRouter.post('/telegram/broadcast', async (req, res) => {
  const { message } = req.body || {}
  try {
    await sendTelegramToAdmins(message)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

integrationsRouter.post('/telegram/screenshot', async (req, res) => {
  const { chatId } = req.body || {}
  try {
    const result = await sendTelegramScreenshot(chatId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

integrationsRouter.post('/telegram/download-music', async (req, res) => {
  try {
    await triggerTelegramMusicDownload(req.body || {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
