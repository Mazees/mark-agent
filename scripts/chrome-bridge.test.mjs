import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import { WebSocket } from 'ws'
import express from 'express'
import {
  createChromeBridge,
  CHROME_BRIDGE_VERSION
} from '../src/main/addons/chrome-bridge/service.js'
import { createChromeBridgeRouter } from '../src/server/routes/chrome-bridge.routes.js'
import {
  loadAllPlugins,
  savePluginDefinition,
  togglePluginState,
  deletePlugin,
  executePluginAction
} from '../src/main/plugins/plugin-loader.js'
import { buildPluginToolGroups } from '../src/shared/plugin-schema.js'

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const delay = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return
    await delay()
  }
  throw new Error('Kondisi pengujian belum tercapai.')
}
async function listen(server, port = 0) {
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}
async function freePort() {
  const server = http.createServer()
  const port = await listen(server)
  await new Promise((resolve) => server.close(resolve))
  return port
}
async function fixture(t, options = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'mark-chrome-bridge-'))
  const port = await freePort()
  const service = createChromeBridge({ home, port, ...options })
  const root = path.join(home, '.config', 'mark-agent', 'addons', 'chrome-bridge')
  const plugin = path.join(home, 'Documents', 'Mark Plugins', 'chrome-use')
  t.after(async () => {
    await service.stop()
    assert.ok(home.startsWith(path.join(os.tmpdir(), 'mark-chrome-bridge-')))
    await fs.rm(home, { recursive: true, force: true })
  })
  return { service, home, port, root, plugin }
}
async function extension(f, token) {
  const config = await readJson(path.join(f.root, 'extension', 'connection.json'))
  const ws = new WebSocket(config.url, { origin: `chrome-extension://${'a'.repeat(32)}` })
  const messages = []
  ws.on('message', (raw) => {
    messages.push(JSON.parse(raw))
  })
  await once(ws, 'open')
  ws.send(
    JSON.stringify({ type: 'hello', token: token || config.token, version: CHROME_BRIDGE_VERSION })
  )
  return { ws, messages, config }
}
async function select(f, connection, paused = false, generation = 1) {
  connection.ws.send(
    JSON.stringify({
      type: 'state',
      tab: { id: 9, title: 'Tab pilihan', url: 'https://selected.test/' },
      paused,
      generation
    })
  )
  await until(
    async () => (await f.service.getStatus()).status === (paused ? 'paused' : 'connected')
  )
}
async function rpc(f, method, params = {}, token) {
  const config = await readJson(path.join(f.plugin, 'connection.json'))
  const response = await fetch(`http://127.0.0.1:${f.port}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || config.token}`
    },
    body: JSON.stringify({ method, params })
  })
  return { status: response.status, ...(await response.json()) }
}

test('install, reinstall, restart, token isolation, and managed plugin ownership', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.service.getStatus()).status, 'not-installed')
  const installed = await f.service.install()
  assert.equal(installed.status, 'waiting-extension')
  assert.equal(installed.extensionDirectory, path.join(f.root, 'extension'))
  const first = await readJson(path.join(f.plugin, 'connection.json'))
  const extConfig = await readJson(path.join(f.root, 'extension', 'connection.json'))
  assert.notEqual(first.token, extConfig.token)
  assert.ok(!JSON.stringify(installed).includes(first.token))
  assert.ok(!JSON.stringify(installed).includes(extConfig.token))
  const manifest = await readJson(path.join(f.plugin, 'plugin.json'))
  assert.equal(manifest.name, 'chrome-use')
  assert.equal(manifest.displayName, 'Chrome Bridge')
  assert.equal(buildPluginToolGroups([manifest])['chrome-use'].tools.length, 10)
  assert.equal((await rpc(f, 'chrome-read', {}, 'wrong-token')).status, 401)
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/health`)).status, 401)
  assert.equal((await rpc(f, 'unknown')).status, 400)

  const actualHome = os.homedir
  os.homedir = () => f.home
  try {
    assert.equal((await loadAllPlugins()).length, 1)
    await assert.rejects(savePluginDefinition({ name: 'chrome-use', isEdit: true }), {
      status: 409
    })
    await assert.rejects(togglePluginState('chrome-use', false), { status: 409 })
    await assert.rejects(deletePlugin('chrome-use'), { status: 409 })
    await assert.rejects(deletePlugin('../chrome-use'), /tidak valid/)
  } finally {
    os.homedir = actualHome
  }

  await f.service.install()
  const second = await readJson(path.join(f.plugin, 'connection.json'))
  assert.notEqual(first.token, second.token)
  assert.equal((await rpc(f, 'chrome-read', {}, first.token)).status, 401)
  await f.service.stop()
  const restarted = createChromeBridge({ home: f.home, port: f.port })
  t.after(() => restarted.stop())
  assert.equal((await restarted.start()).status, 'waiting-extension')
  assert.equal((await restarted.uninstall()).status, 'not-installed')
  assert.equal(await fs.stat(f.plugin).catch(() => null), null)
  assert.equal(await fs.stat(path.join(f.root, 'extension')).catch(() => null), null)
  const revoked = await readJson(path.join(f.root, 'state.json'))
  assert.equal(revoked.extensionToken, undefined)
  assert.equal(revoked.pluginToken, undefined)
})

test('legacy migration requires confirmation and backs up the entire folder', async (t) => {
  const f = await fixture(t)
  await fs.mkdir(path.join(f.plugin, 'nested'), { recursive: true })
  await fs.writeFile(
    path.join(f.plugin, 'plugin.json'),
    JSON.stringify({ name: 'chrome-use', version: 'old' })
  )
  await fs.writeFile(path.join(f.plugin, 'nested', 'custom.bin'), Buffer.from([0, 1, 255]))
  await assert.rejects(f.service.install(), { code: 'LEGACY_PLUGIN_EXISTS' })
  assert.equal((await f.service.getStatus()).legacyPlugin, true)
  await f.service.install({ replaceExisting: true })
  const backups = await fs.readdir(path.join(f.root, 'backups'))
  assert.equal(backups.length, 1)
  assert.deepEqual(
    await fs.readFile(path.join(f.root, 'backups', backups[0], 'nested', 'custom.bin')),
    Buffer.from([0, 1, 255])
  )
  await f.service.uninstall()
  assert.equal((await fs.readdir(path.join(f.root, 'backups'))).length, 1)
})

test('port collision rolls back legacy files without terminating the port owner', async (t) => {
  const f = await fixture(t)
  const owner = http.createServer((_req, res) => res.end('existing service'))
  await listen(owner, f.port)
  t.after(() => new Promise((resolve) => owner.close(resolve)))
  await fs.mkdir(f.plugin, { recursive: true })
  await fs.writeFile(path.join(f.plugin, 'plugin.json'), '{"name":"chrome-use","version":"legacy"}')
  await fs.writeFile(path.join(f.plugin, 'keep.txt'), 'original')
  await assert.rejects(f.service.install({ replaceExisting: true }), { code: 'EADDRINUSE' })
  assert.equal(await fs.readFile(path.join(f.plugin, 'keep.txt'), 'utf8'), 'original')
  assert.equal((await readJson(path.join(f.plugin, 'plugin.json'))).version, 'legacy')
  assert.equal((await f.service.getStatus()).installed, false)
  assert.equal((await f.service.getStatus()).status, 'error')
  assert.equal(await (await fetch(`http://127.0.0.1:${f.port}`)).text(), 'existing service')
  await new Promise((resolve) => owner.close(resolve))
  assert.equal((await f.service.install({ replaceExisting: true })).status, 'waiting-extension')
})

test('authenticated extension, all ten engine tools, artifacts, pause and disconnect', async (t) => {
  const f = await fixture(t)
  await f.service.install()
  const rejected = await extension(f, 'incorrect')
  const [code] = await once(rejected.ws, 'close')
  assert.equal(code, 1008)
  const connection = await extension(f)
  t.after(() => connection.ws.terminate())
  await until(() => connection.messages.some((message) => message.type === 'ready'))
  assert.equal((await f.service.getStatus()).status, 'select-tab')
  await select(f, connection)
  const received = []
  connection.ws.on('message', (raw) => {
    const message = JSON.parse(raw)
    if (!message.method) return
    received.push(message)
    assert.equal(message.tabId, 9)
    connection.ws.send(
      JSON.stringify({
        id: message.id,
        result:
          message.method === 'chrome-screenshot'
            ? {
                success: true,
                dataUrl:
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ZkAAAAASUVORK5CYII='
              }
            : {
                success: true,
                title: 'Tab pilihan',
                url: 'https://selected.test/',
                elements: [{ id: 1, tag: 'input', text: 'Nama' }],
                value: 42
              }
      })
    )
  })
  const engine = (await import(pathToFileURL(path.join(f.plugin, 'index.js')))).default
  const queries = {
    'chrome-navigate': 'example.test',
    'chrome-read': 'baca',
    'chrome-click': '1',
    'chrome-type': '1 Halo dunia',
    'chrome-extract': '{"selector":"h1","urlPattern":"selected.test"}',
    'chrome-script': '{"script":"6*7","urlPattern":"selected.test"}',
    'chrome-scroll': 'up',
    'chrome-screenshot': '../../gambar.png',
    'chrome-ask-user': 'Login dahulu',
    'chrome-close': 'selesai'
  }
  for (const [name, query] of Object.entries(queries)) {
    const result = await engine[name]({ query })
    if (name === 'chrome-screenshot') {
      assert.match(result, /^!\[Tangkapan layar Chrome\]\(\/api\/chat\/temp-file\//)
      const artifacts = await fs.readdir(path.join(f.home, '.config', 'mark-agent', 'temp-uploads'))
      assert.equal(artifacts.length, 1)
      assert.deepEqual(
        (
          await fs.readFile(
            path.join(f.home, '.config', 'mark-agent', 'temp-uploads', artifacts[0])
          )
        ).subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      )
    }
  }
  assert.equal(received.length, 10)
  assert.deepEqual(received.find((message) => message.method === 'chrome-type').params, {
    element_id: 1,
    text: 'Halo dunia'
  })
  assert.equal(
    received.find((message) => message.method === 'chrome-script').params.urlPattern,
    'selected.test'
  )
  await assert.rejects(engine['chrome-click']({ query: '-2' }), /ID elemen/)
  await assert.rejects(engine['chrome-navigate']({ query: 'javascript:alert(1)' }), /HTTP/)
  const actualHome = os.homedir
  os.homedir = () => f.home
  try {
    await loadAllPlugins()
    assert.equal((await executePluginAction('chrome-read', 'baca')).success, true)
  } finally {
    os.homedir = actualHome
  }
  await select(f, connection, true, 2)
  assert.equal((await rpc(f, 'chrome-click', { element_id: 1 })).status, 503)
  connection.ws.terminate()
  await until(async () => (await f.service.getStatus()).status === 'waiting-extension')
})

test('timeout, explicit abort, and uninstall cancel work without automatic mutation retries', async (t) => {
  const f = await fixture(t, { requestTimeout: 90, helpTimeout: 1500 })
  await f.service.install()
  const connection = await extension(f)
  t.after(() => connection.ws.terminate())
  await until(() => connection.messages.some((message) => message.type === 'ready'))
  await select(f, connection)
  const result = await rpc(f, 'chrome-click', { element_id: 1 })
  assert.equal(result.status, 503)
  assert.match(result.error, /timeout/)
  assert.equal(connection.messages.filter((message) => message.method === 'chrome-click').length, 1)
  await until(() => connection.messages.some((message) => message.type === 'cancel'))
  const request = rpc(f, 'chrome-ask-user', { prompt: 'Bantu' })
  await until(() => connection.messages.some((message) => message.method === 'chrome-ask-user'))
  f.service.cancelRequests()
  assert.match((await request).error, /dihentikan/)
  const another = rpc(f, 'chrome-ask-user', { prompt: 'Bantu lagi' })
  await until(
    () => connection.messages.filter((message) => message.method === 'chrome-ask-user').length === 2
  )
  await f.service.uninstall()
  assert.equal((await another).status, 503)
  assert.equal((await f.service.getStatus()).status, 'not-installed')
})

test('addon routes use POST for changes and refresh loaded plugins', async (t) => {
  const f = await fixture(t)
  const app = express()
  app.use(express.json())
  let reloads = 0
  app.use(
    '/api',
    createChromeBridgeRouter(f.service, async () => {
      reloads++
    })
  )
  const server = http.createServer(app),
    port = await listen(server)
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      })
  )
  const call = (operation, method = 'GET', body) =>
    fetch(`http://127.0.0.1:${port}/api/addons/chrome-bridge/${operation}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body)
    })
  assert.equal((await (await call('status')).json()).data.status, 'not-installed')
  assert.equal((await call('install')).status, 404)
  assert.equal((await call('install', 'POST', { replaceExisting: 'yes' })).status, 400)
  assert.equal((await (await call('install', 'POST')).json()).success, true)
  assert.equal((await (await call('reconnect', 'POST')).json()).data.bridgeRunning, true)
  assert.equal((await (await call('uninstall', 'POST')).json()).data.installed, false)
  assert.equal(reloads, 2)
})
