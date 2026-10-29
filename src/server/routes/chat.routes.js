import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fetchAI } from '../services/ai-bridge.js'
import { getActiveConfig } from '../config-manager.js'
import { DEFAULT_WORKSPACE_ROOT } from '../workspace-policy.js'

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

const IMAGE_CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

chatRouter.get('/chat/local-image', async (req, res) => {
  try {
    const requestedPath = typeof req.query.path === 'string' ? req.query.path.trim() : ''
    if (
      !requestedPath ||
      !Object.hasOwn(IMAGE_CONTENT_TYPES, path.extname(requestedPath).toLowerCase())
    ) {
      return res.status(400).send('Path gambar tidak valid')
    }

    const tempUploads = path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads')
    const workspaceRoot = getActiveConfig()?.workspaceRoot || DEFAULT_WORKSPACE_ROOT
    const targetPath = path.resolve(
      path.isAbsolute(requestedPath) ? requestedPath : path.join(workspaceRoot, requestedPath)
    )
    const resolvedTarget = await fs.promises.realpath(targetPath)
    const allowedRoots = await Promise.all(
      [workspaceRoot, tempUploads].map((root) => fs.promises.realpath(root).catch(() => null))
    )
    const isAllowed = allowedRoots.some((root) => {
      if (!root) return false
      const relativePath = path.relative(root, resolvedTarget)
      return (
        relativePath === '' ||
        (!relativePath.startsWith(`..${path.sep}`) &&
          relativePath !== '..' &&
          !path.isAbsolute(relativePath))
      )
    })

    if (!isAllowed) return res.status(403).send('Gambar hanya dapat dibuka dari workspace aktif')

    const stat = await fs.promises.stat(resolvedTarget)
    if (!stat.isFile()) return res.status(404).send('Gambar tidak ditemukan')

    res.set('Content-Type', IMAGE_CONTENT_TYPES[path.extname(resolvedTarget).toLowerCase()])
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Security-Policy', "default-src 'none'; sandbox")
    res.set('Cache-Control', 'private, max-age=60')
    return res.sendFile(resolvedTarget)
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      return res.status(404).send('Gambar tidak ditemukan')
    }
    return res.status(500).send('Gagal membuka gambar')
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
