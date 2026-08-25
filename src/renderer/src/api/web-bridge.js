/**
 * Web Bridge Adapter untuk MARK WebUI.
 * Menghubungkan antarmuka React secara langsung ke Node.js Core Backend via REST API & WebSocket.
 */

const SERVER_HOST = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost'
const SERVER_PORT = 3000
const API_BASE = `http://${SERVER_HOST}:${SERVER_PORT}`
const WS_BASE = `ws://${SERVER_HOST}:${SERVER_PORT}/stream`

let ws = null
const listeners = new Map()

function getWebSocket() {
  if (typeof window === 'undefined') return null
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws
  }

  try {
    ws = new WebSocket(WS_BASE)

    ws.onopen = () => {
      console.log('[WebBridge] Terhubung ke WebSocket MARK Core di', WS_BASE)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { event: evtName, payload } = data

        if (evtName && listeners.has(evtName)) {
          listeners.get(evtName).forEach((cb) => {
            try {
              cb(payload)
            } catch (err) {
              console.error(`[WebBridge] Error pada listener event '${evtName}':`, err)
            }
          })
        }
      } catch (err) {
        console.error('[WebBridge] Gagal parse pesan WebSocket:', err)
      }
    }

    ws.onclose = () => {
      console.warn('[WebBridge] Koneksi WebSocket terputus. Mencoba reconnect dalam 3 detik...')
      setTimeout(getWebSocket, 3000)
    }

    ws.onerror = (err) => {
      console.error('[WebBridge] WebSocket error:', err)
    }
  } catch (err) {
    console.error('[WebBridge] Gagal membuat WebSocket:', err)
  }

  return ws
}

export function addWebListener(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event).add(callback)
  getWebSocket()
}

export function removeWebListener(event, callback) {
  if (listeners.has(event)) {
    listeners.get(event).delete(callback)
  }
}

export function removeAllWebListeners(event) {
  if (listeners.has(event)) {
    listeners.get(event).clear()
  }
}

export const webApi = {
  // 1. Health & Config
  getHealth: async () => {
    const res = await fetch(`${API_BASE}/api/health`)
    return await res.json()
  },

  getConfig: async () => {
    const res = await fetch(`${API_BASE}/api/config`)
    const json = await res.json()
    return json.data
  },

  syncConfig: async (config) => {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    const json = await res.json()
    return json.data
  },

  // 2. Chat & AI
  fetchAI: async (params) => {
    const res = await fetch(`${API_BASE}/api/ai/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `HTTP error ${res.status}`)
      err.code = json.error?.code
      throw err
    }
    return json
  },

  abortFetchAI: () => {
    const socket = getWebSocket()
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: 'ai:abort' }))
    }
    fetch(`${API_BASE}/api/ai/abort`, { method: 'POST' }).catch(() => {})
  },

  onAiStatus: (callback) => {
    addWebListener('ai:status', callback)
  },

  // 3. Audio & Voice
  textToSpeech: async (text, voice = 'id-ID-ArdiNeural') => {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice })
    })
    return await res.json()
  },

  onAudioPlay: (callback) => {
    addWebListener('audio:play', callback)
  },

  // 4. Memory API
  getMemories: async () => {
    const res = await fetch(`${API_BASE}/api/memories`)
    const json = await res.json()
    return json.data || []
  },

  saveMemory: async (item) => {
    const res = await fetch(`${API_BASE}/api/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    })
    const json = await res.json()
    return json.data
  },

  getTurns: async () => {
    const res = await fetch(`${API_BASE}/api/turns`)
    const json = await res.json()
    return json.data || []
  },

  // 5. System Notifications & Windows
  showNotification: (title, body) => {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') new Notification(title, { body })
        })
      }
    }
  },

  openExternal: (url) => {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank')
    }
  },

  // 6. Tools Execution
  executeNativeTool: async (tool, query, config) => {
    try {
      const res = await fetch(`${API_BASE}/api/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, query, config })
      })
      const json = await res.json()
      return json
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  checkToolApproval: async (tool, query) => {
    try {
      const res = await fetch(`${API_BASE}/api/tools/needs-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, query })
      })
      return await res.json()
    } catch (_) {
      return { needsApproval: false }
    }
  },

  needsApproval: async (tool, query) => {
    return webApi.checkToolApproval(tool, query)
  },

  // Browser Automation Bridges
  browserNavigate: async (url) => webApi.executeNativeTool('browser-navigate', url),
  browserReadDom: async () => webApi.executeNativeTool('browser-read-dom', ''),
  browserAction: async (data) =>
    webApi.executeNativeTool('browser-action', typeof data === 'string' ? data : JSON.stringify(data)),
  browserClose: async (sessionId = 'default') =>
    webApi.executeNativeTool(
      'browser-close',
      typeof sessionId === 'string' ? sessionId : sessionId?.sessionId || 'default'
    ),
  showBrowserWindow: async (sessionId = 'default') =>
    webApi.executeNativeTool('browser-show', typeof sessionId === 'string' ? sessionId : 'default'),
  onBrowserPreview: (cb) => {
    addWebListener('browser:preview', cb)
  },

  // Windows Desktop OS Tools Bridges
  osRead: async () => webApi.executeNativeTool('os-read', ''),
  osClick: async (query) => webApi.executeNativeTool('os-click', query),
  osType: async (query) => webApi.executeNativeTool('os-type', query),
  osKey: async (combo) => webApi.executeNativeTool('os-key', combo),
  osScroll: async (query) => webApi.executeNativeTool('os-scroll', query),
  osOpen: async (target) => webApi.executeNativeTool('os-open', target),
  osListWindows: async () => webApi.executeNativeTool('os-list-windows', ''),
  osFocusWindow: async (title) => webApi.executeNativeTool('os-focus-window', title),
  osAskUser: async (query) => webApi.executeNativeTool('os-ask', query),

  // Plugins & Skills
  getPlugins: async () => [],
  getSkills: async () => [],
  readSkill: async (name) => webApi.executeNativeTool('read-skill', name),
  saveSkill: async (name, content) => webApi.executeNativeTool('write-file', `${name}||${content}`),
  deleteSkill: async (name) => webApi.executeNativeTool('delete-file', name),
  onSkillsUpdated: (cb) => {
    addWebListener('skills:updated', cb)
    return () => removeWebListener('skills:updated', cb)
  },

  // Window Controls (WebUI App Mode)
  windowMinimize: () => {},
  windowMaximize: () => {},
  windowClose: () => {
    if (typeof window !== 'undefined') window.close()
  },
  onWindowMaximized: () => {},

  getYoutubeTranscript: async (url) => {
    const res = await webApi.executeNativeTool('youtube-transcript', url)
    return res.data || ''
  },
  searchMusic: async (query) => {
    const res = await webApi.executeNativeTool('search-youtube', query)
    return res.data || []
  }
}

// Inisialisasi otomatis WebSocket saat dimuat di browser
if (typeof window !== 'undefined') {
  window.api = { ...webApi, ...(window.api || {}) }
  getWebSocket()
}
