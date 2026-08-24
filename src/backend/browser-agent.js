import { BrowserWindow, screen } from './electron-compat.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'

// Map of sessionId -> SessionState
// Mendukung multi-session browser independen untuk Lead Agent & parallel Sub-Agents
const sessions = new Map()

function getSession(sessionId = 'default') {
  return sessions.get(sessionId) || null
}

function resetSessionIdleTimeout(session) {
  if (!session) return
  if (session.idleTimeout) clearTimeout(session.idleTimeout)
  session.idleTimeout = setTimeout(() => {
    console.log(`[BROWSER AGENT] Session ${session.id} idle for 5 minutes, destroying hidden window to save RAM...`)
    closeBrowser(session.id)
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

function getOrCreateBrowser(sessionId = 'default') {
  let session = sessions.get(sessionId)
  if (session && session.window && !session.window.isDestroyed()) {
    resetSessionIdleTimeout(session)
    return session
  }

  const browserWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    title: `Mark Browser (${sessionId})`,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  browserWindow.webContents.setMaxListeners(50)

  // Cegah website buka window baru (pop-up atau target="_blank")
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.loadURL(url)
    }
    return { action: 'deny' }
  })

  session = {
    id: sessionId,
    window: browserWindow,
    activeAskUser: false,
    activeAskUserMessage: '',
    globalAskUserResolve: null,
    isForceClosing: false,
    idleTimeout: null
  }
  sessions.set(sessionId, session)

  browserWindow.on('close', (event) => {
    if (!session.isForceClosing) {
      event.preventDefault()

      if (session.globalAskUserResolve) {
        session.globalAskUserResolve('User aborted the action by hiding the browser.')
        session.globalAskUserResolve = null
        session.activeAskUser = false
        session.activeAskUserMessage = ''
      }

      browserWindow.webContents
        .capturePage()
        .then((image) => {
          const thumbnail = image.resize({ width: 800 }).toDataURL()
          const url = browserWindow.webContents.getURL()
          const title = browserWindow.getTitle()

          browserWindow.hide()

          BrowserWindow.getAllWindows().forEach((win) => {
            if (win !== browserWindow && !win.isDestroyed()) {
              win.webContents.send('browser:preview', { sessionId, url, title, thumbnail })
            }
          })
        })
        .catch(() => {
          browserWindow.hide()
        })
    }
  })

  browserWindow.on('closed', () => {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    sessions.delete(sessionId)
  })

  browserWindow.webContents.on('did-finish-load', () => {
    if (session.activeAskUser && !browserWindow.isDestroyed()) {
      executeAction({ action: 'unblock', value: session.activeAskUserMessage, isReinject: true }, sessionId).catch(
        () => null
      )
    }
  })

  browserWindow.on('page-title-updated', (event, title) => {
    if (title.startsWith('MARK_UNBLOCK_DONE:') && session.globalAskUserResolve) {
      event.preventDefault()
      const comment = title.substring(18)
      session.globalAskUserResolve(comment)
      session.globalAskUserResolve = null
      session.activeAskUser = false
      session.activeAskUserMessage = ''

      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents
          .executeJavaScript(
            `
            const b = document.getElementById('mark-user-blocker');
            if (b) {
              b.style.width = '100vw';
              b.style.height = '100vh';
              b.style.top = '0';
              b.style.left = '0';
              b.style.bottom = 'auto';
              b.style.right = 'auto';
              b.style.background = 'rgba(0,0,0,0.1)';
              b.style.pointerEvents = 'auto';
              b.style.display = 'flex';
              b.style.justifyContent = 'center';
              b.style.alignItems = 'flex-start';
              b.style.paddingTop = '24px';
              b.innerHTML = \`<div style="background: rgba(25, 54, 45, 0.9); backdrop-filter: blur(8px); border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 30px; padding: 10px 20px; display: flex; align-items: center; gap: 10px; color: #1fb854; font-family: system-ui, sans-serif; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4); pointer-events: none;"><svg class="mark-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span class="mark-pulse">Mark is working...</span></div>\`;
            }
          `
          )
          .catch(() => {})
      }
    }
  })

  resetSessionIdleTimeout(session)
  return session
}

export async function navigateTo(url, sessionId = 'default') {
  const session = getOrCreateBrowser(sessionId)
  const browserWindow = session.window

  if (browserWindow.webContents.isLoading()) {
    browserWindow.webContents.stop()
  }

  await Promise.race([
    browserWindow.loadURL(url),
    new Promise((resolve) => setTimeout(resolve, 60000))
  ]).catch((e) => console.error(`[BrowserAgent ${sessionId}] Error/Timeout loading URL:`, e))

  await new Promise((resolve) => setTimeout(resolve, 2000))

  return await readDOM(sessionId)
}

export async function closeBrowser(sessionId = 'default') {
  if (sessionId === 'all') {
    for (const [id, s] of sessions.entries()) {
      if (s.idleTimeout) clearTimeout(s.idleTimeout)
      if (s.window && !s.window.isDestroyed()) {
        s.isForceClosing = true
        s.window.close()
      }
    }
    sessions.clear()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('browser:preview', null)
      }
    })
    return 'Semua sesi browser berhasil ditutup.'
  }

  const session = sessions.get(sessionId)
  if (session && session.window && !session.window.isDestroyed()) {
    if (session.idleTimeout) clearTimeout(session.idleTimeout)
    session.isForceClosing = true
    session.window.close()
    sessions.delete(sessionId)
    session.isForceClosing = false
    session.activeAskUser = false
    session.activeAskUserMessage = ''
    if (session.globalAskUserResolve) {
      session.globalAskUserResolve('User aborted the action by closing the browser.')
      session.globalAskUserResolve = null
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('browser:preview', { sessionId, closed: true })
      }
    })

    return `Browser sesi [${sessionId}] berhasil ditutup.`
  }
  return `Browser sesi [${sessionId}] memang sudah tertutup.`
}

export async function readDOM(sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) {
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka. Gunakan browser-navigate dulu.`
  }
  resetSessionIdleTimeout(session)
  const browserWindow = session.window

  const result = await browserWindow.webContents.executeJavaScript(DOM_PARSER_SCRIPT)

  try {
    const image = await browserWindow.webContents.capturePage()
    const thumbnail = image.resize({ width: 800 }).toDataURL()
    const url = browserWindow.webContents.getURL()
    const title = browserWindow.getTitle()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== browserWindow && !win.isDestroyed()) {
        win.webContents.send('browser:preview', { sessionId, url, title, thumbnail })
      }
    })
  } catch (e) {
    console.error(`[BrowserAgent ${sessionId}] Failed to capture browser preview:`, e)
  }

  return result
}

export function showBrowser(sessionId = 'default') {
  const session = getSession(sessionId)
  if (session && session.window && !session.window.isDestroyed()) {
    const browserWindow = session.window
    if (browserWindow.isMinimized()) browserWindow.restore()
    browserWindow.show()
    browserWindow.focus()
    browserWindow.setAlwaysOnTop(true)
    browserWindow.setAlwaysOnTop(false)
  }
}

export async function executeAction(data, sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) {
    return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  }
  resetSessionIdleTimeout(session)
  const browserWindow = session.window
  const { action, id, value, direction } = data

  if (action === 'click') {
    try {
      await browserWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('[data-mark-id="${id}"]');
          if (!el) return 'Elemen dengan ID ${id} tidak ditemukan.';
          
          el.scrollIntoView({ behavior: 'instant', block: 'center' });

          if (!document.getElementById('mark-cursor-style')) {
            const style = document.createElement('style');
            style.id = 'mark-cursor-style';
            style.textContent = \`
              #mark-cursor {
                position: fixed;
                width: 24px;
                height: 24px;
                pointer-events: none;
                z-index: 2147483647;
                transition: left 0.5s cubic-bezier(0.22, 1, 0.36, 1), 
                            top 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
              }
              #mark-cursor svg {
                width: 100%;
                height: 100%;
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
            \`;
            document.head.appendChild(style);
          }

          let cursor = document.getElementById('mark-cursor');
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'mark-cursor';
            cursor.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 2-4 6-4-16z" fill="#19362d" stroke="#1fb854" stroke-width="1.5" stroke-linejoin="round"/></svg>';
            cursor.style.left = '50%';
            cursor.style.top = '50%';
            document.body.appendChild(cursor);
          }
          cursor.style.display = 'block';

          const rect = el.getBoundingClientRect();
          const targetX = rect.left + rect.width / 2;
          const targetY = rect.top + rect.height / 2;

          cursor.style.left = targetX + 'px';
          cursor.style.top = targetY + 'px';

          return new Promise(resolve => {
            setTimeout(() => {
              const ripple = document.createElement('div');
              ripple.className = 'mark-click-ripple';
              ripple.style.left = (targetX - 10) + 'px';
              ripple.style.top = (targetY - 10) + 'px';
              document.body.appendChild(ripple);
              setTimeout(() => ripple.remove(), 600);

              el.click();
              setTimeout(() => { cursor.style.display = 'none'; }, 1000);
              resolve('Berhasil klik elemen ${id}.');
            }, 550);
          });
        })()`
      )
    } catch (e) {
      if (!e.message.includes('destroyed')) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
    return await readDOM(sessionId)
  }

  if (action === 'type') {
    try {
      await browserWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('[data-mark-id="${id}"]');
          if (!el) return 'Elemen dengan ID ${id} tidak ditemukan.';
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();

          const text = '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}';
          
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeValueSetter) {
            nativeValueSetter.call(el, text);
          } else {
            el.value = text;
          }

          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
          el.dispatchEvent(new Event('change', { bubbles: true }));

          if (!el.value || el.value !== text) {
            el.value = '';
            el.focus();
            document.execCommand('insertText', false, text);
          }

          return 'Berhasil ketik di elemen ${id}.';
        })()`
      )
    } catch (e) {
      if (!e.message.includes('destroyed')) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM(sessionId)
  }

  if (action === 'scroll') {
    const scrollAmount = direction === 'up' ? -600 : 600
    await browserWindow.webContents.executeJavaScript(
      `window.scrollBy({ top: ${scrollAmount}, behavior: 'smooth' })`
    )
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM(sessionId)
  }

  if (action === 'unblock') {
    if (!browserWindow.isDestroyed()) {
      browserWindow.show()
      browserWindow.focus()
    }
    try {
      const isReinject = data.isReinject
      if (!isReinject) {
        session.activeAskUser = true
        session.activeAskUserMessage = value
          ? value.replace(/'/g, "\\'").replace(/\n/g, '<br>')
          : 'Please complete the required manual action...'
      }
      const aiMessage = session.activeAskUserMessage

      await browserWindow.webContents.executeJavaScript(
        `(() => {
          let blocker = document.getElementById('mark-user-blocker');
          if (!blocker) {
            blocker = document.createElement('div');
            blocker.id = 'mark-user-blocker';
            document.body.appendChild(blocker);
          }
          blocker.style.position = 'fixed';
          blocker.style.zIndex = '2147483647';
          blocker.style.width = 'auto';
          blocker.style.height = 'auto';
          blocker.style.bottom = '24px';
          blocker.style.right = '24px';
          blocker.style.top = 'auto';
          blocker.style.left = 'auto';
          blocker.style.background = 'transparent';
          blocker.style.pointerEvents = 'none';
          
          if (!document.getElementById('mark-placeholder-style')) {
            const style = document.createElement('style');
            style.id = 'mark-placeholder-style';
            style.textContent = '#mark-user-input::placeholder { color: rgba(248, 250, 252, 0.5); }';
            document.head.appendChild(style);
          }
          
          blocker.innerHTML = \`
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
                \${aiMessage}
              </div>
              
              <input type="text" id="mark-user-input" placeholder="Add a comment for Mark (optional)..." style="background: rgba(15, 23, 42, 0.6); color: #f8fafc; padding: 12px 14px; border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 8px; font-size: 13px; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='#1fb854'; this.style.boxShadow='0 0 0 2px rgba(31, 184, 84, 0.2)';" onblur="this.style.borderColor='rgba(31, 184, 84, 0.4)'; this.style.boxShadow='none';"/>
              
              <button id="mark-btn-selesai" style="background: #1fb854; color: #0f172a; padding: 12px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#22c55e'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#1fb854'; this.style.transform='translateY(0)';">
                Resume Automation
              </button>
            </div>
          \`;
          
          document.getElementById('mark-btn-selesai').onclick = () => {
            const comment = document.getElementById('mark-user-input').value;
            const originalTitle = document.title;
            document.title = 'MARK_UNBLOCK_DONE:' + (comment.trim() || 'User telah menyelesaikan aksi manual (tidak ada komentar).');
            setTimeout(() => { document.title = originalTitle; }, 100);
          };
          
          document.getElementById('mark-user-input').addEventListener('keypress', function (e) {
              if (e.key === 'Enter') document.getElementById('mark-btn-selesai').click();
          });

        })()`
      )

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
    await browserWindow.webContents
      .executeJavaScript(
        `(() => {
        const blocker = document.getElementById('mark-user-blocker');
        if (blocker) blocker.remove();
        const style = document.getElementById('mark-blocker-style');
        if (style) style.remove();
      })()`
      )
      .catch(() => {})
    return 'Browser unlocked.'
  }

  return '[ERROR] Action tidak dikenal.'
}

export async function executeScript(script, sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const result = await session.window.webContents.executeJavaScript(`(async () => { ${script} })()`)
    return JSON.stringify(result) || 'Eksekusi script berhasil tanpa return value.'
  } catch (e) {
    return `[ERROR] Gagal eksekusi script: ${e.message}`
  }
}

export async function extractData(selector, sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const result = await session.window.webContents.executeJavaScript(`
      (() => {
        const els = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
        return Array.from(els).map(el => el.innerText || el.textContent).filter(t => t.trim().length > 0);
      })()
    `)
    return JSON.stringify(result, null, 2)
  } catch (e) {
    return `[ERROR] Gagal ekstrak data: ${e.message}`
  }
}

export async function takeScreenshot(filename = 'screenshot.png', sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  try {
    const image = await session.window.webContents.capturePage()
    const buffer = image.toPNG()
    const savePath = path.join(os.homedir(), 'Documents', 'Mark Workspace', filename)
    
    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    
    fs.writeFileSync(savePath, buffer)
    return `Screenshot berhasil disimpan di: ${savePath}`
  } catch (e) {
    return `[ERROR] Gagal mengambil screenshot: ${e.message}`
  }
}

export async function downloadFile(url, filename, sessionId = 'default') {
  const session = getSession(sessionId)
  if (!session || !session.window || session.window.isDestroyed()) return `[ERROR] Browser sesi [${sessionId}] belum dibuka.`
  resetSessionIdleTimeout(session)
  return new Promise((resolve) => {
    session.window.webContents.session.once('will-download', (event, item) => {
      const savePath = path.join(os.homedir(), 'Downloads', filename || item.getFilename())
      item.setSavePath(savePath)
      item.once('done', (event, state) => {
        if (state === 'completed') {
          resolve(`Download selesai dan disimpan di: ${savePath}`)
        } else {
          resolve(`[ERROR] Download gagal dengan status: ${state}`)
        }
      })
    })
    session.window.webContents.downloadURL(url)
  })
}
