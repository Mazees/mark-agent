import { Router } from 'express'
import { fetchAI } from '../services/ai-bridge.js'
import { getActiveConfig } from '../config-manager.js'

export const chatRouter = Router()

chatRouter.post('/chat', async (req, res) => {
  const { message, messages } = req.body || {}
  const effectiveMessages = messages || [{ role: 'user', content: message || '' }]
  try {
    const result = await fetchAI(effectiveMessages, false, { config: getActiveConfig() })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
