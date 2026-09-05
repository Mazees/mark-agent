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
import {
  listAllSkills,
  getSkillFileTree,
  readSkillFileContent,
  writeSkillFileContent,
  createSkillItem,
  renameSkillItem,
  deleteSkillItem,
  deleteFullSkill,
  installSkillPackage,
  getSkillsDirectory
} from '../main/skills/skill-manager.js'
import {
  loadAllPlugins,
  executePluginAction,
  savePluginDefinition,
  togglePluginState,
  deletePlugin,
  getPluginsDirectory
} from '../main/plugins/plugin-loader.js'
import {
  getActivityBuffer,
  clearActivityBuffer,
  getSystemIdleSeconds,
  startOsActivityTracking
} from './tools/awareness-tracker.js'
import { captureDesktopScreenshotsBase64, captureDesktopScreenshotBase64 } from './tools/screen-service.js'
import { connectGoogle, disconnectGoogle, getGoogleStatus } from '../main/google/google-service.js'
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
} from '../main/telegram/telegram-service.js'
import {
  spawnBackgroundTask,
  readBackgroundTaskOutput,
  killBackgroundTask,
  listBackgroundTasks
} from '../main/task-daemon.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Global crash safety: prevent unhandled promise rejections (e.g. transient TTS/WebSocket errors) from crashing the server
process.on('unhandledRejection', (reason) => {
  console.warn('[Server Warning] Handled UnhandledRejection:', typeof reason === 'string' ? reason : reason?.message || reason)
})

process.on('uncaughtException', (err) => {
  console.error('[Server Error] Handled UncaughtException:', err?.message || err)
})

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

// Inisialisasi WebSocket Hub, Orama, Plugins & Awareness Tracking
wsHub.init(server)
initOramaIndices().catch(() => {})
loadAllPlugins().catch((e) => console.error('[Plugin Init Error]:', e))
startOsActivityTracking(10000)

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

// Relaying WebSocket events dari client (misal: subagent:report) ke semua client
wsHub.on('ws:broadcast', async (payload) => {
  const { event, data } = payload || {}
  if (event) {
    wsHub.broadcast(event, data)
  }
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
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-3.6-flash',
    model: 'local-model',
    customModel: 'default-model',
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

// Auto-start Telegram Bot pada booting server jika token tersedia
try {
  const configs = dbStore.config.getAll()
  const dbCfg = configs[0] || {}
  const unpackedCfg = dbCfg.data && typeof dbCfg.data === 'object' ? { ...dbCfg, ...dbCfg.data } : dbCfg
  const initialTgToken = unpackedCfg.tgBotToken || activeConfig.tgBotToken
  if (initialTgToken && initialTgToken.trim()) {
    console.log('[Telegram] Mengaktifkan bot secara otomatis dari konfigurasi server...')
    startTelegramBot(initialTgToken.trim()).catch((err) => {
      console.error('[Telegram] Gagal auto-start bot:', err.message)
    })
  }
} catch (err) {
  console.warn('[Telegram] Gagal membaca konfigurasi awal bot:', err.message)
}

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
app.get('/api/memories', (_req, res) => {
  res.json({ success: true, data: dbStore.memories.getAll() })
})

app.post('/api/memories', (req, res) => {
  const item = req.body
  const record = dbStore.memories.insert(item)
  res.json({ success: true, data: record })
})

app.delete('/api/memories/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.memories.delete(id)
  res.json({ success })
})

// 5. Chat Turns API
app.get('/api/turns', (_req, res) => {
  res.json({ success: true, data: dbStore.chatTurns.getAll() })
})

app.post('/api/turns', (req, res) => {
  const item = req.body
  const record = dbStore.chatTurns.insert(item)
  res.json({ success: true, data: record })
})

app.post('/api/turns/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.chatTurns.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

// 5b. Sessions API
app.get('/api/sessions', (_req, res) => {
  res.json({ success: true, data: dbStore.sessions.getAll() })
})

app.get('/api/sessions/:id', (req, res) => {
  const { id } = req.params
  const session = dbStore.sessions.getById(id)
  res.json({ success: true, data: session })
})

app.post('/api/sessions', (req, res) => {
  const item = req.body
  const record = dbStore.sessions.insert(item)
  res.json({ success: true, data: record })
})

app.post('/api/sessions/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.sessions.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.sessions.delete(id)
  res.json({ success })
})

// 5c. Chat Archives API
app.get('/api/archives', (_req, res) => {
  res.json({ success: true, data: dbStore.chatArchives.getAll() })
})

app.post('/api/archives', (req, res) => {
  const item = req.body
  const record = dbStore.chatArchives.insert(item)
  res.json({ success: true, data: record })
})

app.delete('/api/archives/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.chatArchives.delete(id)
  res.json({ success })
})

// 5d. Documents (RAG) API & Binary Parser
app.get('/api/documents', (_req, res) => {
  res.json({ success: true, data: dbStore.documents.getAll() })
})

app.post('/api/documents', (req, res) => {
  const item = req.body
  const record = dbStore.documents.insert(item)
  res.json({ success: true, data: record })
})

app.post('/api/documents/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.documents.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.documents.delete(id)
  res.json({ success })
})

app.post(
  '/api/documents/parse',
  express.raw({
    type: ['application/octet-stream', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    limit: '50mb'
  }),
  async (req, res) => {
    try {
      const isDocx = req.query.isDocx === 'true'
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Buffer dokumen kosong.' })
      }

      let extractedText = ''
      if (isDocx) {
        const mammothModule = await import('mammoth')
        const extractRaw = mammothModule.extractRawText || mammothModule.default?.extractRawText
        const result = await extractRaw({ buffer })
        extractedText = result.value || ''
      } else {
        const pdfModule = await import('pdf-parse')
        if (pdfModule.PDFParse) {
          const parser = new pdfModule.PDFParse({ data: buffer })
          const textRes = await parser.getText()
          extractedText = typeof textRes === 'string' ? textRes : textRes?.text || ''
        } else if (typeof pdfModule.default === 'function') {
          const pdfData = await pdfModule.default(buffer)
          extractedText = pdfData.text || ''
        }
      }

      if (!extractedText.trim()) {
        return res.status(422).json({ success: false, error: 'Tidak ada teks yang dapat diekstraksi dari dokumen.' })
      }

      res.json({ success: true, text: extractedText })
    } catch (err) {
      console.error('[Document Parser Error]:', err)
      res.status(500).json({ success: false, error: `Gagal mem-parse dokumen: ${err.message}` })
    }
  }
)

// 5e. Relationships 4D API
app.get('/api/relationships/:userId', (req, res) => {
  const { userId } = req.params
  const rel = dbStore.relationships.getById(userId)
  res.json({ success: true, data: rel })
})

app.post('/api/relationships', (req, res) => {
  const item = req.body
  const record = dbStore.relationships.insert(item)
  res.json({ success: true, data: record })
})

// 5f. Subagents & Messages API
// PENTING: Rute spesifik (/api/subagents/messages) HARUS didaftarkan sebelum wildcard (:id)
app.get('/api/subagents/messages', (_req, res) => {
  res.json({ success: true, data: dbStore.subagentMessages.getAll() })
})

app.get('/api/subagents/messages/:id', (req, res) => {
  const { id } = req.params
  const msg = dbStore.subagentMessages.getById(id)
  res.json({ success: true, data: msg })
})

app.post('/api/subagents/messages', (req, res) => {
  const item = req.body
  const record = dbStore.subagentMessages.insert(item)
  res.json({ success: true, data: record })
})

app.post('/api/subagents/messages/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.subagentMessages.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

app.delete('/api/subagents/messages/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.subagentMessages.delete(id)
  res.json({ success })
})

app.get('/api/subagents', (_req, res) => {
  res.json({ success: true, data: dbStore.subagents.getAll() })
})

app.get('/api/subagents/:id', (req, res) => {
  const { id } = req.params
  const agent = dbStore.subagents.getById(id)
  res.json({ success: true, data: agent })
})

app.get('/api/subagents/:id/messages', (req, res) => {
  const { id } = req.params
  const allMessages = dbStore.subagentMessages.getAll()
  const agentMessages = allMessages.filter((m) => m.subagent_id === id || m.subagentId === id)
  res.json({ success: true, data: agentMessages })
})

app.post('/api/subagents', (req, res) => {
  const item = req.body
  const record = dbStore.subagents.insert(item)
  res.json({ success: true, data: record })
})

app.post('/api/subagents/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.subagents.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

app.delete('/api/subagents/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.subagents.delete(id)
  try {
    const { sqlite } = dbStore
    if (sqlite) {
      sqlite.prepare('DELETE FROM subagent_messages WHERE subagent_id = ?').run(String(id))
    }
  } catch (_) {}
  res.json({ success })
})

// 5g. Learned Skills Database API
app.get('/api/learned-skills', (_req, res) => {
  res.json({ success: true, data: dbStore.learnedSkills.getAll() })
})

app.post('/api/learned-skills', (req, res) => {
  const item = req.body
  const record = dbStore.learnedSkills.insert(item)
  res.json({ success: true, data: record })
})

app.delete('/api/learned-skills/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.learnedSkills.delete(id)
  res.json({ success })
})

// 5h. Pure Node.js Mark Skills File System API
app.get('/api/skills', async (_req, res) => {
  try {
    const skills = await listAllSkills()
    res.json({ success: true, data: skills })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/skills/:name/tree', async (req, res) => {
  const { name } = req.params
  try {
    const tree = await getSkillFileTree(name)
    res.json({ success: true, data: tree })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/skills/:name/file', async (req, res) => {
  const { name } = req.params
  const filePath = req.query.filePath || 'SKILL.md'
  try {
    const content = await readSkillFileContent(name, filePath)
    res.json({ success: true, data: { content, filePath } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/skills/:name/file', async (req, res) => {
  const { name } = req.params
  const { filePath = 'SKILL.md', content = '' } = req.body || {}
  try {
    await writeSkillFileContent(name, filePath, content)
    wsHub.broadcast('skills:updated', { name, filePath, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/skills/:name/item', async (req, res) => {
  const { name } = req.params
  const { itemPath, isFolder = false } = req.body || {}
  try {
    await createSkillItem(name, itemPath, isFolder)
    wsHub.broadcast('skills:updated', { name, itemPath, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/skills/:name/rename', async (req, res) => {
  const { name } = req.params
  const { oldPath, newPath } = req.body || {}
  try {
    const success = await renameSkillItem(name, oldPath, newPath)
    wsHub.broadcast('skills:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.delete('/api/skills/:name/item', async (req, res) => {
  const { name } = req.params
  const itemPath = req.query.itemPath || req.body?.itemPath
  try {
    const success = await deleteSkillItem(name, itemPath)
    wsHub.broadcast('skills:updated', { name, itemPath, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.delete('/api/skills/:name', async (req, res) => {
  const { name } = req.params
  try {
    const success = await deleteFullSkill(name)
    wsHub.broadcast('skills:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post(
  '/api/skills/install',
  express.raw({ type: 'application/zip', limit: '50mb' }),
  async (req, res) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)
      const overrideName = req.query.name || null
      const result = await installSkillPackage(buffer, overrideName)
      wsHub.broadcast('skills:updated', { ...result, timestamp: Date.now() })
      res.json(result)
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
)

// 5i. Dynamic Plugin System API
app.get('/api/plugins', async (_req, res) => {
  try {
    const plugins = await loadAllPlugins()
    res.json({ success: true, data: plugins })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/plugins/reload', async (_req, res) => {
  try {
    const plugins = await loadAllPlugins()
    wsHub.broadcast('plugins:updated', { timestamp: Date.now() })
    res.json({ success: true, data: plugins })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/plugins/save', async (req, res) => {
  try {
    const manifest = await savePluginDefinition(req.body)
    wsHub.broadcast('plugins:updated', { name: manifest.name, timestamp: Date.now() })
    res.json({ success: true, data: manifest })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/plugins/toggle', async (req, res) => {
  const { name, isEnabled } = req.body || {}
  try {
    const success = await togglePluginState(name, Boolean(isEnabled))
    wsHub.broadcast('plugins:updated', { name, isEnabled, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.delete('/api/plugins/:name', async (req, res) => {
  const { name } = req.params
  try {
    const success = await deletePlugin(name)
    wsHub.broadcast('plugins:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/plugins/execute', async (req, res) => {
  const { action, query } = req.body || {}
  try {
    const result = await executePluginAction(action, query)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 5j. Awareness Engine API (Zero-Electron)
app.get('/api/awareness/activity-buffer', (_req, res) => {
  res.json({ success: true, data: getActivityBuffer() })
})

app.post('/api/awareness/clear-buffer', (_req, res) => {
  clearActivityBuffer()
  res.json({ success: true })
})

app.get('/api/awareness/idle-time', async (_req, res) => {
  try {
    const idleSeconds = await getSystemIdleSeconds()
    res.json({ success: true, idleSeconds })
  } catch (_) {
    res.json({ success: true, idleSeconds: 0 })
  }
})

// 5k. Desktop OS Tools & Screen Capture API
app.post('/api/os/screenshot', async (_req, res) => {
  try {
    const screens = await captureDesktopScreenshotsBase64()
    res.json({ success: true, data: screens })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 5l. Agent Tasks & Steps API
app.get('/api/tasks', (_req, res) => {
  res.json({ success: true, data: dbStore.agentTasks.getAll() })
})

app.get('/api/tasks/:id', (req, res) => {
  const { id } = req.params
  const task = dbStore.agentTasks.getById(id)
  res.json({ success: true, data: task })
})

app.post('/api/tasks', (req, res) => {
  const item = req.body
  const record = dbStore.agentTasks.insert(item)
  res.json({ success: true, data: record })
})

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.agentTasks.delete(id)
  res.json({ success })
})

app.get('/api/tasks/:id/steps', (req, res) => {
  const { id } = req.params
  const allSteps = dbStore.agentTaskSteps.getAll()
  const taskSteps = allSteps.filter((s) => s.task_id === id || s.taskId === id)
  res.json({ success: true, data: taskSteps })
})

app.post('/api/tasks/steps', (req, res) => {
  const item = req.body
  const record = dbStore.agentTaskSteps.insert(item)
  res.json({ success: true, data: record })
})

// 5m. Background Task Daemon API
app.post('/api/tasks/daemon/spawn', (req, res) => {
  const { taskId, command, cwd } = req.body || {}
  const result = spawnBackgroundTask(taskId, command, cwd)
  res.json(result)
})

app.get('/api/tasks/daemon/:taskId/output', (req, res) => {
  const { taskId } = req.params
  const lineCount = parseInt(req.query.lines, 10) || 40
  const result = readBackgroundTaskOutput(taskId, lineCount)
  res.json(result)
})

app.post('/api/tasks/daemon/:taskId/kill', (req, res) => {
  const { taskId } = req.params
  const result = killBackgroundTask(taskId)
  res.json(result)
})

app.get('/api/tasks/daemon/list', (_req, res) => {
  const result = listBackgroundTasks()
  res.json(result)
})

// 5n. Google Workspace OAuth API
app.get('/api/google/status', async (_req, res) => {
  try {
    const isConnected = await getGoogleStatus()
    res.json({ success: true, isConnected })
  } catch (err) {
    res.json({ success: false, isConnected: false, error: err.message })
  }
})

app.post('/api/google/connect', async (req, res) => {
  const { clientId, clientSecret } = req.body || {}
  try {
    const success = await connectGoogle(clientId, clientSecret)
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/google/disconnect', async (_req, res) => {
  try {
    const success = await disconnectGoogle()
    res.json({ success })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 5o. Telegram Bot Controller API
app.get('/api/telegram/status', (_req, res) => {
  res.json({ success: true, ...getTelegramStatus() })
})

app.get('/api/telegram/history', (_req, res) => {
  res.json({ success: true, data: tgMessageHistory })
})

app.post('/api/telegram/start', async (req, res) => {
  const { token } = req.body || {}
  try {
    await startTelegramBot(token)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/telegram/stop', (_req, res) => {
  stopTelegramBot()
  res.json({ success: true })
})

app.post('/api/telegram/send', async (req, res) => {
  const { chatId, message } = req.body || {}
  const result = await sendTelegramMessage(chatId, message)
  res.json(result)
})

app.post('/api/telegram/agent-done', async (req, res) => {
  try {
    await finishAgentExecution(req.body || {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/telegram/broadcast', async (req, res) => {
  const { message } = req.body || {}
  try {
    await sendTelegramToAdmins(message)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/telegram/screenshot', async (req, res) => {
  const { chatId } = req.body || {}
  try {
    const result = await sendTelegramScreenshot(chatId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/telegram/download-music', async (req, res) => {
  try {
    await triggerTelegramMusicDownload(req.body || {})
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 5m. Database Backup & Restore API (SQLite <-> WebUI / V4 Dexie Dump)
app.get('/api/db/export', (_req, res) => {
  try {
    const dump = dbStore.exportFullDatabase()
    res.json({ success: true, data: dump })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/db/restore', async (req, res) => {
  const { dumpData, overwrite = true } = req.body || {}
  if (!dumpData) {
    return res.status(400).json({ success: false, error: 'dumpData tidak boleh kosong' })
  }
  try {
    const result = dbStore.restoreFullDatabase(dumpData, { overwrite })
    // Re-inisialisasi/Sinkronisasi indeks Orama jika diperlukan
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), imported: result.imported })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/db/reset-ai', async (_req, res) => {
  try {
    const result = dbStore.resetAllExceptConfig()
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), reset: true })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
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
    const provider = finalConfig.aiProvider || 'gemini-web'
    const resolvedModel =
      provider === 'gemini-web'
        ? finalConfig.geminiWebModel || 'gemini-3.6-flash'
        : provider === 'custom'
          ? finalConfig.customModel || 'default-model'
          : finalConfig.model || 'local-model'

    wsHub.broadcast('ai:fetch', {
      type: 'fetch',
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: false,
      payload: { messages, jsonSchema, isSmallTask }
    })

    const result = await fetchAI(messages, finalConfig, isSmallTask, jsonSchema)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

// 7b. AI Streaming Gateway (Native Tool Calling + SSE & WebSocket Tokens)
app.post('/api/ai/stream', async (req, res) => {
  const { messages, tools = null, config = {}, isSmallTask = false } = req.body || {}
  try {
    const { fetchAIStream } = await import('./services/ai-bridge.js')
    const finalConfig = { ...activeConfig, ...config }
    const provider = finalConfig.aiProvider || 'gemini-web'
    const resolvedModel =
      provider === 'gemini-web'
        ? finalConfig.geminiWebModel || 'gemini-3.6-flash'
        : provider === 'custom'
          ? finalConfig.customModel || 'default-model'
          : finalConfig.model || 'local-model'

    wsHub.broadcast('ai:fetch', {
      type: 'stream',
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: Array.isArray(tools) && tools.length > 0,
      toolsCount: Array.isArray(tools) ? tools.length : 0,
      payload: { messages, tools, isSmallTask }
    })

    const result = await fetchAIStream({
      messages,
      tools,
      config: finalConfig,
      isSmallTask,
      onToken: (token) => {
        wsHub.streamToken(token, 'answer')
      },
      onReasoning: (rToken) => {
        wsHub.streamToken(rToken, 'thought')
      },
      onMood: (mood) => {
        wsHub.broadcast('ai:mood', { mood })
      },
      onToolCall: (toolCalls) => {
        wsHub.broadcast('ai:tool_calls', { toolCalls })
      }
    })

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

// 8b. Desktop Native Notifications API
app.post('/api/system/notify', async (req, res) => {
  const { title = 'Mark', body = '' } = req.body || {}
  try {
    const { showNativeNotification } = await import('./services/notification-service.js')
    showNativeNotification(title, body)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 9. Edge-TTS Speech Synthesis API
app.get('/api/tts/stream', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.query || {}
  try {
    const { streamTTS } = await import('./tools/media-tools.js')
    const audioStream = await streamTTS(text, voice, rate, pitch)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store')

    // Handle client disconnect gracefully without crashing the server or hanging the socket
    req.on('close', () => {
      if (!audioStream.destroyed) {
        audioStream.destroy()
      }
    })

    audioStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        res.end()
      }
    })

    audioStream.pipe(res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
})

app.post('/api/tts/stream', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.body || {}
  try {
    const { streamTTS } = await import('./tools/media-tools.js')
    const audioStream = await streamTTS(text, voice, rate, pitch)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store')

    req.on('close', () => {
      if (!audioStream.destroyed) {
        audioStream.destroy()
      }
    })

    audioStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        res.end()
      }
    })

    audioStream.pipe(res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
})

app.post('/api/tts', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.body || {}
  try {
    const { synthesizeTTS } = await import('./tools/media-tools.js')
    const result = await synthesizeTTS(text, voice, rate, pitch)
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
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

  if (!isDev && fs.existsSync(path.join(staticDir, 'index.html'))) {
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
        appType: 'spa'
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
    } catch (err) {
      console.error('[WebUI Setup Error]:', err)
    }
  }
}

// Inisialisasi penyajian WebUI
await setupWebUIServing()

// --- Start Server dengan Auto-Fallback Port jika terjadi EADDRINUSE ---
let activePort = Number(PORT)

function startServer(portToTry) {
  server.listen(portToTry)
}

server.on('listening', async () => {
  const address = server.address()
  activePort = typeof address === 'object' && address ? address.port : activePort
  console.log(`\n======================================================`)
  console.log(`  MARK Core Server V5.0.0 siap di http://localhost:${activePort}`)
  console.log(`======================================================\n`)

  if (!process.argv.includes('--no-launch') && !process.argv.includes('--headless')) {
    await launchUI({ port: activePort, mode: 'app' })
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Port Manager] Port ${activePort} sedang digunakan aplikasi lain. Mencoba port ${activePort + 1}...`)
    activePort += 1
    setTimeout(() => startServer(activePort), 200)
  } else {
    console.error('[Server Error]', err)
  }
})

startServer(activePort)

export { app, server, wsHub, activeConfig, activePort }
