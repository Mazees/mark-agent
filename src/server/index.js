import http from 'http'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import { wsHub } from './ws-hub.js'
import { launchUI } from './launcher.js'
import { runPlanning } from './agent/planner.js'
import { initOramaIndices } from './memory/orama-store.js'
import { dbStore } from './memory/db-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Filter out DaisyUI CSS banner from leaking into stdout
const _origStdoutWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, encoding, callback) => {
  const str = typeof chunk === 'string' ? chunk : chunk ? chunk.toString() : ''
  if (str.includes('daisyUI') || str.includes('daisyui')) {
    return typeof callback === 'function' ? callback() : true
  }
  return _origStdoutWrite(chunk, encoding, callback)
}

const PORT = process.env.PORT || 3000
const app = express()
const server = http.createServer(app)

// --- Middleware ---
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Inisialisasi WebSocket Hub & Orama
wsHub.init(server)
initOramaIndices().catch(() => {})

// Daftarkan listener event chat dan abort dari WebSocket
wsHub.on('chat:send', async (payload) => {
  const { message, sessionId = '1', config = {} } = payload || {}
  if (!message) throw new Error('Pesan kosong')
  return await runPlanning(message, { sessionId, config })
})

wsHub.on('ai:abort', async () => {
  try {
    const { abortAllFetches } = await import('./services/ai-bridge.js')
    abortAllFetches()
  } catch (_) {}
  return { success: true }
})

// --- Konfigurasi Persisten ---
const CONFIG_DIR = path.join(os.homedir(), '.config', 'mark-agent')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (_) {}
  return {
    aiProvider: 'lm-studio',
    model: 'google/gemma-3-4b',
    temperature: 0.7,
    wakeWordEnabled: true,
    wakeWord: 'mark',
    voiceEnabled: true,
    voice: 'id-ID-ArdiNeural'
  }
}

function saveConfig(newConfig) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8')
    return true
  } catch (_) {
    return false
  }
}

let activeConfig = loadConfig()

// --- REST API Endpoints ---

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'MARK',
    version: '5.0.0',
    uptime: process.uptime(),
    timestamp: Date.now()
  })
})

// 2. Configuration API
app.get('/api/config', (req, res) => {
  res.json({ success: true, data: activeConfig })
})

app.post('/api/config', (req, res) => {
  const updated = { ...activeConfig, ...req.body }
  const success = saveConfig(updated)
  if (success) {
    activeConfig = updated
    wsHub.broadcast('config:updated', activeConfig)
    res.json({ success: true, data: activeConfig })
  } else {
    res.status(500).json({ success: false, error: 'Failed to save config' })
  }
})

// 3. Chat & Planning API
app.post('/api/chat', async (req, res) => {
  const { message, sessionId = '1', options = {} } = req.body || {}
  if (!message) {
    return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' })
  }
  try {
    const result = await runPlanning(message, { sessionId, config: activeConfig, ...options })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 4. Memory API
app.get('/api/memories', (req, res) => {
  res.json({ success: true, data: dbStore.memories.getAll() })
})

app.post('/api/memories', (req, res) => {
  const item = req.body
  const record = dbStore.memories.insert(item)
  res.json({ success: true, data: record })
})

// 5. Chat Turns API
app.get('/api/turns', (req, res) => {
  res.json({ success: true, data: dbStore.chatTurns.getAll() })
})

// 6. Vector Embedding API
app.post('/api/vector', async (req, res) => {
  const { text } = req.body || {}
  try {
    const { generateVector } = await import('./memory/vector-engine.js')
    const vector = await generateVector(text)
    res.json({ success: true, vector })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 7. AI Fetch Direct Gateway (Bridge for WebUI frontend)
app.post('/api/ai/fetch', async (req, res) => {
  const { messages, config = {}, isSmallTask = false, jsonSchema = null } = req.body || {}
  try {
    const { fetchAI } = await import('./services/ai-bridge.js')
    const finalConfig = { ...activeConfig, ...config }
    const result = await fetchAI(messages, finalConfig, isSmallTask, jsonSchema)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

app.post('/api/ai/abort', async (req, res) => {
  try {
    const { abortAllFetches } = await import('./services/ai-bridge.js')
    abortAllFetches()
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

// 8. Native Tools Execution API
app.post('/api/tools/execute', async (req, res) => {
  const { tool, query, config } = req.body || {}
  try {
    const { NATIVE_TOOLS } = await import('../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) {
      return res.json({ success: false, error: `Tool '${tool}' tidak ditemukan` })
    }
    const finalConfig = config || activeConfig
    const result = await nativeTool.handler(query, finalConfig)
    if (result && typeof result === 'object' && 'success' in result) {
      return res.json(result)
    }
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.post('/api/tools/needs-approval', async (req, res) => {
  const { tool, query } = req.body || {}
  try {
    const { NATIVE_TOOLS } = await import('../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) return res.json({ needsApproval: false })
    const needs =
      typeof nativeTool.needsApproval === 'function'
        ? nativeTool.needsApproval(query)
        : nativeTool.needsApproval
    res.json({
      needsApproval: Boolean(needs),
      message: needs && nativeTool.approvalMessage ? nativeTool.approvalMessage(query) : null
    })
  } catch (err) {
    res.json({ needsApproval: false })
  }
})

// 9. Edge-TTS Speech Synthesis API
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body || {}
  try {
    const { synthesizeTTS } = await import('./tools/media-tools.js')
    const result = await synthesizeTTS(text, voice)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 10. Launcher API
app.post('/api/launcher/open', async (req, res) => {
  const { mode = 'app' } = req.body || {}
  try {
    await launchUI({ port: PORT, mode })
    res.json({ success: true, message: `Launcher triggered for mode: ${mode}` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// --- WebUI Serving (Vite Dev Middleware atau Production Build) ---
const staticDir = path.resolve(__dirname, '../../out/renderer')
const rootDir = path.resolve(__dirname, '../../')
const rendererDir = path.resolve(__dirname, '../renderer')

async function setupWebUIServing() {
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/stream')) return next()
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  } else {
    try {
      const { createServer: createViteServer } = await import('vite')
      const vite = await createViteServer({
        root: rendererDir,
        configFile: path.join(rootDir, 'vite.config.js'),
        server: { middlewareMode: true, hmr: { port: 24679 } },
        appType: 'spa',
        logLevel: 'silent'
      })
      app.use(vite.middlewares)

      // Sajikan index.html yang ditransformasikan secara live oleh Vite
      app.use('*', async (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/stream')) return next()
        const url = req.originalUrl
        try {
          let template = fs.readFileSync(path.resolve(rendererDir, 'index.html'), 'utf-8')
          template = await vite.transformIndexHtml(url, template)
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
        } catch (e) {
          next(e)
        }
      })
    } catch (_) {}
  }
}

// Inisialisasi penyajian WebUI
await setupWebUIServing()

// --- Start Server ---
server.listen(PORT, async () => {
  if (!process.argv.includes('--no-launch') && !process.argv.includes('--headless')) {
    await launchUI({ port: PORT, mode: 'app' })
  }
})

export { app, server, wsHub, activeConfig }

