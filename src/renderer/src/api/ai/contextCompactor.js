/**
 * Context Compactor (Antigravity-Style Token Optimizer & Dual-Layer Chat History)
 * Mengoptimalkan payload riwayat chat yang dikirim ke LLM:
 * - Menjaga pesan terkini dalam resolusi tinggi
 * - Mengompaksi blok kode panjang dan log tool pada giliran masa lalu
 * - Menjaga ephemeral ReAct loops terpisah dari persistent storage di SQLite
 * - Memastikan respons tetap instan (sub-second) tanpa kehilangan konsistensi coding
 */

/**
 * Meringkas blok kode markdown panjang (> 300 char atau > 10 baris)
 */
export const compactCodeBlocks = (text) => {
  if (!text || typeof text !== 'string') return ''

  return text.replace(/```([a-zA-Z0-9_\-\.\/]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.split('\n')
    if (lines.length <= 10 && code.length <= 300) {
      return match
    }

    const firstLines = lines.slice(0, 3).join('\n')
    const lastLines = lines.slice(-2).join('\n')
    const omittedCount = lines.length - 5

    return `\`\`\`${lang || ''}\n${firstLines}\n/* --- [Sisa ${omittedCount} baris kode diringkas. Berkas tersimpan di disk. Gunakan tool 'read-file' jika perlu membaca/melanjutkan] --- */\n${lastLines}\n\`\`\``
  })
}

/**
 * Mengompaksi daftar riwayat percakapan untuk prompt LLM:
 * Menjaga seluruh pesan dan riwayat tool 100% UTUH selama masih dalam batas kapasitas 525K karakter.
 */
export const buildOptimizedChatSession = (sourceChatData) => {
  if (!Array.isArray(sourceChatData)) return []

  const validMessages = sourceChatData.filter(
    (item) =>
      item &&
      item.role !== 'command' &&
      !item.isThinking &&
      !item.isSearching &&
      !item.isSummarizing
  )

  return validMessages.map((item) => {
    let msgContent = item.content || ''

    if (item.role === 'ai' || item.role === 'assistant' || item.role === 'planSteps') {
      let toolLog = ''
      if (item.executedTools && item.executedTools.length > 0) {
        toolLog = item.executedTools
          .map((t) => {
            const res = t.fullResult || t.resultSummary || 'OK'
            return `  * [Tool: ${t.tool}] query: "${t.query || ''}"\n    Hasil:\n${res}`
          })
          .join('\n\n')
      }

      if (toolLog) {
        msgContent = `[RIWAYAT TOOL TURN INI]:\n${toolLog}\n\n[JAWABAN]:\n${msgContent}`
      }
    }

    return {
      role: item.role === 'ai' || item.role === 'planSteps' ? 'assistant' : item.role,
      content: msgContent,
      mood: item.mood,
      isProactive: item.isProactive,
      timestamp: item.timestamp,
      source: item.source,
      sender: item.sender
    }
  })
}

/**
 * Merakit multi-turn context secara bersih untuk prompt LLM (SRS Fase 4)
 */
export function assembleMultiTurnContext(systemPrompt, historicalTurns = [], currentQuery = '') {
  const messages = []

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    })
  }

  for (const turn of historicalTurns) {
    if (turn.user_text || (turn.role === 'user' && turn.content)) {
      messages.push({
        role: 'user',
        content: turn.user_text || turn.content
      })
    }
    if (turn.ai_text || (turn.role === 'assistant' && turn.content)) {
      messages.push({
        role: 'assistant',
        content: turn.ai_text || turn.content
      })
    }
  }

  if (currentQuery) {
    messages.push({
      role: 'user',
      content: currentQuery
    })
  }

  return messages
}
