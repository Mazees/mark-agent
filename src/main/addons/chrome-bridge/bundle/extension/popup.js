/* global chrome */
const element = (id) => document.getElementById(id)
let busy = false
let latest = null

function render(state) {
  latest = state
  const label = !state.connected
    ? 'Menunggu Mark'
    : !state.tab
      ? 'Pilih tab'
      : state.paused
        ? 'Dijeda'
        : 'Terhubung'
  element('status').textContent = label
  element('status').dataset.state =
    state.connected && state.tab ? (state.paused ? 'paused' : 'connected') : 'waiting'
  element('tab-title').textContent = state.tab?.title || 'Belum ada tab'
  let domain = 'Pilih satu tab untuk dikendalikan.'
  try {
    domain = new URL(state.tab.url).host
  } catch {
    /* Belum ada tab pilihan. */
  }
  element('tab-domain').textContent = domain
  element('error').textContent = state.error || ''
  element('error').hidden = !state.error
  element('select').disabled = busy || !state.connected
  element('pause').disabled = busy || !state.connected || !state.tab
  element('disconnect').disabled = busy || !state.tab
  element('reconnect').disabled = busy
  element('pause').textContent = state.paused ? 'Lanjutkan' : 'Jeda'
}

async function command(type, extra = {}) {
  busy = true
  if (latest) render(latest)
  try {
    const response = await chrome.runtime.sendMessage({ type, ...extra })
    if (!response?.success)
      throw new Error(response?.error || 'Service worker belum siap. Coba hubungkan ulang.')
    latest = response.state
  } catch (error) {
    latest = { ...(latest || {}), error: error.message }
  } finally {
    busy = false
    render(latest)
  }
}

element('select').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) await command('select-tab', { tabId: tab.id })
})
for (const id of ['pause', 'disconnect', 'reconnect'])
  element(id).addEventListener('click', () => command(id))
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'chrome-bridge:state') render(message.state)
})
command('get-status')
