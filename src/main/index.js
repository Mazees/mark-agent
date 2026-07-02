import { app, shell, BrowserWindow, ipcMain, session, Tray, Menu, globalShortcut, nativeImage, Notification } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import { fetchTranscript } from 'youtube-transcript-plus'
import { url } from 'inspector'
import yts from 'yt-search'
import YTMusic from 'ytmusic-api'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { startTracking, getBuffer, flushBuffer } from './awareness/window-tracker.js'
// Matikan semua optimasi throttling Chromium agar webview WhatsApp tidak tertidur di hasil Build (.exe)
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const setupYoutubeFix = () => {
  // Kita cegat semua request yang pergi ke YouTube
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*'] },
    (details, callback) => {
      // Kita paksa header 'Referer' dan 'Origin' jadi localhost
      // Supaya YouTube gak tau kalau ini dateng dari file://
      details.requestHeaders['Referer'] = 'http://localhost'
      details.requestHeaders['Origin'] = 'http://localhost'
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

let mainWindow = null
let tray = null
let isQuiting = false

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // mainWindow.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    console.log('openlink: ' + details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // Sembunyikan window saat tombol close diklik (masuk tray)
  mainWindow.on('close', function (event) {
    if (!isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

// Removed old WA logic


ipcMain.on('remote-music-command', (event, command, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('execute-music-command', command, payload)
  }
})

import { fetchAI, setGlobalConfig } from './ai-bridge.js'

ipcMain.on('sync-config', (event, config) => {
  setGlobalConfig(config)
})

ipcMain.handle('ai:fetch', async (event, data) => {
  const { messages, config, isSmallTask, jsonSchema } = data
  try {
    const onStatus = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:status', msg)
      }
    }
    return await fetchAI(messages, config, isSmallTask, jsonSchema, onStatus)
  } catch (error) {
    return { error: { message: error.message, code: error.code } }
  }
})

ipcMain.on('ai:abort-fetch', () => {
  import('./ai-bridge.js').then(({ activeAbortControllers }) => {
    activeAbortControllers.forEach(controller => controller.abort(new Error('User Aborted')))
  })
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

// Gunakan folder terpisah untuk development agar terhindar dari error Cache Lock
if (is.dev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'mark-dev'))
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Jika pengguna mencoba membuka aplikasi lagi, tampilkan window yang sudah ada
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

import { startWhatsappBot, stopWhatsappBot, getConnectionStatus, logoutWhatsapp, uiMessageHistory } from './whatsapp/baileys-service.js'

ipcMain.on('wa:start', () => startWhatsappBot(mainWindow))
ipcMain.on('wa:stop', () => stopWhatsappBot())
ipcMain.handle('wa:get-status', () => getConnectionStatus())
ipcMain.handle('wa:get-history', () => uiMessageHistory)
ipcMain.handle('wa:logout', async () => await logoutWhatsapp())

import { loadPlugins, initPluginIPC } from './plugins/plugin-loader.js'

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mark.agent')
  
  // Run on startup background (Only if packaged, to avoid raw electron.exe startup)
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true
    })
  } else {
    // Bersihkan 'electron' dari startup kalau jalan di mode dev
    app.setLoginItemSettings({
      openAtLogin: false,
      openAsHidden: false
    })
  }

  // Load plugin & Inisialisasi IPC Bridge
  await loadPlugins()
  initPluginIPC()

  setupYoutubeFix()
  createWindow()
  
  // Langsung jalankan WhatsApp Bot di background secara rahasia (Tray Mode) saat aplikasi utama dibuka
  startWhatsappBot(mainWindow)

  // Setup System Tray
  // Cara paling aman dan ampuh di Windows: Ekstrak icon 16x16 langsung dari file .exe aplikasi!
  // Ini menghindari semua masalah pathing ASAR dan masalah format .ico yang rusak.
  app.getFileIcon(process.execPath, { size: 'small' }).then((exeIcon) => {
    tray = new Tray(exeIcon)
    tray.setToolTip('Mark AI Assistant')
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Buka Mark', click: () => mainWindow.show() },
      { label: 'Monitor WhatsApp', click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/whatsapp-bot') } },
      { 
        label: 'Matikan WhatsApp Bot', 
        click: () => {
          stopWhatsappBot()
        }
      },
      { 
        label: 'Ngobrol Sekarang (Live Audio)', 
        click: () => {
          mainWindow.show()
          mainWindow.webContents.send('trigger-live-audio')
        }
      },
      { type: 'separator' },
      { 
        label: 'Keluar', 
        click: () => {
          isQuiting = true
          app.quit()
        } 
      }
    ])
    tray.setContextMenu(contextMenu)
    tray.on('click', () => mainWindow.show())
  }).catch(() => {
    // Fallback jika gagal (misal saat masih mode npm run dev)
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
    tray.setToolTip('Mark AI Assistant')
  })

  // Global Shortcut (One-way)
  // Menggunakan Ctrl+Alt+M untuk menghindari bentrok dengan shortcut OS atau aplikasi lain (misal: Discord/AMD)
  globalShortcut.register('CommandOrControl+Alt+M', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.send('trigger-live-audio')
    }
  })

  // Awareness Engine IPC
  ipcMain.handle('awareness:get-buffer', () => getBuffer())
  ipcMain.on('awareness:clear-buffer', () => flushBuffer())

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: icon }).show()
    }
  })

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
      return video.map((item) => ({ url: `https://www.youtube.com/watch?v=${item.videoId}`, title: item.title, author: item.author.name }))
    } catch (error) {
      console.error('Gagal search YT:', error.message)
      return []
    }
  })

  // src/main/index.js

  ipcMain.handle('tts-speak', async (_, text, rate, pitch) => {
    try {
      const tts = new MsEdgeTTS()
      const formattedRate = `${rate || 0}%`
      const formattedPitch = `${pitch || 0}Hz`

      console.log(formattedRate)
      console.log(formattedPitch)

      await tts.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS)
      const tmpPath = path.join(app.getPath('temp'), 'mark-tts-folder')
      if (!fs.existsSync(tmpPath)) {
        fs.mkdirSync(tmpPath, { recursive: true })
      }
      const { audioFilePath } = await tts.toFile(tmpPath, text, {
        rate: formattedRate,
        pitch: formattedPitch
      })
      const audioData = fs.readFileSync(audioFilePath)
      const base64Audio = `data:audio/mp3;base64,${audioData.toString('base64')}`

      fs.unlinkSync(audioFilePath)

      return base64Audio
    } catch (error) {
      console.error('Gagal generate suara Mark:', error)
      return null
    }
  })

  let ytmusicInstance = null
  ipcMain.handle('search-music', async (event, query) => {
    try {
      if (!ytmusicInstance) {
        ytmusicInstance = new YTMusic()
        await ytmusicInstance.initialize()
      }

      const results = await ytmusicInstance.search(query)
      const validSongs = results.filter(item => item.videoId)

      return validSongs.slice(0, 5).map((song) => ({
        id: song.videoId,
        title: song.name,
        artist: song.artist?.name || 'Unknown',
        album: song.album?.name || 'Single',
        duration: song.duration,
        thumbnail: song.thumbnails?.[song.thumbnails.length - 1]?.url?.replace(/=w\d+-h\d+.*$/, '=w1080-h1080-l90-rj')?.replace(/\?sqp=.*$/, '')
      }))
    } catch (error) {
      console.error('Mark gagal mencari lagu:', error.message)
      return []
    }
  })
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Start Awareness Engine
  startTracking()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // Abaikan event ini agar aplikasi tetap hidup di background tray
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
