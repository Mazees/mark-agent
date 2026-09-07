import http from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import { wsHub } from './ws-hub.js'
import { launchUI } from './launcher.js'
import { runPlanning } from './agent/planner.js'
import { initOramaIndices } from './memory/orama-store.js'
import { dbStore } from './memory/db-store.js'
import { loadAllPlugins } from '../main/plugins/plugin-loader.js'
import { startOsActivityTracking } from './tools/awareness-tracker.js'
import { startTelegramBot } from '../main/telegram/telegram-service.js'
import { getActiveConfig } from './config-manager.js'
import { registerRoutes } from './routes/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Global crash safety: prevent unhandled promise rejections from crashing the server
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

const activeConfig = getActiveConfig()

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

// --- Register Modular REST API Routes ---
registerRoutes(app)

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
  app.set('port', activePort)
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
