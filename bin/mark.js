#!/usr/bin/env node

/**
 * MARK Launcher Entrypoint
 * Menjalankan Node.js Core Server, WebUI (Edge App Mode), dan Live Monitor Dashboard.
 */

import { runMonitor } from '../src/cli/monitor.js'
import { stopDaemon } from '../src/server/tools/pc-agent.js'
import { server } from '../src/server/index.js'

process.on('SIGINT', () => {
  console.log('\n\x1b[33m● Mematikan MARK Core Engine...\x1b[0m')
  stopDaemon()
  if (server) {
    server.close(() => {
      process.exit(0)
    })
  }
  setTimeout(() => process.exit(0), 1000)
})

runMonitor().catch((err) => {
  console.error('\x1b[31m[Startup Error]:\x1b[0m', err)
})
