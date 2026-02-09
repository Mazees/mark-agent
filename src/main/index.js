import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import { search } from 'duck-duck-scrape'
import puppeteer from 'puppeteer-core'

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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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

  ipcMain.handle('init-mark-internet', async (event) => {
    const markProfilePath = path.join(app.getPath('userData'), 'mark_chrome_profile')

    const browser = await puppeteer.launch({
      headless: false, // WAJIB false biar user bisa beresin setup
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        `--user-data-dir=${markProfilePath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // SET USER AGENT DI SINI (Hapus baris page.setUserAgent di bawah nanti)
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      ]
    })

    try {
      const page = await browser.newPage()
      // Pancing ke Google
      await page.goto('https://www.google.com/search?q=tes+koneksi+mark&hl=id')

      await Promise.race([
        page.waitForSelector('#search', { timeout: 0 }),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ])

      // Kasih jeda 2 detik biar cookie bener-bener tersimpan setelah captcha beres
      await new Promise((r) => setTimeout(r, 2000))

      await browser.close()
      return { success: true, message: 'Internet Mark sudah siap!' }
    } catch (e) {
      if (browser) await browser.close()
      return { success: false, message: 'Setup gagal atau ditutup paksa.' }
    }
  })

  ipcMain.handle('search-web', async (event, query) => {
    const markProfilePath = path.join(app.getPath('userData'), 'mark_chrome_profile')
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        `--user-data-dir=${markProfilePath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // SET USER AGENT DI SINI (Hapus baris page.setUserAgent di bawah nanti)
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      ]
    })

    try {
      const page = await browser.newPage()

      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`)

      // Cek Captcha secara singkat
      const isCaptcha = await page.evaluate(() => document.body.innerHTML.includes('g-recaptcha'))
      if (isCaptcha) {
        await browser.close()
        throw new Error('captcha_error')
      }

      const results = await page.evaluate(() => {
        const items = []
        const seenLinks = new Set()
        const elements = document.querySelectorAll('div.g, div.tF2Cxc, div.v7W49e')

        elements.forEach((el) => {
          const title = el.querySelector('h3')?.innerText?.trim()
          const link = el.querySelector('a')?.href
          const snippet = el
            .querySelector('div[style*="-webkit-line-clamp"], .VwiC3b')
            ?.innerText?.trim()

          if (title && link && link.includes('http') && !seenLinks.has(link)) {
            seenLinks.add(link)
            items.push({ title, link, snippet: snippet || 'No snippet' })
          }
        })

        if (items.length === 0) {
          document.querySelectorAll('h3').forEach((h3) => {
            const a = h3.closest('a')
            if (a && a.href && !seenLinks.has(a.href)) {
              seenLinks.add(a.href)
              items.push({
                title: h3.innerText?.trim(),
                link: a.href,
                snippet: 'Manual scrap'
              })
            }
          })
        }

        return items.slice(0, 10)
      })

      await browser.close()
      return results
    } catch (e) {
      if (browser) await browser.close()
      throw e
    }
  })

  ipcMain.handle('check-captcha', async () => {
    let browser = null
    try {
      const markProfilePath = path.join(app.getPath('userData'), 'mark_chrome_profile')
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
          `--user-data-dir=${markProfilePath}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // SET USER AGENT DI SINI (Hapus baris page.setUserAgent di bawah nanti)
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ]
      })
      const page = await browser.newPage()

      await page.goto(`https://www.google.com/search?q=tes+koneksi+mark&hl=id`)

      // Cek Captcha secara singkat
      const isCaptcha = await page.evaluate(() => document.body.innerHTML.includes('g-recaptcha'))
      console.log('captcha:' + isCaptcha)
      if (isCaptcha) {
        throw new Error('captcha_error')
      }
      await browser.close()
      return true
    } catch (error) {
      if (browser) await browser.close()
      return false
    }
  })

  ipcMain.handle('deep-search', async (event, links) => {
    // links adalah array of objects dari hasil search-web: [{title, link}, ...]
    const markProfilePath = path.join(app.getPath('userData'), 'mark_chrome_profile')

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        `--user-data-dir=${markProfilePath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // SET USER AGENT DI SINI (Hapus baris page.setUserAgent di bawah nanti)
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      ]
    })

    try {
      // Kita proses semua link secara barengan (Parallel)
      const topLinks = links.slice(0, 5);
      const results = await Promise.all(
        topLinks.map(async (item) => {
          const page = await browser.newPage()

          // Biar cepet: blokir gambar, css, dan font
          await page.setRequestInterception(true)
          page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort()
            else req.continue()
          })

          try {
            await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 15000 })

            const content = await page.evaluate(() => {
              // Bersihin sampah
              const unwanted = document.querySelectorAll(
                'header, footer, nav, script, style, ads, .sidebar'
              )
              unwanted.forEach((el) => el.remove())

              return Array.from(document.querySelectorAll('p'))
                .map((p) => p.innerText)
                .filter((txt) => txt.length > 50)
                .slice(0, 4) // Ambil 4 paragraf per website biar gak kebanyakan token
                .join(' ')
            })

            await page.close()
            return { source: item.title, url: item.link, text: content }
          } catch (err) {
            await page.close()
            return { source: item.title, url: item.link, text: 'Gagal ambil konten.' }
          }
        })
      )

      await browser.close()
      return results // Balikin array [{source, url, text}, ...]
    } catch (e) {
      if (browser) await browser.close()
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
