/**
 * Web Bridge Adapter untuk MARK WebUI.
 * Menghubungkan antarmuka React secara langsung ke Node.js Core Backend via REST API & WebSocket.
 */

const isBrowser = typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:')

export const SERVER_CONFIG = {
  host: typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost',
  port: typeof window !== 'undefined' && window.location?.port ? Number(window.location.port) || 3000 : 3000,
  apiBase: isBrowser ? window.location.origin : 'http://localhost:3000',
  wsProtocol: isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:',
  wsHost: isBrowser ? window.location.host : 'localhost:3000',
  get wsBase() {
    return `${this.wsProtocol}//${this.wsHost}/stream`
  }
}

export const SERVER_HOST = SERVER_CONFIG.host
export const SERVER_PORT = SERVER_CONFIG.port
export const API_BASE = SERVER_CONFIG.apiBase
export const WS_PROTOCOL = SERVER_CONFIG.wsProtocol
export const WS_HOST = SERVER_CONFIG.wsHost
export const WS_BASE = SERVER_CONFIG.wsBase

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
  fetchAI: async (params, signal = null) => {
    const res = await fetch(`${API_BASE}/api/ai/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: signal || undefined
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `HTTP error ${res.status}`)
      err.code = json.error?.code
      throw err
    }
    return json
  },

  fetchAIStream: async (params, signal = null) => {
    const res = await fetch(`${API_BASE}/api/ai/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: signal || undefined
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `HTTP error ${res.status}`)
      err.code = json.error?.code
      throw err
    }
    return json
  },

  onAiToken: (callback) => {
    addWebListener('ai:token', callback)
    return () => removeWebListener('ai:token', callback)
  },

  onAiMood: (callback) => {
    addWebListener('ai:mood', callback)
    return () => removeWebListener('ai:mood', callback)
  },

  onToolStatus: (callback) => {
    addWebListener('tool:status', callback)
    return () => removeWebListener('tool:status', callback)
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
    return () => removeWebListener('ai:status', callback)
  },

  onAiAbort: (callback) => {
    addWebListener('ai:abort', callback)
    return () => removeWebListener('ai:abort', callback)
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

  onDatabaseRestored: (callback) => {
    addWebListener('db:restored', callback)
    return () => removeWebListener('db:restored', callback)
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

  selectDirectory: async (description = 'Pilih Folder Workspace Proyek') => {
    try {
      const res = await webApi.executeNativeTool('select-directory', description)
      if (res && res.success && res.path) {
        return res.path
      }
      return null
    } catch (_) {
      return null
    }
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

  // 7. Pure Node.js Skills Engine
  getSkills: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/skills`)
      const json = await res.json()
      return json.data || []
    } catch (_) {
      return []
    }
  },

  getSkillTree: async (name) => {
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/tree`)
      const json = await res.json()
      return json.data || []
    } catch (_) {
      return []
    }
  },

  readSkillFile: async (name, filePath = 'SKILL.md') => {
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/file?filePath=${encodeURIComponent(filePath)}`)
      const json = await res.json()
      return json.data?.content || ''
    } catch (_) {
      return ''
    }
  },

  readSkill: async (name) => {
    return await webApi.readSkillFile(name, 'SKILL.md')
  },

  saveSkillFile: async (name, filePath, content) => {
    const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content })
    })
    return await res.json()
  },

  saveSkill: async (name, content) => {
    return await webApi.saveSkillFile(name, 'SKILL.md', content)
  },

  createSkillItem: async (name, itemPath, isFolder = false) => {
    const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemPath, isFolder })
    })
    return await res.json()
  },

  renameSkillItem: async (name, oldPath, newPath) => {
    const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath })
    })
    return await res.json()
  },

  deleteSkillItem: async (name, itemPath) => {
    const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/item`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemPath })
    })
    return await res.json()
  },

  deleteSkill: async (name) => {
    const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
    return await res.json()
  },

  installSkill: async (fileOrBuffer, overrideName = null) => {
    const body = fileOrBuffer instanceof File || fileOrBuffer instanceof Blob ? fileOrBuffer : new Blob([fileOrBuffer])
    const url = overrideName ? `${API_BASE}/api/skills/install?name=${encodeURIComponent(overrideName)}` : `${API_BASE}/api/skills/install`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body
    })
    return await res.json()
  },

  onSkillsUpdated: (cb) => {
    addWebListener('skills:updated', cb)
    return () => removeWebListener('skills:updated', cb)
  },

  // 8. Dynamic Plugins Engine
  getPlugins: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plugins`)
      const json = await res.json()
      return json.data || []
    } catch (_) {
      return []
    }
  },

  reloadPlugins: async () => {
    const res = await fetch(`${API_BASE}/api/plugins/reload`, { method: 'POST' })
    const json = await res.json()
    return json.data || []
  },

  createPlugin: async (payload) => {
    const res = await fetch(`${API_BASE}/api/plugins/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return await res.json()
  },

  togglePlugin: async (name, isEnabled) => {
    const res = await fetch(`${API_BASE}/api/plugins/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isEnabled })
    })
    return await res.json()
  },

  deletePlugin: async (name) => {
    const res = await fetch(`${API_BASE}/api/plugins/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
    return await res.json()
  },

  executePluginAction: async (action, query) => {
    const res = await fetch(`${API_BASE}/api/plugins/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, query })
    })
    return await res.json()
  },

  openPluginFolder: async () => {
    return webApi.executeNativeTool('run-powershell', 'explorer.exe "$HOME\\Documents\\Mark Plugins"')
  },

  openSpecificFolder: async (folderPath) => {
    return webApi.executeNativeTool('run-powershell', `explorer.exe "${folderPath}"`)
  },

  onPluginsUpdated: (cb) => {
    addWebListener('plugins:updated', cb)
    return () => removeWebListener('plugins:updated', cb)
  },

  // 9. Document RAG Binary Parser
  parseDocument: async (arrayBuffer, isDocx = false) => {
    const res = await fetch(`${API_BASE}/api/documents/parse?isDocx=${isDocx}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error || 'Parse error')
    return json.text
  },

  // 10. Awareness & OS Vision
  getActivityBuffer: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/awareness/activity-buffer`)
      const json = await res.json()
      return json.data || []
    } catch (_) {
      return []
    }
  },

  clearActivityBuffer: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/awareness/clear-buffer`, { method: 'POST' })
      return await res.json()
    } catch (_) {
      return { success: false }
    }
  },

  getSystemIdleSeconds: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/awareness/idle-time`)
      const json = await res.json()
      return json.idleSeconds || 0
    } catch (_) {
      return 0
    }
  },

  takeScreenshot: async () => {
    const res = await fetch(`${API_BASE}/api/os/screenshot`, { method: 'POST' })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to capture screenshot')
    return json.data
  },

  // 11. Google Workspace API
  googleStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/google/status`)
      const json = await res.json()
      return json
    } catch (_) {
      return { success: false, isConnected: false }
    }
  },
  googleConnect: async (clientId, clientSecret) => {
    const res = await fetch(`${API_BASE}/api/google/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    })
    return await res.json()
  },
  googleDisconnect: async () => {
    const res = await fetch(`${API_BASE}/api/google/disconnect`, { method: 'POST' })
    return await res.json()
  },

  // 12. Telegram Bot API & Listeners
  tgGetStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/telegram/status`)
      return await res.json()
    } catch (_) {
      return { status: 'disconnected' }
    }
  },
  tgGetHistory: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/telegram/history`)
      const json = await res.json()
      return json.data || []
    } catch (_) {
      return []
    }
  },
  tgStart: async (token) => {
    const res = await fetch(`${API_BASE}/api/telegram/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    return await res.json()
  },
  tgStop: async () => {
    const res = await fetch(`${API_BASE}/api/telegram/stop`, { method: 'POST' })
    return await res.json()
  },
  tgSendMessage: async (chatId, message) => {
    const res = await fetch(`${API_BASE}/api/telegram/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message })
    })
    return await res.json()
  },
  tgAgentExecutionDone: async (payload) => {
    const res = await fetch(`${API_BASE}/api/telegram/agent-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return await res.json()
  },
  sendTgAgentExecutionDone: async (payload) => {
    return await webApi.tgAgentExecutionDone(payload)
  },
  tgBroadcastToAdmins: async (message) => {
    const res = await fetch(`${API_BASE}/api/telegram/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
    return await res.json()
  },
  tgTakeScreenshot: async (chatId = null) => {
    const res = await fetch(`${API_BASE}/api/telegram/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    })
    return await res.json()
  },
  onTgCommandAccept: (cb) => {
    addWebListener('tg:command-accept', cb)
    return () => removeWebListener('tg:command-accept', cb)
  },
  onTgCommandAlways: (cb) => {
    addWebListener('tg:command-always', cb)
    return () => removeWebListener('tg:command-always', cb)
  },
  onTgCommandReject: (cb) => {
    addWebListener('tg:command-reject', cb)
    return () => removeWebListener('tg:command-reject', cb)
  },
  onTgConnection: (cb) => {
    addWebListener('tg:connection', cb)
    return () => removeWebListener('tg:connection', cb)
  },
  onTgThinking: (cb) => {
    addWebListener('tg:thinking', cb)
    return () => removeWebListener('tg:thinking', cb)
  },
  onTgMessage: (cb) => {
    addWebListener('tg:message', cb)
    return () => removeWebListener('tg:message', cb)
  },
  onTgReplySent: (cb) => {
    addWebListener('tg:reply-sent', cb)
    return () => removeWebListener('tg:reply-sent', cb)
  },
  onTgRequestAgentExecution: (cb) => {
    addWebListener('tg:request-agent-execution', cb)
    return () => removeWebListener('tg:request-agent-execution', cb)
  },

  // 13. Background Task Daemon API
  spawnBackgroundTask: async (taskId, command, cwd) => {
    const res = await fetch(`${API_BASE}/api/tasks/daemon/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, command, cwd })
    })
    return await res.json()
  },
  readBackgroundTaskOutput: async (taskId, lines = 40) => {
    const res = await fetch(`${API_BASE}/api/tasks/daemon/${encodeURIComponent(taskId)}/output?lines=${lines}`)
    return await res.json()
  },
  killBackgroundTask: async (taskId) => {
    const res = await fetch(`${API_BASE}/api/tasks/daemon/${encodeURIComponent(taskId)}/kill`, { method: 'POST' })
    return await res.json()
  },
  listBackgroundTasks: async () => {
    const res = await fetch(`${API_BASE}/api/tasks/daemon/list`)
    return await res.json()
  },

  // 14. Database Backup & Restore API
  exportDatabase: async () => {
    const res = await fetch(`${API_BASE}/api/db/export`)
    const json = await res.json()
    return json.data || json
  },
  restoreDatabase: async (dumpData, overwrite = true) => {
    const res = await fetch(`${API_BASE}/api/db/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dumpData, overwrite })
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Gagal memulihkan database.')
    }
    return json
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
