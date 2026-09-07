import { sendTelegramMessage, sendTelegramFile } from '../telegram/telegram-service.js'

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
          type = String(args.type || 'text').trim().toLowerCase()
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
          return { success: result.success, data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}` }
        } else {
          const result = await sendTelegramMessage(chatId, content)
          return { success: result.success, data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}` }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
