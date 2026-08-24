import { Telegraf, Input } from 'telegraf'
import { app, ipcMain, desktopCapturer } from '../electron-compat.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import yts from 'yt-search'
import { execFile } from 'child_process'
import ffmpeg from 'ffmpeg-static'
import { getGlobalConfig, abortAllFetches, activeAbortControllers } from '../ai-bridge.js'

let bot = null
let currentStatus = 'disconnected'
let botWindow = null
export const uiMessageHistory = []
const MAX_UI_HISTORY = 100
const pendingRequestsMap = new Map()


export const getConnectionStatus = () => {
  return { status: currentStatus }
}

export const stopTelegramBot = () => {
  if (bot) {
    try {
      bot.stop('BOT_STOPPED')
    } catch (e) {
      console.error('[Telegram] Error stopping bot:', e)
    }
    bot = null
  }
  updateStatus('disconnected')
}

import https from 'https'

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  rejectUnauthorized: false
})

export const startTelegramBot = async (token, mainWindow) => {
  if (!token || !token.trim()) {
    console.error('[Telegram] Token kosong')
    updateStatus('disconnected')
    return
  }

  botWindow = mainWindow
  if (bot) {
    stopTelegramBot()
  }

  updateStatus('connecting')

  try {
    const config = getGlobalConfig()
    const telegramOpts = { agent }
    if (config.tgApiRoot && config.tgApiRoot.trim()) {
      telegramOpts.apiRoot = config.tgApiRoot.trim()
    }

    bot = new Telegraf(token.trim(), { telegram: telegramOpts })

    if (config.tgAdminIds) {
      const ids = config.tgAdminIds.split(',').map((s) => s.trim()).filter(Boolean)
      ids.forEach((id) => {
        const cleanId = id.replace(/^@/, '')
        if (/^\d+$/.test(cleanId)) {
          adminChatIdsSet.add(cleanId)
        }
      })
      saveChatIdsToFile()
    }

    bot.command('start', (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      const senderUsername = (ctx.from?.username || '').toLowerCase()
      if (chatId) {
        adminChatIdsSet.add(chatId)
        if (senderUsername) usernameToChatIdMap.set(senderUsername, chatId)
        saveChatIdsToFile()
      }
      ctx.reply('Halo! Saya Mark (AI OS Companion). Bot Telegram ini telah terhubung.')
    })

    bot.command('info', (ctx) => {
      ctx.reply(
        '**Daftar Perintah MARK:**\n\n' +
        '/start - Memulai bot\n' +
        '/info - Menampilkan daftar perintah\n' +
        '/abort - Menghentikan proses AI yang sedang berjalan\n' +
        '/accept - Mengizinkan persetujuan sekali saja\n' +
        '/always - Mengizinkan selamanya untuk path folder ini\n' +
        '/reject - Menolak prompt persetujuan',
        { parse_mode: 'Markdown' }
      )
    })

    bot.command('abort', (ctx) => {
      if (activeAbortControllers.size > 0) {
        abortAllFetches()
        ctx.reply('[INFO]: Membatalkan proses AI saat ini...')
      } else {
        ctx.reply('[INFO]: Tidak ada proses AI yang sedang berjalan.')
      }
    })

    bot.command('accept', (ctx) => {
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-accept', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.command('always', (ctx) => {
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-always', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.command('reject', (ctx) => {
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-reject', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.on('text', async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name
        ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim()
        : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)
      const text = ctx.message?.text || ''

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getGlobalConfig()
      const adminList = (config.tgAdminIds || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)

      const isAdmin =
        adminList.includes(senderId.toLowerCase()) ||
        (senderUsername && adminList.includes(senderUsername))

      if (!isAdmin) {
        console.log(`[Telegram] Access denied for user ${senderId} (@${senderUsername})`)
        await ctx.reply('Maaf, kamu belum punya akses ke MARK.')
        return
      }

      adminChatIdsSet.add(chatId)
      if (senderUsername) usernameToChatIdMap.set(senderUsername, chatId)
      saveChatIdsToFile()

      const msgId = `${chatId}-${ctx.message.message_id}`

      const uiMsgPayload = {
        id: msgId,
        chatId: chatId,
        sender: senderName,
        text: text,
        isGroup: ctx.chat?.type !== 'private',
        chatTitle: ctx.chat?.title || senderName,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        type: 'incoming'
      }

      uiMessageHistory.push(uiMsgPayload)
      if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('tg:message', uiMsgPayload)
        botWindow.webContents.send('tg:thinking', { sender: senderName, chatId })
      }

      let loadingMsgId = null
      try {
        const loadingMsg = await ctx.reply('[LOADING]: Sedang diproses...', { disable_notification: true })
        loadingMsgId = loadingMsg.message_id
      } catch (e) {}

      pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId })
      setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

      const recentHistory = uiMessageHistory
        .filter((m) => m.chatId === chatId)
        .slice(-10)
        .map((m) => ({
          role: m.type === 'incoming' ? 'user' : 'assistant',
          content: m.type === 'incoming' ? m.text : m.reply
        }))

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('tg:request-agent-execution', {
          text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
          isAdmin: true,
          senderName,
          msgId,
          chatId,
          isGroup: ctx.chat?.type !== 'private',
          chatSession: recentHistory
        })
      }
    })

    bot.on(['document', 'photo'], async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim() : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getGlobalConfig()
      const adminList = (config.tgAdminIds || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
      const isAdmin = adminList.includes(senderId.toLowerCase()) || (senderUsername && adminList.includes(senderUsername))

      if (!isAdmin) {
        await ctx.reply('Maaf, kamu belum punya akses ke MARK.')
        return
      }
      
      try {
        let fileId = ''
        let originalName = ''
        
        if (ctx.message.document) {
          fileId = ctx.message.document.file_id
          originalName = ctx.message.document.file_name || `document_${Date.now()}`
        } else if (ctx.message.photo) {
          const photo = ctx.message.photo[ctx.message.photo.length - 1]
          fileId = photo.file_id
          originalName = `photo_${Date.now()}.jpg`
        }

        const statusMsg = await ctx.reply(`[INFO]: Sedang mengunduh file ${originalName}...`)
      
        const fileUrl = await ctx.telegram.getFileLink(fileId)
        const saveDir = path.join(os.homedir(), 'Documents', 'Mark Workspace', 'Telegram')
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })
        
        const savePath = path.join(saveDir, originalName)
        
        const response = await fetch(fileUrl)
        const buffer = await response.arrayBuffer()
        fs.writeFileSync(savePath, Buffer.from(buffer))

        await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `[INFO]: Berhasil mengunduh: ${originalName}\n[LOADING]: Sedang diproses...`)

        const caption = ctx.message.caption || ''
        const text = `[FILE TERLAMPIR]: "${savePath}"\n${caption ? `Caption dari user: ${caption}` : 'Silakan baca/analisa file gambar atau dokumen ini jika perlu.'}`

        const msgId = `${chatId}-${ctx.message.message_id}`
        const uiMsgPayload = {
          id: msgId,
          chatId: chatId,
          sender: senderName,
          text: `[FILE]: Mengirim file: ${originalName}\n${caption}`,
          isGroup: ctx.chat?.type !== 'private',
          chatTitle: ctx.chat?.title || senderName,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          type: 'incoming'
        }

        uiMessageHistory.push(uiMsgPayload)
        if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

        if (botWindow && !botWindow.isDestroyed()) {
          botWindow.webContents.send('tg:message', uiMsgPayload)
          botWindow.webContents.send('tg:thinking', { sender: senderName, chatId })
        }

        pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId: statusMsg.message_id })
        setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

        const recentHistory = uiMessageHistory
          .filter((m) => m.chatId === chatId)
          .slice(-10)
          .map((m) => ({
            role: m.type === 'incoming' ? 'user' : 'assistant',
            content: m.type === 'incoming' ? m.text : m.reply
          }))

        if (botWindow && !botWindow.isDestroyed()) {
          botWindow.webContents.send('tg:request-agent-execution', {
            text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
            isAdmin: true,
            senderName,
            msgId,
            chatId,
            isGroup: ctx.chat?.type !== 'private',
            chatSession: recentHistory
          })
        }
      } catch (e) {
        console.error('Failed to download file from Telegram:', e)
        ctx.reply(`Gagal mengunduh file: ${e.message}`)
      }
    })

    bot.catch((err, ctx) => {
      console.error(`[Telegram] Error for ${ctx.updateType}:`, err)
    })

    bot.launch({ allowedUpdates: ['message'] }).catch((err) => {
      console.error('[Telegram] Polling error:', err)
      bot = null
      updateStatus('disconnected')
    })
    updateStatus('connected')
    console.log('[Telegram] Bot successfully started and listening')
  } catch (err) {
    console.error('[Telegram] Failed to start bot:', err)
    bot = null
    updateStatus('disconnected')
  }
}

const formatMarkdownToTelegramHTML = (text) => {
  if (!text) return ''
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  html = html.replace(/```([a-z0-9-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
    return lang ? `<pre><code class="language-${lang}">${code}</code></pre>` : `<pre><code>${code}</code></pre>`
  })
  
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  html = html.replace(/\*([^*]+)\*/g, '<i>$1</i>')
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  
  return html
}

export const sendTelegramMessage = async (chatId, text) => {
  if (!bot || currentStatus !== 'connected') {
    return { success: false, error: 'Telegram Bot belum terhubung.' }
  }
  try {
    const htmlText = formatMarkdownToTelegramHTML(text)
    await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    return { success: true }
  } catch (err) {
    try {
      await bot.telegram.sendMessage(chatId, text)
      return { success: true }
    } catch (fallbackErr) {
      return { success: false, error: fallbackErr.message }
    }
  }
}

export const sendTelegramFile = async (chatId, filePath, caption = '') => {
  if (!bot || currentStatus !== 'connected') {
    return { success: false, error: 'Telegram Bot belum terhubung.' }
  }
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File tidak ditemukan: ${filePath}` }
  }
  try {
    const filename = path.basename(filePath)
    const fileStream = fs.createReadStream(filePath)
    await bot.telegram.sendDocument(
      chatId,
      { source: fileStream, filename: filename },
      { caption }
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

const adminChatIdsSet = new Set()
const usernameToChatIdMap = new Map()
const pendingBroadcastQueue = []

const CHAT_IDS_FILE = path.join(app.getPath('userData'), 'tg_chat_ids.json')

const loadSavedChatIds = () => {
  try {
    if (fs.existsSync(CHAT_IDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf8'))
      if (Array.isArray(data.chatIds)) {
        data.chatIds.forEach((id) => adminChatIdsSet.add(String(id)))
      }
      if (data.usernameMap && typeof data.usernameMap === 'object') {
        Object.entries(data.usernameMap).forEach(([user, id]) => {
          usernameToChatIdMap.set(user, String(id))
        })
      }
      console.log(`[Telegram] Loaded ${adminChatIdsSet.size} saved admin chat IDs.`)
    }
  } catch (e) {
    console.error('[Telegram] Error loading saved chat IDs:', e)
  }
}

const saveChatIdsToFile = () => {
  try {
    const data = {
      chatIds: Array.from(adminChatIdsSet),
      usernameMap: Object.fromEntries(usernameToChatIdMap)
    }
    fs.writeFileSync(CHAT_IDS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error('[Telegram] Error saving chat IDs to file:', e)
  }
}

loadSavedChatIds()

const flushPendingBroadcasts = async () => {
  if (currentStatus !== 'connected' || pendingBroadcastQueue.length === 0) return
  console.log(`[Telegram] Flushing ${pendingBroadcastQueue.length} pending broadcast messages...`)
  const queue = [...pendingBroadcastQueue]
  pendingBroadcastQueue.length = 0
  for (const text of queue) {
    await sendTelegramToAdmins(text)
  }
}

const updateStatus = (status) => {
  currentStatus = status
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('tg:connection', status)
  }
  if (status === 'connected') {
    setTimeout(flushPendingBroadcasts, 500)
  }
}

export const sendTelegramToAdmins = async (text) => {
  if (!bot || currentStatus !== 'connected') {
    console.log('[Telegram] Bot belum terhubung. Menampung pesan ke antrean broadcast...')
    pendingBroadcastQueue.push(text)
    return
  }
  const config = getGlobalConfig()
  const adminInputs = (config.tgAdminIds || '')
    .split(',')
    .map((id) => id.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)

  const targetChatIds = new Set(adminChatIdsSet)
  for (const input of adminInputs) {
    if (/^\d+$/.test(input)) {
      targetChatIds.add(input)
    } else if (usernameToChatIdMap.has(input)) {
      targetChatIds.add(usernameToChatIdMap.get(input))
    }
  }

  if (targetChatIds.size === 0) {
    console.warn('[Telegram Broadcast] Peringatan: Tidak ada Chat ID admin yang ditemukan. Silakan kirim /start ke bot dari Telegram!')
    return
  }

  console.log(`[Telegram Broadcast] Mengirim pesan ke ${targetChatIds.size} Chat ID:`, Array.from(targetChatIds))

  for (const chatId of targetChatIds) {
    try {
      const htmlText = formatMarkdownToTelegramHTML(text)
      await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    } catch (err) {
      try {
        await bot.telegram.sendMessage(chatId, text)
      } catch (e) {
        console.error(`[Telegram] Gagal mengirim broadcast ke ${chatId}:`, e.message)
      }
    }
  }
}

// IPC Handlers
ipcMain.removeAllListeners('tg:broadcast-to-admins')
ipcMain.on('tg:broadcast-to-admins', async (event, text) => {
  await sendTelegramToAdmins(text)
})
ipcMain.removeAllListeners('tg:agent-execution-done')
ipcMain.on('tg:agent-execution-done', async (event, data) => {
  const { chatId, result, msgId } = data
  const reqObj = pendingRequestsMap.get(msgId)
  let replyText = result?.answer || 'Selesai diproses.'

  const uiReplyPayload = {
    id: Date.now(),
    chatId: chatId,
    sender: 'Mark',
    text: reqObj?.text || '',
    reply: replyText,
    toolsUsed: result?.toolsUsed || [],
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    type: 'outgoing'
  }

  uiMessageHistory.push(uiReplyPayload)
  if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('tg:reply-sent', uiReplyPayload)
  }

  if (bot && chatId) {
    if (reqObj?.loadingMsgId) {
      try {
        await bot.telegram.deleteMessage(chatId, reqObj.loadingMsgId)
      } catch (e) {}
    }
    try {
      await bot.telegram.sendMessage(chatId, replyText, { parse_mode: 'Markdown' })
    } catch (e) {
      await bot.telegram.sendMessage(chatId, replyText).catch(() => {})
    }
  }

  pendingRequestsMap.delete(msgId)
})

ipcMain.removeHandler('tg:send-message')
ipcMain.handle('tg:send-message', async (event, { chatId, text }) => {
  return await sendTelegramMessage(chatId, text)
})

ipcMain.removeAllListeners('tg:trigger-screenshot')
ipcMain.on('tg:trigger-screenshot', async (event, { chatId } = {}) => {
  if (!bot || currentStatus !== 'connected') return

  const targetChatIds = new Set()
  if (chatId) {
    targetChatIds.add(chatId)
  } else {
    const config = getGlobalConfig()
    const adminInputs = (config.tgAdminIds || '')
      .split(',')
      .map((id) => id.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)

    adminChatIdsSet.forEach((id) => targetChatIds.add(id))
    for (const input of adminInputs) {
      if (/^\d+$/.test(input)) {
        targetChatIds.add(input)
      } else if (usernameToChatIdMap.has(input)) {
        targetChatIds.add(usernameToChatIdMap.get(input))
      }
    }
  }

  if (targetChatIds.size === 0) {
    console.warn('[Telegram Screenshot] Gagal: Tidak ada Chat ID admin yang ditemukan.')
    return
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })
    for (const targetId of targetChatIds) {
      for (const [index, source] of sources.entries()) {
        const imageBuffer = source.thumbnail.toPNG()
        const tempPath = path.join(app.getPath('temp'), `tg-ss-${Date.now()}-${index}.png`)
        fs.writeFileSync(tempPath, imageBuffer)
        await bot.telegram.sendPhoto(
          targetId,
          { source: tempPath },
          { caption: `📸 Layar ${index + 1} (${source.name})` }
        )
        fs.unlink(tempPath, () => {})
      }
    }
  } catch (err) {
    console.error('[Telegram] Gagal mengirim screenshot:', err)
  }
})

ipcMain.removeAllListeners('tg:trigger-music-download')
ipcMain.on('tg:trigger-music-download', async (event, { chatId, query }) => {
  if (!bot || !chatId || !query) return
  try {
    const searchResult = await yts(query)
    const video = searchResult.videos[0]
    if (!video) {
      await bot.telegram.sendMessage(chatId, `❌ Lagu "${query}" tidak ditemukan di YouTube.`)
      return
    }
    const tempPath = path.join(app.getPath('temp'), `tg-audio-${Date.now()}.mp3`)
    const unpackFfmpeg = ffmpeg.replace('app.asar', 'app.asar.unpacked')
    const unpackYtdl = unpackFfmpeg.replace(
      /ffmpeg-static[\\/]ffmpeg\.exe/i,
      'youtube-dl-exec\\bin\\yt-dlp.exe'
    )

    await new Promise((resolve, reject) => {
      execFile(
        unpackYtdl,
        [
          video.url,
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--ffmpeg-location',
          unpackFfmpeg,
          '--output',
          tempPath
        ],
        (err, stdout, stderr) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    await bot.telegram.sendAudio(
      chatId,
      { source: tempPath },
      { title: video.title, performer: video.author?.name || 'YouTube' }
    )
    fs.unlink(tempPath, () => {})
  } catch (err) {
    console.error('[Telegram] Error music download:', err)
    await bot.telegram.sendMessage(chatId, `❌ Gagal download lagu: ${err.message}`)
  }
})

ipcMain.removeAllListeners('tg:trigger-music-ui')
ipcMain.on('tg:trigger-music-ui', (event, { command, query }) => {
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('execute-music-command-tg', command, query)
  }
})
