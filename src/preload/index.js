import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fetchAI: (params) => ipcRenderer.invoke('ai:fetch', params),
  syncConfig: (config) => ipcRenderer.send('sync-config', config),
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url),
  searchYoutube: (query) => ipcRenderer.invoke('youtube-search', query),
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  textToSpeech: (text, rate, pitch) => ipcRenderer.invoke('tts-speak', text, rate, pitch),
  onLiveAudioShortcut: (callback) => ipcRenderer.on('trigger-live-audio', () => callback()),
  removeLiveAudioShortcut: () => ipcRenderer.removeAllListeners('trigger-live-audio'),
  getPreloadPath: (filename) => {
    const path = require('path')
    const url = require('url')
    return url.pathToFileURL(path.join(__dirname, filename)).href
  },
  onWaNewMessage: undefined, // Removed
  sendWaReply: undefined, // Removed
  openWhatsappWindow: undefined, // Removed
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
  onWaAdminRequest: (cb) => ipcRenderer.on('wa:admin-request', (_, data) => cb(data)),
  sendWaMessage: (jid, text) => ipcRenderer.send('wa:send-message', { jid, text }),
  removeWaListeners: () => {
    ['wa:qr', 'wa:connection', 'wa:message', 'wa:reply-sent', 'wa:thinking', 'wa:request-web-search', 'wa:admin-request']
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
