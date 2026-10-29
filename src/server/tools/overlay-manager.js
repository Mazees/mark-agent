import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wsHub } from '../ws-hub.js'
import { ensureOverlayBinary } from './overlay-build.js'

export const overlayEvents = new EventEmitter()
let child = null
let starting = null
let closing = null
let heartbeat = null
let inactivity = null
let controlId = null
let lastStatus = { status: 'ready', sessionName: 'Mark Utama', detail: 'Computer Use siap' }
const pending = new Map()

export function setServerPort() {
  /* Native IPC does not depend on the HTTP port. */
}
export const isHudActive = () => Boolean(child && !child.killed)

function send(message) {
  if (!child || child.killed || !child.stdin.writable) return false
  child.stdin.write(JSON.stringify(message) + '\n')
  return true
}

async function ensureHost() {
  if (closing) await closing
  if (starting) return starting
  if (child && !child.killed) return
  if (process.platform !== 'win32') throw new Error('Overlay memerlukan Windows.')
  starting = (async () => {
    const exe = await ensureOverlayBinary()
    const html = fileURLToPath(new URL('../../renderer/public/overlay-hud.html', import.meta.url))
    if (!fs.existsSync(html)) throw new Error('HTML overlay tidak ditemukan.')
    const profile = path.join(os.homedir(), '.config', 'mark-agent', 'overlay-profile')
    await new Promise((resolve, reject) => {
      const host = spawn(exe, [html, profile, String(process.pid)], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      child = host
      let buffer = ''
      let ready = false
      const timer = setTimeout(() => {
        host.stdin.end()
        reject(
          new Error('Overlay HTML belum siap setelah 15 detik. Pastikan WebView2 Runtime tersedia.')
        )
      }, 15000)
      heartbeat = setInterval(() => send({ cmd: 'pulse' }), 500)
      heartbeat.unref()
      host.stdout.setEncoding('utf8')
      host.stdout.on('data', (chunk) => {
        buffer += chunk
        let newline
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          let message
          try {
            message = JSON.parse(line)
          } catch {
            continue
          }
          if (message.type === 'ready') {
            ready = true
            clearTimeout(timer)
            send({ cmd: 'status', ...lastStatus })
            resolve()
          } else if (message.type === 'ack') {
            const request = pending.get(message.requestId)
            if (request) {
              pending.delete(message.requestId)
              clearTimeout(request.timer)
              if (message.success) request.resolve(message)
              else request.reject(new Error(message.message || 'Permintaan overlay ditolak.'))
            }
          } else if (message.type === 'interrupted' || message.type === 'cancelled') {
            const previous = controlId
            controlId = null
            const event = {
              ...message,
              controlId: message.controlId || previous,
              sessionId: lastStatus.sessionId,
              runId: lastStatus.runId
            }
            overlayEvents.emit(message.type, event)
            wsHub.broadcast('computer:interrupted', {
              sessionId: lastStatus.sessionId,
              sessionName: lastStatus.sessionName,
              runId: lastStatus.runId,
              cancelledBy: message.type === 'cancelled' ? 'user' : null,
              reason: message.reason
            })
            if (message.type === 'cancelled') stopHud(true)
          } else if (message.type === 'error') {
            reject(new Error(message.message || 'Overlay gagal dimulai.'))
          }
        }
      })
      host.stderr.on('data', () => {})
      const closed = (error) => {
        clearTimeout(timer)
        if (child !== host) return
        child = null
        clearInterval(heartbeat)
        const previous = controlId
        controlId = null
        for (const item of pending.values()) {
          clearTimeout(item.timer)
          item.reject(new Error('Host overlay terputus.'))
        }
        pending.clear()
        if (previous)
          overlayEvents.emit('interrupted', {
            controlId: previous,
            reason: 'Host overlay terputus.'
          })
        if (!ready) reject(error || new Error('Host overlay ditutup sebelum siap.'))
      }
      host.on('error', closed)
      host.on('close', () => closed())
    })
  })().finally(() => {
    starting = null
  })
  return starting
}

export function startHud(options = {}) {
  clearTimeout(inactivity)
  lastStatus = { ...lastStatus, ...options }
  return ensureHost()
}

export function updateHudAction(data = {}) {
  clearTimeout(inactivity)
  lastStatus = { ...lastStatus, ...data }
  if (child) send({ cmd: 'status', ...lastStatus })
  wsHub.broadcast('computer:hud_update', lastStatus)
  delete lastStatus.cursorAction
}

export function setHudStatus(status, detail) {
  updateHudAction({ status, detail })
}

async function request(cmd, args = {}, timeoutMs = 3000) {
  await ensureHost()
  return new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Host overlay tidak merespons ' + cmd + '.'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    if (!send({ cmd, requestId, ...args })) {
      clearTimeout(timer)
      pending.delete(requestId)
      reject(new Error('Host overlay tidak tersedia.'))
    }
  })
}

export async function beginHudControl(id) {
  await ensureHost()
  controlId = id
  try {
    await request('control', { controlId: id }, 7000)
  } catch (error) {
    await endHudControl(id)
    throw error
  }
}

export async function endHudControl(id) {
  if (id && controlId && controlId !== id) return
  if (child) {
    try {
      await request('release', { controlId: id || controlId || '' })
    } catch {
      // EOF makes the host close, and its independent guard restores the cursor.
      child?.stdin.end()
    }
  }
  controlId = null
  updateHudAction({ status: 'thinking', detail: 'Memeriksa hasil' })
}

export async function hideHudForCapture() {
  if (child || starting) await request('capture-hide')
}

export function showHudAfterCapture() {
  send({ cmd: 'capture-show' })
}
export const probeHud = () => request('probe')

export function stopHud(force = false) {
  clearTimeout(inactivity)
  if (!force) {
    inactivity = setTimeout(() => stopHud(true), 1500)
    inactivity.unref()
    return
  }
  if (child) {
    const host = child
    closing = new Promise((resolve) => {
      const timer = setTimeout(() => host.kill(), 2000)
      host.once('close', () => {
        clearTimeout(timer)
        closing = null
        resolve()
      })
    })
    send({ cmd: 'stop' })
    child.stdin.end()
  }
  clearInterval(heartbeat)
}

process.once('exit', () => {
  try {
    child?.stdin.end()
  } catch {
    /* Guard also checks parent liveness. */
  }
})
