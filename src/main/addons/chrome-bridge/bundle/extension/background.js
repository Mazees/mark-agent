/* global chrome */
let socket = null,
  connected = false,
  retryTimer = null,
  heartbeat = null
let tabId = null,
  paused = false,
  generation = 0,
  reconnectDelay = 1000,
  lastError = ''
let connectAttempt = 0,
  fetchingConnection = false,
  closingTab = null
let lastPong = 0
const running = new Map()
const safeUrl = (url) => /^https?:\/\//i.test(url || '')

async function currentTab() {
  if (!tabId) return null
  return chrome.tabs.get(tabId).catch(() => null)
}

async function getStatus() {
  const tab = await currentTab()
  return {
    connected,
    paused,
    error: lastError,
    tab: tab ? { id: tab.id, title: tab.title || '', url: tab.url || '' } : null
  }
}

async function publish() {
  const state = await getStatus()
  if (connected && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: 'state', tab: state.tab, paused, generation }))
  await chrome.action.setBadgeText({
    text: !connected ? 'OFF' : !tabId ? '' : paused ? 'II' : 'ON'
  })
  await chrome.action.setBadgeBackgroundColor({ color: connected ? '#25884b' : '#6b706c' })
  chrome.runtime.sendMessage({ type: 'chrome-bridge:state', state }).catch(() => {})
}

async function saveSelection() {
  await chrome.storage.session.set({ selection: { tabId, paused, generation } })
  await publish()
}

function cancelRunning() {
  for (const controller of running.values()) controller.abort()
}

function scheduleReconnect() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 30000)
}

async function connect() {
  if (
    fetchingConnection ||
    (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState))
  )
    return
  const attempt = ++connectAttempt
  fetchingConnection = true
  try {
    const config = await fetch(chrome.runtime.getURL('connection.json'), {
      cache: 'no-store'
    }).then((response) => {
      if (!response.ok)
        throw new Error('Pasang ekstensi dari folder yang disediakan Add-ons > Chrome Bridge.')
      return response.json()
    })
    if (attempt !== connectAttempt) return
    if (!/^ws:\/\/127\.0\.0\.1:\d+\/ws$/.test(config.url) || !config.token)
      throw new Error('Konfigurasi koneksi belum tersedia. Pasang ulang melalui Mark.')
    const next = new WebSocket(config.url)
    socket = next
    next.onopen = () => {
      if (socket === next)
        next.send(
          JSON.stringify({
            type: 'hello',
            token: config.token,
            version: chrome.runtime.getManifest().version
          })
        )
    }
    next.onmessage = (event) => {
      if (socket !== next) return
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        next.close()
        return
      }
      if (message.type === 'ready') {
        connected = true
        lastError = ''
        reconnectDelay = 1000
        clearTimeout(retryTimer)
        clearInterval(heartbeat)
        lastPong = Date.now()
        heartbeat = setInterval(() => {
          if (Date.now() - lastPong > 45000) {
            next.close()
            return
          }
          if (next.readyState === WebSocket.OPEN) next.send(JSON.stringify({ type: 'ping' }))
        }, 15000)
        publish()
        return
      }
      if (message.type === 'cancel') {
        running.get(message.id)?.abort()
        return
      }
      if (message.type === 'pong') {
        lastPong = Date.now()
        return
      }
      if (message.id && message.method) execute(message, next)
    }
    next.onclose = (event) => {
      if (socket !== next) return
      socket = null
      connected = false
      clearInterval(heartbeat)
      cancelRunning()
      lastError =
        event.code === 1008
          ? 'Koneksi ditolak. Tutup ekstensi lama atau muat ulang folder addon terbaru.'
          : 'Mark belum terhubung. Periksa Chrome Bridge di Add-ons.'
      publish()
      scheduleReconnect()
    }
    next.onerror = () => {
      if (socket === next) next.close()
    }
  } catch (error) {
    if (attempt === connectAttempt) {
      lastError = error.message
      connected = false
      publish()
      scheduleReconnect()
    }
  } finally {
    if (attempt === connectAttempt) fetchingConnection = false
  }
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Aksi dibatalkan. Periksa hasil sebelum mengulang.'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function target(message) {
  if (
    !connected ||
    paused ||
    !tabId ||
    message.tabId !== tabId ||
    message.generation !== generation
  )
    throw new Error('Tab tidak terhubung atau kendali sedang dijeda.')
  const tab = await currentTab()
  if (message.tabId !== tabId || message.generation !== generation || paused || !connected)
    throw new Error('Kendali tab berubah. Aksi dibatalkan.')
  if (!tab) throw new Error('Tab pilihan sudah ditutup. Hubungkan tab baru melalui popup.')
  if (!safeUrl(tab.url))
    throw new Error(
      'Chrome Bridge hanya mendukung halaman HTTP/HTTPS, bukan halaman internal Chrome.'
    )
  if (message.params.urlPattern && !tab.url.includes(String(message.params.urlPattern)))
    throw new Error('URL tab pilihan tidak cocok dengan urlPattern. Target tidak dipindahkan.')
  return tab
}

async function content(tab, action, params, signal, id) {
  const pong = await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null)
  if (pong?.version !== '1.1.0')
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  if (signal.aborted || tabId !== tab.id || paused || !connected)
    throw new Error('Kendali tab berubah. Aksi dibatalkan.')
  const cleanup = () => {
    chrome.tabs.sendMessage(tab.id, { action: 'cancel', id }).catch(() => {})
  }
  signal.addEventListener('abort', cleanup, { once: true })
  try {
    const result = await abortable(
      chrome.tabs.sendMessage(tab.id, { ...params, action, id }),
      signal
    )
    if (!result || result.success !== true)
      throw new Error(result?.error || 'Halaman tidak mengonfirmasi hasil aksi.')
    return result
  } finally {
    signal.removeEventListener('abort', cleanup)
  }
}

async function withDebugger(tab, signal, run) {
  const debuggee = { tabId: tab.id }
  let owned = false
  try {
    await chrome.debugger.attach(debuggee, '1.3')
    owned = true
    if (signal.aborted) throw new Error('Aksi dibatalkan.')
    return await run((method, params) =>
      abortable(chrome.debugger.sendCommand(debuggee, method, params), signal)
    )
  } catch (error) {
    throw new Error(`Debugger Chrome gagal: ${error.message}`)
  } finally {
    if (owned) await chrome.debugger.detach(debuggee).catch(() => {})
  }
}

async function navigate(tab, url, signal) {
  if (!safeUrl(url)) throw new Error('URL tujuan harus HTTP/HTTPS.')
  await new Promise((resolve, reject) => {
    let finished = false
    const done = (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      signal.removeEventListener('abort', aborted)
      error ? reject(error) : resolve()
    }
    const listener = (id, change) => {
      if (id === tab.id && change.status === 'complete') done()
    }
    const aborted = () => done(new Error('Navigasi dibatalkan.'))
    const timer = setTimeout(
      () =>
        done(
          new Error('Navigasi belum selesai dalam 25 detik. Periksa halaman sebelum mengulang.')
        ),
      25000
    )
    chrome.tabs.onUpdated.addListener(listener)
    signal.addEventListener('abort', aborted, { once: true })
    chrome.tabs
      .update(tab.id, { url })
      .then(() => chrome.tabs.get(tab.id))
      .then((updated) => {
        if (updated.status === 'complete' && updated.url === url) done()
      })
      .catch(done)
    if (signal.aborted) aborted()
  })
}

async function execute(message, connection) {
  const controller = new AbortController()
  running.set(message.id, controller)
  const signal = controller.signal
  const respond = (result, error) => {
    if (socket === connection && connection.readyState === WebSocket.OPEN)
      connection.send(JSON.stringify({ id: message.id, result, error }))
  }
  try {
    const tab = await target(message)
    const params = message.params || {}
    let result
    switch (message.method) {
      case 'chrome-navigate':
        await navigate(tab, params.url, signal)
        await target(message)
        result = await content(tab, 'read', {}, signal, message.id)
        break
      case 'chrome-read':
        result = await content(tab, 'read', params, signal, message.id)
        break
      case 'chrome-click':
        result = await content(tab, 'click', params, signal, message.id)
        break
      case 'chrome-type':
        result = await content(tab, 'type', params, signal, message.id)
        break
      case 'chrome-scroll':
        result = await content(tab, 'scroll', params, signal, message.id)
        break
      case 'chrome-extract':
        result = await content(tab, 'extract', params, signal, message.id)
        break
      case 'chrome-ask-user':
        result = await content(tab, 'ask-user', params, signal, message.id)
        break
      case 'chrome-script':
        if (typeof params.script !== 'string' || !params.script.trim())
          throw new Error('Kode JavaScript wajib diisi.')
        result = await withDebugger(tab, signal, async (command) => {
          const value = await command('Runtime.evaluate', {
            expression: params.script,
            returnByValue: true,
            awaitPromise: true
          })
          if (value.exceptionDetails)
            throw new Error(
              value.exceptionDetails.exception?.description ||
                value.exceptionDetails.text ||
                'Script gagal.'
            )
          return { success: true, value: value.result?.value ?? null }
        })
        break
      case 'chrome-screenshot':
        result = await withDebugger(tab, signal, async (command) => {
          const screenshot = await command('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false
          })
          return { success: true, dataUrl: `data:image/png;base64,${screenshot.data}` }
        })
        break
      case 'chrome-close':
        closingTab = tab.id
        try {
          await chrome.tabs.remove(tab.id)
        } catch (error) {
          closingTab = null
          throw error
        }
        result = { success: true }
        break
      default:
        throw new Error('Aksi Chrome Bridge tidak dikenali.')
    }
    if (signal.aborted && message.method !== 'chrome-close')
      throw new Error('Aksi dibatalkan. Hasil sebelumnya belum pasti; jangan ulangi otomatis.')
    respond(result, null)
  } catch (error) {
    respond(null, error.message)
  } finally {
    running.delete(message.id)
    if (closingTab === message.tabId) {
      closingTab = null
      cancelRunning()
      generation++
      tabId = null
      paused = false
      await saveSelection()
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.type === 'chrome-bridge:state') return false
  const handle = async () => {
    switch (message.type) {
      case 'get-status':
        return getStatus()
      case 'select-tab': {
        const tab = await chrome.tabs.get(message.tabId)
        if (!safeUrl(tab.url)) throw new Error('Pilih halaman HTTP/HTTPS yang ingin dikendalikan.')
        if (!connected) throw new Error('Hubungkan Chrome Bridge di Mark terlebih dahulu.')
        const previous = tabId
        cancelRunning()
        generation++
        tabId = tab.id
        paused = false
        lastError = ''
        if (previous) chrome.tabs.sendMessage(previous, { action: 'cleanup' }).catch(() => {})
        await saveSelection()
        return getStatus()
      }
      case 'pause':
        if (!tabId) throw new Error('Belum ada tab terhubung.')
        cancelRunning()
        generation++
        paused = !paused
        await saveSelection()
        return getStatus()
      case 'disconnect': {
        const previous = tabId
        cancelRunning()
        generation++
        tabId = null
        paused = false
        if (previous) chrome.tabs.sendMessage(previous, { action: 'cleanup' }).catch(() => {})
        await saveSelection()
        return getStatus()
      }
      case 'reconnect': {
        connectAttempt++
        fetchingConnection = false
        const previous = socket
        socket = null
        connected = false
        clearInterval(heartbeat)
        clearTimeout(retryTimer)
        cancelRunning()
        previous?.close()
        await connect()
        return getStatus()
      }
      default:
        throw new Error('Perintah popup tidak dikenali.')
    }
  }
  handle().then(
    (state) => respond({ success: true, state }),
    (error) => respond({ success: false, error: error.message })
  )
  return true
})

chrome.tabs.onRemoved.addListener((removedId) => {
  if (removedId !== tabId || removedId === closingTab) return
  cancelRunning()
  generation++
  tabId = null
  paused = false
  saveSelection()
})
chrome.tabs.onUpdated.addListener((updatedId, change) => {
  if (updatedId === tabId && change.url && !safeUrl(change.url)) {
    cancelRunning()
    generation++
    tabId = null
    paused = false
    lastError = 'Halaman ini tidak didukung. Pilih tab HTTP/HTTPS melalui popup.'
    saveSelection()
    return
  }
  if (updatedId === tabId && (change.url || change.title || change.status === 'complete')) publish()
})
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'chrome-bridge-reconnect' && !connected) connect()
})
chrome.alarms.create('chrome-bridge-reconnect', { periodInMinutes: 1 })
chrome.storage.session.get('selection').then(async ({ selection }) => {
  tabId = selection?.tabId || null
  paused = !!selection?.paused
  generation = selection?.generation || 0
  if (tabId && !(await currentTab())) tabId = null
  await connect()
})
