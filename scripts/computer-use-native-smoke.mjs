import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { ensureOverlayBinary } from '../src/server/tools/overlay-build.js'

function connect(exe, args) {
  const child = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  const events = []
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      try {
        const message = JSON.parse(line)
        events.push(message)
        const pending = waiting.get(message.requestId || message.type)
        if (pending) {
          clearTimeout(pending.timer)
          waiting.delete(message.requestId || message.type)
          pending.resolve(message)
        }
      } catch {
        /* Ignore a malformed diagnostic line. */
      }
    }
  })
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const wait = (key) =>
    new Promise((resolve, reject) => {
      const existing = events.find((event) => (event.requestId || event.type) === key)
      if (existing) return resolve(existing)
      const timer = setTimeout(() => {
        waiting.delete(key)
        reject(new Error('Timeout: ' + key))
      }, 7000)
      waiting.set(key, { resolve, timer })
    })
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n')
  const request = (cmd, args = {}) => {
    const requestId = randomUUID()
    const result = wait(requestId)
    send({ cmd, requestId, ...args })
    return result
  }
  return { child, wait, request, send }
}

if (process.platform !== 'win32') throw new Error('Smoke test ini memerlukan Windows.')
const exe = await ensureOverlayBinary()
let guard
try {
  guard = connect(exe, ['--guard', String(process.pid)])
  await guard.wait('guard-ready')
  const heartbeat = setInterval(() => guard.send({ cmd: 'pulse' }), 250)
  try {
    const before = await guard.request('probe')
    const hidden = await guard.request('hide', { controlId: 'native-smoke' })
    assert.equal(hidden.type, 'hidden', hidden.message)
    const during = await guard.request('probe')
    assert.equal(during.active, true)
    assert.deepEqual(
      before.signatures,
      during.signatures,
      'Bentuk cursor pengguna tidak boleh diganti.'
    )
    await guard.request('restore')
    const after = await guard.request('probe')
    assert.deepEqual(
      after.signatures,
      before.signatures,
      'Seluruh bentuk cursor harus dipulihkan persis.'
    )
    await guard.request('hide', { controlId: 'watchdog-smoke' })
    clearInterval(heartbeat)
    await once(guard.child, 'exit')
    guard = connect(exe, ['--guard', String(process.pid)])
    await guard.wait('guard-ready')
    const restored = await guard.request('probe')
    assert.deepEqual(
      restored.signatures,
      before.signatures,
      'Watchdog harus memulihkan cursor ketika heartbeat berhenti.'
    )
    console.log(
      'PASS: hide cursor tanpa mengganti bentuk, restore identik, dan watchdog setelah heartbeat putus.'
    )
  } finally {
    clearInterval(heartbeat)
  }
} finally {
  guard?.send({ cmd: 'stop' })
  guard?.child.stdin.end()
}

const hud = await import('../src/server/tools/overlay-manager.js')
try {
  await hud.startHud()
  const probe = await hud.probeHud()
  assert.equal(probe.documentReady, true)
  assert.equal(probe.clickThrough, true)
  assert.ok(probe.styles & 0x20)
  assert.ok(probe.styles & 0x8000000)
  assert.ok(probe.styles & 0x80000)
  await hud.beginHudControl('overlay-smoke')
  assert.equal((await hud.probeHud()).cursorVisible, true)
  await hud.hideHudForCapture()
  assert.equal((await hud.probeHud()).visible, true, 'Overlay harus tetap terlihat selama capture.')
  hud.showHudAfterCapture()
  await hud.endHudControl('overlay-smoke')
  assert.equal((await hud.probeHud()).cursorVisible, false)
  console.log('PASS: HTML siap, layered, klik tembus, tanpa aktivasi, cursor aktif dan dilepas.')
} finally {
  hud.stopHud(true)
}
