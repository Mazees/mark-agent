import { Router } from 'express'
import { compactionOperation } from '../services/session-compaction.js'
export const compactionRouter = Router()
compactionRouter.get('/sessions/:id/compaction', (req, res) => {
  try {
    res.json({ success: true, data: compactionOperation(req.params.id, 'read') })
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message })
  }
})
compactionRouter.post('/sessions/:id/compaction/:operation', (req, res) => {
  try {
    res.json({
      success: true,
      data: compactionOperation(req.params.id, req.params.operation, req.body)
    })
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message })
  }
})
