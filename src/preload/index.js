import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fetchAI: (params) => ipcRenderer.invoke('ai:fetch', params),
  abortFetchAI: () => ipcRenderer.send('ai:abort-fetch'),
  syncConfig: (config) => ipcRenderer.send('sync-config', config),
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  getActivityBuffer: () => ipcRenderer.invoke('awareness:get-buffer'),
  clearActivityBuffer: () => ipcRenderer.send('awareness:clear-buffer'),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url),
  searchYoutube: (query) => ipcRenderer.invoke('youtube-search', query),
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  textToSpeech: (text, rate, pitch) => ipcRenderer.invoke('tts-speak', text, rate, pitch),
  onAiStatus: (callback) => {
    ipcRenderer.removeAllListeners('ai:status')
    ipcRenderer.on('ai:status', (event, message) => callback(message))
  },
  onLiveAudioShortcut: (callback) => ipcRenderer.on('trigger-live-audio', () => callback()),
  removeLiveAudioShortcut: () => ipcRenderer.removeAllListeners('trigger-live-audio'),
  getPreloadPath: (filename) => {
    const path = require('path')
    const url = require('url')
    return url.pathToFileURL(path.join(__dirname, filename)).href
  },
  sendRemoteMusicCommand: (command, payload) => ipcRenderer.send('remote-music-command', command, payload),
  onExecuteMusicCommand: (callback) => {
    ipcRenderer.removeAllListeners('execute-music-command')
    ipcRenderer.on('execute-music-command', (event, command, payload) => callback(command, payload))
  },
  onExecuteMusicCommandWa: (callback) => {
    ipcRenderer.removeAllListeners('execute-music-command-wa')
    ipcRenderer.on('execute-music-command-wa', (event, command, payload) => callback(command, payload))
  },
  sendWaReady: undefined, // Removed
  waStart: () => ipcRenderer.send('wa:start'),
  waStop: () => ipcRenderer.send('wa:stop'),
  waGetStatus: () => ipcRenderer.invoke('wa:get-status'),
  waGetHistory: () => ipcRenderer.invoke('wa:get-history'),
  waLogout: () => ipcRenderer.invoke('wa:logout'),
  onWaQr: (cb) => ipcRenderer.on('wa:qr', (_, data) => cb(data)),
  onWaConnection: (cb) => ipcRenderer.on('wa:connection', (_, status) => cb(status)),
  onWaMessage: (cb) => ipcRenderer.on('wa:message', (_, data) => cb(data)),
  onWaReplySent: (cb) => ipcRenderer.on('wa:reply-sent', (_, data) => cb(data)),
  onWaThinking: (cb) => ipcRenderer.on('wa:thinking', (_, data) => cb(data)),
  onWaRequestWebSearch: (cb) => ipcRenderer.on('wa:request-web-search', (_, data) => cb(data)),
  sendWaSearchResult: (id, result) => ipcRenderer.send('wa:web-search-result', { id, result }),
  onWaAdminRequest: (cb) => {
    ipcRenderer.removeAllListeners('wa:admin-request')
    ipcRenderer.on('wa:admin-request', (_, data) => cb(data))
  },
  onWaRequestAgentExecution: (cb) => {
    ipcRenderer.removeAllListeners('wa:request-agent-execution')
    ipcRenderer.on('wa:request-agent-execution', (_, data) => cb(data))
  },
  sendWaAgentExecutionDone: (data) => ipcRenderer.send('wa:agent-execution-done', data),
  sendWaMessage: (jid, text) => ipcRenderer.invoke('wa:send-message', { jid, text }),
  
  // RAG Parsing
  parseDocument: (arrayBuffer, isDocx) => ipcRenderer.invoke('parse-document', arrayBuffer, isDocx),

  waTakeScreenshot: (jid, msgId) => ipcRenderer.send('wa:trigger-screenshot', { jid, msgId }),
  waDownloadMusic: (jid, msgId, query) => ipcRenderer.send('wa:trigger-music-download', { jid, msgId, query }),
  waPlayMusicUi: (command, query) => ipcRenderer.send('wa:trigger-music-ui', { command, query }),
  getPlugins: () => ipcRenderer.invoke('plugin:get-list'),
  executeNativeTool: (toolName, query) => ipcRenderer.invoke('native-tool:execute', toolName, query),
  checkToolApproval: (toolName, query) => ipcRenderer.invoke('native-tool:needs-approval', toolName, query),
  executePlugin: (action, query) => ipcRenderer.invoke('plugin:execute', action, query),
  openPluginFolder: () => ipcRenderer.invoke('plugin:open-folder'),
  openSpecificFolder: (path) => ipcRenderer.invoke('plugin:open-specific-folder', path),
  reloadPlugins: () => ipcRenderer.invoke('plugin:reload'),
  createPlugin: (payload) => ipcRenderer.invoke('plugin:create', payload),
  togglePlugin: (name, isEnabled) => ipcRenderer.invoke('plugin:toggle', name, isEnabled),
  deletePlugin: (name) => ipcRenderer.invoke('plugin:delete', name),
  removeWaListeners: () => {
    ['wa:qr', 'wa:connection', 'wa:message', 'wa:reply-sent', 'wa:thinking', 'wa:request-web-search', 'wa:admin-request', 'wa:request-agent-execution']
      .forEach(ch => ipcRenderer.removeAllListeners(ch))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
