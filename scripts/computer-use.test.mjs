import test from 'node:test'
import assert from 'node:assert/strict'
import { PcCommandChannel } from '../src/server/tools/pc-command-channel.js'
import {
  requestComputerUsePermission,
  decideComputerUsePermission,
  consumeComputerUsePermission,
  isLocalComputerUseOrigin
} from '../src/server/tools/computer-use-permissions.js'
import { isComputerUseSessionOpen } from '../src/shared/computer-use.js'
import {
  boundedDelay,
  parseNativeResult,
  screenGeometryMatches,
  abortableDelay
} from '../src/server/tools/computer-use-contract.js'

test('daemon errors cannot be reported as successful actions', () => {
  assert.equal(parseNativeResult('{"status":"error","message":"blocked"}').success, false)
  assert.equal(parseNativeResult('{"status":"success"}').executionStatus, 'executed')
  assert.equal(parseNativeResult('truncated').executionStatus, 'unknown')
})

test('delay accepts five seconds and rejects invalid values', () => {
  assert.equal(boundedDelay(5000), 5000)
  assert.equal(boundedDelay(0), 0)
  for (const value of [-1, Infinity, 'invalid', 10001]) assert.throws(() => boundedDelay(value))
})

test('a foreign or late response cannot complete another command', async () => {
  const sent = []
  const channel = new PcCommandChannel((cmd) => sent.push(cmd), null, 1000)
  const first = channel.enqueue({ cmd: 'click' })
  const second = channel.enqueue({ cmd: 'type' })
  assert.equal(sent.length, 1)
  assert.equal(channel.receive('wrong-request', '{"status":"success"}'), false)
  channel.receive(sent[0].requestId, '{"status":"success"}')
  assert.equal(JSON.parse(await first).status, 'success')
  assert.equal(sent.length, 2)
  assert.equal(channel.receive(sent[0].requestId, '{"status":"success"}'), false)
  channel.receive(sent[1].requestId, '{"status":"error","message":"rejected"}')
  assert.equal(JSON.parse(await second).status, 'error')
  channel.close()
})

test('timeout cancels queued mutations and never retries', async () => {
  const sent = []
  let stopped = false
  const channel = new PcCommandChannel(
    (cmd) => sent.push(cmd),
    () => {
      stopped = true
    },
    15
  )
  const results = await Promise.all([
    channel.enqueue({ cmd: 'click' }),
    channel.enqueue({ cmd: 'type' })
  ])
  assert.equal(JSON.parse(results[0]).executionStatus, 'unknown')
  assert.equal(JSON.parse(results[1]).executionStatus, 'cancelled')
  assert.equal(sent.length, 1)
  assert.equal(stopped, true)
})

test('cancelling an active command cancels the channel', async () => {
  const controller = new AbortController()
  const channel = new PcCommandChannel(
    () => {},
    () => {},
    1000
  )
  const result = channel.enqueue({ cmd: 'drag' }, controller.signal)
  controller.abort()
  assert.equal(JSON.parse(await result).executionStatus, 'unknown')
  assert.equal(channel.closed, true)
})

test('cancelling a queued command preserves the active owner', async () => {
  const controller = new AbortController(),
    sent = []
  const channel = new PcCommandChannel((cmd) => sent.push(cmd), null, 1000)
  const first = channel.enqueue({ cmd: 'click' })
  const queued = channel.enqueue({ cmd: 'type' }, controller.signal)
  controller.abort()
  assert.equal(JSON.parse(await queued).executionStatus, 'cancelled')
  channel.receive(sent[0].requestId, '{"status":"success"}')
  assert.equal(JSON.parse(await first).status, 'success')
  assert.equal(sent.length, 1)
  channel.close()
})

test('delay responds immediately to cancellation', async () => {
  const controller = new AbortController()
  const pending = abortableDelay(5000, controller.signal)
  controller.abort()
  await assert.rejects(pending, /dihentikan/)
})

test('window identity and screenshot geometry must both match', () => {
  const before = {
    screen_x: -1920,
    screen_y: 0,
    host_width: 1920,
    host_height: 1080,
    window_id: '100',
    process_id: 20,
    process_started_at: 'start',
    window_rect: [0, 0, 800, 600]
  }
  assert.equal(screenGeometryMatches(before, { ...before }), true)
  for (const field of ['window_id', 'process_id', 'process_started_at', 'screen_x', 'host_width'])
    assert.equal(screenGeometryMatches(before, { ...before, [field]: 'changed' }), false)
  assert.equal(screenGeometryMatches(before, { ...before, window_rect: [1, 0, 800, 600] }), false)
})

test('session permission is single-use and bound to the requesting run', () => {
  const owner = { sessionId: 'chat-1', runId: 'turn-1' }
  const request = requestComputerUsePermission(owner)
  const token = decideComputerUsePermission(request, owner, true)
  assert.ok(consumeComputerUsePermission(token, owner))
  assert.equal(consumeComputerUsePermission(token, owner), false)
  assert.throws(() => decideComputerUsePermission(request, owner, true))
  const wrongOwner = decideComputerUsePermission(requestComputerUsePermission(owner), owner, true)
  assert.equal(consumeComputerUsePermission(wrongOwner, { ...owner, runId: 'turn-2' }), false)
  assert.equal(decideComputerUsePermission(requestComputerUsePermission(owner), owner, false), null)
})

test('only the local Mark UI can submit a browser approval decision', () => {
  assert.equal(isLocalComputerUseOrigin('http://localhost:3001', 3001), true)
  assert.equal(isLocalComputerUseOrigin('http://127.0.0.1:3001', 3001), true)
  assert.equal(isLocalComputerUseOrigin('http://localhost:5173', 3001, true), true)
  for (const origin of [
    undefined,
    'null',
    'https://example.com',
    'http://localhost:4000',
    'http://localhost:5173',
    'http://localhost.evil.test:3001'
  ])
    assert.equal(isLocalComputerUseOrigin(origin, 3001), false)
})

test('opening a session is distinct from opening an application', () => {
  assert.equal(isComputerUseSessionOpen('computer_use', { action: 'open_session' }), true)
  assert.equal(isComputerUseSessionOpen('computer-use', '{"action":"open_session"}'), true)
  assert.equal(isComputerUseSessionOpen('computer_use', { action: 'open_app' }), false)
})
