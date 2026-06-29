import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { app, ipcMain } from 'electron'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { clearChat } from './message-store.js'
import { handleIncomingMessage, uiMessageHistory } from './wa-flow.js'

let sock = null
let currentStatus = 'disconnected'
let qrDataUrl = null
let botWindow = null

const updateStatus = (status, qr = null) => {
  currentStatus = status
  qrDataUrl = qr
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('wa:connection', status)
    if (qr) botWindow.webContents.send('wa:qr', qr)
  }
}

export const getConnectionStatus = () => {
  return { status: currentStatus, qr: qrDataUrl }
}

export const logoutWhatsapp = async () => {
  if (sock) {
    sock.logout()
    sock = null
  }
  const authFolder = path.join(app.getPath('userData'), 'wa-auth')
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true })
  }
  updateStatus('disconnected')
}

export const stopWhatsappBot = () => {
  if (sock) {
    sock.end()
    sock = null
  }
  updateStatus('disconnected')
}

export const startWhatsappBot = async (mainWindow) => {
  botWindow = mainWindow

  // Register IPC listener for sending WA messages
  try { ipcMain.removeHandler('wa:get-history') } catch (e) {}
  ipcMain.handle('wa:get-history', () => uiMessageHistory)

  if (!ipcMain.listenerCount('wa:send-message')) {
    ipcMain.on('wa:send-message', async (event, { jid, text }) => {
      if (sock) {
        try {
          await sock.sendMessage(jid, { text })
        } catch (e) {
          console.error('[Baileys] Gagal mengirim pesan WA manual:', e)
        }
      }
    })
  }

  if (sock) return // already started

  updateStatus('connecting')

  const authFolder = path.join(app.getPath('userData'), 'wa-auth')
  let state, saveCreds
  try {
    const auth = await useMultiFileAuthState(authFolder)
    state = auth.state
    saveCreds = auth.saveCreds
  } catch (err) {
    console.error('[Baileys] Error loading auth state, wiping folder...', err)
    if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true })
    const auth = await useMultiFileAuthState(authFolder)
    state = auth.state
    saveCreds = auth.saveCreds
  }

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      const url = await qrcode.toDataURL(qr)
      updateStatus('qr', url)
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log(
        '[Baileys] Connection closed. Reconnecting:',
        shouldReconnect,
        'Reason:',
        statusCode
      )

      // MENGHAPUS INSTANCE SOCKET LAMA
      sock = null

      if (shouldReconnect) {
        updateStatus('connecting')
        // Jika karena 515 (restart required), kita bisa langsung restart
        const delayMs = statusCode === DisconnectReason.restartRequired ? 1000 : 5000
        setTimeout(() => startWhatsappBot(mainWindow), delayMs)
      } else {
        // Jika status code = loggedOut (401), hapus sesi lama biar nggak stuck
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[Baileys] Logged out. Wiping old auth data...')
          const authFolder = path.join(app.getPath('userData'), 'wa-auth')
          if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true })
        }
        updateStatus('disconnected')
      }
    } else if (connection === 'open') {
      console.log('[Baileys] Connected')
      updateStatus('connected')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    await handleIncomingMessage(messages, type, sock, botWindow)
  })
}