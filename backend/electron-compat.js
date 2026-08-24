import path from 'path'
import os from 'os'

// Redirect console.log and console.info to stderr when running in standalone Node / Tauri backend
if (typeof process !== 'undefined' && (!process.versions || !process.versions.electron)) {
  console.log = (...args) => console.error('[LOG]', ...args)
  console.info = (...args) => console.error('[INFO]', ...args)
}

// Safe electron compatibility shim for standalone Node.js and Tauri runtimes
let electron = null
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  try {
    const pkg = await import('electron')
    electron = pkg.default || pkg
  } catch (e) {}
}

export const app = electron?.app || {
  isPackaged: false,
  getPath: (name) => {
    if (name === 'userData') return path.join(os.homedir(), 'AppData', 'Roaming', 'mark')
    if (name === 'documents') return path.join(os.homedir(), 'Documents')
    if (name === 'temp') return os.tmpdir()
    return os.homedir()
  },
  setAppUserModelId: () => {},
  setLoginItemSettings: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => process.exit(0),
  whenReady: async () => {}
}

export const ipcMain = electron?.ipcMain || {
  handle: () => {},
  on: () => {},
  send: () => {},
  removeAllListeners: () => {},
  removeListener: () => {},
  removeHandler: () => {},
  emit: () => {}
}

export const BrowserWindow = electron?.BrowserWindow || class MockBrowserWindow {
  constructor() {}
  loadURL() {}
  loadFile() {}
  show() {}
  hide() {}
  close() {}
  isDestroyed() { return false }
  webContents = { send: () => {}, on: () => {}, setWindowOpenHandler: () => {}, removeAllListeners: () => {} }
}

export const screen = electron?.screen || {
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
}

export const globalShortcut = electron?.globalShortcut || {
  register: () => true,
  unregisterAll: () => {}
}

export const shell = electron?.shell || {
  openExternal: () => {},
  openPath: () => {}
}

export const dialog = electron?.dialog || {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}

export const powerMonitor = electron?.powerMonitor || {
  getSystemIdleTime: () => 0
}

export const desktopCapturer = electron?.desktopCapturer || {
  getSources: async () => []
}

export default electron
