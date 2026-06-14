import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
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
  onWaNewMessage: (callback) => ipcRenderer.on('wa-new-message-forward', (event, data) => callback(data)),
  sendWaReply: (text) => ipcRenderer.send('wa-send-reply', text),
  openWhatsappWindow: () => ipcRenderer.send('open-whatsapp-window'),
  sendRemoteMusicCommand: (command, payload) => ipcRenderer.send('remote-music-command', command, payload),
  onExecuteMusicCommand: (callback) => ipcRenderer.on('execute-music-command', (event, command, payload) => callback(command, payload)),
  sendWaReady: () => ipcRenderer.send('wa-ready-to-hide')
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
