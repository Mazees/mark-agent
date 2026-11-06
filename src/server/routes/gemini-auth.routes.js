import { Router } from 'express'
import { geminiAuth } from '../services/gemini-auth.js'

export const geminiAuthRouter = Router()
for (const [method, action] of [
  ['get', 'status'],
  ['post', 'connect'],
  ['post', 'check'],
  ['delete', 'disconnect']
]) {
  geminiAuthRouter[method]('/providers/gemini-web/auth/' + action, async (_req, res) => {
    try {
      res.json({ success: true, data: await geminiAuth[action]() })
    } catch {
      res.status(503).json({
        success: false,
        error: 'Koneksi akun Gemini belum dapat diproses. Periksa browser atau hubungkan ulang.'
      })
    }
  })
}
