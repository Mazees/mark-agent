import { wsHub } from '../server/ws-hub.js'
import { normalizeBrowserUrl } from './tools/browser-url.js'

const controls = new Map()
let factory
export const setBrowserFactory = (value) => {
  factory = value
}
export function browserControl(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('ID browser tidak valid.')
  if (!controls.has(id))
    controls.set(id, {
      id,
      mode: 'agent',
      revision: 0,
      subscribers: new Set(),
      owner: null,
      queue: Promise.resolve(),
      active: false,
      sequence: 0
    })
  return controls.get(id)
}
export function browserState(id, client = null) {
  const c = browserControl(id)
  return {
    sessionId: id,
    open: !!c.session?.browser?.connected,
    url: c.session?.page?.url() || 'about:blank',
    title: c.session?.title || 'Browser',
    mode: c.mode,
    revision: c.revision,
    panelRevision: c.panelRevision || 0,
    ownedByYou: !!client && c.owner === client,
    loading: !!c.loading,
    notice: c.notice || '',
    width: 1280,
    height: 720
  }
}
export function requestBrowserPanel(id) {
  const c = browserControl(id)
  c.panelRevision = (c.panelRevision || 0) + 1
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
export async function attachBrowserSession(session) {
  const c = browserControl(session.id)
  c.session = session
  session.page.on('framenavigated', (frame) => {
    if (frame === session.page.mainFrame()) publishBrowserState(session.id)
  })
  session.page.on('domcontentloaded', () => {
    session.page
      .title()
      .then((title) => {
        session.title = title
        publishBrowserState(session.id)
      })
      .catch(() => {})
  })
  session.page.on('popup', async (popup) => {
    c.notice = `Tab baru diblokir: ${popup.url()}`
    await popup.close().catch(() => {})
    publishBrowserState(session.id)
  })
  await session.page.evaluateOnNewDocument(() => {
    window.open = () => {
      console.info('MARK: popup blocked')
      return null
    }
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target.closest?.('a[target="_blank"]')
        if (a) {
          e.preventDefault()
          console.info('MARK: popup blocked')
        }
      },
      true
    )
  })
  session.page.on('console', (message) => {
    if (message.text() === 'MARK: popup blocked') {
      c.notice = 'Tab baru diblokir. Gunakan halaman browser yang sama.'
      publishBrowserState(session.id)
    }
  })
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
  return c.mode !== 'agent' || c.active || c.subscribers.size > 0 || c.jobs?.size > 0
}
export async function runBrowserAction(id, action) {
  const c = browserControl(id),
    revision = c.revision
  const task = c.queue
    .catch(() => {})
    .then(async () => {
      if (c.mode !== 'agent' || revision !== c.revision) {
        const error = new Error('Browser sedang dikendalikan pengguna; aksi ini tidak dijalankan.')
        error.code = 'BROWSER_MANUAL_CONTROL'
        throw error
      }
      c.active = true
      try {
        return await action()
      } finally {
        c.active = false
      }
    })
  c.queue = task.catch(() => {})
  return task
}
export async function publishBrowserCursor(id, x, y, phase) {
  const c = browserControl(id),
    event = {
      sessionId: id,
      x,
      y,
      phase,
      sequence: ++c.sequence,
      width: 1280,
      height: 720,
      revision: c.revision
    }
  for (const client of c.subscribers) wsHub.send(client, 'browser-panel:cursor', event)
  if (phase === 'move' && c.subscribers.size)
    await new Promise((resolve) => setTimeout(resolve, 180))
}
function deliverFrame(c, data) {
  if (!c.subscribers.size || Date.now() - (c.lastFrame || 0) < 125) return
  c.lastFrame = Date.now()
  const frame = { sessionId: c.id, data, width: 1280, height: 720, sequence: ++c.sequence }
  for (const client of c.subscribers)
    if (client.bufferedAmount < 512000) wsHub.send(client, 'browser-panel:frame', frame)
}
async function stopFrames(c) {
  c.streamGeneration = (c.streamGeneration || 0) + 1
  clearInterval(c.fallback)
  c.fallback = null
  const cdp = c.cdp
  c.cdp = null
  if (cdp) {
    await cdp.send('Page.stopScreencast').catch(() => {})
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
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 65,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 8
    })
    const first = await c.session.page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' })
    if (c.cdp === cdp) deliverFrame(c, first)
  } catch {
    if (c.cdp === cdp) c.cdp = null
    await cdp?.detach().catch(() => {})
    if (c.subscribers.size && generation === (c.streamGeneration || 0)) {
      const capture = async () => {
        if (c.capturing || !c.session || !c.subscribers.size) return
        c.capturing = true
        try {
          deliverFrame(
            c,
            await c.session.page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' })
          )
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
    image: `data:image/jpeg;base64,${await c.session.page.screenshot({ type: 'jpeg', quality: 80, encoding: 'base64' })}`,
    text: c.session.readDom
      ? await c.session.readDom()
      : await c.session.page.evaluate(() => document.body?.innerText?.slice(0, 6000) || '')
  }
}
export async function browserPanelCommand(payload, client) {
  const { sessionId, action } = payload || {},
    c = browserControl(sessionId)
  if (action === 'job-start' || action === 'job-stop') {
    c.jobs ||= new Set()
    if (action === 'job-start') c.jobs.add(client)
    else c.jobs.delete(client)
    return browserState(sessionId, client)
  }
  if (action === 'subscribe') {
    c.subscribers.add(client)
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
  if (action === 'observe') {
    if (c.mode !== 'agent') throw new Error('Browser masih dalam kontrol manual.')
    return { ...browserState(sessionId, client), observation: await snapshot(c) }
  }
  if (action === 'takeover' || action === 'wait') {
    if (c.owner && c.owner !== client) throw new Error('Browser sedang dikendalikan client lain.')
    if (c.mode === 'taking-over') throw new Error('Peralihan kontrol masih berlangsung.')
    c.owner = client
    c.mode = 'taking-over'
    c.revision++
    publishBrowserState(sessionId)
    try {
      await c.queue
      if (!c.session && action === 'takeover') await factory(sessionId)
      c.mode = 'manual'
    } catch (error) {
      c.owner = null
      c.mode = 'agent'
      throw error
    } finally {
      publishBrowserState(sessionId)
    }
    return browserState(sessionId, client)
  }
  if (action === 'resume') {
    if (c.owner && c.owner !== client) throw new Error('Kontrol browser dimiliki client lain.')
    if (c.mode !== 'manual') throw new Error('Browser belum siap dikembalikan ke Mark.')
    c.mode = 'taking-over'
    publishBrowserState(sessionId)
    await c.queue
    await releaseInput(c)
    let observation
    try { observation = await snapshot(c) }
    catch (error) { c.mode = 'manual'; publishBrowserState(sessionId); throw error }
    c.owner = null
    c.mode = 'agent'
    c.revision++
    c.notice = ''
    publishBrowserState(sessionId)
    return { ...browserState(sessionId, client), observation }
  }
  if (c.owner !== client || c.mode !== 'manual')
    throw new Error('Ambil alih browser sebelum berinteraksi.')
  const revision = c.revision
  const task = c.queue
    .catch(() => {})
    .then(async () => {
      if (c.owner !== client || c.mode !== 'manual' || c.revision !== revision)
        throw new Error('Input dibatalkan karena kontrol browser berubah.')
      const page = c.session?.page
      if (!page || page.isClosed()) throw new Error('Browser sudah ditutup.')
      if (['navigate', 'back', 'forward', 'reload'].includes(action)) {
        c.loading = true
        publishBrowserState(sessionId)
        try {
          if (action === 'navigate')
            await page.goto(normalizeBrowserUrl(payload.url), {
              waitUntil: 'domcontentloaded',
              timeout: 45000
            })
          else if (action === 'reload')
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
        if (['move', 'down', 'up', 'wheel'].includes(kind)) {
          if (
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            p.x < 0 ||
            p.y < 0 ||
            p.x > 1280 ||
            p.y > 720
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
  c.queue = task.catch(() => {})
  return task
}
export async function disconnectBrowserClient(client) {
  for (const c of controls.values()) {
    c.subscribers.delete(client)
    c.jobs?.delete(client)
    if (c.owner === client) {
      c.owner = null
      c.mode = 'manual'
      c.revision++
      await c.queue
      await releaseInput(c)
      publishBrowserState(c.id)
    }
    if (!c.subscribers.size) await stopFrames(c)
  }
}
