/* global chrome */
;(() => {
  if (globalThis.__markChromeBridgeContent) return
  globalThis.__markChromeBridgeContent = true
  const registry = new Map()
  const prompts = new Map()
  let overlay = null

  function clearBadges() {
    overlay?.remove()
    for (const element of registry.values()) element.removeAttribute('data-chrome-use-id')
    registry.clear()
  }

  function scan() {
    clearBadges()
    overlay = document.createElement('div')
    overlay.dataset.markBridgeOverlay = 'true'
    Object.assign(overlay.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      zIndex: '2147483646'
    })
    const candidates = document.querySelectorAll(
      'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="checkbox"],[role="tab"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])'
    )
    const elements = []
    for (const element of candidates) {
      if (element.closest('[data-mark-bridge-ui]') || element.disabled) continue
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element)
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth ||
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        Number(style.opacity) === 0
      )
        continue
      const id = elements.length + 1
      registry.set(id, element)
      element.setAttribute('data-chrome-use-id', String(id))
      const badge = document.createElement('span')
      badge.textContent = String(id)
      Object.assign(badge.style, {
        position: 'absolute',
        top: `${rect.top + scrollY}px`,
        left: `${rect.left + scrollX}px`,
        background: '#176b3a',
        color: '#fff',
        font: '11px system-ui',
        padding: '1px 4px',
        borderRadius: '3px'
      })
      overlay.appendChild(badge)
      const secret = element.type === 'password'
      elements.push({
        id,
        tag: element.tagName.toLowerCase(),
        type: element.type || undefined,
        text: String(
          element.getAttribute('aria-label') ||
            element.innerText ||
            (!secret && element.value) ||
            element.placeholder ||
            ''
        )
          .trim()
          .slice(0, 120)
      })
      if (elements.length === 80) break
    }
    document.documentElement.appendChild(overlay)
    return { success: true, title: document.title, url: location.href, elements }
  }

  function target(id) {
    const element = registry.get(Number(id))
    if (!element?.isConnected)
      throw new Error('Elemen sudah berubah. Jalankan chrome-read kembali.')
    if (element.disabled) throw new Error('Elemen sedang dinonaktifkan.')
    if (element.readOnly) throw new Error('Elemen hanya dapat dibaca.')
    return element
  }

  function askUser(id, text) {
    if (prompts.size) throw new Error('Masih ada permintaan bantuan yang aktif.')
    return new Promise((resolve) => {
      const host = document.createElement('div')
      host.dataset.markBridgeUi = 'true'
      Object.assign(host.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '2147483647'
      })
      const shadow = host.attachShadow({ mode: 'closed' })
      const style = document.createElement('style')
      style.textContent =
        ':host{all:initial}section{box-sizing:border-box;width:min(340px,calc(100vw - 32px));background:#171a18;color:#dedede;border:1px solid #414942;border-radius:10px;padding:16px;font:13px/1.6 system-ui}h2{font-size:14px;margin:0 0 8px}p{margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}footer{display:flex;gap:8px}button{font:inherit;border:1px solid #566057;border-radius:6px;padding:6px 12px;background:transparent;color:inherit;cursor:pointer}button:last-child{background:#1e8245;border-color:#1e8245}button:focus-visible{outline:2px solid #75d796;outline-offset:2px}'
      const panel = document.createElement('section')
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', 'Bantuan untuk Chrome Bridge')
      const heading = document.createElement('h2')
      heading.textContent = 'Mark membutuhkan bantuanmu'
      const message = document.createElement('p')
      message.textContent = String(text).slice(0, 2000)
      const footer = document.createElement('footer')
      for (const [label, success] of [
        ['Batal', false],
        ['Lanjutkan', true]
      ]) {
        const button = document.createElement('button')
        button.textContent = label
        button.onclick = () => {
          host.remove()
          prompts.delete(id)
          resolve(
            success ? { success: true, resumed: true } : { error: 'Bantuan dibatalkan pengguna.' }
          )
        }
        footer.appendChild(button)
      }
      panel.append(heading, message, footer)
      shadow.append(style, panel)
      document.documentElement.append(host)
      prompts.set(id, () => {
        host.remove()
        prompts.delete(id)
        resolve({ error: 'Permintaan bantuan dihentikan.' })
      })
    })
  }

  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    try {
      if (request.action === 'ping') {
        respond({ status: 'pong', version: '1.1.0' })
        return false
      }
      if (request.action === 'cancel') {
        prompts.get(request.id)?.()
        respond({ success: true })
        return false
      }
      if (request.action === 'cleanup') {
        clearBadges()
        for (const cancel of prompts.values()) cancel()
        respond({ success: true })
        return false
      }
      if (request.action === 'ask-user') {
        askUser(request.id, request.prompt).then(respond)
        return true
      }
      if (request.action === 'read') {
        respond(scan())
        return false
      }
      if (request.action === 'click') {
        const element = target(request.element_id)
        element.scrollIntoView({ block: 'center', inline: 'center' })
        element.focus()
        element.click()
        respond({ success: true, element_id: request.element_id })
        return false
      }
      if (request.action === 'type') {
        const element = target(request.element_id)
        element.scrollIntoView({ block: 'center' })
        element.focus()
        const value = String(request.text ?? '')
        if (element.isContentEditable) element.textContent = value
        else {
          const prototype =
            element instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : element instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
          if (!setter) throw new Error('Elemen ini tidak dapat diisi.')
          setter.call(element, value)
        }
        element.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertText',
            data: element.type === 'password' ? null : value
          })
        )
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
        respond({ success: true, element_id: request.element_id })
        return false
      }
      if (request.action === 'scroll') {
        window.scrollBy({ top: request.direction === 'up' ? -600 : 600, behavior: 'instant' })
        respond({ success: true, scrollY: window.scrollY })
        return false
      }
      if (request.action === 'extract') {
        if (!request.selector || typeof request.selector !== 'string')
          throw new Error('CSS selector wajib diisi.')
        const nodes = [...document.querySelectorAll(request.selector)]
        respond({
          success: true,
          count: nodes.length,
          data: nodes
            .slice(0, 80)
            .map((node) => String(node.innerText || node.textContent || '').slice(0, 4000))
        })
        return false
      }
    } catch (error) {
      respond({ error: error.message })
    }
    return false
  })
})()
