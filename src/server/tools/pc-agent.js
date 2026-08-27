import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { wsHub } from '../ws-hub.js'

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

let overlayProcess = null
let overlayReady = false

function getScriptPath(scriptName) {
  const candidates = [
    path.resolve(__dirname, `../../../src/main/pc-agent-scripts/${scriptName}`),
    path.resolve(__dirname, `../../main/pc-agent-scripts/${scriptName}`),
    path.resolve(__dirname, `../../../resources/scripts/${scriptName}`),
    path.resolve(__dirname, `../../resources/scripts/${scriptName}`)
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

function getDaemonScriptPath() {
  return getScriptPath('pc-daemon.ps1')
}

function getOverlayScriptPath() {
  return getScriptPath('pc-overlay.ps1')
}

export function isOverlayAlive() {
  return overlayProcess && !overlayProcess.killed
}

export function startOverlay() {
  if (isOverlayAlive()) return

  const scriptPath = getOverlayScriptPath()
  if (!fs.existsSync(scriptPath)) {
    console.warn('[PC-Agent] Skrip overlay tidak ditemukan:', scriptPath)
    return
  }

  try {
    overlayProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ])

    overlayReady = false

    overlayProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString().trim()
      if (text.includes('READY')) {
        overlayReady = true
      }
      if (text.includes('"event":"abort"') || text.includes('{"event":"abort"}')) {
        console.warn('[PC-Agent] Sinyal ABORT diterima dari Overlay (Ctrl+Shift+S / Tombol Batal)!')
        // Hentikan sesi dan picu abort di WebSocket hub
        stopDaemon()
        stopOverlay()
        wsHub.broadcast('ai:abort', { source: 'pc-overlay', reason: 'User pressed Ctrl+Shift+S or clicked Cancel' })
      }
    })

    overlayProcess.stderr.on('data', (chunk) => {
      console.warn('[PC-Agent Overlay Error]:', chunk.toString())
    })

    overlayProcess.on('close', () => {
      overlayProcess = null
      overlayReady = false
    })

    overlayProcess.on('error', (err) => {
      console.error('[PC-Agent] Gagal spawn overlay:', err)
      overlayProcess = null
      overlayReady = false
    })
  } catch (err) {
    console.error('[PC-Agent] Error menjalankan overlay:', err)
  }
}

export function stopOverlay() {
  if (overlayProcess && !overlayProcess.killed) {
    try {
      overlayProcess.kill()
    } catch (_) {}
    overlayProcess = null
    overlayReady = false
  }
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
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'click', x, y })
  return raw
}

export async function executeType(text) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'type', text })
  return raw
}

export async function executeKey(combo) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'key', combo })
  return raw
}

export async function executeScroll(direction = 'down', amount = 3) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'scroll', direction, amount })
  return raw
}

export async function openApp(target) {
  startOverlay()
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
  startOverlay()
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

export async function openPCSession() {
  startOverlay()
  await startDaemon()
  return { success: true }
}

export async function closePCSession() {
  stopOverlay()
  stopDaemon()
  return { success: true }
}

export function isPCSessionOpen() {
  return isDaemonAlive()
}
