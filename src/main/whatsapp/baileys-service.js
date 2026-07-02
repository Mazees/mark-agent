import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser
} from '@whiskeysockets/baileys'
import { app, ipcMain, Notification } from 'electron'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { sendScreenshotToWA } from './screenshot.js'
import { downloadAndSendMusicWA } from './media-downloader.js'
import { getGlobalConfig } from '../ai-bridge.js'

let sock = null
let currentStatus = 'disconnected'
let qrDataUrl = null
let botWindow = null
const contactCache = {}
export const uiMessageHistory = []
const MAX_UI_HISTORY = 100

const messageStoreMap = new Map()

const updateStatus = (status, qr = null) => {
  currentStatus = status
  qrDataUrl = qr
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('wa:connection', status)
    if (qr) botWindow.webContents.send('wa:qr', qr)
  }
}

export const safeSendMessage = async (jid, content, options = {}, retries = 6) => {
  for (let i = 0; i < retries; i++) {
    if (!sock || currentStatus !== 'connected') {
      console.log(`[Baileys] Socket belum ready (Status: ${currentStatus}). Menunggu 2 detik... (${i+1}/${retries})`)
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    try {
      return await sock.sendMessage(jid, content, options)
    } catch (err) {
      console.log(`[Baileys] Retry send message ${i+1}/${retries} due to:`, err.message || err)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.error('[Baileys] Gagal mengirim pesan setelah maksimal percobaan.')
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

const handleIncomingMessage = async (messages, type) => {
  if (type !== 'notify') return

  for (const msg of messages) {
    if (!msg.message) continue
    const jid = msg.key.remoteJid
    if (jid === 'status@broadcast') continue
    if (msg.key.fromMe) continue

    messageStoreMap.set(msg.key.id, msg)
    setTimeout(() => messageStoreMap.delete(msg.key.id), 300000) // 5 minutes

    const isGroup = jid.endsWith('@g.us')
    const senderJid = isGroup ? msg.key.participant : jid
    const senderName = msg.pushName || msg.key.participant || jid

    if (msg.pushName && senderJid) {
      contactCache[senderJid] = msg.pushName
    }

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
    const quotedText =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
      null

    const uiMsgPayload = {
      id: msg.key.id,
      jid: jid,
      sender: senderName,
      text: text || '[Media]',
      quotedText: quotedText,
      isGroup,
      chatTitle: isGroup
        ? (await sock.groupMetadata(jid).catch(() => ({ subject: jid }))).subject
        : senderName,
      time: new Date(msg.messageTimestamp * 1000).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      type: 'incoming'
    }

    uiMessageHistory.push(uiMsgPayload)
    if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

    if (botWindow && !botWindow.isDestroyed()) {
      botWindow.webContents.send('wa:message', uiMsgPayload)
    }

    let senderNumber
    let rawSenderJid = isGroup ? msg.key.participant : msg.key.remoteJid

    if (rawSenderJid && rawSenderJid.includes('@lid')) {
      const phoneNumber = msg.participant || msg.senderPhoneNumber || rawSenderJid
      senderNumber = jidNormalizedUser(phoneNumber).split('@')[0]
    } else {
      senderNumber = jidNormalizedUser(rawSenderJid).split('@')[0]
    }

    const cmd = text.trim().toLowerCase()
    if (cmd === '/register' || cmd === '/registrasi') {
      const reqText = `⏳ Permintaan akses Admin atas nama *${senderName}* telah dikirim ke layar komputer. Mohon tunggu persetujuan Owner.`
      await safeSendMessage(jid, { text: reqText }, { quoted: msg })

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('wa:admin-request', {
          id: senderNumber,
          name: senderName,
          jid: jid,
          timestamp: Date.now()
        })
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Mark WhatsApp',
            body: `Permintaan akses Admin baru dari ${senderName}! Klik untuk menyetujui.`
          })
          notif.on('click', () => {
            if (botWindow) {
              botWindow.show()
              botWindow.webContents.send('route-to-config')
            }
          })
          notif.show()
        }
      }
      continue
    }

    if (!text) continue

    if (isGroup) {
      const myPn = sock.user?.id?.split(':')[0] || sock.authState?.creds?.me?.id?.split(':')[0]
      const myLid = sock.user?.lid?.split(':')[0] || sock.authState?.creds?.me?.lid?.split(':')[0]
      const botJid = myPn ? myPn + '@s.whatsapp.net' : ''
      const botLid = myLid ? myLid + '@lid' : ''
      const mentionedJidList = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      const isMentioned =
        mentionedJidList.includes(botJid) || (botLid && mentionedJidList.includes(botLid))
      const lowerText = text.toLowerCase()
      const isCalled =
        lowerText.includes('mark') || lowerText.includes('@mark') || lowerText.includes('bot')
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant || null
      const isReplyToBot = quotedParticipant === botJid || (botLid && quotedParticipant === botLid)

      if (!isMentioned && !isCalled && !isReplyToBot) continue
    }

    await processMessage(msg, isGroup, senderName, text, jid, senderNumber)
  }
}

const processMessage = async (msg, isGroup, senderName, text, jid, senderNumber) => {
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('wa:thinking', { sender: senderName, isGroup, jid })
  }

  try {
    const myLid = sock.user?.lid?.split(':')[0] || sock.authState?.creds?.me?.lid?.split(':')[0]
    const myPn = sock.user?.id?.split(':')[0] || sock.authState?.creds?.me?.id?.split(':')[0]

    if (myLid && myPn && senderNumber === myLid) {
      senderNumber = myPn
    }

    const config = getGlobalConfig()
    const adminNumbers = (config.waAdminNumber || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    const isAdmin = adminNumbers.includes(senderNumber)

    let processedText = text
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    for (const mJid of mentionedJids) {
      const num = mJid.split('@')[0]
      const cachedName = contactCache[mJid]
      if (cachedName) {
        processedText = processedText.replace(new RegExp(`@${num}`, 'g'), `@${cachedName}`)
      }
    }

    try {
      await new Promise((r) => setTimeout(r, 500))
      await sock.readMessages([msg.key])
      // Dihapus sendPresenceUpdate('composing') dari sini biar WA nggak timeout nungguin AI kelamaan!
    } catch (readErr) {
      console.log('[Baileys] Gagal read pesan:', readErr.message)
    }

    const recentHistory = uiMessageHistory
      .filter(m => m.jid === jid)
      .slice(-10)
      .map(m => ({
        role: m.type === 'incoming' ? 'user' : 'assistant',
        content: m.type === 'incoming' ? m.text : m.reply
      }))

    if (botWindow && !botWindow.isDestroyed()) {
      botWindow.webContents.send('wa:request-agent-execution', {
        text: processedText,
        isAdmin,
        senderName,
        msgId: msg.key.id,
        jid,
        isGroup,
        chatSession: recentHistory
      })
    }
  } catch (err) {
    console.error('Error processing message:', err)
  }
}

export const startWhatsappBot = async (mainWindow) => {
  botWindow = mainWindow
  const authFolder = path.join(app.getPath('userData'), 'wa-auth')
  const { state, saveCreds } = await useMultiFileAuthState(authFolder)

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    keepAliveIntervalMs: 25000, // Ping server setiap 25 detik biar koneksi nggak diputus sepihak sama WA
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    markOnlineOnConnect: true // Paksa bot selalu terlihat online pas connect
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      const qrDataUrl = await qrcode.toDataURL(qr)
      updateStatus('qr', qrDataUrl)
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      updateStatus('disconnected')

      if (shouldReconnect) {
        updateStatus('connecting')
        const delayMs = statusCode === DisconnectReason.restartRequired ? 1000 : 5000
        setTimeout(() => startWhatsappBot(mainWindow), delayMs)
      } else {
        sock = null
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true })
        }
      }
    } else if (connection === 'open') {
      updateStatus('connected')
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    await handleIncomingMessage(m.messages, m.type)
  })
}

// IPC Handlers
ipcMain.removeAllListeners('wa:agent-execution-done')
ipcMain.on('wa:agent-execution-done', async (event, data) => {
  const { jid, result, msgId } = data
  const msg = messageStoreMap.get(msgId)
  if (!msg) console.warn(`[Baileys] Warning: msgId ${msgId} not found in map, reply will not be quoted.`)

  let replyText = result?.answer || "Selesai diproses."
  
  // Baru kirim status 'composing' (ngetik) di sini, biar aman dan nggak kena timeout dari WhatsApp!
  if (sock) await sock.sendPresenceUpdate('composing', jid).catch(() => {})

  // Kurangi delay ngetik jadi maksimal 1.5 detik biar nggak kelamaan
  const typingSpeed = 10
  const delayNgetik = Math.min(replyText.length * typingSpeed, 1500)
  await new Promise((r) => setTimeout(r, delayNgetik))
  
  // Update UI SEBELUM ngirim pesan, biar di PC kerasa instan!
  const isGroup = jid.endsWith('@g.us')
  const chatTitle = isGroup
    ? (await sock?.groupMetadata(jid).catch(() => ({ subject: jid }))).subject
    : 'Chat'
  const originalText = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ''

  const uiReplyPayload = {
    id: Date.now(),
    jid: jid,
    sender: 'Mark',
    text: originalText,
    reply: replyText,
    isGroup,
    chatTitle,
    toolsUsed: result?.toolsUsed || [],
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    type: 'outgoing'
  }
  uiMessageHistory.push(uiReplyPayload)
  if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('wa:reply-sent', uiReplyPayload)
  }

  // Baru deh kirim via WA (kalau error 1006 tetep aman karena UI udah ke-update)
  await safeSendMessage(jid, { text: replyText }, msg ? { quoted: msg } : undefined)
  if (sock) await sock.sendPresenceUpdate('paused', jid).catch(() => {})
})

ipcMain.removeAllListeners('wa:send-message')
ipcMain.on('wa:send-message', async (event, { jid, text }) => {
  await safeSendMessage(jid, { text })
})

ipcMain.removeAllListeners('wa:trigger-screenshot')
ipcMain.on('wa:trigger-screenshot', async (event, { jid, msgId }) => {
  const msg = messageStoreMap.get(msgId)
  if (!sock || !msg) return
  const replyText = await sendScreenshotToWA(sock, jid, msg)
  await safeSendMessage(jid, { text: replyText }, { quoted: msg })
})

ipcMain.removeAllListeners('wa:trigger-music-download')
ipcMain.on('wa:trigger-music-download', async (event, { jid, msgId, query }) => {
  const msg = messageStoreMap.get(msgId)
  if (!sock || !msg) return
  await downloadAndSendMusicWA(sock, jid, msg, query)
})

ipcMain.removeAllListeners('wa:trigger-music-ui')
ipcMain.on('wa:trigger-music-ui', (event, { command, query }) => {
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('execute-music-command-wa', command, query)
  }
})
