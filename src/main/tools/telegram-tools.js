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
        let type = 'text'
        let content = ''

        if (typeof args === 'object' && args !== null) {
          chatId = String(args.chat_id || args.chatId || '').trim()
          type = String(args.type || 'text')
            .trim()
            .toLowerCase()
          content = args.content ?? ''
        } else {
          const parts = String(args || '').split(/\|+/)
          if (parts.length < 2) return { success: false, error: 'Format: chatId||type||content' }
          chatId = parts[0].trim()
          type = parts[1].trim().toLowerCase()
          content = parts.slice(2).join('||').trim()
        }

        if (type === 'file') {
          const result = await sendTelegramFile(chatId, content)
          return {
            success: result.success,
            data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}`
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
