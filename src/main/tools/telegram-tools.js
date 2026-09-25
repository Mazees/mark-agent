import fs from 'fs'
import {
  sendTelegramMessage,
  sendTelegramFile,
  sendTelegramScreenshot
} from '../telegram/telegram-service.js'

export const telegramTools = {
  'tg-send': {
    needsApproval: false,
    handler: async (args) => {
      try {
        let chatId = ''
        let type = 'auto'
        let content = ''
        let caption = ''

        if (typeof args === 'object' && args !== null) {
          chatId = String(args.chat_id || args.chatId || '').trim()
          type = String(args.type || 'auto')
            .trim()
            .toLowerCase()
          content = args.content ?? ''
          caption = String(args.caption || args.text || '').trim()
        } else {
          const rawStr = String(args || '').trim()
          const parts = rawStr.split(/\|+/)
          if (parts.length === 1) {
            content = parts[0].trim()
          } else if (parts.length === 2) {
            if (['text', 'file', 'photo', 'image'].includes(parts[0].trim().toLowerCase())) {
              type = parts[0].trim().toLowerCase()
              content = parts[1].trim()
            } else {
              chatId = parts[0].trim()
              content = parts[1].trim()
            }
          } else {
            chatId = parts[0].trim()
            type = parts[1].trim().toLowerCase()
            content = parts.slice(2).join('||').trim()
          }
        }

        // Auto-detect type jika 'auto'
        if (type === 'auto') {
          const cleanContent = typeof content === 'string' ? content.trim() : ''
          if (
            cleanContent.startsWith('data:') ||
            fs.existsSync(cleanContent) ||
            /\.(png|jpe?g|webp|gif|bmp|pdf|docx?|xlsx?|txt|zip)$/i.test(cleanContent)
          ) {
            type =
              /\.(png|jpe?g|webp|gif|bmp)$/i.test(cleanContent) ||
              cleanContent.startsWith('data:image/')
                ? 'photo'
                : 'file'
          } else {
            type = 'text'
          }
        }

        if (type === 'file' || type === 'photo' || type === 'image') {
          const result = await sendTelegramFile(chatId, content, caption, { type })
          return {
            success: result.success,
            data: result.success
              ? `Berhasil mengirim ${type === 'photo' ? 'gambar/foto' : 'berkas'} ke Telegram.`
              : `Gagal: ${result.error}`
          }
        } else {
          const result = await sendTelegramMessage(chatId, content)
          return {
            success: result.success,
            data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}`
          }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'screenshot-to-tg': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const chatId =
          typeof args === 'object' && args !== null ? args.chat_id || args.chatId || null : null
        const result = await sendTelegramScreenshot(chatId)
        return {
          success: result.success,
          data: result.success
            ? 'Berhasil mengirim screenshot PC ke Telegram admin.'
            : `Gagal: ${result.error}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
