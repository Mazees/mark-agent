import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
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
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mark.agent')
  setupYoutubeFix()
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

  // src/main/index.js

  ipcMain.handle('tts-speak', async (_, text) => {
    try {
      const tts = new MsEdgeTTS()
      await tts.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS)
      const tmpPath = './tts-folder'
      if (!fs.existsSync(tmpPath)) {
        fs.mkdirSync(tmpPath, { recursive: true })
      }
      const { audioFilePath } = await tts.toFile(tmpPath, text, { rate: 1.5, pitch: '+15Hz' })
      const audioData = fs.readFileSync(audioFilePath)
      const base64Audio = `data:audio/mp3;base64,${audioData.toString('base64')}`

      // 4. (Optional) Hapus filenya setelah dibaca biar gak menuhin disk
      fs.unlinkSync(audioFilePath)

      return base64Audio
    } catch (error) {
      console.error('Gagal generate suara Mark:', error)
      return null
    }
  })

  ipcMain.handle('search-music', async (event, query) => {
    try {
      const ytmusic = new YTMusic()
      await ytmusic.initialize()

      const songs = await ytmusic.searchSongs(query)

      return songs.slice(0, 5).map((song) => ({
        id: song.videoId,
        title: song.name,
        artist: song.artist.name,
        album: song.album?.name || 'Single',
        duration: song.duration,
        thumbnail: song.thumbnails[song.thumbnails.length - 1].url
      }))
    } catch (error) {
      console.error('Mark gagal mencari lagu:', error.message)
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
