import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'

// Map of sessionId -> SessionState
// Mendukung multi-session browser independen untuk Lead Agent & parallel Sub-Agents
const sessions = new Map()
let sharedBrowser = null
let eventEmitterCallback = null

export function setBrowserEventEmitter(emitter) {
  eventEmitterCallback = emitter
}

function emitPreview(payload) {
  if (typeof eventEmitterCallback === 'function') {
    eventEmitterCallback('browser-preview', payload)
  }
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.EDGE_BIN,
    process.env.CHROME_BIN
  ].filter(Boolean)

  for (const executablePath of candidates) {
    if (fs.existsSync(executablePath)) {
      return executablePath
    }
  }
  return null
}

async function getOrLaunchBrowser() {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser
  }

  const executablePath = findBrowserExecutable()
  if (!executablePath) {
    throw new Error('Tidak dapat menemukan Microsoft Edge atau Google Chrome di sistem Windows ini.')
  }

  const userDataDir = path.join(os.tmpdir(), 'mark-browser-agent-profile')

  sharedBrowser = await puppeteer.launch({
    executablePath,
    headless: false, // Jendela browser nyata (off-screen) agar bypass anti-bot dan bisa dipanggil ke layar
    userDataDir,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,850',
      '--window-position=-3000,-3000', // Sembunyi off-screen saat awal navigasi
      '--lang=id-ID,id,en-US,en'
    ]
  })

  sharedBrowser.on('disconnected', () => {
    sharedBrowser = null
  })

  return sharedBrowser
}

function resetSessionIdleTimeout(session) {
  if (!session) return
  if (session.idleTimeout) clearTimeout(session.idleTimeout)
  session.idleTimeout = setTimeout(() => {
    console.error(`[BROWSER AGENT] Session ${session.id} idle for 5 minutes, destroying page to save RAM...`)
    closeBrowser(session.id).catch(() => {})
  }, 5 * 60 * 1000)
}

const DOM_PARSER_SCRIPT = `
(() => {
  document.querySelectorAll('[data-mark-id]').forEach(el => el.removeAttribute('data-mark-id'));

  if (!document.getElementById('mark-blocker-style')) {
    const style = document.createElement('style');
    style.id = 'mark-blocker-style';
    style.textContent = \`
      @keyframes mark-spin { 100% { transform: rotate(360deg); } }
      .mark-spin { animation: mark-spin 1.5s linear infinite; }
      @keyframes mark-pulse { 50% { opacity: 0.7; } }
      .mark-pulse { animation: mark-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    \`;
    document.head.appendChild(style);
  }

  let blocker = document.getElementById('mark-user-blocker');
  if (!blocker) {
    blocker = document.createElement('div');
    blocker.id = 'mark-user-blocker';
    blocker.innerHTML = \`
      <div style="background: rgba(25, 54, 45, 0.9); backdrop-filter: blur(8px); border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 30px; padding: 10px 20px; display: flex; align-items: center; gap: 10px; color: #1fb854; font-family: system-ui, sans-serif; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4); pointer-events: none;">
        <svg class="mark-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span class="mark-pulse">Mark is working...</span>
      </div>
    \`;
    Object.assign(blocker.style, {
      position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.1)', zIndex: '2147483647', cursor: 'not-allowed',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      paddingTop: '24px', pointerEvents: 'auto', transition: 'all 0.3s'
    });
    
    blocker.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    blocker.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.body.appendChild(blocker);
  }
  blocker.style.display = 'flex';

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
  }

  const bodyText = getVisibleText() || '';
  const pageTitle = document.title || '';
  const currentURL = window.location.href || '';

  let output = '[URL Aktif]: ' + currentURL + '\\n';
  output += '[Title]: ' + pageTitle + '\\n\\n';
  output += '== ELEMEN INTERAKTIF (' + results.length + ' ditemukan) ==\\n';
  output += results.join('\\n');
  output += '\\n\\n== KONTEN TEKS DI LAYAR (Dan sekitarnya) ==\\n';
  output += bodyText;

  return output;
})()
`

async function setupStealthMode(page) {
  try {
    await page.evaluateOnNewDocument(() => {
      delete Object.getPrototypeOf(navigator).webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      })

      window.chrome = {
        app: { isInstalled: false },
        runtime: {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install' },
          PlatformArch: { X86_64: 'x86-64' },
          PlatformOs: { WIN: 'win' }
        }
      }

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      })

      Object.defineProperty(navigator, 'languages', {
        get: () => ['id-ID', 'id', 'en-US', 'en']
      })
    })

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
    )
  } catch (err) {
    // Non-fatal
  }
}

async function captureAndEmitPreview(page, sessionId) {
  try {
    const session = sessions.get(sessionId)
    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 50,
      encoding: 'base64'
    })
    const url = page.url()
    const title = await page.title().catch(() => url)
    const thumbnail = `data:image/jpeg;base64,${screenshotBuffer}`

    emitPreview({
      sessionId,
      url,
      title,
      thumbnail,
      isWindowVisible: session?.isWindowVisible || false
    })
  } catch (err) {
    // Non-critical if capture fails during page close or reload
  }
}

async function getOrCreateSession(sessionId = 'default') {
  let session = sessions.get(sessionId)
  if (session && session.page && !session.page.isClosed()) {
    resetSessionIdleTimeout(session)
    return session
  }

  const browser = await getOrLaunchBrowser()
  let context = browser.defaultBrowserContext()

  if (sessionId !== 'default' && typeof browser.createBrowserContext === 'function') {
    try {
      context = await browser.createBrowserContext()
    } catch (e) {
      context = browser.defaultBrowserContext()
    }
  }

  const page = await context.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await setupStealthMode(page)

  session = {
    id: sessionId,
    context,
    page,
    isWindowVisible: false,
    activeAskUser: false,
    activeAskUserMessage: '',
    globalAskUserResolve: null
  }

  sessions.set(sessionId, session)

  page.on('close', () => {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    sessions.delete(sessionId)
    emitPreview({ sessionId, closed: true })
  })

  resetSessionIdleTimeout(session)
  return session
}

export async function navigateTo(url, sessionId = 'default') {
  const session = await getOrCreateSession(sessionId)
  const page = session.page

  try {
    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 45000
    })
  } catch (e) {
    console.error(`[BrowserAgent ${sessionId}] Goto warning/timeout:`, e.message)
  }

  await new Promise((resolve) => setTimeout(resolve, 1500))
  return await readDOM(sessionId)
}

export async function closeBrowser(sessionId = 'default') {
  const targetId = !sessionId || sessionId.trim() === '' ? 'default' : sessionId.trim()

  if (targetId === 'all') {
    for (const [id, s] of sessions.entries()) {
      if (s.idleTimeout) clearTimeout(s.idleTimeout)
      try {
        if (s.page && !s.page.isClosed()) await s.page.close()
      } catch (e) {}
    }
    sessions.clear()
    if (sharedBrowser) {
      try {
        await sharedBrowser.close()
      } catch (e) {}
      sharedBrowser = null
    }
    emitPreview(null)
    return 'Semua sesi browser berhasil ditutup.'
  }

  const session = sessions.get(targetId)
  if (session) {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    try {
      if (session.page && !session.page.isClosed()) {
        await session.page.close()
      }
    } catch (e) {}
    sessions.delete(targetId)

    if (session.globalAskUserResolve) {
      session.globalAskUserResolve('User aborted the action by closing the browser.')
      session.globalAskUserResolve = null
    }

    emitPreview({ sessionId: targetId, closed: true })

    // Jika sudah tidak ada sesi lain yang aktif, matikan seluruh proses browser
    if (sessions.size === 0 && sharedBrowser) {
      try {
        await sharedBrowser.close()
      } catch (e) {}
      sharedBrowser = null
    }

    return `Browser sesi [${targetId}] berhasil ditutup.`
  }

  // Jika session tidak ditemukan namun sharedBrowser masih hidup, tutup browser
  if (sharedBrowser) {
    try {
      await sharedBrowser.close()
    } catch (e) {}
    sharedBrowser = null
    emitPreview(null)
    return 'Browser berhasil ditutup.'
  }

  return `Browser sesi [${targetId}] memang sudah tertutup.`
}

export async function readDOM(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed()) {
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka. Gunakan browser-navigate dulu.`
  }

  resetSessionIdleTimeout(session)
  const page = session.page

  let result = ''
  try {
    result = await page.evaluate(DOM_PARSER_SCRIPT)
  } catch (e) {
    result = `[ERROR Evaluasi DOM]: ${e.message}`
  }

  // Broadcast preview screenshot asynchronously
  captureAndEmitPreview(page, sessionId)

  return result
}

// Menampilkan jendela fisik ke layar (saat user klik "Buka Jendela")
export async function showBrowser(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (session && session.page && !session.page.isClosed()) {
    try {
      const cdp = await session.page.createCDPSession()
      const { windowId } = await cdp.send('Browser.getWindowForTarget')
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: 80, top: 60, width: 1280, height: 850, windowState: 'normal' }
      })
      await session.page.bringToFront()
      await session.page.evaluate(() => {
        window.focus()
      }).catch(() => {})
      session.isWindowVisible = true

      emitPreview({
        sessionId,
        url: session.page.url(),
        title: await session.page.title().catch(() => ''),
        isWindowVisible: true
      })
    } catch (e) {
      console.error(`[BrowserAgent ${sessionId}] showBrowser error:`, e.message)
    }
  }
}

// Menyembunyikan kembali jendela fisik ke offscreen (tanpa mematikan browser)
export async function hideBrowser(sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (session && session.page && !session.page.isClosed()) {
    try {
      const cdp = await session.page.createCDPSession()
      const { windowId } = await cdp.send('Browser.getWindowForTarget')
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: -3000, top: -3000, width: 1280, height: 850, windowState: 'normal' }
      })
      session.isWindowVisible = false

      captureAndEmitPreview(session.page, sessionId)
    } catch (e) {
      console.error(`[BrowserAgent ${sessionId}] hideBrowser error:`, e.message)
    }
  }
}

export async function executeAction(data, sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed()) {
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  }
  resetSessionIdleTimeout(session)
  const page = session.page
  const { action, id, value, direction } = data

  if (action === 'click') {
    try {
      await page.evaluate(
        (targetId) => {
          const el = document.querySelector(`[data-mark-id="${targetId}"]`)
          if (!el) return 'Elemen tidak ditemukan'

          el.scrollIntoView({ behavior: 'instant', block: 'center' })

          if (!document.getElementById('mark-cursor-style')) {
            const style = document.createElement('style')
            style.id = 'mark-cursor-style'
            style.textContent = `
              #mark-cursor {
                position: fixed;
                width: 24px;
                height: 24px;
                pointer-events: none;
                z-index: 2147483647;
                transition: left 0.4s cubic-bezier(0.22, 1, 0.36, 1), top 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
              }
              .mark-click-ripple {
                position: fixed;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(56, 189, 248, 0.4);
                border: 2px solid rgba(56, 189, 248, 0.8);
                pointer-events: none;
                z-index: 999998;
                animation: mark-ripple 0.6s ease-out forwards;
              }
              @keyframes mark-ripple {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(3); opacity: 0; }
              }
            `
            document.head.appendChild(style)
          }

          let cursor = document.getElementById('mark-cursor')
          if (!cursor) {
            cursor = document.createElement('div')
            cursor.id = 'mark-cursor'
            cursor.innerHTML =
              '<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 2-4 6-4-16z" fill="#19362d" stroke="#1fb854" stroke-width="1.5" stroke-linejoin="round"/></svg>'
            cursor.style.left = '50%'
            cursor.style.top = '50%'
            document.body.appendChild(cursor)
          }
          cursor.style.display = 'block'

          const rect = el.getBoundingClientRect()
          const targetX = rect.left + rect.width / 2
          const targetY = rect.top + rect.height / 2

          cursor.style.left = targetX + 'px'
          cursor.style.top = targetY + 'px'

          const ripple = document.createElement('div')
          ripple.className = 'mark-click-ripple'
          ripple.style.left = targetX - 10 + 'px'
          ripple.style.top = targetY - 10 + 'px'
          document.body.appendChild(ripple)
          setTimeout(() => ripple.remove(), 600)

          el.click()
          setTimeout(() => {
            cursor.style.display = 'none'
          }, 600)
        },
        id
      )
    } catch (e) {
      console.error(`[BrowserAgent ${sessionId}] Click error:`, e.message)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
    return await readDOM(sessionId)
  }

  if (action === 'type') {
    try {
      await page.evaluate(
        (targetId, text) => {
          const el = document.querySelector(`[data-mark-id="${targetId}"]`)
          if (!el) return 'Elemen tidak ditemukan'
          el.scrollIntoView({ behavior: 'instant', block: 'center' })
          el.focus()

          const proto =
            el.tagName === 'TEXTAREA'
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype
          const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
          if (nativeValueSetter) {
            nativeValueSetter.call(el, text)
          } else {
            el.value = text
          }

          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
          el.dispatchEvent(new Event('change', { bubbles: true }))

          if (!el.value || el.value !== text) {
            el.value = ''
            el.focus()
            document.execCommand('insertText', false, text)
          }
        },
        id,
        value || ''
      )
    } catch (e) {
      console.error(`[BrowserAgent ${sessionId}] Type error:`, e.message)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM(sessionId)
  }

  if (action === 'scroll') {
    const scrollAmount = direction === 'up' ? -600 : 600
    await page.evaluate((amt) => {
      window.scrollBy({ top: amt, behavior: 'smooth' })
    }, scrollAmount)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM(sessionId)
  }

  if (action === 'unblock') {
    try {
      const isReinject = data.isReinject
      if (!isReinject) {
        session.activeAskUser = true
        session.activeAskUserMessage = value
          ? value.replace(/'/g, "\\'").replace(/\n/g, '<br>')
          : 'Please complete the required manual action...'
      }
      const aiMessage = session.activeAskUserMessage

      // Bring browser to front so user can interact
      await showBrowser(sessionId)

      await page.evaluate((msg) => {
        let blocker = document.getElementById('mark-user-blocker')
        if (!blocker) {
          blocker = document.createElement('div')
          blocker.id = 'mark-user-blocker'
          document.body.appendChild(blocker)
        }
        blocker.style.position = 'fixed'
        blocker.style.zIndex = '2147483647'
        blocker.style.width = 'auto'
        blocker.style.height = 'auto'
        blocker.style.bottom = '24px'
        blocker.style.right = '24px'
        blocker.style.top = 'auto'
        blocker.style.left = 'auto'
        blocker.style.background = 'transparent'
        blocker.style.pointerEvents = 'none'

        blocker.innerHTML = `
          <div style="background: rgba(25, 54, 45, 0.95); backdrop-filter: blur(12px); padding: 20px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 16px; pointer-events: auto; font-family: system-ui, sans-serif; width: 340px; border: 1px solid rgba(31, 184, 84, 0.3);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1fb854" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
              <div style="font-weight: 600; color: #f8fafc; font-size: 15px; letter-spacing: 0.5px;">Mark paused for input</div>
            </div>
            
            <div style="font-size: 13px; color: #94a3b8; line-height: 1.5; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; border-left: 3px solid #1fb854;">
              ${msg}
            </div>
            
            <input type="text" id="mark-user-input" placeholder="Add a comment for Mark (optional)..." style="background: rgba(15, 23, 42, 0.6); color: #f8fafc; padding: 12px 14px; border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 8px; font-size: 13px; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='#1fb854'; this.style.boxShadow='0 0 0 2px rgba(31, 184, 84, 0.2)';" onblur="this.style.borderColor='rgba(31, 184, 84, 0.4)'; this.style.boxShadow='none';"/>
            
            <button id="mark-btn-selesai" style="background: #1fb854; color: #0f172a; padding: 12px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#22c55e'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#1fb854'; this.style.transform='translateY(0)';">
              Resume Automation
            </button>
          </div>
        `

        document.getElementById('mark-btn-selesai').onclick = () => {
          const comment = document.getElementById('mark-user-input').value
          const originalTitle = document.title
          document.title =
            'MARK_UNBLOCK_DONE:' +
            (comment.trim() || 'User telah menyelesaikan aksi manual (tidak ada komentar).')
          setTimeout(() => {
            document.title = originalTitle
          }, 100)
        }
      }, aiMessage)

      if (isReinject) return 'reinjected'

      return new Promise((resolve) => {
        session.globalAskUserResolve = async (comment) => {
          const newDOM = await readDOM(sessionId)
          resolve(`[LAPORAN USER]: ${comment}\n\n[DOM TERBARU SETELAH USER INTERAKSI]:\n${newDOM}`)
        }
      })
    } catch (e) {
      return `[ERROR] Gagal menunggu respon user: ${e.message}`
    }
  }

  if (action === 'finish') {
    await page
      .evaluate(() => {
        const blocker = document.getElementById('mark-user-blocker')
        if (blocker) blocker.remove()
        const style = document.getElementById('mark-blocker-style')
        if (style) style.remove()
      })
      .catch(() => {})
    return 'Browser unlocked.'
  }

  return '[ERROR] Action tidak dikenal.'
}

export async function executeScript(script, sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed())
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const result = await session.page.evaluate(async (code) => {
      const fn = new Function(`return (async () => { ${code} })()`)
      return await fn()
    }, script)
    return JSON.stringify(result) || 'Eksekusi script berhasil tanpa return value.'
  } catch (e) {
    return `[ERROR] Gagal eksekusi script: ${e.message}`
  }
}

export async function extractData(selector, sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed())
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const result = await session.page.evaluate((sel) => {
      const els = document.querySelectorAll(sel)
      return Array.from(els)
        .map((el) => el.innerText || el.textContent)
        .filter((t) => t.trim().length > 0)
    }, selector)
    return JSON.stringify(result, null, 2)
  } catch (e) {
    return `[ERROR] Gagal ekstrak data: ${e.message}`
  }
}

export async function takeScreenshot(filename = 'screenshot.png', sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed())
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const savePath = path.join(os.homedir(), 'Documents', 'Mark Workspace', filename)
    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    await session.page.screenshot({
      path: savePath,
      fullPage: false
    })
    return `Screenshot berhasil disimpan di: ${savePath}`
  } catch (e) {
    return `[ERROR] Gagal mengambil screenshot: ${e.message}`
  }
}

export async function downloadFile(url, filename, sessionId = 'default') {
  const session = sessions.get(sessionId)
  if (!session || !session.page || session.page.isClosed())
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const savePath = path.join(os.homedir(), 'Downloads', filename || path.basename(url))
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    await fs.promises.writeFile(savePath, Buffer.from(arrayBuffer))
    return `Download selesai dan disimpan di: ${savePath}`
  } catch (err) {
    return `[ERROR] Download gagal: ${err.message}`
  }
}
