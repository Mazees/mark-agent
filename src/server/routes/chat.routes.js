import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fetchAI } from '../services/ai-bridge.js'
import { getActiveConfig } from '../config-manager.js'

export const chatRouter = Router()

chatRouter.post('/chat/upload-temp', async (req, res) => {
  const { fileName, dataUrl, base64Data } = req.body || {}
  try {
    const rawBase64 = base64Data || (dataUrl ? dataUrl.replace(/^data:[^;]+;base64,/, '') : null)
    if (!rawBase64) {
      return res.status(400).json({ success: false, error: 'Data base64 kosong' })
    }
    const tempDir = path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    const safeName = (fileName || `image-${Date.now()}.png`).replace(/[^a-zA-Z0-9_.-]/g, '_')
    const finalName = `${Date.now()}-${safeName}`
    const targetPath = path.join(tempDir, finalName)
    const buffer = Buffer.from(rawBase64, 'base64')
    await fs.promises.writeFile(targetPath, buffer)

    res.json({
      success: true,
      path: targetPath,
      name: finalName,
      url: `/api/chat/temp-file/${encodeURIComponent(finalName)}`,
      size: buffer.length
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

chatRouter.get('/chat/temp-file/:fileName', (req, res) => {
  try {
    const safeName = path.basename(req.params.fileName)
    const filePath = path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads', safeName)
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath)
    }
    res.status(404).send('File tidak ditemukan')
  } catch (err) {
    res.status(500).send(err.message)
  }
})

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
