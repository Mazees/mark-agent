import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * Tauri v2 Hybrid Bridge Adapter for MARK
 * Connects React UI to Tauri Host & Node.js Native Engine
 */
export const tauriApi = {
  // --- File & Dialogs ---
  getPathForFile: (file) => file?.path || file?.name || '',
  showOpenDialog: async () => {
    try {
      return await invoke('dialog_open_file')
    } catch (e) {
      console.warn('[TauriBridge] showOpenDialog error:', e)
      return []
    }
  },
  selectDirectory: async () => {
    try {
      return await invoke('dialog_open_directory')
    } catch (e) {
      console.warn('[TauriBridge] selectDirectory error:', e)
      return null
    }
  },
  getDocumentsPath: async () => {
    try {
      return await invoke('get_documents_path')
    } catch (e) {
      return ''
    }
  },
  parseDocument: async (arrayBuffer, isDocx) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'parseDocument',
        payload: {
          data: Array.from(new Uint8Array(arrayBuffer)),
          isDocx
        }
      })
      if (res.success) return res.data
      throw new Error(res.error || 'Gagal mem-parsing dokumen')
    } catch (e) {
      console.error('[TauriBridge] parseDocument error:', e)
      throw e
    }
  },

  // --- Vector Embedding Engine (Node.js Native Bridge) ---
  generateEmbedding: async (text) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'generateEmbedding',
        payload: { text }
      })
      if (res.success && res.data?.vector) {
        return res.data.vector
      }
      return null
    } catch (e) {
      console.error('[TauriBridge] generateEmbedding error:', e)
      return null
    }
  },
  generateEmbeddingBatch: async (items) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'generateEmbeddingBatch',
        payload: { items }
      })
      if (res.success && res.data?.results) {
        return res.data.results
      }
      return []
    } catch (e) {
      console.error('[TauriBridge] generateEmbeddingBatch error:', e)
      return []
    }
  },

  // --- AI Bridge (Routed through Node.js Engine) ---
  fetchAI: async (params) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'fetchAI',
        payload: params
      })
      if (res.success) {
        return res.data
      } else {
        return { error: { message: res.error || 'Unknown AI error' } }
      }
    } catch (e) {
      console.error('[TauriBridge] fetchAI error:', e)
      return { error: { message: e?.message || String(e) } }
    }
  },
  abortFetchAI: () => {
    invoke('node_invoke', { action: 'abortFetchAI' }).catch(() => {})
  },
  onAiStatus: (callback) => {
    const unlistenPromise = listen('ai-status', (event) => callback(event.payload))
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },

  // --- Window Controls ---
  windowMinimize: () => {
    invoke('window_minimize').catch(() => {})
  },
  windowMaximize: () => {
    invoke('window_maximize').catch(() => {})
  },
  windowClose: () => {
    invoke('window_close').catch(() => {})
  },
  onWindowMaximized: (callback) => {
    const unlistenPromise = listen('window-maximized', (event) => callback(event.payload))
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },

  // --- Config & Lifecycle ---
  syncConfig: (config) => {
    invoke('sync_config', { config }).catch(() => {})
    invoke('node_invoke', { action: 'syncConfig', payload: { config } }).catch(() => {})
  },
  openExternal: (url) => {
    invoke('open_external', { url }).catch(() => {})
  },
  showNotification: (title, body) => {
    invoke('show_notification', { title, body }).catch(() => {})
  },

  // --- Native OS Tools (100% Executed in Node.js Engine) ---
  executeNativeTool: async (toolName, query, config) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName, query, config }
      })
      return res
    } catch (err) {
      return { success: false, error: err?.message || String(err) }
    }
  },
  checkToolApproval: async (toolName, query) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'checkToolApproval',
        payload: { toolName, query }
      })
      return res.data || { needsApproval: false, message: null }
    } catch (e) {
      return { needsApproval: false, message: null }
    }
  },
  runNodeFunction: async (data) => {
    try {
      return await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'run-powershell', query: data }
      })
    } catch (e) {
      return `Error: ${e.message}`
    }
  },

  // --- Awareness Engine ---
  getActivityBuffer: async () => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'os-read', query: '' }
      })
      return res.data || []
    } catch (e) {
      return []
    }
  },
  clearActivityBuffer: () => {},
  takeScreenshot: async () => {
    try {
      return await invoke('take_screenshot')
    } catch (e) {
      return []
    }
  },

  // --- Voice, Audio & Shortcuts ---
  onLiveAudioShortcut: (callback) => {
    const unlistenPromise = listen('trigger-live-audio', (event) => callback(null, event.payload))
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },
  removeLiveAudioShortcut: () => {},
  textToSpeech: async (text, rate, pitch) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'tts-speak', query: `${text}||${rate}||${pitch}` }
      })
      return res.data
    } catch (e) {
      return null
    }
  },

  // --- YouTube & Media ---
  getYoutubeTranscript: async (url) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'youtube-transcript', query: url }
      })
      return res.data || ''
    } catch (e) {
      return ''
    }
  },
  searchYoutube: async (query) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'youtube-search', query }
      })
      return res.data || []
    } catch (e) {
      return []
    }
  },
  searchMusic: async (query) => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'search-music', query }
      })
      return res.data || []
    } catch (e) {
      return []
    }
  },
  sendRemoteMusicCommand: (command, payload) => {},
  onExecuteMusicCommand: (callback) => {
    const unlistenPromise = listen('execute-music-command', (event) => {
      callback(event.payload?.command, event.payload?.data)
    })
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },
  onExecuteMusicCommandTg: (callback) => {
    const unlistenPromise = listen('execute-music-command-tg', (event) => {
      callback(event.payload?.command, event.payload?.data)
    })
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },

  // --- Multi-Session Browser Automation ---
  browserNavigate: async (url, sessionId = 'default') => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'browser-navigate', query: url, config: { sessionId } }
      })
      return res.data
    } catch (e) {
      return `[ERROR] ${e.message}`
    }
  },
  browserReadDom: async (sessionId = 'default') => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'browser-read', query: '', config: { sessionId } }
      })
      return res.data
    } catch (e) {
      return `[ERROR] ${e.message}`
    }
  },
  browserAction: async (data, sessionId = 'default') => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: {
          toolName: 'browser-action',
          query: typeof data === 'string' ? data : JSON.stringify(data),
          config: { sessionId }
        }
      })
      return res.data
    } catch (e) {
      return `[ERROR] ${e.message}`
    }
  },
  browserClose: async (sessionId = 'default') => {
    try {
      const res = await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'browser-close', query: sessionId, config: { sessionId } }
      })
      return res.data
    } catch (e) {
      return false
    }
  },
  onBrowserPreview: (cb) => {
    const unlistenPromise = listen('browser-preview', (event) => cb(event.payload))
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },
  showBrowserWindow: async (sessionId = 'default') => {
    try {
      await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'browser-show', query: sessionId, config: { sessionId } }
      })
    } catch (e) {}
  },
  hideBrowserWindow: async (sessionId = 'default') => {
    try {
      await invoke('node_invoke', {
        action: 'executeNativeTool',
        payload: { toolName: 'browser-hide', query: sessionId, config: { sessionId } }
      })
    } catch (e) {}
  },

  // --- PC Automation (Win32 / PowerShell Daemon) ---
  osRead: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-read', query: '' } })
    return res.data
  },
  osClick: async (query) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-click', query } })
    return res.data
  },
  osType: async (query) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-type', query } })
    return res.data
  },
  osKey: async (combo) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-key', query: combo } })
    return res.data
  },
  osScroll: async (query) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-scroll', query } })
    return res.data
  },
  osOpen: async (target) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-open', query: target } })
    return res.data
  },
  osListWindows: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-list-windows', query: '' } })
    return res.data
  },
  osFocusWindow: async (title) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-focus-window', query: title } })
    return res.data
  },
  osAskUser: async (query) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'os-ask-user', query } })
    return res.data
  },

  // --- Skills System ---
  getSkills: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'get-skills', query: '' } })
    return res.data || []
  },
  readSkill: async (name) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'read-skill', query: name } })
    return res.data
  },
  saveSkill: async (name, content) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'save-skill', query: `${name}||${content}` } })
    return res.data
  },
  deleteSkill: async (name) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'delete-skill', query: name } })
    return res.data
  },
  installSkill: async (sourcePath) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'install-skill', query: sourcePath } })
    return res.data
  },
  getSkillTree: async (name) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'get-skill-tree', query: name } })
    return res.data
  },
  readSkillFile: async (name, relativePath) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'read-skill-file', query: `${name}||${relativePath}` } })
    return res.data
  },
  saveSkillFile: async (name, relativePath, content) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'save-skill-file', query: `${name}||${relativePath}||${content}` } })
    return res.data
  },
  createSkillItem: async (name, relativePath, isFolder) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'create-skill-item', query: `${name}||${relativePath}||${isFolder}` } })
    return res.data
  },
  deleteSkillItem: async (name, relativePath) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'delete-skill-item', query: `${name}||${relativePath}` } })
    return res.data
  },
  renameSkillItem: async (name, oldPath, newPath) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'rename-skill-item', query: `${name}||${oldPath}||${newPath}` } })
    return res.data
  },
  onSkillsUpdated: (callback) => {
    const unlistenPromise = listen('skills-updated', () => callback())
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  },

  // --- Plugins System ---
  getPlugins: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'get-plugins', query: '' } })
    return res.data || []
  },
  executePlugin: async (action, query) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'execute-plugin', query: `${action}||${query}` } })
    return res.data
  },
  openPluginFolder: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'open-plugin-folder', query: '' } })
    return res.data
  },
  openSpecificFolder: async (path) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'open-specific-folder', query: path } })
    return res.data
  },
  reloadPlugins: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'reload-plugins', query: '' } })
    return res.data
  },
  createPlugin: async (payload) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'create-plugin', query: JSON.stringify(payload) } })
    return res.data
  },
  togglePlugin: async (name, isEnabled) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'toggle-plugin', query: `${name}||${isEnabled}` } })
    return res.data
  },
  deletePlugin: async (name) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'delete-plugin', query: name } })
    return res.data
  },

  // --- Telegram Bot ---
  tgStart: (token) => invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-start', query: token } }),
  tgStop: () => invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-stop', query: '' } }),
  tgGetStatus: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-status', query: '' } })
    return res.data || { status: 'disconnected' }
  },
  tgGetHistory: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-history', query: '' } })
    return res.data || []
  },
  tgSendMessage: async (chatId, text) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-send', query: `${chatId}||${text}` } })
    return res.data
  },
  tgBroadcastToAdmins: (text) => invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-broadcast', query: text } }),
  sendTgAgentExecutionDone: (data) => invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'tg-agent-done', query: JSON.stringify(data) } }),
  tgTakeScreenshot: (chatId) => {},
  tgDownloadMusic: (chatId, query) => {},
  tgPlayMusicUi: (command, query) => {},
  onTgConnection: (cb) => {
    const u = listen('tg-connection', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgMessage: (cb) => {
    const u = listen('tg-message', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgReplySent: (cb) => {
    const u = listen('tg-reply-sent', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgThinking: (cb) => {
    const u = listen('tg-thinking', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgRequestAgentExecution: (cb) => {
    const u = listen('tg-request-agent-execution', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgCommandAccept: (cb) => {
    const u = listen('tg-command-accept', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgCommandAlways: (cb) => {
    const u = listen('tg-command-always', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  onTgCommandReject: (cb) => {
    const u = listen('tg-command-reject', (e) => cb(e.payload))
    return () => u.then((fn) => fn())
  },
  removeTgListeners: () => {},

  // --- Google Workspace ---
  googleConnect: async (clientId, clientSecret) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'google-connect', query: `${clientId}||${clientSecret}` } })
    return res.data
  },
  googleDisconnect: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'google-disconnect', query: '' } })
    return res.data
  },
  googleStatus: async () => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'google-status', query: '' } })
    return res.data || { isConnected: false }
  },

  // --- Workspace RAG & .mark/ Engine ---
  workspaceIndex: async (workspaceRoot) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'workspace-index', query: workspaceRoot } })
    return res.data
  },
  workspaceQuery: async (workspaceRoot, queryText, topK = 4) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'workspace-query', query: `${workspaceRoot}||${queryText}||${topK}` } })
    return res.data
  },
  workspaceGetMemory: async (workspaceRoot) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'workspace-get-memory', query: workspaceRoot } })
    return res.data
  },
  workspaceSaveMemory: async (workspaceRoot, memoryData) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'workspace-save-memory', query: `${workspaceRoot}||${JSON.stringify(memoryData)}` } })
    return res.data
  },
  workspaceEnsure: async (workspaceRoot) => {
    const res = await invoke('node_invoke', { action: 'executeNativeTool', payload: { toolName: 'workspace-ensure', query: workspaceRoot } })
    return res.data
  }
}

// Auto-detect environment
if (typeof window !== 'undefined') {
  if (window.__TAURI_INTERNALS__ || !window.api) {
    window.api = tauriApi
  }
}
