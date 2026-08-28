import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
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
    defaultViewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
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
    idleTimeout: null,
    isForeground: false
  }

  // Handle page close / tab close gracefully (Keep alive in background)
  page.on('close', async () => {
    const s = sessions.get(sessionId)
    if (s && s.browser && s.browser.isConnected()) {
      try {
        const remainingPages = await s.browser.pages()
        if (remainingPages.length > 0) {
          s.page = remainingPages[0]
        } else {
          // Re-create background page if user closed the last tab
          s.page = await s.browser.newPage()
          await s.page.setUserAgent(userAgent)
          await hideBrowserWindow(sessionId)
        }
      } catch (_) {}
    }
  })

  // Pastikan window bounds diatur ke off-screen (-32000, -32000) saat launch
  try {
    const client = await page.target().createCDPSession()
    const { windowId } = await client.send('Browser.getWindowForTarget')
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal', left: -32000, top: -32000, width: 1280, height: 800 }
    })
  } catch (_) {}

  sessions.set(sessionId, session)
  resetSessionIdleTimeout(session)
  return session
}

const DOM_PARSER_SCRIPT = `
(() => {
  // 1. Injeksi Style dan Keyframe Animation jika belum ada
  if (!document.getElementById('mark-blocker-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mark-blocker-style';
    styleEl.textContent = \`
      @keyframes mark-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes mark-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(0.98); }
      }
      .mark-pulse {
        animation: mark-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
    \`;
    document.head ? document.head.appendChild(styleEl) : document.documentElement.appendChild(styleEl);
  }

  // 2. Injeksi atau Pulihkan Fullscreen Interaction Blocker & Top Loading Pill
  let blocker = document.getElementById('mark-user-blocker');
  if (!blocker) {
    blocker = document.createElement('div');
    blocker.id = 'mark-user-blocker';
    document.documentElement.appendChild(blocker);

    // Mencegah scroll saat blocker aktif
    const preventScroll = (e) => {
      if (blocker && blocker.dataset.mode !== 'unblock') {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
  }

  // Mode default: Fullscreen blocker dengan Top Loading Pill
  blocker.dataset.mode = 'working';
  blocker.style.cssText = \`
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    cursor: not-allowed !important;
    display: flex !important;
    justify-content: center !important;
    align-items: flex-start !important;
    padding-top: 24px !important;
    box-sizing: border-box !important;
    background: transparent !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  \`;

  blocker.innerHTML = \`
    <div style="
      background: rgba(25, 54, 45, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(31, 184, 84, 0.4);
      border-radius: 30px;
      padding: 10px 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(31, 184, 84, 0.2);
      color: #f1f5f9;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.2px;
      user-select: none;
      pointer-events: auto;
    ">
      <svg style="animation: mark-spin 1s linear infinite; width: 16px; height: 16px; color: #1fb854;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span class="mark-pulse" style="color: #f8fafc;">Mark is working...</span>
    </div>
  \`;

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
    while ((node = walker.nextNode())) {
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
  try {
    const screenshotBuf = await session.page.screenshot({ encoding: 'base64' })
    if (wsHub) {
      const dataUri = `data:image/png;base64,${screenshotBuf}`
      wsHub.broadcast('browser:preview', {
        sessionId: session.id,
        thumbnail: dataUri,
        preview: dataUri,
        title: session.title || 'Browser Session',
        url: session.url || 'about:blank',
        isForeground: Boolean(session.isForeground)
      })
    }
  } catch (_) {}
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
        type: isGoogleBlocked ? 'Google Unusual Traffic' : isCloudflareBlocked ? 'Cloudflare Challenge' : 'CAPTCHA Protection',
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

  // Otomatis cek apakah halaman memicu CAPTCHA / bot challenge
  const challenge = await detectChallenge(session.page)
  if (challenge.isBlocked) {
    return `[PERINGATAN ANTI-BOT / CAPTCHA TERDETEKSI]: Halaman memicu perlindungan "${challenge.type}" (Judul: "${session.title}", URL: "${session.url}").\nKamu WAJIB segera memanggil tool 'browser-ask-user' dengan pesan agar pengguna menyelesaikan CAPTCHA ini!`
  }

  return `Berhasil membuka ${session.url} (Judul: "${session.title}"). Gunakan 'browser-read' untuk melihat isi dan elemen interaktif.`
}

export async function readDOM(sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const result = await session.page.evaluate(DOM_PARSER_SCRIPT)

  session.url = session.page.url()
  session.title = await session.page.title()

  await broadcastPreview(session)

  const challenge = await detectChallenge(session.page)
  if (challenge.isBlocked) {
    return `[PERINGATAN ANTI-BOT / CAPTCHA TERDETEKSI]: Terdeteksi "${challenge.type}" pada halaman ini!\nKamu WAJIB segera memanggil tool 'browser-ask-user' agar user dapat menyelesaikan verifikasi manusia secara langsung di jendela browser.\n\n${result}`
  }

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
    // 1. Tampilkan jendela browser ke layar aktif agar user bisa melihat dan menyelesaikan captcha/login
    await showBrowserWindow(sessionId)

    // 2. Ubah blocker menjadi unblock prompt widget di kanan bawah
    const promptMsg = value || 'Silakan selesaikan CAPTCHA atau login pada halaman ini, lalu klik tombol di bawah.'
    await session.page.evaluate((msg) => {
      let blocker = document.getElementById('mark-user-blocker');
      if (!blocker) {
        blocker = document.createElement('div');
        blocker.id = 'mark-user-blocker';
        document.documentElement.appendChild(blocker);
      }

      blocker.dataset.mode = 'unblock';
      blocker.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        top: auto !important;
        left: auto !important;
        width: auto !important;
        height: auto !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        cursor: default !important;
        display: flex !important;
        justify-content: flex-end !important;
        align-items: flex-end !important;
        background: transparent !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      `;

      blocker.innerHTML = `
        <div style="
          background: rgba(15, 23, 21, 0.95);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(31, 184, 84, 0.5);
          border-radius: 16px;
          padding: 20px 22px;
          width: 350px;
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(31, 184, 84, 0.25);
          color: #f1f5f9;
          box-sizing: border-box;
          pointer-events: auto !important;
          animation: mark-pulse 3s ease-in-out infinite;
        ">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: #1fb854; box-shadow: 0 0 8px #1fb854;"></div>
            <div style="font-weight: 700; color: #f8fafc; font-size: 15px; letter-spacing: 0.2px;">Mark Paused for Input</div>
          </div>
          <div style="font-size: 13px; line-height: 1.5; color: #cbd5e1; margin-bottom: 14px; word-break: break-word;">
            ${msg}
          </div>
          <input type="text" id="mark-user-input" placeholder="Komentar untuk Mark (opsional)..." style="
            width: 100%;
            padding: 10px 14px;
            background: rgba(25, 54, 45, 0.6);
            border: 1px solid rgba(31, 184, 84, 0.3);
            border-radius: 10px;
            color: #f8fafc;
            font-size: 13px;
            margin-bottom: 12px;
            box-sizing: border-box;
            outline: none;
            transition: border-color 0.2s;
          " />
          <button id="mark-btn-selesai" style="
            width: 100%;
            padding: 11px 16px;
            background: #1fb854;
            color: #0f1715;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(31, 184, 84, 0.3);
          ">Lanjutkan Otomasi (Resume)</button>
        </div>
      `;

      // 3. Setup listener click dan Enter
      const btn = document.getElementById('mark-btn-selesai');
      const input = document.getElementById('mark-user-input');

      const submit = () => {
        const comment = input ? input.value : '';
        btn.innerText = 'Melanjutkan...';
        btn.style.opacity = '0.7';
        btn.disabled = true;
        document.title = 'MARK_UNBLOCK_DONE:' + (comment.trim() || 'Sudah selesai.');
      };

      if (btn) btn.onclick = submit;
      if (input) {
        input.onkeydown = (e) => {
          if (e.key === 'Enter') submit();
        };
        setTimeout(() => input.focus(), 300);
      }
    }, promptMsg);

    await broadcastPreview(session);

    // 4. Tunggu respons pengguna via perubahan document.title di page
    const userFeedback = await new Promise((resolve) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          session.page.off('titlechanged', titleListener);
          resolve('Waktu tunggu intervensi user habis (600 detik).');
        }
      }, 600000); // 10 menit timeout

      const titleListener = (newTitle) => {
        if (newTitle && newTitle.startsWith('MARK_UNBLOCK_DONE:')) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            session.page.off('titlechanged', titleListener);
            const userText = newTitle.replace('MARK_UNBLOCK_DONE:', '').trim();
            resolve(userText || 'Sudah selesai.');
          }
        }
      };

      session.page.on('titlechanged', titleListener);
    });

    // 5. Kembalikan blocker ke mode Fullscreen working indicator
    await session.page.evaluate(() => {
      let blocker = document.getElementById('mark-user-blocker');
      if (blocker) {
        blocker.dataset.mode = 'working';
        blocker.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          pointer-events: auto !important;
          cursor: not-allowed !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-start !important;
          padding-top: 24px !important;
          box-sizing: border-box !important;
          background: transparent !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        `;
        blocker.innerHTML = `
          <div style="
            background: rgba(25, 54, 45, 0.92);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(31, 184, 84, 0.4);
            border-radius: 30px;
            padding: 10px 22px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(31, 184, 84, 0.2);
            color: #f1f5f9;
            font-size: 13px;
            font-weight: 500;
            letter-spacing: 0.2px;
            user-select: none;
            pointer-events: auto;
          ">
            <svg style="animation: mark-spin 1s linear infinite; width: 16px; height: 16px; color: #1fb854;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span class="mark-pulse" style="color: #f8fafc;">Mark is working...</span>
          </div>
        `;
      }
    });

    // 6. Baca ulang DOM setelah user selesai
    const updatedDOM = await readDOM(sessionId);
    return `[USER SELESAI INTERVENSI]: Catatan user: "${userFeedback}".\nBerikut kondisi DOM terbaru setelah intervensi:\n${updatedDOM}`;
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

export function forceProcessWindowToForeground(pid) {
  if (os.platform() !== 'win32' || !pid) return Promise.resolve()
  return new Promise((resolve) => {
    const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    public static void FocusPid(int pid) {
        IntPtr targetHwnd = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            uint procId;
            GetWindowThreadProcessId(hWnd, out procId);
            if (procId == (uint)pid && IsWindowVisible(hWnd)) {
                targetHwnd = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        if (targetHwnd != IntPtr.Zero) {
            ShowWindow(targetHwnd, 9); // SW_RESTORE
            IntPtr fg = GetForegroundWindow();
            uint fgThread = GetWindowThreadProcessId(fg, out _);
            uint curThread = GetCurrentThreadId();
            uint targetThread = GetWindowThreadProcessId(targetHwnd, out _);
            if (fgThread != targetThread) {
                AttachThreadInput(fgThread, targetThread, true);
                AttachThreadInput(curThread, targetThread, true);
            }
            keybd_event(0, 0, 0, 0);
            SetWindowPos(targetHwnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040); // HWND_TOPMOST
            SetWindowPos(targetHwnd, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040); // HWND_NOTOPMOST
            BringWindowToTop(targetHwnd);
            SetForegroundWindow(targetHwnd);
            SwitchToThisWindow(targetHwnd, true);
            if (fgThread != targetThread) {
                AttachThreadInput(fgThread, targetThread, false);
                AttachThreadInput(curThread, targetThread, false);
            }
        }
    }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
[Win32Focus]::FocusPid(${pid})
`
    const enc = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${enc}`, () => resolve())
  })
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
      session.isForeground = true

      // Bypass Windows Foreground Lock dan paksa window naik ke paling atas
      const pid = session.browser?.process()?.pid
      if (pid) {
        await forceProcessWindowToForeground(pid)
      }

      return `Berhasil menampilkan jendela browser untuk sesi '${sessionId}'.`
    } catch (cdpErr) {
      try {
        await session.page.bringToFront()
        session.isForeground = true
        const pid = session.browser?.process()?.pid
        if (pid) {
          await forceProcessWindowToForeground(pid)
        }
        return `Berhasil membawa browser sesi '${sessionId}' ke depan.`
      } catch (err) {
        return `Gagal menampilkan jendela browser: ${err.message}`
      }
    }
  }
  return `Sesi browser '${sessionId}' tidak ditemukan atau sedang tidak aktif.`
}

export async function hideBrowserWindow(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (session && session.page) {
    try {
      const client = await session.page.target().createCDPSession()
      const { windowId } = await client.send('Browser.getWindowForTarget')
      await client.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'normal', left: -32000, top: -32000, width: 1280, height: 800 }
      })
      session.isForeground = false
      return `Berhasil menyembunyikan jendela browser sesi '${sessionId}' ke latar belakang.`
    } catch (err) {
      return `Gagal menyembunyikan jendela browser: ${err.message}`
    }
  }
  return `Sesi browser '${sessionId}' tidak ditemukan atau sedang tidak aktif.`
}

