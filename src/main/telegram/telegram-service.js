import { Telegraf } from 'telegraf'
import fs from 'fs'
import path from 'path'
import os from 'os'
import yts from 'yt-search'
import { execFile } from 'child_process'
import ffmpeg from 'ffmpeg-static'
import https from 'https'
import { abortAllFetches, activeAbortControllers } from '../../server/services/ai-bridge.js'
import { dbStore } from '../../server/memory/db-store.js'
import { wsHub } from '../../server/ws-hub.js'

let bot = null
let currentStatus = 'disconnected'
export const uiMessageHistory = []
const MAX_UI_HISTORY = 100
const pendingRequestsMap = new Map()
const pendingBroadcastQueue = []

const CHAT_IDS_FILE = path.join(os.homedir(), '.config', 'mark-agent', 'telegram-chats.json')
const adminChatIdsSet = new Set()
const usernameToChatIdMap = new Map()

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  rejectUnauthorized: false
})

function getTelegramConfig() {
  try {
    const cfgs = dbStore.config.getAll()
    const cfg = cfgs[0] || {}
    // SQLite config table stores settings inside row.data object
    if (cfg.data && typeof cfg.data === 'object') {
      return { ...cfg, ...cfg.data }
    }
    return cfg
  } catch (_) {
    return {}
  }
}

export const getConnectionStatus = () => {
  return { status: currentStatus }
}

const updateStatus = (status) => {
  currentStatus = status
  wsHub.broadcast('tg:connection', status)
  if (status === 'connected') {
    setTimeout(flushPendingBroadcasts, 500)
  }
}

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
    }
  } catch (e) {
    console.error('[Telegram] Gagal memuat saved chat IDs:', e)
  }
}

const saveChatIdsToFile = () => {
  try {
    const dir = path.dirname(CHAT_IDS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const data = {
      chatIds: Array.from(adminChatIdsSet),
      usernameMap: Object.fromEntries(usernameToChatIdMap)
    }
    fs.writeFileSync(CHAT_IDS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error('[Telegram] Gagal menyimpan chat IDs ke file:', e)
  }
}

loadSavedChatIds()

const formatMarkdownToTelegramHTML = (text) => {
  if (!text) return ''
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/```([a-z0-9-]*)\n([\s\S]*?)```/gi, (_match, lang, code) => {
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

export const startTelegramBot = async (token) => {
  if (!token || !token.trim()) {
    console.error('[Telegram] Token kosong')
    updateStatus('disconnected')
    return
  }

  if (bot) {
    stopTelegramBot()
  }

  updateStatus('connecting')

  try {
    const config = getTelegramConfig()
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
        'Daftar Perintah MARK:\n\n' +
        '/start - Memulai bot\n' +
        '/info - Menampilkan daftar perintah\n' +
        '/abort - Menghentikan proses AI yang sedang berjalan\n' +
        '/accept - Mengizinkan persetujuan sekali saja\n' +
        '/always - Mengizinkan selamanya untuk path folder ini\n' +
        '/reject - Menolak prompt persetujuan'
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

    const isApprovalCommand = (cmdText) => {
      const clean = (cmdText || '').trim().toLowerCase()
      return (
        clean === '/accept' ||
        clean === 'accept' ||
        clean === '/izinkan' ||
        clean === 'izinkan' ||
        clean.startsWith('/accept@') ||
        clean === '/always' ||
        clean === 'always' ||
        clean === '/selamanya' ||
        clean === 'selamanya' ||
        clean.startsWith('/always@') ||
        clean === '/reject' ||
        clean === 'reject' ||
        clean === '/tolak' ||
        clean === 'tolak' ||
        clean.startsWith('/reject@')
      )
    }

    bot.command('accept', (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      wsHub.broadcast('tg:command-accept', { chatId })
    })

    bot.command('always', (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      wsHub.broadcast('tg:command-always', { chatId })
    })

    bot.command('reject', (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      wsHub.broadcast('tg:command-reject', { chatId })
    })

    bot.on('text', async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name
        ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim()
        : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)
      const text = ctx.message?.text || ''

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getTelegramConfig()
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

      // Jika teks adalah perintah approval (/accept, /always, /reject), jangan picu loop planning agent baru
      if (isApprovalCommand(text)) {
        const clean = text.trim().toLowerCase()
        if (clean === '/accept' || clean === 'accept' || clean === '/izinkan' || clean === 'izinkan' || clean.startsWith('/accept@')) {
          wsHub.broadcast('tg:command-accept', { chatId })
        } else if (clean === '/always' || clean === 'always' || clean === '/selamanya' || clean === 'selamanya' || clean.startsWith('/always@')) {
          wsHub.broadcast('tg:command-always', { chatId })
        } else if (clean === '/reject' || clean === 'reject' || clean === '/tolak' || clean === 'tolak' || clean.startsWith('/reject@')) {
          wsHub.broadcast('tg:command-reject', { chatId })
        }
        return
      }

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

      wsHub.broadcast('tg:message', uiMsgPayload)
      wsHub.broadcast('tg:thinking', { sender: senderName, chatId })

      let loadingMsgId = null
      try {
        const loadingMsg = await ctx.reply('[LOADING]: Sedang diproses...', { disable_notification: true })
        loadingMsgId = loadingMsg.message_id
      } catch (_) {}

      pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId })
      setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

      const recentHistory = uiMessageHistory
        .filter((m) => m.chatId === chatId)
        .slice(-10)
        .map((m) => ({
          role: m.type === 'incoming' ? 'user' : 'assistant',
          content: m.type === 'incoming' ? m.text : m.reply
        }))

      wsHub.broadcast('tg:request-agent-execution', {
        text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
        isAdmin: true,
        senderName,
        msgId,
        chatId,
        isGroup: ctx.chat?.type !== 'private',
        chatSession: recentHistory
      })
    })

    bot.on(['document', 'photo'], async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim() : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getTelegramConfig()
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

        wsHub.broadcast('tg:message', uiMsgPayload)
        wsHub.broadcast('tg:thinking', { sender: senderName, chatId })

        pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId: statusMsg.message_id })
        setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

        const recentHistory = uiMessageHistory
          .filter((m) => m.chatId === chatId)
          .slice(-10)
          .map((m) => ({
            role: m.type === 'incoming' ? 'user' : 'assistant',
            content: m.type === 'incoming' ? m.text : m.reply
          }))

        wsHub.broadcast('tg:request-agent-execution', {
          text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
          isAdmin: true,
          senderName,
          msgId,
          chatId,
          isGroup: ctx.chat?.type !== 'private',
          chatSession: recentHistory
        })
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
    console.log('[Telegram] Bot berhasil dijalankan dan mendengarkan pesan.')
  } catch (err) {
    console.error('[Telegram] Gagal menjalankan bot:', err)
    bot = null
    updateStatus('disconnected')
  }
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
    const fileStream = fs.createReadStream(filePath)
    await bot.telegram.sendDocument(chatId, { source: fileStream }, { caption })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export const sendTelegramScreenshot = async (chatId = null) => {
  if (!bot || currentStatus !== 'connected') {
    return { success: false, error: 'Telegram Bot belum terhubung.' }
  }
  try {
    const { captureDesktopScreenshotsBase64 } = await import('../../server/tools/screen-service.js')
    const base64List = await captureDesktopScreenshotsBase64()

    const targets = []
    if (chatId) {
      targets.push(String(chatId))
    } else {
      const config = getTelegramConfig()
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
      targets.push(...Array.from(targetChatIds))
    }

    if (targets.length === 0) {
      return { success: false, error: 'Tidak ada target admin Telegram yang terdaftar.' }
    }

    for (const target of targets) {
      try {
        if (base64List.length === 1) {
          const cleanBase64 = base64List[0].replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(cleanBase64, 'base64')
          await bot.telegram.sendPhoto(target, { source: buffer }, { caption: 'Screenshot Layar PC Mark' })
        } else {
          for (let i = 0; i < base64List.length; i++) {
            const cleanBase64 = base64List[i].replace(/^data:image\/\w+;base64,/, '')
            const buffer = Buffer.from(cleanBase64, 'base64')
            await bot.telegram.sendPhoto(
              target,
              { source: buffer },
              { caption: `Screenshot Layar PC Mark - Monitor ${i + 1} dari ${base64List.length}` }
            )
          }
        }
      } catch (err) {
        console.error(`[Telegram] Gagal kirim screenshot ke ${target}:`, err.message)
      }
    }
    return { success: true }
  } catch (e) {
    console.error('[Telegram] Gagal proses screenshot:', e)
    return { success: false, error: e.message }
  }
}

export const sendTelegramToAdmins = async (text) => {
  if (!bot || currentStatus !== 'connected') {
    pendingBroadcastQueue.push(text)
    return
  }
  const config = getTelegramConfig()
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

  if (targetChatIds.size === 0) return

  for (const chatId of targetChatIds) {
    try {
      const htmlText = formatMarkdownToTelegramHTML(text)
      await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    } catch (_) {
      try {
        await bot.telegram.sendMessage(chatId, text)
      } catch (e) {
        console.error(`[Telegram] Gagal broadcast ke ${chatId}:`, e.message)
      }
    }
  }
}

const flushPendingBroadcasts = async () => {
  if (currentStatus !== 'connected' || pendingBroadcastQueue.length === 0) return
  const queue = [...pendingBroadcastQueue]
  pendingBroadcastQueue.length = 0
  for (const text of queue) {
    await sendTelegramToAdmins(text)
  }
}

export const finishAgentExecution = async ({ chatId, result, msgId }) => {
  const reqObj = pendingRequestsMap.get(msgId)
  if (msgId && pendingRequestsMap.has(msgId)) {
    pendingRequestsMap.delete(msgId)
  }
  const replyText = result?.answer || 'Selesai diproses.'

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

  wsHub.broadcast('tg:reply-sent', uiReplyPayload)

  if (bot && chatId) {
    if (reqObj?.loadingMsgId) {
      try {
        await bot.telegram.deleteMessage(chatId, reqObj.loadingMsgId)
      } catch (_) {}
    }
    try {
      const htmlText = formatMarkdownToTelegramHTML(replyText)
      await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    } catch (_) {
      try {
        await bot.telegram.sendMessage(chatId, replyText, { parse_mode: 'Markdown' })
      } catch (fallbackErr) {
        await bot.telegram.sendMessage(chatId, replyText).catch(() => {})
      }
    }
  }
}

export const triggerTelegramMusicDownload = async ({ chatId, query }) => {
  if (!bot || !chatId || !query) return
  try {
    const searchResult = await yts(query)
    const video = searchResult.videos[0]
    if (!video) {
      await bot.telegram.sendMessage(chatId, `Lagu "${query}" tidak ditemukan di YouTube.`)
      return
    }
    const tempPath = path.join(os.tmpdir(), `tg-audio-${Date.now()}.mp3`)
    const unpackFfmpeg = ffmpeg ? ffmpeg.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg'
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
        (err) => {
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
    await bot.telegram.sendMessage(chatId, `Gagal download lagu: ${err.message}`)
  }
}
