import { spawn } from 'node:child_process'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wsHub } from '../ws-hub.js'
import { PcCommandChannel } from './pc-command-channel.js'
import { consumeComputerUsePermission } from './computer-use-permissions.js'
import { validateComputerUseArgs } from '../../shared/computer-use.js'
import {
  boundedDelay,
  parseNativeResult,
  screenGeometryMatches,
  abortableDelay
} from './computer-use-contract.js'
import {
  startHud,
  stopHud,
  updateHudAction,
  setHudStatus,
  isHudActive,
  setServerPort,
  beginHudControl,
  endHudControl,
  hideHudForCapture,
  showHudAfterCapture,
  overlayEvents
} from './overlay-manager.js'

const scriptDir = fileURLToPath(new URL('../../main/pc-agent-scripts/', import.meta.url))
const executionScope = new AsyncLocalStorage()
const observations = new Map()
const activeCalls = new Map()
const cancelledRuns = new Set()
let daemonProcess = null
let daemonReady = false
let startingDaemon = null
let channel = null
let lockHolder = null
const lockQueue = []
export const CANONICAL_WIDTH = 1280
export const CANONICAL_HEIGHT = 720
let cachedScreenInfo = null
let desktopSession = null

export function computerUseSessionStatus() {
  return desktopSession
    ? {
        id: desktopSession.id,
        sessionId: desktopSession.sessionId,
        runId: desktopSession.runId,
        status: 'active'
      }
    : { status: 'closed' }
}

export async function closeComputerUseSession(reason = 'Sesi Computer Use ditutup.', owner = null) {
  const current = desktopSession
  if (!current || (owner && current.runKey !== owner.runKey))
    return { success: true, action: 'close', sessionStatus: 'closed' }
  if (current.closing) return current.closing
  current.closing = (async () => {
    await endHudControl(current.id)
    if (desktopSession === current) {
      stopHud(true)
      desktopSession = null
    }
    observations.delete(current.sessionId)
    return { success: true, action: 'close', sessionStatus: 'closed', message: reason }
  })()
  return current.closing
}

overlayEvents.on('cancelled', (event) => {
  if (desktopSession) {
    cancelledRuns.add(desktopSession.runKey)
    desktopSession = null
  }
  for (const scope of activeCalls.values()) {
    cancelledRuns.add(scope.runKey)
    scope.reason = event.reason
    scope.cancelledBy = 'user'
    scope.controller.abort()
  }
  if (event.sessionId)
    cancelledRuns.add(String(event.sessionId) + ':' + String(event.runId || event.sessionId))
  if (cancelledRuns.size > 100) cancelledRuns.delete(cancelledRuns.values().next().value)
  stopDaemon()
})
overlayEvents.on('interrupted', (event) => {
  if (!desktopSession || (event.controlId && event.controlId !== desktopSession.id)) return
  for (const scope of activeCalls.values()) {
    scope.reason = event.reason || 'Sesi Computer Use terputus.'
    scope.controller.abort()
  }
  stopDaemon()
})

export { updateHudAction, setHudStatus, isHudActive, setServerPort }
export const isOverlayAlive = isHudActive
export const startOverlay = (sessionName = 'Mark Utama') => startHud({ sessionName })
export const stopOverlay = (force = false) => stopHud(force)
export const updateOverlayText = (sessionName, detail) => updateHudAction({ sessionName, detail })
export const sendVirtualCursor = (data) => updateHudAction({ cursorAction: data.cmd })
export const startVirtualCursor = startOverlay
export const stopVirtualCursor = () => endHudControl()
export const isDaemonAlive = () => Boolean(daemonProcess && !daemonProcess.killed && daemonReady)

export function startDaemon() {
  if (isDaemonAlive()) return Promise.resolve()
  if (startingDaemon) return startingDaemon
  const startup = new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(scriptDir, 'pc-daemon.ps1')
      ],
      { windowsHide: true }
    )
    daemonProcess = child
    let buffer = ''
    const localChannel = new PcCommandChannel(
      (command) => child.stdin.write(JSON.stringify(command) + '\n'),
      () => {
        child.kill()
        if (daemonProcess === child) {
          daemonReady = false
          observations.clear()
        }
      }
    )
    channel = localChannel
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Daemon Win32 tidak siap setelah 15 detik.'))
    }, 15000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let match
      while ((match = /---MARK_DONE(?::([a-f0-9-]+))?---/.exec(buffer))) {
        const response = buffer.slice(0, match.index).trim()
        buffer = buffer.slice(match.index + match[0].length).trimStart()
        if (!match[1]) {
          try {
            if (JSON.parse(response).status !== 'ready') throw new Error()
            if (daemonProcess !== child) return
            daemonReady = true
            clearTimeout(timer)
            resolve()
          } catch {
            clearTimeout(timer)
            child.kill()
            reject(new Error('Handshake daemon tidak valid.'))
          }
        } else localChannel.receive(match[1], response)
      }
    })
    child.stderr.on('data', () => {})
    child.on('error', (error) => {
      clearTimeout(timer)
      localChannel.close()
      reject(error)
    })
    child.on('close', () => {
      clearTimeout(timer)
      localChannel.close()
      if (daemonProcess === child) {
        daemonProcess = null
        daemonReady = false
        observations.clear()
      }
      reject(new Error('Daemon Win32 ditutup sebelum siap.'))
    })
  })
  startingDaemon = startup.finally(() => {
    startingDaemon = null
  })
  return startingDaemon
}

export function stopDaemon() {
  desktopSession = null
  const child = daemonProcess
  channel?.close()
  channel = null
  daemonProcess = null
  daemonReady = false
  observations.clear()
  child?.kill()
  stopHud(true)
}

export async function sendCommand(command) {
  const scope = executionScope.getStore()
  if (scope?.signal.aborted)
    return JSON.stringify({
      status: 'error',
      executionStatus: 'cancelled',
      message: 'Computer Use dihentikan.'
    })
  await startDaemon()
  return channel.enqueue(
    {
      ...command,
      expectedWindowId: scope?.expectedWindowId,
      expectedProcessId: scope?.expectedProcessId
    },
    scope?.signal
  )
}

export function acquirePcLock(sessionId = 'default', agentName = 'Mark Utama', signal) {
  if (signal?.aborted) return Promise.reject(new Error('Computer Use dihentikan.'))
  return new Promise((resolve, reject) => {
    const item = { sessionId, agentName, signal }
    item.grant = () => {
      signal?.removeEventListener('abort', item.abort)
      lockHolder = item
      if (!desktopSession) updateHudAction({ sessionName: agentName, queueCount: lockQueue.length })
      let released = false
      resolve(() => {
        if (!released) {
          released = true
          releasePcLock()
        }
      })
    }
    item.abort = () => {
      const index = lockQueue.indexOf(item)
      if (index >= 0) lockQueue.splice(index, 1)
      reject(new Error('Computer Use dihentikan sebelum mendapat giliran.'))
    }
    if (!lockHolder) item.grant()
    else {
      lockQueue.push(item)
      signal?.addEventListener('abort', item.abort, { once: true })
    }
  })
}

export function releasePcLock() {
  lockHolder = null
  const next = lockQueue.shift()
  if (next) next.grant()
  else if (!desktopSession) stopHud(false)
}

const native = (cmd, args = {}) => sendCommand({ cmd, ...args })
export const executeClick = (x, y) => native('click', { x, y })
export const executeDoubleClick = (x, y) => native('double-click', { x, y })
export const executeRightClick = (x, y) => native('right-click', { x, y })
export const executeMiddleClick = (x, y) => native('middle-click', { x, y })
export const executeMouseMove = (x, y) => native('move', { x, y })
export const executeMouseDown = (options) => native('mouse-down', options)
export const executeMouseUp = (options) => native('mouse-up', options)
export const executeBurstClick = (options) => native('burst-click', options)
export const executeDrag = (options) => native('drag', options)
export const executeKeyDown = (key, duration_ms = 0) => native('key-down', { key, duration_ms })
export const executeKeyUp = (key) => native('key-up', { key })
export const executeType = (text) => native('type', { text })
export const executeKey = (combo) => native('key', { combo })
export const executeScroll = (direction = 'down', amount = 3) =>
  native('scroll', { direction, amount })
export const openApp = (target) => native('open', { target })
export const listWindows = async () => JSON.parse(await native('list-windows'))
export const focusWindow = (title, maximize = false, windowId) =>
  native('focus-window', { title, maximize, windowId })
export const maximizeWindow = (title = '', windowId) =>
  native('focus-window', { title, windowId, maximize: true })
export const readDesktop = async (options = {}) =>
  JSON.parse(
    await native('read-ui', { maxElements: options.maxElements || 60, roles: options.roles })
  )
export const openPCSession = async () => {
  await startDaemon()
  return { success: true }
}
export const closePCSession = async () => {
  stopDaemon()
  return { success: true }
}
export const isPCSessionOpen = isDaemonAlive

export async function getScreenInfo() {
  const result = JSON.parse(await native('get-screen-info'))
  if (result.status !== 'success')
    throw new Error(result.message || 'Geometri layar tidak tersedia.')
  cachedScreenInfo = result
  return result
}

export function denormalizeCoordinates(x, y) {
  if (!cachedScreenInfo) throw new Error('Ambil observasi layar sebelum menggunakan koordinat.')
  if (
    ![x, y].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    x >= CANONICAL_WIDTH ||
    y >= CANONICAL_HEIGHT
  )
    throw new Error('Koordinat berada di luar screenshot 1280x720.')
  return {
    x: Math.round(cachedScreenInfo.screen_x + (x * cachedScreenInfo.host_width) / CANONICAL_WIDTH),
    y: Math.round(cachedScreenInfo.screen_y + (y * cachedScreenInfo.host_height) / CANONICAL_HEIGHT)
  }
}

export function normalizeCoordinates(x, y) {
  if (!cachedScreenInfo) throw new Error('Geometri layar belum tersedia.')
  return {
    x: Math.round(
      ((x - cachedScreenInfo.screen_x) * CANONICAL_WIDTH) / cachedScreenInfo.host_width
    ),
    y: Math.round(
      ((y - cachedScreenInfo.screen_y) * CANONICAL_HEIGHT) / cachedScreenInfo.host_height
    )
  }
}

export async function captureScreen(options = {}) {
  const scope = executionScope.getStore()
  if (scope?.expectedWindowId) {
    const current = await getScreenInfo()
    if (
      current.window_id !== scope.expectedWindowId &&
      !(current.owner_window_ids || []).includes(scope.expectedWindowId)
    )
      return {
        status: 'error',
        message:
          'Fokus berpindah ke jendela lain; screenshot hasil aksi tidak diambil. Periksa target sebelum melanjutkan.'
      }
  }
  await hideHudForCapture()
  try {
    const result = JSON.parse(
      await native('capture-screen', {
        width: options.width || CANONICAL_WIDTH,
        height: options.height || CANONICAL_HEIGHT,
        quality: options.quality ?? 75,
        show_ruler: false
      })
    )
    if (result.status === 'success' && result.image) {
      const observation = {
        id: randomUUID(),
        capturedAt: new Date().toISOString(),
        source: 'monitor',
        coordinateSpace: 'monitor-1280x720',
        ...result
      }
      delete observation.image
      cachedScreenInfo = result
      if (scope) {
        observations.delete(scope.sessionId)
        observations.set(scope.sessionId, observation)
        if (observations.size > 100) observations.delete(observations.keys().next().value)
      }
      result.observation = observation
      wsHub.broadcast('computer:preview', {
        image: result.image,
        cursor: result.cursor,
        cursor_host: result.cursor_host,
        width: options.width || CANONICAL_WIDTH,
        height: options.height || CANONICAL_HEIGHT,
        observation,
        timestamp: Date.now()
      })
    }
    return result
  } finally {
    showHudAfterCapture()
  }
}

function check(scope) {
  if (scope.signal.aborted) throw new Error(scope.reason || 'Computer Use dihentikan.')
}

async function checkTarget(scope, action) {
  check(scope)
  if (
    [
      'screenshot',
      'list_windows',
      'focus_window',
      'maximize_window',
      'open_app',
      'wait',
      'close',
      'close_session'
    ].includes(action)
  )
    return
  const previous = observations.get(scope.sessionId)
  if (!previous) throw new Error('Ambil screenshot terlebih dahulu untuk menetapkan target aksi.')
  if (scope.observationId && previous.id !== scope.observationId)
    throw new Error('Observasi sudah diganti. Gunakan ID dari screenshot terbaru.')
  const current = await getScreenInfo()
  if (
    !screenGeometryMatches(previous, current) ||
    current.window_id !== current.foreground_window_id
  )
    throw new Error(
      'Target atau geometri layar berubah. Ambil screenshot baru sebelum melanjutkan.'
    )
  scope.expectedWindowId = current.window_id
  scope.expectedProcessId = current.process_id
}

const pointerActions = new Set([
  'click',
  'double_click',
  'right_click',
  'middle_click',
  'move',
  'drag',
  'burst_click',
  'mouse_down',
  'mouse_up'
])
async function runAction(p, scope) {
  const action = String(p.action).toLowerCase().trim()
  if (desktopSession?.closing)
    throw new Error('Sesi Computer Use sedang ditutup. Tunggu sampai penutupan selesai.')
  if (action === 'open_session') {
    if (desktopSession?.runKey === scope.runKey)
      return { success: true, action, sessionStatus: 'active', session: computerUseSessionStatus() }
    if (desktopSession) throw new Error('Desktop sedang dikendalikan sesi Computer Use lain.')
    if (!consumeComputerUsePermission(scope.approvalToken, scope))
      throw new Error(
        'Sesi Computer Use membutuhkan izin pengguna. Panggil open_session dan tunggu persetujuan.'
      )
    const session = {
      id: randomUUID(),
      runKey: scope.runKey,
      sessionId: scope.sessionId,
      runId: scope.runId
    }
    await startHud({ sessionName: scope.agentName, sessionId: scope.sessionId, runId: scope.runId })
    await beginHudControl(session.id)
    desktopSession = session
    check(scope)
    return { success: true, action, sessionStatus: 'active', session: computerUseSessionStatus() }
  }
  if (action === 'close' || action === 'close_session')
    return closeComputerUseSession('Mark menutup sesi Computer Use.', scope)
  if (!desktopSession || desktopSession.runKey !== scope.runKey)
    throw new Error(
      'Belum ada sesi Computer Use yang diizinkan untuk pekerjaan ini. Buka open_session terlebih dahulu.'
    )
  await checkTarget(scope, action)
  updateHudAction({
    status: action === 'screenshot' ? 'observing' : 'running',
    detail: actionLabel(action),
    sessionName: scope.agentName,
    sessionId: scope.sessionId,
    runId: scope.runId
  })
  const point = (
    coordinate = p.coordinate || (p.x !== undefined && p.y !== undefined ? [p.x, p.y] : null)
  ) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2)
      throw new Error('Koordinat [x, y] wajib diisi.')
    return denormalizeCoordinates(Number(coordinate[0]), Number(coordinate[1]))
  }
  let result
  switch (action) {
    case 'screenshot':
      return { success: true, executionStatus: 'not_applicable', action }
    case 'list_windows':
      return { success: true, action, windows: await listWindows() }
    case 'wait':
      await abortableDelay(boundedDelay(p.duration_ms ?? p.ms, 1000), scope.signal)
      return { success: true, action, executionStatus: 'not_applicable' }
    case 'click':
    case 'double_click':
    case 'right_click':
    case 'middle_click':
    case 'move':
      result = await native(action.replaceAll('_', '-'), { ...point(), duration_ms: 140 })
      break
    case 'mouse_down':
    case 'mouse_up':
      result = await native(action.replaceAll('_', '-'), {
        ...(p.coordinate ? point() : {}),
        button: p.button || 'left'
      })
      break
    case 'burst_click':
      result = await native('burst-click', {
        ...point(),
        count: Math.min(100, Math.max(1, Number(p.count ?? 5))),
        interval_ms: boundedDelay(p.interval_ms, 20),
        button: p.button || 'left'
      })
      break
    case 'drag': {
      const from = point(p.start_coordinate || p.coordinate),
        to = point(p.end_coordinate || p.to)
      result = await native('drag', {
        start_x: from.x,
        start_y: from.y,
        end_x: to.x,
        end_y: to.y,
        duration_ms: boundedDelay(p.duration_ms, 300),
        button: p.button || 'left'
      })
      break
    }
    case 'type':
      result = await executeType(String(p.text ?? ''))
      break
    case 'key':
      result = await executeKey(p.key || p.combo || p.text || '')
      break
    case 'key_down':
      result = await executeKeyDown(p.key || p.combo || '', boundedDelay(p.duration_ms, 0))
      break
    case 'key_up':
      result = await executeKeyUp(p.key || p.combo || '')
      break
    case 'hotkey':
      result = await executeKey(
        Array.isArray(p.keys)
          ? p.keys.join('+')
          : p.keys || [...(p.modifiers || []), p.key || ''].join('+')
      )
      break
    case 'scroll':
      result = await executeScroll(
        p.direction || 'down',
        Math.min(100, Math.max(1, Number(p.amount ?? 3)))
      )
      break
    case 'focus_window':
    case 'maximize_window':
      scope.expectedWindowId = undefined
      scope.expectedProcessId = undefined
      result = await focusWindow(
        p.title || p.target || '',
        action === 'maximize_window' || p.maximize === true,
        p.window_id
      )
      break
    case 'open_app':
      scope.expectedWindowId = undefined
      scope.expectedProcessId = undefined
      result = await openApp(p.name || p.target || p.app || '')
      break
    default:
      throw new Error("Aksi '" + action + "' tidak dikenali.")
  }
  const parsed = { ...parseNativeResult(result), action }
  if (pointerActions.has(action) && parsed.success) {
    updateHudAction({ cursorAction: action.includes('click') ? 'click' : 'move' })
    if (
      action.includes('click') &&
      Number.isFinite(parsed.result?.x) &&
      Number.isFinite(parsed.result?.y)
    ) {
      const position = normalizeCoordinates(parsed.result.x, parsed.result.y)
      wsHub.broadcast('computer:click', {
        ...position,
        host_x: parsed.result.x,
        host_y: parsed.result.y,
        button: action === 'right_click' ? 'right' : 'left',
        timestamp: Date.now()
      })
    }
  }
  if (parsed.success && ['focus_window', 'maximize_window', 'open_app'].includes(action)) {
    scope.observationId = null
    const shot = await captureScreen()
    if (shot.status !== 'success')
      return {
        success: false,
        action,
        error: 'Target dibuka, tetapi observasi awal gagal.',
        executionStatus: 'executed',
        captureStatus: 'failed'
      }
  }
  return parsed
}

function actionLabel(action) {
  return (
    {
      click: 'Mengklik',
      double_click: 'Mengklik dua kali',
      right_click: 'Klik kanan',
      type: 'Mengetik',
      key: 'Menekan tombol',
      scroll: 'Menggulir',
      drag: 'Menyeret',
      screenshot: 'Mengamati layar',
      move: 'Memindahkan cursor',
      focus_window: 'Memilih jendela',
      open_app: 'Membuka aplikasi',
      wait: 'Menunggu'
    }[action] || 'Menjalankan aksi'
  )
}

export async function executeComputerUse(params = {}) {
  let p
  try {
    p = validateComputerUseArgs(params)
  } catch (error) {
    return { success: false, executionStatus: 'failed', error: error.message }
  }
  const controller = new AbortController()
  const sessionId = String(p.sessionId || 'default'),
    runId = String(p.runId || sessionId)
  const scope = {
    id: randomUUID(),
    sessionId,
    runId,
    runKey: sessionId + ':' + runId,
    agentName: p.agentName || 'Mark Utama',
    observationId: p.observation_id,
    signal: controller.signal,
    controller,
    approvalToken: p.approvalToken
  }
  if (cancelledRuns.has(scope.runKey))
    return {
      success: false,
      executionStatus: 'cancelled',
      cancelledBy: 'user',
      error:
        'Pengguna membatalkan Computer Use. Jangan lanjutkan dalam giliran ini; tunggu instruksi baru.'
    }
  activeCalls.set(scope.id, scope)
  const abort = () => {
    scope.reason = 'Computer Use dihentikan.'
    controller.abort()
  }
  const takeover = (event) => {
    if (event.controlId === desktopSession?.id || event.controlId === scope.id) {
      scope.reason = event.reason || 'Sesi Computer Use terputus.'
      controller.abort()
      desktopSession = null
    }
  }
  p.signal?.addEventListener('abort', abort, { once: true })
  if (p.signal?.aborted) abort()
  overlayEvents.on('interrupted', takeover)
  let release
  try {
    release = await acquirePcLock(scope.sessionId, scope.agentName, scope.signal)
    return await executionScope.run(scope, async () => {
      if (['close', 'close_session'].includes(p.action) && !p.actions)
        return closeComputerUseSession('Mark menutup sesi Computer Use.', scope)
      await startDaemon()
      const actions = Array.isArray(p.actions) ? p.actions : [p]
      if (!actions.length || actions.length > 30)
        throw new Error('Isi 1 hingga 30 aksi per panggilan.')
      const waitMs = boundedDelay(p.wait_ms ?? actions.at(-1)?.wait_ms, 300)
      for (const action of actions) {
        if (!action || typeof action !== 'object')
          throw new Error('Setiap aksi harus berupa objek.')
        boundedDelay(action.delay_after_ms, 0)
      }
      const results = []
      for (let i = 0; i < actions.length; i++) {
        check(scope)
        let result
        try {
          result = await runAction(actions[i], scope)
        } catch (error) {
          check(scope)
          result = {
            success: false,
            action: actions[i].action,
            executionStatus: 'failed',
            error: error.message
          }
        }
        results.push(result)
        if (!result.success) break
        if (i < actions.length - 1)
          await abortableDelay(boundedDelay(actions[i].delay_after_ms, 50), scope.signal)
      }
      check(scope)
      const success = results.every((result) => result.success) && results.length === actions.length
      const result =
        actions.length === 1
          ? results[0]
          : {
              success,
              action: 'batch',
              count: results.length,
              requestedCount: actions.length,
              stoppedAt: success ? null : results.length,
              results,
              executionStatus: success ? 'executed' : results.at(-1)?.executionStatus
            }
      if (!desktopSession || desktopSession.runKey !== scope.runKey) return result
      if (actions.every((item) => ['list_windows', 'close', 'close_session'].includes(item.action)))
        return result
      if (success && waitMs) {
        updateHudAction({
          status: 'waiting',
          detail: 'Menunggu ' + waitMs / 1000 + ' detik',
          waitMs
        })
        await abortableDelay(waitMs, scope.signal)
      }
      check(scope)
      updateHudAction({ status: 'observing', detail: 'Mengamati hasil aksi' })
      const shot = await captureScreen({ quality: p.quality })
      check(scope)
      if (shot.status !== 'success')
        return {
          ...result,
          success: false,
          captureStatus: 'failed',
          error:
            shot.message || 'Screenshot hasil aksi gagal. Periksa keadaan sebelum mengulang aksi.'
        }
      return {
        ...result,
        captureStatus: 'captured',
        verificationStatus: 'unverified',
        wait_ms: success ? waitMs : 0,
        image: shot.image,
        dataUrl: shot.image,
        observation: shot.observation,
        cursor: shot.cursor,
        cursor_host: shot.cursor_host,
        viewport: '1280x720',
        host_resolution: shot.host_width + 'x' + shot.host_height,
        message: success
          ? 'Screenshot sesudah aksi dilampirkan. Periksa hasilnya sebelum menentukan tindakan berikutnya.'
          : 'Rangkaian dihentikan. Screenshot keadaan terakhir dilampirkan untuk diperiksa.'
      }
    })
  } catch (error) {
    return {
      success: false,
      executionStatus: scope.signal.aborted ? 'cancelled' : 'failed',
      cancelledBy: scope.cancelledBy,
      error: scope.reason || error.message,
      message:
        scope.cancelledBy === 'user'
          ? 'Pengguna membatalkan Computer Use. Hentikan kendali desktop dan sampaikan pembatalan kepada pengguna. Tunggu instruksi baru untuk melanjutkan.'
          : 'Periksa keadaan layar sebelum mengulang aksi yang hasilnya belum diketahui.'
    }
  } finally {
    p.signal?.removeEventListener('abort', abort)
    overlayEvents.off('interrupted', takeover)
    activeCalls.delete(scope.id)
    if (scope.signal.aborted) await closeComputerUseSession(scope.reason, scope)
    if (desktopSession?.runKey === scope.runKey)
      updateHudAction({ status: 'thinking', detail: 'Sesi Computer Use aktif' })
    if (release) release()
  }
}
