import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let daemonProcess = null
let daemonReady = false
let pendingResolve = null
let daemonBuffer = ''
let lastReadResult = null
let lastReadTimestamp = 0
let stateChanged = false
const CACHE_TTL = 10000

function getDaemonScriptPath() {
  const candidates = [
    path.resolve(__dirname, '../../../src/main/pc-agent-scripts/pc-daemon.ps1'),
    path.resolve(__dirname, '../../main/pc-agent-scripts/pc-daemon.ps1'),
    path.resolve(__dirname, '../../../resources/scripts/pc-daemon.ps1'),
    path.resolve(__dirname, '../../resources/scripts/pc-daemon.ps1')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

export function isDaemonAlive() {
  return daemonProcess && !daemonProcess.killed && daemonReady
}

export function startDaemon() {
  return new Promise((resolve, reject) => {
    if (isDaemonAlive()) {
      resolve()
      return
    }

    const scriptPath = getDaemonScriptPath()

    daemonProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ])

    daemonBuffer = ''
    daemonReady = false

    daemonProcess.stdout.on('data', (chunk) => {
      daemonBuffer += chunk.toString()

      const delimiterIndex = daemonBuffer.indexOf('---MARK_DONE---')
      if (delimiterIndex !== -1) {
        const response = daemonBuffer.substring(0, delimiterIndex).trim()
        daemonBuffer = daemonBuffer.substring(delimiterIndex + '---MARK_DONE---'.length).trimStart()

        if (!daemonReady) {
          daemonReady = true
          resolve()
          return
        }

        if (pendingResolve) {
          const resolveFn = pendingResolve
          pendingResolve = null
          resolveFn(response)
        }
      }
    })

    daemonProcess.stderr.on('data', () => {})

    daemonProcess.on('close', () => {
      daemonProcess = null
      daemonReady = false
      if (pendingResolve) {
        const resolveFn = pendingResolve
        pendingResolve = null
        resolveFn('')
      }
    })

    daemonProcess.on('error', (err) => {
      console.error('[PC-Agent] Gagal spawn daemon:', err)
      daemonProcess = null
      reject(err)
    })

    setTimeout(() => {
      if (!daemonReady) {
        console.warn('[PC-Agent] Timeout menunggu startup daemon (15s)')
        resolve()
      }
    }, 15000)
  })
}

export function stopDaemon() {
  if (daemonProcess && !daemonProcess.killed) {
    try {
      daemonProcess.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n')
    } catch (_) {}
    setTimeout(() => {
      if (daemonProcess && !daemonProcess.killed) {
        try {
          daemonProcess.kill()
        } catch (_) {}
      }
      daemonProcess = null
      daemonReady = false
    }, 1000)
  }
}

export function sendCommand(cmd) {
  return new Promise((resolve) => {
    if (!isDaemonAlive()) {
      resolve(JSON.stringify({ status: 'error', message: 'Daemon Win32 belum berjalan' }))
      return
    }

    pendingResolve = resolve
    try {
      daemonProcess.stdin.write(JSON.stringify(cmd) + '\n')
    } catch (err) {
      pendingResolve = null
      resolve(JSON.stringify({ status: 'error', message: 'Gagal kirim ke daemon: ' + err.message }))
    }

    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null
        resolve(JSON.stringify({ status: 'error', message: 'Command timeout (30s)' }))
      }
    }, 30000)
  })
}

export async function readDesktop(options = {}) {
  const maxElements = options.maxElements || 60
  if (!stateChanged && lastReadResult && Date.now() - lastReadTimestamp < CACHE_TTL) {
    return { ...lastReadResult, method: 'cached' }
  }

  if (!isDaemonAlive()) {
    await startDaemon()
  }

  const raw = await sendCommand({ cmd: 'read-ui', maxElements, roles: options.roles })
  try {
    const parsed = JSON.parse(raw)
    lastReadResult = parsed
    lastReadTimestamp = Date.now()
    stateChanged = false
    return parsed
  } catch (_) {
    return { status: 'error', message: raw }
  }
}

export async function executeClick(x, y) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'click', x, y })
  return raw
}

export async function executeType(text) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'type', text })
  return raw
}

export async function executeKey(combo) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'key', combo })
  return raw
}

export async function executeScroll(direction = 'down', amount = 3) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'scroll', direction, amount })
  return raw
}

export async function openApp(target) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'open', target })
  return raw
}

export async function listWindows() {
  if (!isDaemonAlive()) await startDaemon()
  const raw = await sendCommand({ cmd: 'list-windows' })
  try {
    return JSON.parse(raw)
  } catch (_) {
    return []
  }
}

export async function focusWindow(title) {
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'focus-window', title })
  return raw
}

export async function executeDoubleClick(x, y) {
  await executeClick(x, y)
  await new Promise((r) => setTimeout(r, 60))
  return await executeClick(x, y)
}

export async function askUserPC(query) {
  return `User prompt: ${query}`
}

export async function openPCSession() {
  await startDaemon()
  return { success: true }
}

export async function closePCSession() {
  stopDaemon()
  return { success: true }
}

export function isPCSessionOpen() {
  return isDaemonAlive()
}
