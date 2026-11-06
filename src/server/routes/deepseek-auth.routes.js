import { Router } from 'express'
import { deepseekAuth } from '../services/deepseek-auth.js'

export const deepseekAuthRouter = Router()
for (const [method, action] of [
  ['get', 'status'],
  ['post', 'connect'],
  ['post', 'check'],
  ['delete', 'disconnect']
]) {
  deepseekAuthRouter[method]('/providers/deepseek-web/auth/' + action, async (_req, res) => {
    try {
      res.json({ success: true, data: await deepseekAuth[action]() })
    } catch {
      res.status(503).json({
        success: false,
        error: 'Koneksi DeepSeek belum dapat diproses. Hubungkan ulang melalui Pengaturan.'
      })
    }
  })
}
