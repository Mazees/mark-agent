// src/main/pc-agent.js
// MARK PC Automation Engine - Zero Vision Cost Desktop Controller
// Uses native Windows UIAutomation, local WinRT OCR fallback, and Win32 action script

import { spawn } from 'child_process'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let pcEventBridge = null
export function setPCEventBridge(bridge) {
  pcEventBridge = bridge
}

function emitPCEvent(event, data) {
  if (pcEventBridge) {
    try {
      pcEventBridge(event, data)
    } catch (_) {}
  }
}

let lastReadResult = null
let lastReadTimestamp = 0
let stateChanged = false  // Set to true after click/type/key/scroll/open actions
const CACHE_TTL = 10000   // 10 seconds
let daemonProcess = null
let daemonReady = false
let pendingResolve = null
let daemonBuffer = ''
let activeChildProcess = null
let isStoppedByUser = false
let lastStopTime = 0
let lastStopReason = null
let overlayHideTimeout = null
let pendingAskResolve = null
let isSessionOpen = false
let mouseLockerProcess = null

export function isPCSessionOpen() {
  return isSessionOpen
}

function isStopActive() {
  if (isStoppedByUser && Date.now() - lastStopTime > 15000) {
    console.log(
      '[PC-Agent] Emergency stop state expired after 15s. Resetting isStoppedByUser=false'
    )
    isStoppedByUser = false
  }
  return isStoppedByUser
}

function getOverlayHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: transparent;
      overflow: hidden;
      user-select: none;
    }
    .banner {
      box-sizing: border-box;
      width: calc(100% - 8px);
      height: calc(100% - 8px);
      margin: 4px;
      background: rgba(25, 54, 45, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(31, 184, 84, 0.4);
      border-radius: 30px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 12px 24px;
      color: #1fb854;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes mark-spin { 100% { transform: rotate(360deg); } }
    .mark-spin { animation: mark-spin 1.5s linear infinite; }
    @keyframes mark-pulse { 50% { opacity: 0.7; } }
    .mark-pulse { animation: mark-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

    .title { font-size: 14px; font-weight: 600; letter-spacing: 0.3px; color: #1fb854; display: flex; align-items: center; gap: 6px; }
    .subtitle { font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 1px; }
    
    .modal-content {
      display: none;
      box-sizing: border-box;
      width: calc(100% - 24px);
      height: calc(100% - 24px);
      margin: 12px;
      background: rgba(25, 54, 45, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(31, 184, 84, 0.4);
      border-radius: 18px;
      box-shadow: 0 15px 35px -5px rgba(0,0,0,0.5);
      padding: 22px;
      flex-direction: column;
      gap: 16px;
      pointer-events: auto;
      font-family: system-ui, sans-serif;
    }
    .modal-header { display: flex; align-items: center; gap: 12px; }
    .modal-title { font-weight: 600; color: #f8fafc; font-size: 15px; letter-spacing: 0.5px; }
    .modal-subtitle {
      font-size: 13px; color: #94a3b8; line-height: 1.5;
      background: rgba(0,0,0,0.2); padding: 10px;
      border-radius: 8px; border-left: 3px solid #1fb854;
      margin: 0;
    }
    input[type="text"] {
      width: 100%; padding: 12px 14px; background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 8px; color: #f8fafc;
      font-size: 13px; outline: none; transition: all 0.2s; box-sizing: border-box;
    }
    input[type="text"]::placeholder { color: rgba(248, 250, 252, 0.5); }
    input[type="text"]:focus { border-color: #1fb854; box-shadow: 0 0 0 2px rgba(31, 184, 84, 0.2); }
    .btn-send {
      width: 100%; padding: 12px; background: #1fb854; color: #0f172a;
      border: none; border-radius: 8px; font-weight: 600; font-size: 14px;
      cursor: pointer; margin-top: auto; transition: all 0.2s;
    }
    .btn-send:hover { background: #22c55e; transform: translateY(-1px); }
  </style>
</head>
<body>
  <div class="banner" id="banner">
    <svg class="mark-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <div>
      <div class="title mark-pulse">Mark is working...</div>
      <div class="subtitle" id="banner-subtitle">Mouse locked. Press <strong style="color: #cbd5e1;">[Ctrl+Shift+S]</strong> to stop</div>
    </div>
  </div>

  <div class="modal-content" id="modal">
    <div class="modal-header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1fb854" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <div class="modal-title">Mark paused for input</div>
    </div>
    <div class="modal-subtitle">Menunggu respon atau instruksi...</div>
    <input type="text" id="reason-input" placeholder="Add a comment for Mark (optional)..." autocomplete="off" />
    <div style="display: flex; gap: 8px; margin-top: auto;">
      <button style="flex: 1; padding: 12px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.15)'" onclick="onCancel()">
        Batalkan Otomasi
      </button>
      <button style="flex: 1;" class="btn-send" id="btn-send" onclick="onSend()">
        Lanjutkan
      </button>
    </div>
  </div>

  <script>
    function onStop() {
      document.title = 'MARK_PC_STOP_CLICKED:' + Date.now();
    }
    function showAskModal(titleText, subtitleText, btnColor) {
      document.getElementById('banner').style.display = 'none';
      const modal = document.getElementById('modal');
      modal.style.display = 'flex';
      if (titleText) modal.querySelector('.modal-title').innerText = titleText;
      if (subtitleText) modal.querySelector('.modal-subtitle').innerHTML = subtitleText;
      const input = document.getElementById('reason-input');
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onSend();
      });
    }
    function onSend() {
      const val = document.getElementById('reason-input').value;
      document.title = 'MARK_PC_STOP_REASON:' + (val.trim() || 'User stopped PC automation without comment.');
    }
    function onCancel() {
      document.title = 'MARK_PC_ABORT_SESSION';
    }
    function resetBanner() {
      document.getElementById('modal').style.display = 'none';
      document.getElementById('banner').style.display = 'flex';
      document.getElementById('reason-input').value = '';
      document.getElementById('banner-subtitle').innerHTML = 'Mouse locked. Press <strong style="color: #cbd5e1;">[Ctrl+Shift+S]</strong> to stop';
    }
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onStop();
      }
    });
  </script>
</body>
</html>`
}

function showPCOverlay(action = 'Mengontrol Desktop', detail = '') {
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }
  if (isStopActive()) return

  emitPCEvent('pc-overlay-show', {
    status: 'running',
    action,
    detail,
    isSessionOpen
  })
}

function hidePCOverlay() {
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }
  if (isSessionOpen) return

  emitPCEvent('pc-overlay-hide', {})
}

function scheduleHidePCOverlay() {
  if (isSessionOpen) return
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
  }
  overlayHideTimeout = setTimeout(() => {
    if (!isStoppedByUser && !pendingAskResolve) {
      hidePCOverlay()
    }
  }, 1800)
}

export function triggerEmergencyStop(reason) {
  if (activeChildProcess) {
    try {
      activeChildProcess.kill()
    } catch (err) {}
    activeChildProcess = null
  }
  if (mouseLockerProcess) {
    try {
      mouseLockerProcess.kill()
    } catch (err) {}
    mouseLockerProcess = null
  }
  if (daemonProcess) {
    try { daemonProcess.kill() } catch(e){}
    daemonProcess = null
    daemonReady = false
  }
  isStoppedByUser = true
  lastStopTime = Date.now()
  lastStopReason = reason || 'User menekan tombol eksekusi Stop (Ctrl+Shift+S).'

  if (pendingAskResolve) {
    const resolveFn = pendingAskResolve
    pendingAskResolve = null
    resolveFn('SISTEM: USER MEMBATALKAN OTOMASI PC MELALUI EMERGENCY STOP (Ctrl+Shift+S).')
  }

  emitPCEvent('pc-emergency-stop', { reason: lastStopReason })
  emitPCEvent('pc-overlay-status', { status: 'stopped', message: lastStopReason })

  return { success: true, reason: lastStopReason }
}

export function resolveAskUserPC(response) {
  if (pendingAskResolve) {
    const resolveFn = pendingAskResolve
    pendingAskResolve = null
    resolveFn(response)
    emitPCEvent('pc-overlay-hide', {})
    return true
  }
  return false
}

/**
 * Helper to spawn mouse locker
 */
function startMouseLocker() {
  if (mouseLockerProcess) return
  try {
    let scriptPath = join(__dirname, 'pc-agent-scripts', 'mouse-locker.ps1')
    if (app.isPackaged) {
      const unpackedPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'src',
        'main',
        'pc-agent-scripts',
        'mouse-locker.ps1'
      )
      if (fs.existsSync(unpackedPath)) {
        scriptPath = unpackedPath
      } else {
        scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked')
      }
    } else if (!fs.existsSync(scriptPath)) {
      scriptPath = join(__dirname, 'pc-agent-scripts', 'mouse-locker.ps1')
    }
    mouseLockerProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ])
  } catch (err) {
    console.warn('[PC-Agent] Failed to start mouse locker:', err)
  }
}

function stopMouseLocker() {
  if (mouseLockerProcess) {
    try {
      mouseLockerProcess.kill()
    } catch (err) {}
    mouseLockerProcess = null
  }
}

/**
 * Open a persistent PC Automation session
 */
export async function openPCSession() {
  if (isSessionOpen) {
    return JSON.stringify({
      status: 'success',
      message:
        'PC Automation Session is ALREADY OPEN. Sesi PC Automation masih aktif! JANGAN panggil os-control-open lagi. LANGSUNG EKSEKUSI tool os-read, os-click, os-type, dll berikutnya di loop yang sama.'
    })
  }
  isSessionOpen = true
  isStoppedByUser = false
  showPCOverlay()
  startMouseLocker()
  try {
    await startDaemon()
  } catch (err) {
    console.warn('[PC-Agent] Failed to start daemon, will use fallback mode:', err)
  }
  return JSON.stringify({
    status: 'success',
    message:
      'PC Automation Session OPENED & APPROVED BY USER. User telah menyetujui dan mengizinkan sesi kontrol PC ini. LANGSUNG EKSEKUSI langkah berikutnya dengan tool os-read, os-click, os-type, dll SEKARANG JUGA di loop yang sama tanpa menyuruh user klik izinkan lagi! WAJIB panggil os-control-close ketika selesai.'
  })
}

/**
 * Close a persistent PC Automation session
 */
export async function closePCSession() {
  isSessionOpen = false
  isStoppedByUser = false
  hidePCOverlay()
  stopMouseLocker()
  stopDaemon()
  return JSON.stringify({
    status: 'success',
    message: 'PC Automation Session CLOSED.'
  })
}

/**
 * Ask user via PC automation overlay modal
 */
export async function askUserPC(query = '') {
  if (!isSessionOpen) {
    return JSON.stringify({
      status: 'error',
      message:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    })
  }
  isStoppedByUser = false

  emitPCEvent('pc-overlay-ask', {
    question: query,
    title: 'MARK Membutuhkan Masukan Anda'
  })

  const comment = await new Promise((resolve) => {
    pendingAskResolve = (val) => resolve(val)
  })

  if (isSessionOpen) {
    startMouseLocker()
  }

  return JSON.stringify({
    status: 'success',
    user_response: comment
  })
}

function getDaemonScriptPath() {
  let scriptPath = join(__dirname, 'pc-agent-scripts', 'pc-daemon.ps1')
  if (fs.existsSync(scriptPath)) return scriptPath
  const fallbackPath = path.resolve('src/backend/pc-agent-scripts/pc-daemon.ps1')
  return fallbackPath
}

function startDaemon() {
  return new Promise((resolve, reject) => {
    if (daemonProcess && !daemonProcess.killed) {
      resolve()
      return
    }
    
    const scriptPath = getDaemonScriptPath()
    daemonProcess = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ])
    daemonBuffer = ''
    daemonReady = false
    
    // Handle daemon stdout - accumulate until ---MARK_DONE--- delimiter
    daemonProcess.stdout.on('data', (chunk) => {
      daemonBuffer += chunk.toString()
      
      let delimiterIndex;
      while ((delimiterIndex = daemonBuffer.indexOf('---MARK_DONE---')) !== -1) {
        const response = daemonBuffer.substring(0, delimiterIndex).trim()
        daemonBuffer = daemonBuffer.substring(delimiterIndex + '---MARK_DONE---'.length).trimStart()
        
        if (!daemonReady) {
          // First response is the startup {"status":"ready"} message
          daemonReady = true
          console.log('[PC-Agent] Daemon started and ready')
          resolve()
          continue
        }
        
        if (pendingResolve) {
          const resolveFn = pendingResolve
          pendingResolve = null
          resolveFn(response)
        }
      }
    })
    
    daemonProcess.stderr.on('data', (data) => {
      console.warn('[PC-Agent] Daemon stderr:', data.toString())
    })
    
    daemonProcess.on('close', (code) => {
      console.log('[PC-Agent] Daemon process exited with code', code)
      daemonProcess = null
      daemonReady = false
      if (pendingResolve) {
        const resolveFn = pendingResolve
        pendingResolve = null
        resolveFn('')
      }
    })
    
    daemonProcess.on('error', (err) => {
      console.error('[PC-Agent] Daemon spawn error:', err)
      daemonProcess = null
      reject(err)
    })
    
    // Timeout: if daemon doesn't respond within 15s, reject
    setTimeout(() => {
      if (!daemonReady) {
        reject(new Error('Daemon startup timeout'))
      }
    }, 15000)
  })
}

function stopDaemon() {
  if (daemonProcess && !daemonProcess.killed) {
    try {
      daemonProcess.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n')
    } catch (e) {}
    setTimeout(() => {
      if (daemonProcess && !daemonProcess.killed) {
        try { daemonProcess.kill() } catch (e) {}
      }
      daemonProcess = null
      daemonReady = false
    }, 1000)
  }
}

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    if (!daemonProcess || daemonProcess.killed || !daemonReady) {
      resolve(JSON.stringify({ status: 'error', message: 'Daemon not running' }))
      return
    }
    
    if (isStopActive()) {
      resolve(JSON.stringify({
        status: 'stopped_by_user',
        message: `PC automation stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`,
        user_message: lastStopReason || 'User pressed Ctrl+S / Stop button',
        action: 'os-ask'
      }))
      return
    }
    
    pendingResolve = resolve
    try {
      daemonProcess.stdin.write(JSON.stringify(cmd) + '\n')
    } catch (err) {
      pendingResolve = null
      resolve(JSON.stringify({ status: 'error', message: 'Failed to write to daemon: ' + err.message }))
    }
    
    // Timeout: 30s per command
    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null
        resolve(JSON.stringify({ status: 'error', message: 'Command timeout (30s)' }))
      }
    }, 30000)
  })
}

function isDaemonAlive() {
  return daemonProcess && !daemonProcess.killed && daemonReady
}

/**
 * Run a PowerShell script from pc-agent-scripts as fallback
 */
function runScriptFallback(scriptName, args = []) {
  return new Promise((resolve) => {
    let scriptPath = join(__dirname, 'pc-agent-scripts', scriptName)
    if (app.isPackaged) {
      const unpackedPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'src',
        'main',
        'pc-agent-scripts',
        scriptName
      )
      if (fs.existsSync(unpackedPath)) {
        scriptPath = unpackedPath
      } else {
        scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked')
      }
    } else if (!fs.existsSync(scriptPath)) {
      scriptPath = join(__dirname, 'pc-agent-scripts', scriptName)
    }

    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      ...args
    ])
    activeChildProcess = ps

    let stdout = ''
    let stderr = ''

    ps.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ps.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ps.on('close', (code) => {
      if (activeChildProcess === ps) {
        activeChildProcess = null
      }
      if (code !== 0 && stderr) {
        console.warn(`[PC-Agent] Script ${scriptName} exited with code ${code}: ${stderr}`)
      }
      if (isStopActive()) {
        resolve(
          JSON.stringify({
            status: 'stopped_by_user',
            message: `PC automation stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`,
            user_message: lastStopReason || 'User pressed Ctrl+S / Stop button',
            action: 'os-ask'
          })
        )
        return
      }
      resolve(stdout.trim())
    })

    ps.on('error', (err) => {
      if (activeChildProcess === ps) {
        activeChildProcess = null
      }
      console.error(`[PC-Agent] Error spawning script ${scriptName}:`, err)
      resolve('')
    })
  })
}

/**
 * Read the active desktop GUI elements (UIAutomation with OCR fallback)
 */
export async function readDesktop(options = {}, query = '') {
  if (!isSessionOpen) {
    return {
      window: 'error',
      method: 'error',
      elements: [],
      element_count: 0,
      error:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    }
  }
  if (isStoppedByUser) {
    console.log('[PC-Agent] Resetting isStoppedByUser=false for new readDesktop() call')
    isStoppedByUser = false
  }
  showPCOverlay()
  
  const isFocus = (query === 'focus')
  if (!isFocus && !stateChanged && lastReadResult && (Date.now() - lastReadTimestamp < CACHE_TTL)) {
    scheduleHidePCOverlay()
    return { ...lastReadResult, method: 'cached' }
  }

  try {
    let uiText = ''
    if (isDaemonAlive()) {
      if (isFocus) {
        uiText = await sendCommand({ cmd: 'read-focus' })
      } else {
        uiText = await sendCommand({ cmd: 'read-ui', maxElements: options.maxElements || 300, roles: options.roles })
      }
    } else {
      uiText = await runScriptFallback('read-ui.ps1')
    }

    let parsed = null
    if (uiText) {
      try {
        parsed = JSON.parse(uiText)
      } catch (e) {
        console.warn('[PC-Agent] Failed to parse UIAutomation JSON, falling back to OCR')
      }
    }

    // If UIAutomation returned 0 elements or failed, fallback to local OCR
    if (!isFocus && (!parsed || !parsed.elements || parsed.elements.length === 0)) {
      console.log(
        '[PC-Agent] UIAutomation returned 0 elements. Executing local WinRT OCR fallback...'
      )
      let ocrText = ''
      if (isDaemonAlive()) {
        ocrText = await sendCommand({ cmd: 'ocr' })
      } else {
        ocrText = await runScriptFallback('ocr-region.ps1')
      }
      if (ocrText) {
        try {
          parsed = JSON.parse(ocrText)
        } catch {}
      }
    }

    if (parsed && parsed.elements) {
      lastReadResult = parsed
      lastReadTimestamp = Date.now()
      stateChanged = false
    } else {
      parsed = { window: 'unknown', method: 'none', elements: [], element_count: 0 }
    }

    scheduleHidePCOverlay()
    return parsed
  } catch (err) {
    scheduleHidePCOverlay()
    console.error('[PC-Agent] readDesktop error:', err)
    return { window: 'error', method: 'error', elements: [], element_count: 0 }
  }
}

/**
 * Helper: Find coordinates from element ID or x||y string
 */
function resolveCoordinates(query) {
  if (!query) return null

  // If query is "x||y"
  if (query.includes('||')) {
    const parts = query.split('||').map((p) => parseInt(p.trim(), 10))
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] }
    }
  }

  // If query is element ID (number)
  const id = parseInt(query.trim(), 10)
  if (!isNaN(id) && lastReadResult && lastReadResult.elements) {
    const el = lastReadResult.elements.find((item) => item.id === id)
    if (el && el.rect && el.rect.length === 4) {
      const centerX = Math.round(el.rect[0] + el.rect[2] / 2)
      const centerY = Math.round(el.rect[1] + el.rect[3] / 2)
      return { x: centerX, y: centerY, id: id }
    }
  }

  return null
}

/**
 * Click an element by ID or coordinates
 */
export async function executeClick(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  const coords = resolveCoordinates(query)
  if (!coords) {
    scheduleHidePCOverlay()
    return `[PC-Agent] Error: Element ID or coordinates '${query}' not found. Try os-read first.`
  }
  
  let result = ''
  if (isDaemonAlive()) {
    if (coords.id !== undefined) {
      result = await sendCommand({ cmd: 'native-invoke', id: coords.id, x: coords.x, y: coords.y })
    } else {
      result = await sendCommand({ cmd: 'click', x: coords.x, y: coords.y })
    }
  } else {
    result = await runScriptFallback('win-action.ps1', [
      '-Action',
      'click',
      '-X',
      coords.x.toString(),
      '-Y',
      coords.y.toString()
    ])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Clicked at (${coords.x}, ${coords.y}). ${result}`
}

/**
 * Double Click an element by ID or coordinates
 */
export async function executeDoubleClick(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  const coords = resolveCoordinates(query)
  if (!coords) {
    scheduleHidePCOverlay()
    return `[PC-Agent] Error: Element ID or coordinates '${query}' not found. Try os-read first.`
  }
  
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'double-click', x: coords.x, y: coords.y })
  } else {
    result = await runScriptFallback('win-action.ps1', [
      '-Action',
      'doubleclick',
      '-X',
      coords.x.toString(),
      '-Y',
      coords.y.toString()
    ])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Double-Clicked at (${coords.x}, ${coords.y}). ${result}`
}

/**
 * Type text into an element by ID or directly
 */
export async function executeType(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let text = query
  let coords = null

  if (query && query.includes('||')) {
    const idx = query.indexOf('||')
    const possibleId = query.substring(0, idx).trim()
    text = query.substring(idx + 2).trim()
    coords = resolveCoordinates(possibleId)
  }

  // If element ID was provided, click it first to focus
  if (coords) {
    if (isDaemonAlive()) {
      await sendCommand({ cmd: 'click', x: coords.x, y: coords.y })
    } else {
      await runScriptFallback('win-action.ps1', [
        '-Action',
        'click',
        '-X',
        coords.x.toString(),
        '-Y',
        coords.y.toString()
      ])
    }
  }

  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'type', text })
  } else {
    result = await runScriptFallback('win-action.ps1', ['-Action', 'type', '-Text', text])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Typed "${text}". ${result}`
}

/**
 * Press a keyboard shortcut combo
 */
export async function executeKey(combo) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'key', combo })
  } else {
    result = await runScriptFallback('win-action.ps1', ['-Action', 'key', '-Combo', combo])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Pressed key combo "${combo}". ${result}`
}

/**
 * Scroll mouse wheel
 */
export async function executeScroll(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let direction = 'down'
  let amount = 5
  if (query && query.includes('||')) {
    const parts = query.split('||')
    direction = parts[0].trim().toLowerCase()
    const amt = parseInt(parts[1].trim(), 10)
    if (!isNaN(amt)) amount = amt
  } else if (query) {
    direction = query.trim().toLowerCase()
  }
  
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'scroll', direction, amount })
  } else {
    result = await runScriptFallback('win-action.ps1', [
      '-Action',
      'scroll',
      '-Direction',
      direction,
      '-Amount',
      amount.toString()
    ])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Scrolled ${direction} by ${amount}. ${result}`
}

/**
 * Open an application
 */
export async function openApp(target) {
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'open', target })
  } else {
    result = await runScriptFallback('win-action.ps1', ['-Action', 'open', '-Target', target])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Opened application "${target}". ${result}`
}

/**
 * List all active top-level windows
 */
export async function listWindows() {
  if (!isSessionOpen) {
    return {
      status: 'error',
      windows: [],
      count: 0,
      message:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    }
  }
  if (isStopActive()) {
    return { status: 'stopped_by_user', windows: [], count: 0, message: lastStopReason }
  }
  showPCOverlay()
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'list-windows' })
  } else {
    result = await runScriptFallback('win-action.ps1', ['-Action', 'list-windows'])
  }
  scheduleHidePCOverlay()
  try {
    const parsed = JSON.parse(result)
    return { status: 'success', windows: parsed, count: parsed.length }
  } catch {
    return { status: 'error', windows: [], count: 0, raw: result }
  }
}

/**
 * Focus window by title substring
 */
export async function focusWindow(title) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let result = ''
  if (isDaemonAlive()) {
    result = await sendCommand({ cmd: 'focus-window', title })
  } else {
    result = await runScriptFallback('win-action.ps1', ['-Action', 'focus-window', '-Target', title])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Focus window "${title}". ${result}`
}
