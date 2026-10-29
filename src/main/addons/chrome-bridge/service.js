import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'

export const CHROME_BRIDGE_VERSION = '1.1.0'
const bundleDirectory = fileURLToPath(new URL('./bundle/', import.meta.url))
const methods = new Set([
  'chrome-navigate',
  'chrome-read',
  'chrome-click',
  'chrome-type',
  'chrome-extract',
  'chrome-script',
  'chrome-scroll',
  'chrome-screenshot',
  'chrome-ask-user',
  'chrome-close'
])
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const exists = async (file) => !!(await fs.stat(file).catch(() => null))
const matchesToken = (actual, expected) =>
  typeof actual === 'string' &&
  typeof expected === 'string' &&
  Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
  timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
const fault = (message, code, status = 400) => Object.assign(new Error(message), { code, status })

export function createChromeBridge({
  home = os.homedir(),
  port = 8765,
  bundle = bundleDirectory,
  requestTimeout = 30000,
  helpTimeout = 300000
} = {}) {
  const root = path.join(home, '.config', 'mark-agent', 'addons', 'chrome-bridge')
  const pluginDirectory = path.join(home, 'Documents', 'Mark Plugins', 'chrome-use')
  const extensionDirectory = path.join(root, 'extension')
  const stateFile = path.join(root, 'state.json')
  const events = new EventEmitter()
  let state = null,
    server = null,
    sockets = null,
    client = null
  let controlledTab = null,
    paused = false,
    generation = 0,
    extensionVersion = null
  let error = '',
    busy = false,
    initialization = null,
    queue = Promise.resolve(),
    starting = null
  const pending = new Map()
  let requestEpoch = 0

  async function initialize() {
    initialization ||= readJson(stateFile)
      .then((value) => {
        state = value
      })
      .catch(() => {
        state = null
      })
    await initialization
  }

  async function persist(value) {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(`${stateFile}.tmp`, JSON.stringify(value), { mode: 0o600 })
    await fs.rename(`${stateFile}.tmp`, stateFile)
  }

  async function removeOwned(target, base) {
    const relative = path.relative(path.resolve(base), path.resolve(target))
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Lokasi penghapusan addon tidak valid.')
    }
    await fs.rm(target, { recursive: true, force: true })
  }

  async function getStatus() {
    await initialize()
    const installed = state?.installed === true
    const legacy = await readJson(path.join(pluginDirectory, 'plugin.json')).catch(() => null)
    return {
      installed,
      status: error
        ? 'error'
        : !installed
          ? 'not-installed'
          : !server?.listening
            ? 'disconnected'
            : !client
              ? 'waiting-extension'
              : !controlledTab
                ? 'select-tab'
                : paused
                  ? 'paused'
                  : 'connected',
      bridgeRunning: !!server?.listening,
      extensionConnected: !!client,
      extensionVersion,
      controlledTab,
      paused,
      version: state?.version || null,
      availableVersion: CHROME_BRIDGE_VERSION,
      extensionDirectory,
      legacyPlugin: !!legacy && legacy.managedByAddon !== 'chrome-bridge',
      error: error || null
    }
  }
  const emit = () => {
    getStatus()
      .then((status) => events.emit('status', status))
      .catch(() => {})
  }
  const reply = (response, status, data) => {
    if (!response.destroyed && !response.writableEnded) {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      })
      response.end(JSON.stringify(data))
    }
  }
  const send = (value) => {
    if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify(value))
  }
  function finish(id, failure, result) {
    const task = pending.get(id)
    if (!task) return
    clearTimeout(task.timer)
    pending.delete(id)
    reply(task.response, failure ? 503 : 200, failure ? { error: failure } : { result })
    task.done()
  }
  function cancelAll(message) {
    requestEpoch++
    for (const id of pending.keys()) {
      send({ type: 'cancel', id })
      finish(id, message)
    }
  }

  async function start() {
    if (starting) return starting
    starting = startListener()
    try {
      return await starting
    } finally {
      starting = null
    }
  }

  async function startListener() {
    await initialize()
    if (!state?.installed || server?.listening) return getStatus()
    if (!state.pluginToken || !state.extensionToken) {
      error = 'Konfigurasi Chrome Bridge rusak. Pasang ulang addon.'
      emit()
      throw fault(error, 'INVALID_CONFIG', 503)
    }
    const listener = http.createServer((request, response) => {
      if (!matchesToken(request.headers.authorization, `Bearer ${state?.pluginToken}`)) {
        reply(response, 401, { error: 'Autentikasi Chrome Bridge gagal.' })
        return
      }
      if (request.method === 'GET' && request.url === '/health') {
        getStatus().then((status) => reply(response, 200, status))
        return
      }
      if (request.method !== 'POST' || request.url !== '/rpc') {
        reply(response, 404, { error: 'Endpoint tidak ditemukan.' })
        return
      }
      let body = '',
        length = 0
      request.on('data', (chunk) => {
        length += chunk.length
        if (length > 1024 * 1024) {
          reply(response, 413, { error: 'Request terlalu besar.' })
          request.destroy()
        } else body += chunk
      })
      request.on('error', () => {})
      request.on('end', () => {
        let payload
        try {
          payload = JSON.parse(body)
          if (
            !methods.has(payload.method) ||
            !payload.params ||
            typeof payload.params !== 'object' ||
            Array.isArray(payload.params)
          )
            throw new Error()
        } catch {
          reply(response, 400, { error: 'Request Chrome Bridge tidak valid.' })
          return
        }
        const enqueuedGeneration = generation
        const enqueuedEpoch = requestEpoch
        const run = async () => {
          if (response.destroyed || response.writableEnded) return
          if (
            !client ||
            !controlledTab ||
            paused ||
            enqueuedGeneration !== generation ||
            enqueuedEpoch !== requestEpoch
          ) {
            reply(response, 503, {
              error:
                'Chrome Bridge belum siap atau tab berubah. Pilih Hubungkan tab ini pada ekstensi.'
            })
            return
          }
          await new Promise((done) => {
            const id = randomUUID()
            const timer = setTimeout(
              () => {
                send({ type: 'cancel', id })
                finish(id, 'Chrome Bridge timeout. Periksa hasil sebelum mengulang aksi.')
              },
              payload.method === 'chrome-ask-user' ? helpTimeout : requestTimeout
            )
            pending.set(id, { response, timer, done })
            response.once('close', () => {
              if (pending.has(id)) {
                send({ type: 'cancel', id })
                finish(id, 'Request dibatalkan.')
              }
            })
            send({
              id,
              method: payload.method,
              params: payload.params,
              tabId: controlledTab.id,
              generation
            })
          })
        }
        queue = queue
          .then(run, run)
          .catch(() => reply(response, 500, { error: 'Aksi Chrome Bridge gagal.' }))
      })
    })
    const wss = new WebSocketServer({ server: listener, path: '/ws', maxPayload: 12 * 1024 * 1024 })
    wss.on('error', () => {})
    wss.on('connection', (socket, request) => {
      if (!/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin || '')) {
        socket.close(1008, 'Origin tidak diizinkan')
        return
      }
      let authenticated = false
      let lastSeen = Date.now()
      const watchdog = setInterval(() => {
        if (Date.now() - lastSeen > 45000) socket.terminate()
      }, 15000)
      watchdog.unref()
      const authTimer = setTimeout(() => socket.close(1008, 'Autentikasi timeout'), 5000)
      socket.on('message', (raw) => {
        lastSeen = Date.now()
        let message
        try {
          message = JSON.parse(raw.toString())
        } catch {
          socket.close(1008, 'Pesan tidak valid')
          return
        }
        if (!authenticated) {
          if (
            message.type !== 'hello' ||
            !matchesToken(message.token, state?.extensionToken) ||
            client ||
            message.version !== CHROME_BRIDGE_VERSION
          ) {
            socket.close(1008, 'Koneksi ditolak. Muat ulang ekstensi dari folder addon terbaru.')
            return
          }
          clearTimeout(authTimer)
          authenticated = true
          client = socket
          extensionVersion = message.version
          socket.send(JSON.stringify({ type: 'ready' }))
          emit()
          return
        }
        if (socket !== client) return
        if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
          return
        }
        if (message.type === 'state') {
          const next = message.tab
          const nextTab =
            next && Number.isInteger(next.id) && next.id > 0 && /^https?:\/\//i.test(next.url || '')
              ? {
                  id: next.id,
                  title: String(next.title || '').slice(0, 250),
                  url: String(next.url).slice(0, 2048)
                }
              : null
          if (
            controlledTab?.id !== nextTab?.id ||
            generation !== message.generation ||
            !!message.paused
          )
            cancelAll('Kendali tab berubah atau dijeda.')
          controlledTab = nextTab
          paused = !!message.paused
          generation = Number.isSafeInteger(message.generation)
            ? message.generation
            : generation + 1
          emit()
          return
        }
        if (message.id)
          finish(
            message.id,
            message.error ? String(message.error.message || message.error).slice(0, 1000) : null,
            message.result
          )
      })
      socket.on('error', () => {})
      socket.on('close', () => {
        clearInterval(watchdog)
        clearTimeout(authTimer)
        if (client !== socket) return
        cancelAll('Ekstensi Chrome terputus.')
        client = null
        controlledTab = null
        extensionVersion = null
        paused = false
        generation++
        emit()
      })
    })
    try {
      await new Promise((resolve, reject) => {
        listener.once('error', reject)
        listener.listen(port, '127.0.0.1', resolve)
      })
      server = listener
      sockets = wss
      error = ''
      listener.on('error', () => {
        error = 'Koneksi bridge mengalami kesalahan.'
        emit()
      })
      emit()
      return getStatus()
    } catch (cause) {
      wss.close()
      error =
        cause.code === 'EADDRINUSE'
          ? `Port ${port} sedang dipakai. Tutup bridge lama lalu coba lagi.`
          : 'Bridge gagal dijalankan.'
      emit()
      throw fault(error, cause.code || 'BRIDGE_START_FAILED', 503)
    }
  }

  async function stop() {
    if (starting) await starting.catch(() => {})
    cancelAll('Chrome Bridge dihentikan.')
    for (const socket of sockets?.clients || []) socket.terminate()
    client = null
    controlledTab = null
    extensionVersion = null
    paused = false
    generation++
    const previous = server
    server = null
    sockets?.close()
    sockets = null
    if (previous)
      await new Promise((resolve) => {
        previous.close(resolve)
        previous.closeAllConnections()
      })
    emit()
  }

  async function install({ replaceExisting = false } = {}) {
    if (busy) throw fault('Operasi addon masih berjalan.', 'BUSY', 409)
    busy = true
    await initialize()
    const previousState = state
    const stage = path.join(root, `stage-${randomUUID()}`)
    let movedPlugin = false,
      movedExtension = false,
      newPlugin = false,
      newExtension = false,
      stopped = false
    try {
      const previousManifest = await readJson(path.join(pluginDirectory, 'plugin.json')).catch(
        () => null
      )
      if (
        (await exists(pluginDirectory)) &&
        previousManifest?.managedByAddon !== 'chrome-bridge' &&
        !replaceExisting
      ) {
        throw fault(
          'Plugin chrome-use lama ditemukan. Konfirmasi penggantian agar dibuatkan backup.',
          'LEGACY_PLUGIN_EXISTS',
          409
        )
      }
      await fs.mkdir(stage, { recursive: true })
      await fs.cp(path.join(bundle, 'plugin'), path.join(stage, 'plugin'), { recursive: true })
      await fs.cp(path.join(bundle, 'extension'), path.join(stage, 'extension'), {
        recursive: true
      })
      const nextState = {
        installed: true,
        version: CHROME_BRIDGE_VERSION,
        pluginToken: randomBytes(32).toString('hex'),
        extensionToken: randomBytes(32).toString('hex')
      }
      await fs.writeFile(
        path.join(stage, 'plugin', 'connection.json'),
        JSON.stringify({
          port,
          token: nextState.pluginToken,
          artifactDir: path.join(home, '.config', 'mark-agent', 'temp-uploads')
        }),
        { mode: 0o600 }
      )
      await fs.writeFile(
        path.join(stage, 'extension', 'connection.json'),
        JSON.stringify({ url: `ws://127.0.0.1:${port}/ws`, token: nextState.extensionToken }),
        { mode: 0o600 }
      )
      if (await exists(pluginDirectory)) {
        const backup = path.join(root, 'backups', `${Date.now()}-${randomUUID()}`)
        await fs.mkdir(path.dirname(backup), { recursive: true })
        await fs.cp(pluginDirectory, backup, { recursive: true })
      }
      await stop()
      stopped = true
      await fs.mkdir(path.dirname(pluginDirectory), { recursive: true })
      if (await exists(pluginDirectory)) {
        await fs.rename(pluginDirectory, path.join(stage, 'previous-plugin'))
        movedPlugin = true
      }
      if (await exists(extensionDirectory)) {
        await fs.rename(extensionDirectory, path.join(stage, 'previous-extension'))
        movedExtension = true
      }
      await fs.rename(path.join(stage, 'plugin'), pluginDirectory)
      newPlugin = true
      await fs.rename(path.join(stage, 'extension'), extensionDirectory)
      newExtension = true
      state = nextState
      await persist(state)
      await start()
      emit()
      return await getStatus()
    } catch (cause) {
      if (newPlugin || newExtension) {
        await stop()
        if (newPlugin) await removeOwned(pluginDirectory, path.dirname(pluginDirectory))
        if (newExtension) await removeOwned(extensionDirectory, root)
      }
      if (movedPlugin) await fs.rename(path.join(stage, 'previous-plugin'), pluginDirectory)
      if (movedExtension)
        await fs.rename(path.join(stage, 'previous-extension'), extensionDirectory)
      state = previousState
      if (stopped) {
        if (state) await persist(state)
        else await fs.rm(stateFile, { force: true })
        if (state?.installed) await start().catch(() => {})
      }
      throw cause
    } finally {
      try {
        await removeOwned(stage, root)
      } finally {
        busy = false
      }
    }
  }

  async function uninstall() {
    if (busy) throw fault('Operasi addon masih berjalan.', 'BUSY', 409)
    busy = true
    try {
      await initialize()
      const manifest = await readJson(path.join(pluginDirectory, 'plugin.json')).catch(() => null)
      await stop()
      state = { installed: false, version: CHROME_BRIDGE_VERSION }
      await persist(state)
      if (manifest?.managedByAddon === 'chrome-bridge')
        await removeOwned(pluginDirectory, path.dirname(pluginDirectory))
      await removeOwned(extensionDirectory, root)
      error = ''
      emit()
      return getStatus()
    } finally {
      busy = false
    }
  }

  async function reconnect() {
    if (busy) throw fault('Operasi addon masih berjalan.', 'BUSY', 409)
    busy = true
    try {
      await stop()
      return await start()
    } finally {
      busy = false
    }
  }

  return {
    initialize,
    getStatus,
    start,
    stop,
    install,
    uninstall,
    reconnect,
    events,
    cancelRequests: () => cancelAll('Aksi dihentikan pengguna.')
  }
}

export const chromeBridge = createChromeBridge()
