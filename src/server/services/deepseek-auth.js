import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { launchGeminiLogin, launchGeminiBrowser } from './gemini-auth.js'
import { activeAbortControllers } from './ai/ai-utils.js'

const ORIGIN = 'https://chat.deepseek.com'
const required = () =>
  Object.assign(new Error('Hubungkan akun DeepSeek melalui Pengaturan terlebih dahulu.'), {
    code: 'DEEPSEEK_AUTH_REQUIRED'
  })

export function createDeepSeekAuth({
  directory = path.join(os.homedir(), '.config', 'mark-agent', 'deepseek-web'),
  login = (profile, options) => launchGeminiLogin(profile, { ...options, url: ORIGIN }),
  launch = (profile, options) => launchGeminiBrowser(profile, false, { ...options, url: ORIGIN }),
  invalidate = async () => (await import('./deepseek-web.js')).clearDeepSeekSession()
} = {}) {
  const profile = path.join(directory, 'profile'),
    metadata = path.join(directory, 'connection.json')
  let state = { status: 'disconnected', connected: false, lastConnectedAt: null, error: null }
  let loaded = false,
    token = '',
    browserHandle = null,
    loginHandle = null,
    timer,
    opening,
    generation = 0
  let queue = Promise.resolve()
  const serial = (work) => {
    const next = queue.then(work, work)
    queue = next.catch(() => {})
    return next
  }
  const status = () => ({ ...state })
  const load = async () => {
    if (loaded) return
    try {
      const saved = JSON.parse(await fs.readFile(metadata, 'utf8'))
      state = {
        ...state,
        lastConnectedAt: saved.lastConnectedAt || null,
        status: saved.authorized ? 'saved' : 'expired',
        connected: !!saved.authorized
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Status koneksi DeepSeek tidak dapat dibaca.')
    }
    loaded = true
  }
  const save = async (authorized) => {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      metadata + '.tmp',
      JSON.stringify({ authorized, lastConnectedAt: state.lastConnectedAt })
    )
    await fs.rename(metadata + '.tmp', metadata)
  }
  const cancel = async () => {
    token = ''
    for (const controller of activeAbortControllers)
      if (controller.provider === 'deepseek-web') controller.abort(required())
    await invalidate()
  }
  const close = async () => {
    clearInterval(timer)
    const handles = [loginHandle, browserHandle]
    loginHandle = browserHandle = null
    await Promise.allSettled(handles.filter(Boolean).map((h) => h.close()))
  }
  const inspect = async () => {
    if (!browserHandle?.browser.connected) {
      const controller = new AbortController()
      opening = controller
      try {
        browserHandle = await launch(profile, { signal: controller.signal })
      } finally {
        if (opening === controller) opening = null
      }
    }
    let page = (await browserHandle.browser.pages()).find((p) => {
      try {
        return new URL(p.url()).origin === ORIGIN
      } catch {
        return false
      }
    })
    if (!page) page = await browserHandle.browser.newPage()
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Read only the origin opened in Mark's dedicated profile, never a personal browser.
    return page.evaluate((origin) => {
      if (location.origin !== origin) return ''
      try {
        const value = JSON.parse(localStorage.getItem('userToken'))
        return typeof value?.value === 'string' ? value.value : ''
      } catch {
        return ''
      }
    }, ORIGIN)
  }
  const check = async () => {
    if (state.status !== 'waiting_login' || !loginHandle?.exited) return status()
    const version = generation
    loginHandle = null
    clearInterval(timer)
    state = { ...state, status: 'checking_session' }
    try {
      const value = await inspect()
      if (version !== generation) return status()
      if (!value || value.length > 16000 || /[\r\n]/.test(value)) throw required()
      token = value
      state = { status: 'connected', connected: true, lastConnectedAt: Date.now(), error: null }
      await save(true)
    } catch {
      token = ''
      state = {
        ...state,
        status: 'failed',
        connected: false,
        error:
          'Login DeepSeek belum dapat digunakan. Hubungkan ulang dan selesaikan login sebelum menutup jendela.'
      }
      await save(false)
    } finally {
      await close()
    }
    return status()
  }
  return {
    status: () =>
      serial(async () => {
        await load()
        return status()
      }),
    check: () => serial(check),
    connect: () =>
      serial(async () => {
        await load()
        if (state.status === 'waiting_login') return status()
        const version = ++generation
        await cancel()
        await close()
        state = { ...state, status: 'waiting_login', connected: false, error: null }
        await save(false)
        const controller = new AbortController()
        opening = controller
        try {
          loginHandle = await login(profile, { signal: controller.signal })
          if (version !== generation) {
            await close()
            return status()
          }
          timer = setInterval(
            () =>
              serial(check).catch(() => {
                state = {
                  ...state,
                  status: 'failed',
                  connected: false,
                  error: 'Pemeriksaan sesi DeepSeek gagal.'
                }
                clearInterval(timer)
              }),
            2000
          )
          timer.unref?.()
        } catch {
          state = {
            ...state,
            status: 'failed',
            connected: false,
            error: 'Browser login DeepSeek tidak dapat dibuka.'
          }
        } finally {
          if (opening === controller) opening = null
        }
        return status()
      }),
    getToken: () =>
      serial(async () => {
        await load()
        if (!state.connected) throw required()
        if (token) return token
        try {
          token = await inspect()
          if (!token || token.length > 16000 || /[\r\n]/.test(token)) throw required()
          state = { ...state, status: 'connected' }
          return token
        } catch {
          token = ''
          state = {
            ...state,
            status: 'expired',
            connected: false,
            error: 'Sesi DeepSeek berakhir. Hubungkan ulang.'
          }
          await save(false)
          throw required()
        } finally {
          await close()
        }
      }),
    expire: () =>
      serial(async () => {
        await load()
        await cancel()
        await close()
        state = {
          ...state,
          status: 'expired',
          connected: false,
          error: 'Sesi DeepSeek ditolak. Hubungkan ulang.'
        }
        await save(false)
      }),
    disconnect: () => {
      generation++
      opening?.abort()
      const cancellation = cancel()
      return serial(async () => {
        await cancellation
        await close()
        try {
          const info = await fs.lstat(profile),
            root = await fs.realpath(directory),
            target = await fs.realpath(profile)
          if (info.isSymbolicLink() || !target.startsWith(root + path.sep))
            throw new Error('Profil DeepSeek berada di luar direktori Mark.')
          await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        } catch (e) {
          if (e.code !== 'ENOENT') throw e
        }
        await fs.rm(metadata, { force: true })
        loaded = true
        state = { status: 'disconnected', connected: false, lastConnectedAt: null, error: null }
        return status()
      })
    },
    stop: () => {
      generation++
      opening?.abort()
      const cancellation = cancel()
      return serial(async () => {
        await cancellation
        await close()
      })
    }
  }
}

export const deepseekAuth = createDeepSeekAuth()
