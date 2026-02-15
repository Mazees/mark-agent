import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import { fetchTranscript } from 'youtube-transcript-plus'
import { url } from 'inspector'
import yts from 'yt-search'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    console.log('openlink: ' + url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Cari IPv4 dan pastikan bukan internal (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('execute-node-task', async (event, data) => {
    // Jalankan kode Node.js di sini (misal: baca file, akses DB)
    console.log('Menerima data dari UI:', data)
    return `Berhasil memproses: ${data}`
  })

  ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url)
  })

  ipcMain.handle('get-youtube-transcript', async (event, url) => {
    try {
      const transcript = await fetchTranscript(url)
      const textTranscript = transcript
        .filter((_, index) => index % 2 === 0)
        .map((item) => {
          const minutes = Math.floor(item.offset / 60)
            .toString()
            .padStart(2, '0')
          const seconds = Math.floor(item.offset % 60)
            .toString()
            .padStart(2, '0')
          return `[${minutes}:${seconds}] ${item.text}`
        })
        .join('\n')
      return textTranscript
    } catch (error) {
      console.error('Gagal ambil transkrip YT:', error.message)
      return ''
    }
  })

  ipcMain.handle('youtube-search', async (event, query) => {
    try {
      const ytData = await yts(query)
      const video = ytData.videos.slice(0, 4)
      return video.map((items) => items.videoId)
    } catch (error) {
      console.error('Gagal search YT:', error.message)
      return []
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
