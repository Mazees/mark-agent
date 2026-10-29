#!/usr/bin/env node
import { subagentRuntime } from '../src/server/services/subagents/service.js'

/**
 * MARK Launcher Entrypoint
 * Menjalankan Node.js Core Server, WebUI (Edge App Mode), dan Live Monitor Dashboard.
 */

import { runMonitor } from '../src/cli/monitor.js'
import { stopDaemon } from '../src/server/tools/pc-agent.js'
import { server } from '../src/server/index.js'
import { closeUI } from '../src/server/launcher.js'
import { chromeBridge } from '../src/main/addons/chrome-bridge/service.js'

process.on('uncaughtException', (err) => {
  // Abaikan error putus koneksi socket client (seperti streaming TTS/audio diputus client)
  if (
    err?.code === 'EPIPE' ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    err?.code === 'ERR_STREAM_DESTROYED'
  ) {
    return
  }
  console.error('\n\x1b[31m[MARK Fatal Error]:\x1b[0m', err)
  console.error(
    '\x1b[33mTerminal tidak ditutup otomatis agar pesan error di atas dapat dibaca.\x1b[0m'
  )
  console.error('Tekan Ctrl+C untuk menutup terminal ini.\n')
  setInterval(() => {}, 60000)
})

process.stdout?.on('error', (err) => {
  if (err.code === 'EPIPE') return
})
process.stderr?.on('error', (err) => {
  if (err.code === 'EPIPE') return
})

process.on('SIGINT', async () => {
  console.log('\n\x1b[33m● Mematikan MARK Core Engine...\x1b[0m')
  closeUI()
  stopDaemon()
  await Promise.allSettled([subagentRuntime.stop(), chromeBridge.stop()])
  if (server) {
    server.close(() => {
      process.exit(0)
    })
  }
  setTimeout(() => process.exit(0), 1000)
})

runMonitor().catch((err) => {
  console.error('\x1b[31m[Startup Error]:\x1b[0m', err)
  console.error(
    '\x1b[33mTerminal tidak ditutup otomatis agar pesan error di atas dapat dibaca.\x1b[0m'
  )
  console.error('Tekan Ctrl+C untuk menutup terminal ini.\n')
  setInterval(() => {}, 60000)
})
