import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  attachBrowserSession,
  detachBrowserSession,
  browserControl,
  browserIsHeld,
  runBrowserAction,
  publishBrowserState,
  publishBrowserCursor,
  setBrowserFactory,
  requestBrowserPanel
} from './browser-panel-runtime.js'
import { normalizeBrowserUrl } from './tools/browser-url.js'

export const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'

// Map of sessionId -> SessionState { browser, page, url, title, idleTimeout }
const sessions = new Map()
const launches = new Map()

function getEdgePath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  const possiblePaths = [
    // 1. Microsoft Edge (System-wide & Local)
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),

    // 2. Google Chrome (System-wide & User Local AppData)
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),

    // 3. Brave Browser
    path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),

    // 4. Vivaldi Browser
    path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'),
    path.join(programFiles, 'Vivaldi', 'Application', 'vivaldi.exe')
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  // Fallback nama executable di PATH
  return 'msedge.exe'
}

function resetSessionIdleTimeout(session) {
  if (!session) return
  if (session.idleTimeout) clearTimeout(session.idleTimeout)
  session.idleTimeout = setTimeout(
    () => {
      if (browserIsHeld(session.id)) resetSessionIdleTimeout(session)
      else closeBrowser(session.id)
    },
    5 * 60 * 1000
  )
  session.idleTimeout.unref?.()
}

async function getOrCreateSession(sessionId = 'default') {
  browserControl(sessionId)
  if (launches.has(sessionId)) return launches.get(sessionId)
  const pending = createBrowserSession(sessionId).finally(() => launches.delete(sessionId))
  launches.set(sessionId, pending)
  return pending
}

async function createBrowserSession(sessionId) {
  browserControl(sessionId)
  let session = sessions.get(sessionId)
  if (session && session.page && !session.page.isClosed()) {
    resetSessionIdleTimeout(session)
    return session
  }

  const edgePath = getEdgePath()
  const userDataDir = path.join(
    os.homedir(),
    '.config',
    'mark-agent',
    'browser-sessions',
    sessionId
  )
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    protocolTimeout: 15000,
    userDataDir,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    args: [
      '--force-high-performance-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=id-ID,id,en-US,en'
    ]
  })

  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    page.setDefaultTimeout(8000)
    page.setDefaultNavigationTimeout(45000)

    // Real Edge Windows 11 User-Agent & HTTP Headers
    try {
      const rawUA = await page.evaluate(() => navigator.userAgent)
      const cleanUA = rawUA.replace(/HeadlessChrome/g, 'Chrome')
      await page.setUserAgent(cleanUA)
    } catch (_) {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
      )
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    })

    session = {
      id: sessionId,
      browser,
      page,
      url: 'https://www.google.com',
      title: 'Google',
      idleTimeout: null,
      isForeground: true
    }
    session.readDom = () => evaluateObservation(session, DOM_PARSER_SCRIPT)

    // Buka beranda Google secara default agar peramban langsung siap pakai
    try {
      await page.goto('https://www.google.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      })
      session.url = page.url()
      session.title = (await page.title()) || 'Google'
    } catch (err) {
      console.warn('[BrowserAgent] Inisialisasi Google beranda:', err.message)
    }

    sessions.set(sessionId, session)
    await attachBrowserSession(session)
    browser.once('disconnected', () => {
      if (sessions.get(sessionId) === session) {
        sessions.delete(sessionId)
        clearTimeout(session.idleTimeout)
        detachBrowserSession(sessionId).catch(() => {})
      }
    })
    resetSessionIdleTimeout(session)
    return session
  } catch (error) {
    sessions.delete(sessionId)
    await browser.close().catch(() => {})
    await detachBrowserSession(sessionId)
    throw error
  }
}

const DOM_PARSER_SCRIPT = `
(() => {
  // 3. Parser Elemen Interaktif
  document.querySelectorAll('[data-mark-id]').forEach(el => el.removeAttribute('data-mark-id'));

  const INTERACTIVE_SELECTORS = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const allElements = document.querySelectorAll(INTERACTIVE_SELECTORS);
  const results = [];
  let markId = 1;
  const MAX_ELEMENTS = 80;
  const MAX_TEXT_LENGTH = 80;

  for (const el of allElements) {
    if (el.closest('#mark-user-blocker')) continue;
    if (results.length >= MAX_ELEMENTS) break;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    if (el.offsetWidth < 5 || el.offsetHeight < 5) continue;

    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.right < 0 || rect.left > window.innerWidth) continue;

    const tag = el.tagName.toLowerCase();
    let type = 'Element';
    if (tag === 'a') type = 'Link';
    else if (tag === 'button' || el.getAttribute('role') === 'button') type = 'Button';
    else if (tag === 'input') type = 'Input (' + (el.type || 'text') + ')';
    else if (tag === 'select') type = 'Dropdown';
    else if (tag === 'textarea') type = 'TextArea';

    let label = el.innerText?.trim() || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '';
    label = label.replace(/\\n/g, ' ').substring(0, MAX_TEXT_LENGTH);

    el.setAttribute('data-mark-id', markId);
    results.push('[' + markId + '] ' + type + ': "' + label + '"');
    markId++;
  }

  const getVisibleText = () => {
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let lastParent = null;
    let visited = 0;
    while ((node = walker.nextNode())) {
      if (++visited > 12000) break;
      if (text.length > 8000) break;
      const parent = node.parentElement;
      if (!parent || parent.closest('#mark-user-blocker')) continue;

      const tag = parent.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;

      const rect = parent.getBoundingClientRect();
      if (rect.bottom > -200 && rect.top < window.innerHeight + 1500) {
        const val = node.nodeValue.trim();
        if (val.length > 0) {
          if (lastParent !== parent && ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tag)) {
            text += '\\n';
          }
          text += val + ' ';
          lastParent = parent;
        }
      }
    }
    return text.trim();
  };

  const bodyText = getVisibleText() || '';
  const pageTitle = document.title || '';
  const currentURL = window.location.href || '';

  let output = '[URL Aktif]: ' + currentURL + '\\n';
  output += '[Title]: ' + pageTitle + '\\n\\n';
  output += '== ELEMEN INTERAKTIF (' + results.length + ' ditemukan) ==\\n';
  output += results.join('\\n') + '\\n\\n';
  output += '== TEKS UTAMA HALAMAN (Ringkasan) ==\\n';
  output += bodyText.substring(0, 4000);

  return output;
})()
`

async function broadcastPreview(session) {
  publishBrowserState(session.id)
}

async function evaluateObservation(session, expression, awaitPromise = false) {
  const client = await session.page.createCDPSession()
  try {
    const response = await client.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise,
        returnByValue: true,
        timeout: 2500
      },
      { timeout: 3000 }
    )
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result.value
  } finally {
    await client.detach().catch(() => {})
  }
}

async function detectChallenge(page) {
  if (!page || page.isClosed()) return { isBlocked: false }
  try {
    const url = page.url() || ''
    const title = (await page.title()) || ''

    // 1. Deteksi Pola URL & Title Khas Block/CAPTCHA (Google "Unusual Traffic", Cloudflare, Cloudflare Turnstile, reCAPTCHA, hCaptcha)
    const isGoogleBlocked =
      url.includes('google.com/sorry') ||
      url.includes('/sorry/index') ||
      title.includes('Sorry...') ||
      title.includes('unusual traffic')
    const isCloudflareBlocked =
      title.includes('Just a moment...') ||
      title.includes('Attention Required!') ||
      title.includes('Security Challenge') ||
      title.includes('Cloudflare')
    const isGenericCaptcha =
      title.toLowerCase().includes('robot check') ||
      title.toLowerCase().includes('captcha') ||
      title.toLowerCase().includes('human verification')

    if (isGoogleBlocked || isCloudflareBlocked || isGenericCaptcha) {
      return {
        isBlocked: true,
        type: isGoogleBlocked
          ? 'Google Unusual Traffic'
          : isCloudflareBlocked
            ? 'Cloudflare Challenge'
            : 'CAPTCHA Protection',
        url,
        title
      }
    }

    // 2. Deteksi Selector DOM CAPTCHA / Iframe Challenge
    const hasChallengeElement = await page.evaluate(() => {
      const selectors = [
        '#captcha-form',
        '#challenge-running',
        '#challenge-form',
        '#cf-challenge-running',
        '.cf-turnstile',
        '.g-recaptcha',
        '.h-captcha',
        'iframe[src*="recaptcha"]',
        'iframe[src*="turnstile"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="challenge-platform"]'
      ]
      return selectors.some((s) => Boolean(document.querySelector(s)))
    })

    if (hasChallengeElement) {
      return {
        isBlocked: true,
        type: 'DOM Challenge Element Detected',
        url,
        title
      }
    }
  } catch (_) {}

  return { isBlocked: false }
}

async function recoverIfBlockedByGoogle(page) {
  try {
    const url = page.url()
    if (url.includes('google.com/sorry')) {
      console.warn('[BrowserAgent] Terdeteksi halaman blokir Google. Cookie login dipertahankan.')
      await page.goto('https://www.google.com/', {
        waitUntil: 'networkidle2',
        timeout: 20000
      })
      return true
    }
  } catch (err) {
    console.warn('[BrowserAgent] Pemulihan sesi terblokir:', err.message)
  }
  return false
}

async function navigateToInternal(url, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  let targetUrl = url.trim()
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  // Normalisasi URL Google Search dengan query params browser alami
  if (targetUrl.includes('google.com/search') && !targetUrl.includes('sourceid=')) {
    const separator = targetUrl.includes('?') ? '&' : '?'
    targetUrl = `${targetUrl}${separator}sourceid=chrome&ie=UTF-8`
  }

  await session.page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
    referer: targetUrl.includes('google.com') ? 'https://www.google.com/' : undefined
  })
  if (session.page.url().includes('google.com/sorry')) {
    await recoverIfBlockedByGoogle(session.page)
  }

  session.url = session.page.url()
  session.title = await session.page.title()

  // Auto-dismiss Google Consent / Cookie dialog jika muncul
  try {
    if (session.url.includes('google.com') || session.url.includes('consent.google')) {
      const consentHandled = await session.page.evaluate(() => {
        const consentSelectors = [
          'button[aria-label*="Setuju"]',
          'button[aria-label*="Accept"]',
          '#L2AGLb',
          'button:has-text("Saya setuju")',
          'button:has-text("Accept all")',
          'form[action*="consent"] button'
        ]
        for (const selector of consentSelectors) {
          const btn = document.querySelector(selector)
          if (btn && btn.offsetParent !== null) {
            btn.click()
            return true
          }
        }
        return false
      })
      if (consentHandled) {
        await session.page
          .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
          .catch(() => {})
        session.url = session.page.url()
        session.title = await session.page.title()
      }
    }
  } catch (_) {}

  await broadcastPreview(session)

  // Otomatis cek apakah halaman memicu CAPTCHA / bot challenge
  const challenge = await detectChallenge(session.page)
  if (challenge.isBlocked) {
    return `[PERINGATAN ANTI-BOT / CAPTCHA TERDETEKSI]: Halaman memicu perlindungan "${challenge.type}" (Judul: "${session.title}", URL: "${session.url}").\nTanyakan bantuan pengguna di chat, gunakan metadata await_user="true", dan akhiri giliran tanpa menutup browser.`
  }

  return `Berhasil membuka ${session.url} (Judul: "${session.title}").`
}

async function readDOMInternal(sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  let result
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await evaluateObservation(session, DOM_PARSER_SCRIPT)
      break
    } catch (error) {
      if (attempt === 2 || !/context|navigation|frame.*detach/i.test(error.message)) throw error
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  session.url = session.page.url()
  session.title = await session.page.title()

  await broadcastPreview(session)

  const challenge = await detectChallenge(session.page)
  if (challenge.isBlocked) {
    return `[PERINGATAN ANTI-BOT / CAPTCHA TERDETEKSI]: Terdeteksi "${challenge.type}" pada halaman ini!\nTanyakan bantuan pengguna di chat, gunakan metadata await_user="true", dan akhiri giliran tanpa menutup browser.\n\n${result}`
  }

  return result
}

async function withPageObservation(sessionId, action) {
  const result = await action()
  const session = sessions.get(sessionId)
  if (session && !session.page.isClosed()) {
    await evaluateObservation(
      session,
      `(${() =>
        new Promise((resolve) => {
          let quiet
          const done = () => {
            clearTimeout(quiet)
            clearTimeout(limit)
            observer.disconnect()
            resolve()
          }
          const observer = new MutationObserver(() => {
            clearTimeout(quiet)
            quiet = setTimeout(done, 120)
          })
          const limit = setTimeout(done, 600)
          observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true
          })
          quiet = setTimeout(done, 120)
        })})()`,
      true
    ).catch(() => {})
  }
  let observation
  try {
    observation = await readDOMInternal(sessionId)
  } catch (error) {
    observation = `[DOM terbaru belum tersedia: ${error.message}. Periksa halaman sebelum aksi berikutnya.]`
  }
  const text =
    typeof result === 'object' && result !== null
      ? result.message
      : String(result ?? 'Aksi selesai.')
  const summary =
    text.length > 4000
      ? `${text.slice(0, 4000)}\n[Hasil aksi dipotong; gunakan browser-extract untuk bagian tertentu.]`
      : text
  const message = `${summary}\n\n[Observasi halaman setelah aksi]\n${observation}`
  return typeof result === 'object' && result !== null ? { ...result, message } : message
}

async function executeActionInternal(data, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const { action, id, value, direction } = data

  if (action === 'click') {
    const selector = `[data-mark-id="${id}"]`
    await session.page.waitForSelector(selector, { timeout: 8000 })
    await session.page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }))
    const box = await session.page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await publishBrowserCursor(sessionId, box.x, box.y, 'move')
    await session.page.click(selector)
    await publishBrowserCursor(sessionId, box.x, box.y, 'click')
    await new Promise((r) => setTimeout(r, 1000))
    await broadcastPreview(session)
    return `Berhasil klik elemen [${id}].`
  }

  if (action === 'type') {
    const selector = `[data-mark-id="${id}"]`
    await session.page.waitForSelector(selector, { timeout: 8000 })
    await session.page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }))
    const box = await session.page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await publishBrowserCursor(sessionId, box.x, box.y, 'move')
    await session.page.click(selector)
    await publishBrowserCursor(sessionId, box.x, box.y, 'click')
    await session.page.type(selector, value || '', { delay: 30 })
    await broadcastPreview(session)
    return `Berhasil mengetik "${value}" pada elemen [${id}].`
  }

  if (action === 'scroll') {
    const delta = direction === 'up' ? -500 : 500
    await session.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta)
    await new Promise((r) => setTimeout(r, 600))
    await broadcastPreview(session)
    return `Berhasil scroll ${direction}.`
  }

  return `Aksi ${action} tidak dikenali.`
}

async function executeScriptInternal(code, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const res = await session.page.evaluate(code)
  await broadcastPreview(session)
  return typeof res === 'string' ? res : JSON.stringify(res)
}

async function extractDataInternal(selector, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const text = await session.page.$$eval(selector, (els) =>
    els.map((e) => e.innerText.trim()).filter(Boolean)
  )
  return JSON.stringify(text)
}

async function takeScreenshotInternal(filename = 'screenshot.png', sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const outPath = path.isAbsolute(filename)
    ? filename
    : path.join(os.homedir(), 'Desktop', filename)
  const buffer = await session.page.screenshot({ path: outPath, fullPage: false })
  const base64 = buffer ? buffer.toString('base64') : ''
  const dataUrl = base64 ? `data:image/png;base64,${base64}` : null
  return {
    success: true,
    message: `Screenshot berhasil disimpan ke ${outPath}`,
    path: outPath,
    dataUrl
  }
}

async function downloadFileInternal(url, filename, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const outPath = path.join(os.homedir(), 'Downloads', filename)
  const viewSource = await session.page.goto(url)
  fs.writeFileSync(outPath, await viewSource.buffer())
  return `File berhasil diunduh ke ${outPath}`
}

async function closeBrowserInternal(sessionId = 'default') {
  if (launches.has(sessionId)) await launches.get(sessionId).catch(() => {})
  const session = sessions.get(sessionId)
  if (session && session.browser) {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    sessions.delete(sessionId)
    try {
      await session.browser.close()
    } catch (_) {}

    await detachBrowserSession(sessionId)

    return `Browser session '${sessionId}' berhasil ditutup.`
  }
  return `Browser session '${sessionId}' tidak sedang berjalan.`
}

setBrowserFactory(getOrCreateSession)
export const closeBrowser = (sessionId = 'default') =>
  runBrowserAction(sessionId, () => closeBrowserInternal(sessionId))
export const navigateTo = (url, sessionId = 'default') =>
  runBrowserAction(sessionId, async () => {
    const target = normalizeBrowserUrl(url)
    requestBrowserPanel(sessionId)
    const control = browserControl(sessionId)
    control.loading = true
    publishBrowserState(sessionId)
    try {
      return await withPageObservation(sessionId, () => navigateToInternal(target, sessionId))
    } finally {
      control.loading = false
      publishBrowserState(sessionId)
    }
  })
export const readDOM = (sessionId = 'default') =>
  runBrowserAction(sessionId, () => readDOMInternal(sessionId))
export const executeAction = (data, sessionId = 'default') =>
  runBrowserAction(sessionId, () =>
    withPageObservation(sessionId, () => executeActionInternal(data, sessionId))
  )
export const executeScript = (code, sessionId = 'default') =>
  runBrowserAction(sessionId, () =>
    withPageObservation(sessionId, () => executeScriptInternal(code, sessionId))
  )
export const extractData = (selector, sessionId = 'default') =>
  runBrowserAction(sessionId, () =>
    withPageObservation(sessionId, () => extractDataInternal(selector, sessionId))
  )
export const takeScreenshot = (filename = 'screenshot.png', sessionId = 'default') =>
  runBrowserAction(sessionId, () =>
    withPageObservation(sessionId, () => takeScreenshotInternal(filename, sessionId))
  )
export const downloadFile = (url, filename, sessionId = 'default') =>
  runBrowserAction(sessionId, () =>
    withPageObservation(sessionId, () =>
      downloadFileInternal(normalizeBrowserUrl(url), filename, sessionId)
    )
  )
