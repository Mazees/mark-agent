import { wsHub } from '../server/ws-hub.js'
import { normalizeBrowserUrl } from './tools/browser-url.js'

const controls = new Map()
const FRAME_INTERVAL_MS = 1000 / 30
let factory
export const setBrowserFactory = (value) => {
  factory = value
}
export function browserControl(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id))
    throw new Error('ID browser tidak valid.')
  if (!controls.has(id))
    controls.set(id, {
      id,
      mode: 'agent',
      revision: 0,
      subscribers: new Set(),
      owner: null,
      queue: Promise.resolve(),
      active: false,
      sequence: 0,
      cursor: { x: 64, y: 64, sequence: 0 },
      width: 1280,
      height: 720
    })
  return controls.get(id)
}
export function browserState(id) {
  const c = browserControl(id)
  return {
    sessionId: id,
    open: !!c.session?.browser?.connected,
    url: c.session?.page?.url() || 'about:blank',
    title: c.session?.title || 'Google',
    mode: 'agent',
    active: !!c.active,
    revision: c.revision,
    panelRevision: c.panelRevision || 0,
    ownedByYou: true,
    loading: !!c.loading,
    notice: c.notice || '',
    cursor: c.cursor,
    width: c.width || 1280,
    height: c.height || 720
  }
}
export function requestBrowserPanel(id) {
  const c = browserControl(id)
  c.panelRevision = (c.panelRevision || 0) + 1
  wsHub.broadcast('browser-panel:open-request', { sessionId: id })
  publishBrowserState(id)
}
export const browserStates = () =>
  [...controls.keys()].filter((id) => controls.get(id).session).map((id) => browserState(id))
export function publishBrowserState(id) {
  const c = browserControl(id)
  wsHub.broadcast('browser-panel:activity', browserState(id))
  for (const client of c.subscribers)
    wsHub.send(client, 'browser-panel:state', browserState(id, client))
}
function routeNewTabsInPage() {
  const navigate = (value) => {
    try {
      const url = new URL(String(value), document.baseURI)
      if (!['http:', 'https:'].includes(url.protocol)) return false
      window.top.location.assign(url.href)
      return true
    } catch {
      return false
    }
  }
  window.open = (url) => {
    if (url != null && String(url).trim()) navigate(url)
    return null
  }
  const retarget = (element) => {
    const target = element.getAttribute('target') || document.querySelector('base[target]')?.target
    if (target && !['_self', '_parent', '_top'].includes(target.toLowerCase()))
      element.setAttribute('target', '_top')
  }
  document.addEventListener(
    'click',
    (event) => {
      const link = event.composedPath().find((node) => node?.matches?.('a[href], area[href]'))
      if (link) retarget(link)
    },
    true
  )
  document.addEventListener(
    'submit',
    (event) => {
      if (event.target?.matches?.('form')) {
        retarget(event.target)
        const target = event.submitter?.getAttribute('formtarget')
        if (target && !['_self', '_parent', '_top'].includes(target.toLowerCase()))
          event.submitter.setAttribute('formtarget', '_top')
      }
    },
    true
  )
}
export async function attachBrowserSession(session) {
  const c = browserControl(session.id)
  c.session = session
  if (c.width && c.height && session.page && !session.page.isClosed()) {
    await session.page.setViewport({ width: c.width, height: c.height }).catch(() => {})
  }
  session.page.on('framenavigated', (frame) => {
    if (frame === session.page.mainFrame()) publishBrowserState(session.id)
  })
  session.page.on('domcontentloaded', () => {
    void refreshFrames(c).catch(() => {})
    session.page
      .title()
      .then((title) => {
        session.title = title
        publishBrowserState(session.id)
      })
      .catch(() => {})
  })
  session.page.on('popup', async (popup) => {
    try {
      if (popup.url() === 'about:blank')
        await popup
          .waitForFunction('location.protocol === "http:" || location.protocol === "https:"', {
            timeout: 3000
          })
          .catch(() => {})
      const url = popup.url()
      await popup.close().catch(() => {})
      if (!/^https?:\/\//i.test(url)) return
      await queueBrowserTask(c, async () => {
        if (c.session !== session || session.page.isClosed()) return
        c.loading = true
        publishBrowserState(session.id)
        try {
          await session.page.goto(normalizeBrowserUrl(url), {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          })
          session.title = await session.page.title()
          c.notice = ''
        } finally {
          c.loading = false
          publishBrowserState(session.id)
        }
      })
    } catch (error) {
      c.notice = `Tautan belum dapat dibuka di halaman ini: ${error.message}`
      publishBrowserState(session.id)
    } finally {
      await popup.close().catch(() => {})
    }
  })
  await session.page.evaluateOnNewDocument(routeNewTabsInPage)
  await session.page.evaluate(routeNewTabsInPage).catch(() => {})
  publishBrowserState(session.id)
  if (c.subscribers.size) await startFrames(c)
}
export async function detachBrowserSession(id) {
  const c = browserControl(id)
  await stopFrames(c)
  c.session = null
  c.owner = null
  c.mode = 'agent'
  c.revision++
  publishBrowserState(id)
}
export function browserIsHeld(id) {
  const c = browserControl(id)
  return (
    c.mode !== 'agent' ||
    c.active ||
    c.pendingTasks > 0 ||
    c.launching ||
    c.subscribers.size > 0 ||
    c.jobs?.size > 0
  )
}
export async function runBrowserAction(id, action) {
  const c = browserControl(id)
  return queueBrowserTask(c, async () => {
    c.active = true
    publishBrowserState(id)
    try {
      return await action()
    } catch (error) {
      if (/timed out|timeout/i.test(error.message))
        throw new Error(
          'Perintah browser melewati batas waktu. Hasil aksi belum dapat dipastikan; periksa halaman sebelum mengulangi aksi.',
          { cause: error }
        )
      throw error
    } finally {
      c.active = false
      publishBrowserState(id)
    }
  })
}
function queueBrowserTask(c, action) {
  c.pendingTasks = (c.pendingTasks || 0) + 1
  const task = c.queue
    .catch(() => {})
    .then(action)
    .finally(() => {
      c.pendingTasks--
    })
  c.queue = task.catch(() => {})
  return task
}
async function ensureBrowserSession(c) {
  if (c.session) return c.session
  if (!c.launching) {
    c.launching = Promise.resolve()
      .then(() => factory(c.id))
      .then((session) => {
        c.notice = ''
        publishBrowserState(c.id)
        return session
      })
      .catch((error) => {
        c.notice = `Browser gagal dibuka: ${error.message}`
        publishBrowserState(c.id)
        throw error
      })
      .finally(() => {
        c.launching = null
      })
  }
  return c.launching
}
export async function publishBrowserCursor(id, x, y, phase) {
  const c = browserControl(id),
    event = {
      sessionId: id,
      x,
      y,
      phase,
      sequence: ++c.sequence,
      width: c.width || 1280,
      height: c.height || 720,
      revision: c.revision
    }
  c.cursor = { x, y, sequence: event.sequence }
  for (const client of c.subscribers) wsHub.send(client, 'browser-panel:cursor', event)
  if (phase === 'move' && c.subscribers.size)
    await new Promise((resolve) => setTimeout(resolve, 180))
}
function deliverFrame(c, data) {
  const now = Date.now()
  const next = c.nextFrameAt || now
  if (!c.subscribers.size || now < next) return
  c.nextFrameAt = (now - next > FRAME_INTERVAL_MS ? now : next) + FRAME_INTERVAL_MS
  c.lastFrame = now
  const frame = {
    sessionId: c.id,
    data,
    width: c.width || 1280,
    height: c.height || 720,
    sequence: ++c.sequence
  }
  for (const client of c.subscribers)
    if (client.bufferedAmount < 512000) wsHub.send(client, 'browser-panel:frame', frame)
}
export async function captureBrowserImage(id, quality = 80, fresh = false) {
  const c = browserControl(id)
  if (!c.session || c.session.page.isClosed()) throw new Error('Browser belum siap.')
  if (c.capturePromise) {
    if (!fresh) return c.capturePromise
    await c.capturePromise.catch(() => {})
    return captureBrowserImage(id, quality)
  }
  c.capturePromise = (async () => {
    const client = await c.session.page.createCDPSession()
    try {
      const { data } = await client.send(
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          quality,
          captureBeyondViewport: false,
          optimizeForSpeed: true
        },
        { timeout: 3000 }
      )
      return data
    } finally {
      await client.detach().catch(() => {})
    }
  })().finally(() => {
    c.capturePromise = null
  })
  return c.capturePromise
}
async function refreshFrames(c) {
  if (!c.session || !c.subscribers.size || c.refreshing) return
  c.refreshing = true
  try {
    await stopFrames(c)
    await startFrames(c)
  } finally {
    c.refreshing = false
  }
}
async function stopFrames(c) {
  c.streamGeneration = (c.streamGeneration || 0) + 1
  clearInterval(c.fallback)
  c.fallback = null
  clearInterval(c.watchdog)
  c.watchdog = null
  const cdp = c.cdp
  c.cdp = null
  if (cdp) {
    await cdp.send('Page.stopScreencast', {}, { timeout: 2000 }).catch(() => {})
    await cdp.detach().catch(() => {})
  }
}
async function startFrames(c) {
  if (c.cdp || c.fallback || c.starting || !c.session || !c.subscribers.size) return
  c.starting = true
  const generation = c.streamGeneration || 0
  let cdp
  try {
    cdp = await c.session.page.createCDPSession()
    if (!c.subscribers.size || generation !== (c.streamGeneration || 0)) {
      await cdp.detach()
      return
    }
    c.cdp = cdp
    cdp.on('Page.screencastFrame', (frame) => {
      cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
      if (c.cdp === cdp) deliverFrame(c, frame.data)
    })
    await cdp.send(
      'Page.startScreencast',
      {
        format: 'jpeg',
        quality: 65,
        maxWidth: Math.max(1920, c.width || 1280),
        maxHeight: Math.max(1080, c.height || 720),
        everyNthFrame: 1
      },
      { timeout: 3000 }
    )
    const first = await captureBrowserImage(c.id, 65)
    if (c.cdp !== cdp || generation !== (c.streamGeneration || 0)) return
    deliverFrame(c, first)
    c.watchdog = setInterval(async () => {
      if (c.cdp !== cdp || c.capturing || Date.now() - (c.lastFrame || 0) < 2000) return
      c.capturing = true
      try {
        const data = await captureBrowserImage(c.id, 65)
        if (c.cdp === cdp) deliverFrame(c, data)
      } catch {
        if (c.cdp === cdp) void refreshFrames(c).catch(() => {})
      } finally {
        c.capturing = false
      }
    }, 1000)
    c.watchdog.unref?.()
  } catch {
    if (c.cdp === cdp) c.cdp = null
    await cdp?.detach().catch(() => {})
    if (c.subscribers.size && generation === (c.streamGeneration || 0)) {
      const capture = async () => {
        if (c.capturing || !c.session || !c.subscribers.size) return
        c.capturing = true
        try {
          const data = await captureBrowserImage(c.id, 65)
          if (generation === (c.streamGeneration || 0)) deliverFrame(c, data)
        } catch {
          // Halaman dapat berpindah ketika frame sedang diambil.
        } finally {
          c.capturing = false
        }
      }
      c.fallback = setInterval(capture, 1000)
      c.fallback.unref?.()
      capture()
    }
  } finally {
    c.starting = false
    if (generation !== (c.streamGeneration || 0) && c.subscribers.size && c.session)
      void startFrames(c)
  }
}
async function releaseInput(c) {
  for (const key of c.keys || []) await c.session?.page.keyboard.up(key).catch(() => {})
  for (const button of c.buttons || []) await c.session?.page.mouse.up({ button }).catch(() => {})
  c.keys = new Set()
  c.buttons = new Set()
}
async function snapshot(c) {
  if (!c.session) return null
  return {
    url: c.session.page.url(),
    image: `data:image/jpeg;base64,${await captureBrowserImage(c.id, 80, true)}`,
    text: c.session.readDom
      ? await c.session.readDom()
      : await c.session.page.evaluate(() => document.body?.innerText?.slice(0, 6000) || '')
  }
}
export async function browserPanelCommand(payload, client) {
  const { sessionId, action } = payload || {},
    c = browserControl(sessionId)
  const receivedAt = Date.now()
  if (action === 'job-start' || action === 'job-stop') {
    c.jobs ||= new Set()
    if (action === 'job-start') c.jobs.add(client)
    else c.jobs.delete(client)
    return browserState(sessionId, client)
  }
  if (action === 'subscribe') {
    c.subscribers.add(client)
    if (!c.session && factory) await ensureBrowserSession(c)
    await startFrames(c)
    wsHub.send(client, 'browser-panel:state', browserState(sessionId, client))
    return browserState(sessionId, client)
  }
  if (action === 'unsubscribe') {
    c.subscribers.delete(client)
    if (!c.subscribers.size) await stopFrames(c)
    return browserState(sessionId, client)
  }
  if (action === 'state') return browserState(sessionId, client)
  if (action === 'resize') {
    const { width, height } = payload || {}
    const w = Math.round(Number(width))
    const h = Math.round(Number(height))
    if (!(w >= 300 && w <= 3840 && h >= 200 && h <= 2160))
      throw new Error('Ukuran browser tidak valid.')
    return queueBrowserTask(c, async () => {
      if (c.launching) await c.launching
      const changed = c.width !== w || c.height !== h
      if (!changed) return browserState(sessionId)
      await stopFrames(c)
      if (changed && c.session?.page && !c.session.page.isClosed()) {
        await c.session.page.setViewport({ width: w, height: h })
      }
      c.width = w
      c.height = h
      c.revision++
      publishBrowserState(sessionId)
      await startFrames(c)
      return browserState(sessionId)
    })
  }
  if (action === 'observe') {
    return queueBrowserTask(c, async () => ({
      ...browserState(sessionId),
      observation: await snapshot(c)
    }))
  }
  if (action === 'takeover' || action === 'wait') {
    if (!c.session && factory) await ensureBrowserSession(c)
    c.mode = 'agent'
    publishBrowserState(sessionId)
    return browserState(sessionId, client)
  }
  if (action === 'resume') {
    c.mode = 'agent'
    c.notice = ''
    publishBrowserState(sessionId)
    return queueBrowserTask(c, async () => ({
      ...browserState(sessionId),
      observation: await snapshot(c)
    }))
  }
  if (!c.session && factory) {
    await ensureBrowserSession(c)
  }
  return queueBrowserTask(c, async () => {
    const page = c.session?.page
    if (!page || page.isClosed()) throw new Error('Browser belum siap.')
    if (['navigate', 'back', 'forward', 'reload'].includes(action)) {
      c.loading = true
      publishBrowserState(sessionId)
      try {
        if (action === 'navigate') {
          const rawUrl = String(payload.url || '').trim()
          let targetUrl = rawUrl
          if (
            targetUrl &&
            !/^https?:\/\//i.test(targetUrl) &&
            !targetUrl.includes('.') &&
            !targetUrl.startsWith('localhost')
          ) {
            targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`
          }
          await page.goto(normalizeBrowserUrl(targetUrl), {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
            referer: targetUrl.includes('google.com') ? 'https://www.google.com/' : undefined
          })
        } else if (action === 'reload')
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
        else if (action === 'back')
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45000 })
        else await page.goForward({ waitUntil: 'domcontentloaded', timeout: 45000 })
        c.session.title = await page.title()
      } finally {
        c.loading = false
        publishBrowserState(sessionId)
      }
    } else if (action === 'input') {
      const p = payload.input || {},
        { kind } = p
      if (Date.now() - receivedAt > 3000 && !['up', 'keyUp'].includes(kind))
        return { ...browserState(sessionId), inputIgnored: true }
      if (['move', 'down', 'up', 'wheel'].includes(kind)) {
        const maxW = c.width || 1280
        const maxH = c.height || 720
        if (
          (p.viewportWidth != null && p.viewportWidth !== maxW) ||
          (p.viewportHeight != null && p.viewportHeight !== maxH)
        ) {
          if (kind === 'up') await releaseInput(c)
          return { ...browserState(sessionId), inputIgnored: true }
        }
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.y < 0 ||
          p.x > maxW ||
          p.y > maxH
        )
          throw new Error('Koordinat browser tidak valid.')
        await page.mouse.move(p.x, p.y)
        if (kind === 'down' || kind === 'up') {
          if (!['left', 'right', 'middle'].includes(p.button))
            throw new Error('Tombol mouse tidak valid.')
          await page.mouse[kind]({ button: p.button, clickCount: p.clickCount === 2 ? 2 : 1 })
          c.buttons ||= new Set()
          if (kind === 'down') c.buttons.add(p.button)
          else c.buttons.delete(p.button)
        }
        if (kind === 'wheel')
          await page.mouse.wheel({
            deltaX: Math.max(-2000, Math.min(2000, Number(p.deltaX) || 0)),
            deltaY: Math.max(-2000, Math.min(2000, Number(p.deltaY) || 0))
          })
      } else if (kind === 'text')
        await page.keyboard.sendCharacter(String(p.text || '').slice(0, 20000))
      else if (kind === 'keyDown' || kind === 'keyUp') {
        if (typeof p.key !== 'string' || p.key.length > 40) throw new Error('Tombol tidak valid.')
        await page.keyboard[kind === 'keyDown' ? 'down' : 'up'](p.key)
        c.keys ||= new Set()
        if (kind === 'keyDown') c.keys.add(p.key)
        else c.keys.delete(p.key)
      } else throw new Error('Jenis input browser tidak didukung.')
    } else throw new Error('Perintah browser tidak didukung.')
    return browserState(sessionId, client)
  })
}
export async function disconnectBrowserClient(client) {
  for (const c of controls.values()) {
    c.subscribers.delete(client)
    c.jobs?.delete(client)
    if (!c.subscribers.size) {
      await stopFrames(c)
      await c.queue
      await releaseInput(c)
    }
  }
}
