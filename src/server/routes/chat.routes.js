import { Router } from 'express'
import { runPlanning } from '../agent/planner.js'
import { getActiveConfig } from '../config-manager.js'

export const chatRouter = Router()

chatRouter.post('/chat', async (req, res) => {
  const { message, sessionId = '1', options = {} } = req.body || {}
  if (!message) {
    return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' })
  }
  try {
    const result = await runPlanning(message, { sessionId, config: getActiveConfig(), ...options })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
