import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import Database from 'better-sqlite3'
import { activeAbortControllers } from './ai/ai-utils.js'

const ORIGIN = 'https://gemini.google.com'
const authError = (message) => Object.assign(new Error(message), { code: 'GEMINI_AUTH_REQUIRED' })

function cancelGeminiRequests() {
  for (const controller of activeAbortControllers)
    if (controller.provider === 'gemini-web')
      controller.abort(
        authError('Koneksi akun Gemini diputuskan. Hubungkan ulang sebelum melanjutkan.')
      )
}

function browserExecutable() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const program = process.env.ProgramFiles || 'C:/Program Files'
  const x86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'
  const candidates = [
    path.join(program, 'Google/Chrome/Application/chrome.exe'),
    path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(x86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(program, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(local, 'Microsoft/Edge/Application/msedge.exe')
  ]
  const executable = candidates.find(existsSync)
  if (!executable) throw new Error('Chrome atau Microsoft Edge tidak ditemukan untuk login Gemini.')
  return executable
}

export async function launchGeminiLogin(profile, { signal } = {}) {
  signal?.throwIfAborted()
  await fs.mkdir(profile, { recursive: true })
  const child = spawn(
    browserExecutable(),
    [
      '--user-data-dir=' + profile,
      '--new-window',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-mode',
      ORIGIN + '/app'
    ],
    { stdio: 'ignore', windowsHide: false }
  )
  let exited = false
  const closed = new Promise((resolve) =>
    child.once('close', () => {
      exited = true
      resolve()
    })
  )
  const close = () =>
    new Promise((resolve) => {
      if (!child.pid || exited) return resolve()
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 3000 },
        () => resolve()
      )
    })
  const abort = () => {
    close().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  closed.finally(() => signal?.removeEventListener('abort', abort))
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  if (signal?.aborted) {
    await close()
    signal.throwIfAborted()
  }
  return {
    get exited() {
      return exited
    },
    closed,
    close
  }
}

function loginAccount(profile, previous) {
  const file = path.join(profile, 'Default', 'History')
  if (!existsSync(file)) return previous
  let history
  try {
    history = new Database(file, { readonly: true, fileMustExist: true, timeout: 1500 })
    const urls = history
      .prepare(
        "SELECT url FROM urls WHERE url LIKE 'https://gemini.google.com/%' ORDER BY last_visit_time DESC LIMIT 20"
      )
      .all()
    for (const { url } of urls) {
      const parsed = new URL(url),
        match = parsed.pathname.match(/^\/(?:u\/(\d{1,3})\/)?app(?:\/|$)/)
      if (parsed.origin === ORIGIN && match) return match[1] || '0'
    }
    return previous
  } catch {
    throw new Error('Pilihan akun pada profil login Gemini belum dapat dibaca. Hubungkan ulang.')
  } finally {
    history?.close()
  }
}

// Only a dedicated Mark profile is opened. Personal browser profiles are never attached.
export async function launchGeminiBrowser(profile, visible, { signal } = {}) {
  signal?.throwIfAborted()
  await fs.mkdir(profile, { recursive: true })
  const portFile = path.join(profile, 'DevToolsActivePort')
  await fs.rm(portFile, { force: true })
  const child = spawn(
    browserExecutable(),
    [
      '--user-data-dir=' + profile,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      ...(visible ? ['--new-window'] : ['--headless=new']),
      ORIGIN + '/app'
    ],
    { stdio: 'ignore', windowsHide: !visible }
  )
  let failed = false
  child.once('error', () => {
    failed = true
  })
  const terminate = () =>
    new Promise((resolve) => {
      if (!child.pid || child.exitCode !== null) return resolve()
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 3000 },
        () => resolve()
      )
    })
  const abort = () => {
    terminate().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      signal?.throwIfAborted()
      if (failed || child.exitCode !== null)
        throw new Error('Browser login Gemini berhenti sebelum tersambung.')
      let endpoint
      try {
        const [port, id] = (await fs.readFile(portFile, 'utf8')).trim().split(/\r?\n/)
        if (/^\d+$/.test(port) && /^\/devtools\/browser\/[\w-]+$/.test(id))
          endpoint = `ws://127.0.0.1:${port}${id}`
      } catch (error) {
        if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error
      }
      if (endpoint) {
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
          protocolTimeout: 10000
        })
        return {
          browser,
          close: async () => {
            signal?.removeEventListener('abort', abort)
            try {
              await browser.close()
            } finally {
              await terminate()
            }
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Browser login Gemini belum tersambung. Coba hubungkan kembali.')
  } catch (error) {
    signal?.removeEventListener('abort', abort)
    await terminate()
    throw error
  }
}

export function createGeminiAuth({
  directory = path.join(os.homedir(), '.config', 'mark-agent', 'gemini-web'),
  launch = launchGeminiBrowser,
  login = launchGeminiLogin
} = {}) {
  const profile = path.join(directory, 'profile'),
    metadata = path.join(directory, 'connection.json')
  let state = {
    status: 'disconnected',
    connected: false,
    lastConnectedAt: null,
    authUser: '0',
    error: null
  }
  let loaded = false,
    connection = null,
    timer = null,
    queue = Promise.resolve(),
    lastRefresh = 0
  let launching = null,
    loginWindow = null,
    generation = 0
  const serial = (work) => {
    const result = queue.then(work, work)
    queue = result.catch(() => {})
    return result
  }
  const status = () => ({ ...state })
  const load = async () => {
    if (loaded) return
    try {
      const saved = JSON.parse(await fs.readFile(metadata, 'utf8'))
      if (saved.authorized && existsSync(profile))
        state = {
          ...state,
          status: 'saved',
          connected: true,
          authUser: /^\d{1,3}$/.test(saved.authUser) ? saved.authUser : '0',
          lastConnectedAt: saved.lastConnectedAt
        }
      else if (saved.lastConnectedAt)
        state = {
          ...state,
          status: 'expired',
          lastConnectedAt: saved.lastConnectedAt,
          error: 'Hubungkan ulang akun Google.'
        }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Status sesi Gemini tidak dapat dibaca.')
    }
    loaded = true
  }
  const save = async (authorized) => {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      metadata + '.tmp',
      JSON.stringify({
        authorized,
        lastConnectedAt: state.lastConnectedAt,
        authUser: state.authUser
      })
    )
    await fs.rename(metadata + '.tmp', metadata)
  }
  const stopPolling = () => {
    clearInterval(timer)
    timer = null
  }
  const close = async () => {
    const login = loginWindow
    loginWindow = null
    if (login) await login.close()
    const current = connection
    connection = null
    if (current) await current.close()
  }
  const open = async (visible) => {
    if (connection?.browser.connected) return connection.browser
    const controller = new AbortController()
    launching = controller
    try {
      connection = await launch(profile, visible, { signal: controller.signal })
    } finally {
      if (launching === controller) launching = null
    }
    const current = connection
    current.browser.once('disconnected', () => {
      if (connection === current) {
        connection = null
        stopPolling()
        state = { ...state, status: state.connected ? 'saved' : 'disconnected', error: null }
      }
    })
    return current.browser
  }
  const inspect = async (browser, refresh = false) => {
    let page = (await browser.pages()).find((p) => {
      try {
        return new URL(p.url()).origin === ORIGIN
      } catch {
        return false
      }
    })
    if (refresh && (!page || Date.now() - lastRefresh > 300000)) {
      page ||= await browser.newPage()
      const prefix = state.authUser === '0' ? '' : '/u/' + state.authUser
      await page.goto(ORIGIN + prefix + '/app', { waitUntil: 'domcontentloaded', timeout: 30000 })
      lastRefresh = Date.now()
    }
    if (!page) return null
    const url = new URL(page.url())
    const match = url.pathname.match(/^\/(?:u\/(\d+)\/)?app(?:\/|$)/)
    if (url.origin !== ORIGIN || !match) return null
    const cookies = (await browser.defaultBrowserContext().cookies()).filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, '')
      return (
        (url.hostname === domain || url.hostname.endsWith('.' + domain)) &&
        (cookie.expires < 0 || cookie.expires > Date.now() / 1000)
      )
    })
    const names = new Set(cookies.map((cookie) => cookie.name))
    if (!names.has('__Secure-1PSID') || (!names.has('SAPISID') && !names.has('__Secure-3PAPISID')))
      return null
    return {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      authUser: match[1] || '0'
    }
  }
  const checkLogin = async () => {
    if (state.status !== 'waiting_login' || !loginWindow?.exited) return status()
    const currentGeneration = generation
    loginWindow = null
    stopPolling()
    state = { ...state, status: 'checking_session' }
    state.authUser = loginAccount(profile, state.authUser)
    const auth = await inspect(await open(false), true)
    if (currentGeneration !== generation) {
      await close()
      return status()
    }
    if (!auth) {
      state = {
        ...state,
        status: 'failed',
        connected: false,
        error:
          'Login Google belum selesai. Hubungkan ulang, buka halaman Gemini, lalu tutup jendela login.'
      }
      await close()
      return status()
    }
    state = {
      status: 'connected',
      connected: true,
      lastConnectedAt: Date.now(),
      authUser: auth.authUser,
      error: null
    }
    await save(true)
    stopPolling()
    await close()
    return status()
  }
  return {
    status: () =>
      serial(async () => {
        await load()
        return status()
      }),
    connect: () => {
      cancelGeminiRequests()
      return serial(async () => {
        await load()
        if (state.status === 'waiting_login' && loginWindow) return status()
        const currentGeneration = ++generation
        stopPolling()
        await close()
        state = { ...state, status: 'waiting_login', connected: false, error: null }
        await save(false)
        try {
          const controller = new AbortController()
          launching = controller
          try {
            loginWindow = await login(profile, { signal: controller.signal })
          } finally {
            if (launching === controller) launching = null
          }
          if (currentGeneration !== generation) {
            await close()
            return status()
          }
          timer = setInterval(
            () =>
              serial(checkLogin).catch(() => {
                stopPolling()
                state = {
                  ...state,
                  status: 'failed',
                  connected: false,
                  error: 'Sesi login belum dapat disimpan. Hubungkan ulang.'
                }
              }),
            2000
          )
          timer.unref?.()
          return status()
        } catch (error) {
          state = {
            ...state,
            status: 'failed',
            connected: false,
            error: 'Browser login Gemini belum dapat dibuka.'
          }
          throw error
        }
      })
    },
    check: () => serial(checkLogin),
    getAuth: () =>
      serial(async () => {
        await load()
        if (state.status === 'waiting_login' || state.status === 'checking_session')
          throw authError('Selesaikan login Google pada jendela Gemini terlebih dahulu.')
        if (!state.connected) {
          if (state.status === 'expired' || state.status === 'failed')
            throw authError('Hubungkan ulang akun Google di Pengaturan Gemini Web.')
          return { cookie: '', authUser: '0' }
        }
        const browser = await open(false)
        const auth = await inspect(browser, true)
        if (!auth) {
          state = {
            ...state,
            connected: false,
            status: 'expired',
            error: 'Sesi Google berakhir. Hubungkan ulang.'
          }
          await save(false)
          await close()
          throw authError(state.error)
        }
        state = { ...state, status: 'connected', error: null }
        return { ...auth, version: state.lastConnectedAt }
      }),
    expire: () =>
      serial(async () => {
        cancelGeminiRequests()
        await load()
        state = {
          ...state,
          connected: false,
          status: 'expired',
          error: 'Sesi Google ditolak. Hubungkan ulang.'
        }
        await save(false)
        await close()
      }),
    disconnect: () => {
      generation++
      launching?.abort()
      cancelGeminiRequests()
      return serial(async () => {
        stopPolling()
        await close()
        try {
          const info = await fs.lstat(profile)
          const root = await fs.realpath(directory),
            target = await fs.realpath(profile)
          if (info.isSymbolicLink() || !target.startsWith(root + path.sep))
            throw new Error('Profil Gemini berada di luar lokasi yang dikelola Mark.')
          await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        await fs.rm(metadata, { force: true })
        loaded = true
        state = {
          status: 'disconnected',
          connected: false,
          lastConnectedAt: null,
          authUser: '0',
          error: null
        }
        return status()
      })
    },
    stop: () => {
      generation++
      stopPolling()
      launching?.abort()
      const closing = close()
      return serial(() => closing)
    }
  }
}

export const geminiAuth = createGeminiAuth()
