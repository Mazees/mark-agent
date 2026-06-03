import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url),
  searchYoutube: (query) => ipcRenderer.invoke('youtube-search', query),
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  textToSpeech: (text, rate, pitch) => ipcRenderer.invoke('tts-speak', text, rate, pitch)
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
