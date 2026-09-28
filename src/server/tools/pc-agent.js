import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { wsHub } from '../ws-hub.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let daemonProcess = null
let daemonReady = false
let daemonBuffer = ''
let lastReadResult = null
let lastReadTimestamp = 0
let stateChanged = false
const CACHE_TTL = 10000

let activeCommand = null
const commandQueue = []

function clearCommandQueue(errorMessage = 'Daemon Win32 dihentikan') {
  if (activeCommand) {
    if (activeCommand.timeoutTimer) clearTimeout(activeCommand.timeoutTimer)
    const resolveFn = activeCommand.resolve
    activeCommand = null
    resolveFn(JSON.stringify({ status: 'error', message: errorMessage }))
  }
  while (commandQueue.length > 0) {
    const item = commandQueue.shift()
    if (item.timeoutTimer) clearTimeout(item.timeoutTimer)
    item.resolve(JSON.stringify({ status: 'error', message: errorMessage }))
  }
}

function processNextCommand() {
  if (activeCommand !== null || commandQueue.length === 0) return
  if (!isDaemonAlive()) {
    clearCommandQueue('Daemon Win32 belum berjalan')
    return
  }

  activeCommand = commandQueue.shift()
  const { cmd, resolve } = activeCommand

  activeCommand.timeoutTimer = setTimeout(() => {
    if (activeCommand && activeCommand.resolve === resolve) {
      console.warn('[PC-Agent] Command timeout (30s):', cmd?.cmd)
      activeCommand = null
      resolve(JSON.stringify({ status: 'error', message: 'Command timeout (30s)' }))
      processNextCommand()
    }
  }, 30000)

  try {
    daemonProcess.stdin.write(JSON.stringify(cmd) + '\n')
  } catch (err) {
    if (activeCommand && activeCommand.resolve === resolve) {
      clearTimeout(activeCommand.timeoutTimer)
      activeCommand = null
      resolve(JSON.stringify({ status: 'error', message: 'Gagal kirim ke daemon: ' + err.message }))
      processNextCommand()
    }
  }
}

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
        wsHub.broadcast('ai:abort', {
          source: 'pc-overlay',
          reason: 'User pressed Ctrl+Shift+S or clicked Cancel'
        })
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

      while (true) {
        const delimiterIndex = daemonBuffer.indexOf('---MARK_DONE---')
        if (delimiterIndex === -1) break

        const response = daemonBuffer.substring(0, delimiterIndex).trim()
        daemonBuffer = daemonBuffer.substring(delimiterIndex + '---MARK_DONE---'.length).trimStart()

        if (!daemonReady) {
          daemonReady = true
          resolve()
          processNextCommand()
          continue
        }

        if (activeCommand) {
          const current = activeCommand
          activeCommand = null
          if (current.timeoutTimer) clearTimeout(current.timeoutTimer)
          current.resolve(response)
          processNextCommand()
        }
      }
    })

    daemonProcess.stderr.on('data', () => {})

    daemonProcess.on('close', () => {
      daemonProcess = null
      daemonReady = false
      clearCommandQueue('Daemon Win32 ditutup')
    })

    daemonProcess.on('error', (err) => {
      console.error('[PC-Agent] Gagal spawn daemon:', err)
      daemonProcess = null
      daemonReady = false
      clearCommandQueue('Gagal spawn daemon: ' + err.message)
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
  clearCommandQueue('Daemon Win32 dihentikan')
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
      startDaemon()
        .then(() => {
          commandQueue.push({ cmd, resolve })
          processNextCommand()
        })
        .catch((err) => {
          resolve(
            JSON.stringify({ status: 'error', message: 'Gagal menjalankan daemon: ' + err.message })
          )
        })
      return
    }

    commandQueue.push({ cmd, resolve })
    processNextCommand()
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

export const CANONICAL_WIDTH = 1280
export const CANONICAL_HEIGHT = 720

let cachedScreenInfo = {
  screen_x: 0,
  screen_y: 0,
  host_width: 1920,
  host_height: 1080,
  canonical_width: CANONICAL_WIDTH,
  canonical_height: CANONICAL_HEIGHT
}

export function denormalizeCoordinates(xModel, yModel) {
  const screenX = cachedScreenInfo.screen_x || 0
  const screenY = cachedScreenInfo.screen_y || 0
  const hostW = cachedScreenInfo.host_width || 1920
  const hostH = cachedScreenInfo.host_height || 1080
  const x = Math.round(screenX + (Number(xModel) * hostW) / CANONICAL_WIDTH)
  const y = Math.round(screenY + (Number(yModel) * hostH) / CANONICAL_HEIGHT)
  return { x, y }
}

export function normalizeCoordinates(xHost, yHost) {
  const screenX = cachedScreenInfo.screen_x || 0
  const screenY = cachedScreenInfo.screen_y || 0
  const hostW = cachedScreenInfo.host_width || 1920
  const hostH = cachedScreenInfo.host_height || 1080
  const x = Math.round(((Number(xHost) - screenX) * CANONICAL_WIDTH) / hostW)
  const y = Math.round(((Number(yHost) - screenY) * CANONICAL_HEIGHT) / hostH)
  return { x, y }
}

export async function getScreenInfo() {
  if (!isDaemonAlive()) await startDaemon()
  const raw = await sendCommand({ cmd: 'get-screen-info' })
  try {
    const parsed = JSON.parse(raw)
    if (parsed.host_width && parsed.host_height) {
      cachedScreenInfo = {
        ...cachedScreenInfo,
        screen_x: parsed.screen_x || 0,
        screen_y: parsed.screen_y || 0,
        host_width: parsed.host_width,
        host_height: parsed.host_height
      }
    }
    return parsed
  } catch (_) {
    return cachedScreenInfo
  }
}

export async function captureScreen(options = {}) {
  if (!isDaemonAlive()) await startDaemon()
  const width = options.width || CANONICAL_WIDTH
  const height = options.height || CANONICAL_HEIGHT
  const quality = options.quality || 75
  const raw = await sendCommand({ cmd: 'capture-screen', width, height, quality })
  try {
    const parsed = JSON.parse(raw)
    if (parsed.host_width && parsed.host_height) {
      cachedScreenInfo = {
        ...cachedScreenInfo,
        screen_x: parsed.screen_x || 0,
        screen_y: parsed.screen_y || 0,
        host_width: parsed.host_width,
        host_height: parsed.host_height
      }
    }
    if (parsed.image) {
      wsHub.broadcast('computer:preview', {
        image: parsed.image,
        cursor: parsed.cursor,
        cursor_host: parsed.cursor_host,
        width: parsed.canonical_width || width,
        height: parsed.canonical_height || height,
        timestamp: Date.now()
      })
    }
    return parsed
  } catch (err) {
    return { status: 'error', message: raw || err.message }
  }
}

export async function executeClick(x, y) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true

  let targetX = x
  let targetY = y
  if (typeof x === 'string' && x.includes('||')) {
    const parts = x.split('||')
    targetX = Number(parts[0])
    targetY = Number(parts[1])
  } else if (typeof x === 'string' && /^\d+$/.test(x.trim()) && (y === undefined || y === null)) {
    // ID elemen dari os-read: coba native-invoke terlebih dahulu
    const invokeRaw = await sendCommand({ cmd: 'native-invoke', id: parseInt(x.trim(), 10) })
    return invokeRaw
  }

  const raw = await sendCommand({ cmd: 'click', x: targetX, y: targetY })
  const canonical = normalizeCoordinates(targetX, targetY)
  wsHub.broadcast('computer:click', {
    x: canonical.x,
    y: canonical.y,
    host_x: targetX,
    host_y: targetY,
    button: 'left',
    timestamp: Date.now()
  })
  return raw
}

export async function executeDoubleClick(x, y) {
  await executeClick(x, y)
  await new Promise((r) => setTimeout(r, 60))
  return await executeClick(x, y)
}

export async function executeRightClick(x, y) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'right-click', x, y })
  const canonical = normalizeCoordinates(x, y)
  wsHub.broadcast('computer:click', {
    x: canonical.x,
    y: canonical.y,
    host_x: x,
    host_y: y,
    button: 'right',
    timestamp: Date.now()
  })
  return raw
}

export async function executeMiddleClick(x, y) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'middle-click', x, y })
  const canonical = normalizeCoordinates(x, y)
  wsHub.broadcast('computer:click', {
    x: canonical.x,
    y: canonical.y,
    host_x: x,
    host_y: y,
    button: 'middle',
    timestamp: Date.now()
  })
  return raw
}

export async function executeMouseMove(x, y) {
  if (!isDaemonAlive()) await startDaemon()
  const raw = await sendCommand({ cmd: 'move', x, y })
  return raw
}

export async function executeMouseDown(options = {}) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({
    cmd: 'mouse-down',
    button: options.button || 'left',
    x: options.x,
    y: options.y
  })
  return raw
}

export async function executeMouseUp(options = {}) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({
    cmd: 'mouse-up',
    button: options.button || 'left',
    x: options.x,
    y: options.y
  })
  return raw
}

export async function executeBurstClick(options = {}) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({
    cmd: 'burst-click',
    x: options.x,
    y: options.y,
    count: options.count || 5,
    interval_ms: options.interval_ms || 20,
    button: options.button || 'left'
  })
  const canonical = normalizeCoordinates(options.x, options.y)
  wsHub.broadcast('computer:click', {
    x: canonical.x,
    y: canonical.y,
    host_x: options.x,
    host_y: options.y,
    button: options.button || 'left',
    burst: true,
    count: options.count || 5,
    timestamp: Date.now()
  })
  return raw
}

export async function executeDrag(options = {}) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({
    cmd: 'drag',
    start_x: options.start_x,
    start_y: options.start_y,
    end_x: options.end_x,
    end_y: options.end_y,
    duration_ms: options.duration_ms || 300,
    button: options.button || 'left'
  })
  wsHub.broadcast('computer:action', { action: 'drag', ...options, timestamp: Date.now() })
  return raw
}

export async function executeKeyDown(key, duration_ms = 0) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'key-down', key, duration_ms })
  return raw
}

export async function executeKeyUp(key) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'key-up', key })
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

export async function focusWindow(title, maximize = true) {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'focus-window', title, maximize })
  return raw
}

export async function maximizeWindow(title = '') {
  startOverlay()
  if (!isDaemonAlive()) await startDaemon()
  stateChanged = true
  const raw = await sendCommand({ cmd: 'maximize-window', title })
  return raw
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

/**
 * Unified Autonomous Computer Use Executor (VLA Contract).
 * Mengimplementasikan spesifikasi kontrak tool 'computer_use' sesuai SRS Visual Computer Use.
 */
export async function executeComputerUse(params = {}) {
  const p = typeof params === 'object' && params !== null ? params : {}

  // 1. Dukungan Unifikasi Array 'actions' (baik 1 aksi maupun banyak aksi berurutan)
  if (Array.isArray(p.actions) && p.actions.length > 0) {
    if (p.actions.length === 1 && typeof p.actions[0] === 'object') {
      return executeComputerUse(p.actions[0])
    }
    const results = []
    let lastScreenshotResult = null
    for (const act of p.actions) {
      if (act && typeof act === 'object') {
        const res = await executeComputerUse(act)
        results.push(res)
        if (res.action === 'screenshot' && (res.image || res.dataUrl)) {
          lastScreenshotResult = res
        }
        const delay = act.delay_after_ms !== undefined ? Number(act.delay_after_ms) : 100
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }
    const batchReturn = {
      success: results.every((r) => r.success !== false),
      action: 'batch',
      count: results.length,
      results
    }
    if (lastScreenshotResult) {
      batchReturn.image = lastScreenshotResult.image
      batchReturn.dataUrl = lastScreenshotResult.dataUrl
      batchReturn.cursor = lastScreenshotResult.cursor
      batchReturn.cursor_host = lastScreenshotResult.cursor_host
      batchReturn.viewport = lastScreenshotResult.viewport
      batchReturn.host_resolution = lastScreenshotResult.host_resolution
      batchReturn.message = lastScreenshotResult.message
    }
    return batchReturn
  }

  // 2. Dukungan Single Action Langsung di Root
  const action = (p.action || 'screenshot').toLowerCase().trim()

  switch (action) {
    case 'screenshot': {
      const res = await captureScreen({
        width: CANONICAL_WIDTH,
        height: CANONICAL_HEIGHT,
        quality: p.quality || 75
      })
      if (res.status === 'success') {
        const cursorMsg = Array.isArray(res.cursor)
          ? ` Posisi kursor saat ini: [${res.cursor[0]}, ${res.cursor[1]}].`
          : ''
        return {
          success: true,
          action: 'screenshot',
          image: res.image,
          dataUrl: res.image,
          cursor: res.cursor,
          cursor_host: res.cursor_host,
          host_resolution: `${res.host_width}x${res.host_height}`,
          viewport: `${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}`,
          message: `Screenshot berhasil diambil (${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}).${cursorMsg}`
        }
      }
      return { success: false, error: res.message || 'Gagal mengambil screenshot' }
    }

    case 'click': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      } else if (p.x !== undefined && p.y !== undefined) {
        const denorm = denormalizeCoordinates(p.x, p.y)
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeClick(x, y)
      return {
        success: true,
        action: 'click',
        coordinate: [p.coordinate?.[0] ?? p.x, p.coordinate?.[1] ?? p.y],
        host_coordinate: [x, y],
        result: raw
      }
    }

    case 'double_click': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeDoubleClick(x, y)
      return { success: true, action: 'double_click', coordinate: p.coordinate, result: raw }
    }

    case 'right_click': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeRightClick(x, y)
      return { success: true, action: 'right_click', coordinate: p.coordinate, result: raw }
    }

    case 'middle_click': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeMiddleClick(x, y)
      return { success: true, action: 'middle_click', coordinate: p.coordinate, result: raw }
    }

    case 'mouse_down': {
      let x, y
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeMouseDown({ button: p.button || 'left', x, y })
      return { success: true, action: 'mouse_down', button: p.button || 'left', result: raw }
    }

    case 'mouse_up': {
      let x, y
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeMouseUp({ button: p.button || 'left', x, y })
      return { success: true, action: 'mouse_up', button: p.button || 'left', result: raw }
    }

    case 'move': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeMouseMove(x, y)
      return { success: true, action: 'move', coordinate: p.coordinate, result: raw }
    }

    case 'drag': {
      let startX = 0,
        startY = 0,
        endX = 0,
        endY = 0
      if (Array.isArray(p.start_coordinate) && p.start_coordinate.length >= 2) {
        const s = denormalizeCoordinates(p.start_coordinate[0], p.start_coordinate[1])
        startX = s.x
        startY = s.y
      } else if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const s = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        startX = s.x
        startY = s.y
      }
      if (Array.isArray(p.end_coordinate) && p.end_coordinate.length >= 2) {
        const e = denormalizeCoordinates(p.end_coordinate[0], p.end_coordinate[1])
        endX = e.x
        endY = e.y
      } else if (Array.isArray(p.to) && p.to.length >= 2) {
        const e = denormalizeCoordinates(p.to[0], p.to[1])
        endX = e.x
        endY = e.y
      }
      const raw = await executeDrag({
        start_x: startX,
        start_y: startY,
        end_x: endX,
        end_y: endY,
        duration_ms: p.duration_ms || 300,
        button: p.button || 'left'
      })
      return { success: true, action: 'drag', result: raw }
    }

    case 'burst_click': {
      let x = 0,
        y = 0
      if (Array.isArray(p.coordinate) && p.coordinate.length >= 2) {
        const denorm = denormalizeCoordinates(p.coordinate[0], p.coordinate[1])
        x = denorm.x
        y = denorm.y
      }
      const raw = await executeBurstClick({
        x,
        y,
        count: p.count || 5,
        interval_ms: p.interval_ms || 20,
        button: p.button || 'left'
      })
      return { success: true, action: 'burst_click', count: p.count || 5, result: raw }
    }

    case 'type': {
      const text = p.text ?? ''
      const raw = await executeType(text)
      return { success: true, action: 'type', text, result: raw }
    }

    case 'key': {
      const key = p.key || p.combo || p.text || ''
      const raw = await executeKey(key)
      return { success: true, action: 'key', key, result: raw }
    }

    case 'key_down': {
      const key = p.key || p.combo || p.text || ''
      const raw = await executeKeyDown(key, p.duration_ms || 0)
      return { success: true, action: 'key_down', key, result: raw }
    }

    case 'key_up': {
      const key = p.key || p.combo || p.text || ''
      const raw = await executeKeyUp(key)
      return { success: true, action: 'key_up', key, result: raw }
    }

    case 'hotkey': {
      let combo = ''
      if (Array.isArray(p.keys)) {
        combo = p.keys.join('+')
      } else if (typeof p.keys === 'string') {
        combo = p.keys
      } else {
        const mods = Array.isArray(p.modifiers) ? p.modifiers.join('+') : ''
        const key = p.key || p.text || ''
        combo = mods ? `${mods}+${key}` : key
      }
      const raw = await executeKey(combo)
      return { success: true, action: 'hotkey', combo, result: raw }
    }

    case 'scroll': {
      const dir = p.direction || 'down'
      const amt = p.amount !== undefined ? Number(p.amount) : 3
      const raw = await executeScroll(dir, amt)
      return { success: true, action: 'scroll', direction: dir, amount: amt, result: raw }
    }

    case 'wait': {
      const ms = Math.min(10000, Math.max(10, Number(p.duration_ms || p.ms || 1000)))
      await new Promise((r) => setTimeout(r, ms))
      return { success: true, action: 'wait', duration_ms: ms }
    }

    case 'list_windows': {
      const windows = await listWindows()
      return { success: true, action: 'list_windows', count: windows.length, windows }
    }

    case 'focus_window': {
      const title = p.title || p.target || ''
      const maximize = p.maximize !== undefined ? Boolean(p.maximize) : true
      const raw = await focusWindow(title, maximize)
      return { success: true, action: 'focus_window', title, maximize, result: raw }
    }

    case 'maximize_window': {
      const title = p.title || p.target || ''
      const raw = await maximizeWindow(title)
      return { success: true, action: 'maximize_window', title, result: raw }
    }

    case 'open_app': {
      const target = p.name || p.target || p.app || ''
      const raw = await openApp(target)
      return { success: true, action: 'open_app', target, result: raw }
    }

    case 'batch': {
      const actions = Array.isArray(p.actions) ? p.actions : []
      return executeComputerUse({ actions })
    }

    default:
      return { success: false, error: `Action '${action}' tidak dikenali pada computer_use.` }
  }
}
