import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  searchWeb: (query) => ipcRenderer.invoke('search-web', query),
  deepSearch: (links) => ipcRenderer.invoke('deep-search', links),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url)
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
