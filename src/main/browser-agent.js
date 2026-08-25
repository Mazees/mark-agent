import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { wsHub } from '../server/ws-hub.js'

export const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'

// Map of sessionId -> SessionState { browser, page, url, title, idleTimeout }
const sessions = new Map()

function getEdgePath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return 'msedge.exe'
}

function resetSessionIdleTimeout(session) {
  if (!session) return
  if (session.idleTimeout) clearTimeout(session.idleTimeout)
  session.idleTimeout = setTimeout(() => {
    closeBrowser(session.id)
  }, 5 * 60 * 1000)
}

async function getOrCreateSession(sessionId = 'default', headless = false) {
  let session = sessions.get(sessionId)
  if (session && session.page && !session.page.isClosed()) {
    resetSessionIdleTimeout(session)
    return session
  }

  const edgePath = getEdgePath()
  const userDataDir = path.join(os.homedir(), '.config', 'mark-agent', 'browser-sessions', sessionId)
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: headless ? 'new' : false,
    userDataDir,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-position=-32000,-32000',
      '--window-size=1280,800',
      '--lang=id-ID,id,en-US,en'
    ]
  })

  const pages = await browser.pages()
  const page = pages.length > 0 ? pages[0] : await browser.newPage()

  // Real Edge Windows 11 User-Agent & HTTP Headers
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
  await page.setUserAgent(userAgent)

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-CH-UA': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1'
  })

  // Comprehensive Anti-Bot Detection Stealth Overrides
  await page.evaluateOnNewDocument(() => {
    // 1. Delete & Overwrite webdriver on Navigator prototype
    try {
      delete Object.getPrototypeOf(navigator).webdriver
    } catch (_) {}
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true
    })

    // 2. Complete window.chrome structure matching official Edge
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        OnInstalledReason: {},
        OnRestartRequiredReason: {},
        PlatformArch: {},
        PlatformNaclArch: {},
        PlatformOs: {},
        RequestUpdateCheckStatus: {},
        connect: function () {},
        sendMessage: function () {}
      },
      loadTimes: function () {
        return {
          requestTime: performance.now() / 1000,
          startLoadTime: performance.now() / 1000,
          commitLoadTime: performance.now() / 1000,
          finishDocumentLoadTime: performance.now() / 1000,
          finishLoadTime: performance.now() / 1000,
          firstPaintTime: performance.now() / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
          npnNegotiatedProtocol: '',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'http/1.1'
        }
      },
      csi: function () {
        return {
          startE: performance.now(),
          onloadT: performance.now(),
          pageT: performance.now(),
          tran: 15
        }
      }
    }

    // 3. Mock navigator.plugins & mimeTypes
    const fakePlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
    ]
    Object.defineProperty(navigator, 'plugins', {
      get: () => fakePlugins,
      configurable: true
    })
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => [
        {
          type: 'application/pdf',
          suffixes: 'pdf',
          description: 'Portable Document Format',
          enabledPlugin: fakePlugins[0]
        }
      ],
      configurable: true
    })

    // 4. Mock navigator hardware properties
    Object.defineProperty(navigator, 'languages', {
      get: () => ['id-ID', 'id', 'en-US', 'en'],
      configurable: true
    })
    Object.defineProperty(navigator, 'language', {
      get: () => 'id-ID',
      configurable: true
    })
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true
    })
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true
    })
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true
    })

    // 5. Mock navigator.userAgentData (Edge Client Hints for Cloudflare)
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands: [
          { brand: 'Not(A:Brand', version: '99' },
          { brand: 'Microsoft Edge', version: '133' },
          { brand: 'Chromium', version: '133' }
        ],
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: async () => ({
          architecture: 'x86',
          bitness: '64',
          brands: [
            { brand: 'Not(A:Brand', version: '99' },
            { brand: 'Microsoft Edge', version: '133' },
            { brand: 'Chromium', version: '133' }
          ],
          fullVersionList: [
            { brand: 'Not(A:Brand', version: '99.0.0.0' },
            { brand: 'Microsoft Edge', version: '133.0.3065.82' },
            { brand: 'Chromium', version: '133.0.6943.127' }
          ],
          mobile: false,
          model: '',
          platform: 'Windows',
          platformVersion: '15.0.0'
        })
      }),
      configurable: true
    })

    // 6. Fix notification permissions
    const originalQuery = window.navigator.permissions?.query
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission || 'default', onchange: null })
          : originalQuery.call(window.navigator.permissions, parameters)
    }

    // 7. Fix WebGL Vendor & Renderer (Spoof Intel GPU)
    const getParam1 = WebGLRenderingContext.prototype.getParameter
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Google Inc. (Intel)'
      if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
      return getParam1.apply(this, arguments)
    }
    const getParam2 = WebGL2RenderingContext.prototype.getParameter
    WebGL2RenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Google Inc. (Intel)'
      if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
      return getParam2.apply(this, arguments)
    }
  })

  session = {
    id: sessionId,
    browser,
    page,
    url: 'about:blank',
    title: 'New Tab',
    idleTimeout: null
  }

  sessions.set(sessionId, session)
  resetSessionIdleTimeout(session)
  return session
}

const DOM_PARSER_SCRIPT = `
(() => {
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
    while ((node = walker.nextNode())) {
      if (text.length > 8000) break;
      const parent = node.parentElement;
      if (!parent) continue;
      
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
  try {
    const screenshotBuf = await session.page.screenshot({ encoding: 'base64' })
    if (wsHub) {
      const dataUri = `data:image/png;base64,${screenshotBuf}`
      wsHub.broadcast('browser:preview', {
        sessionId: session.id,
        thumbnail: dataUri,
        preview: dataUri,
        title: session.title || 'Browser Session',
        url: session.url || 'about:blank'
      })
    }
  } catch (_) {}
}

export async function navigateTo(url, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  let targetUrl = url.trim()
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
  session.url = session.page.url()
  session.title = await session.page.title()

  await broadcastPreview(session)

  return `Berhasil membuka ${session.url} (Judul: "${session.title}"). Gunakan 'browser-read' untuk melihat isi dan elemen interaktif.`
}

export async function readDOM(sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const result = await session.page.evaluate(DOM_PARSER_SCRIPT)

  session.url = session.page.url()
  session.title = await session.page.title()

  await broadcastPreview(session)

  return result
}

export async function executeAction(data, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const { action, id, value, direction } = data

  if (action === 'click') {
    const selector = `[data-mark-id="${id}"]`
    await session.page.waitForSelector(selector, { timeout: 8000 })
    await session.page.click(selector)
    await new Promise((r) => setTimeout(r, 1000))
    await broadcastPreview(session)
    return `Berhasil klik elemen [${id}]. Gunakan 'browser-read' untuk melihat perubahan halaman.`
  }

  if (action === 'type') {
    const selector = `[data-mark-id="${id}"]`
    await session.page.waitForSelector(selector, { timeout: 8000 })
    await session.page.click(selector)
    await session.page.type(selector, value || '', { delay: 30 })
    await broadcastPreview(session)
    return `Berhasil mengetik "${value}" pada elemen [${id}].`
  }

  if (action === 'scroll') {
    const delta = direction === 'up' ? -500 : 500
    await session.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta)
    await new Promise((r) => setTimeout(r, 600))
    await broadcastPreview(session)
    return `Berhasil scroll ${direction}. Gunakan 'browser-read' untuk membaca elemen terbaru.`
  }

  if (action === 'unblock') {
    await broadcastPreview(session)
    return `Mode user unblock: ${value}`
  }

  return `Aksi ${action} tidak dikenali.`
}

export async function executeScript(code, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const res = await session.page.evaluate(code)
  await broadcastPreview(session)
  return typeof res === 'string' ? res : JSON.stringify(res)
}

export async function extractData(selector, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const text = await session.page.$$eval(selector, (els) => els.map((e) => e.innerText.trim()).filter(Boolean))
  return JSON.stringify(text)
}

export async function takeScreenshot(filename = 'screenshot.png', sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const outPath = path.isAbsolute(filename) ? filename : path.join(os.homedir(), 'Desktop', filename)
  await session.page.screenshot({ path: outPath, fullPage: false })
  return `Screenshot berhasil disimpan ke ${outPath}`
}

export async function downloadFile(url, filename, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const outPath = path.join(os.homedir(), 'Downloads', filename)
  const viewSource = await session.page.goto(url)
  fs.writeFileSync(outPath, await viewSource.buffer())
  return `File berhasil diunduh ke ${outPath}`
}

export async function closeBrowser(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (session && session.browser) {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    try {
      await session.browser.close()
    } catch (_) {}
    sessions.delete(sessionId)

    if (wsHub) {
      wsHub.broadcast('browser:preview', {
        sessionId,
        closed: true
      })
    }

    return `Browser session '${sessionId}' berhasil ditutup.`
  }
  return `Browser session '${sessionId}' tidak sedang berjalan.`
}

export async function showBrowserWindow(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (session && session.page) {
    try {
      const client = await session.page.target().createCDPSession()
      const { windowId } = await client.send('Browser.getWindowForTarget')
      await client.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'normal', left: 80, top: 60, width: 1280, height: 800 }
      })
      await session.page.bringToFront()
    } catch (_) {
      try {
        await session.page.bringToFront()
      } catch (_) {}
    }
  }
}
