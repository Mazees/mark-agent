/**
 * Context Compactor (Antigravity-Style Token Optimizer)
 * Mengoptimalkan payload riwayat chat yang dikirim ke LLM:
 * - Menjaga pesan terkini dalam resolusi tinggi
 * - Mengompaksi blok kode panjang dan log tool pada giliran masa lalu
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
 * Mengompaksi daftar riwayat percakapan untuk prompt LLM
 */
export const buildOptimizedChatSession = (sourceChatData, maxTurns = 10) => {
  if (!Array.isArray(sourceChatData)) return []

  const validMessages = sourceChatData.filter(
    (item) =>
      item &&
      item.role !== 'command' &&
      !item.isThinking &&
      !item.isSearching &&
      !item.isSummarizing
  )

  const recentSlice = validMessages.slice(-1 * maxTurns)
  const totalCount = recentSlice.length

  return recentSlice.map((item, idx) => {
    const isRecentTurn = idx >= totalCount - 2 // 2 pesan terakhir dibiarkan resolusi tinggi
    // In-progress retention: Jika pesan AI ini belum selesai (tanya user/in-progress) atau pesan AI paling akhir
    const isInProgress = item.isTaskDone === false || (item.isTaskDone !== true && isRecentTurn)
    let msgContent = item.content || ''

    if (item.role === 'ai') {
      // 1. Kompaksi log tool
      let toolLog = ''
      if (item.executedTools && item.executedTools.length > 0) {
        if (isInProgress) {
          // Smart Retention: Pertahankan detail hasil tool (read-file, grep, list-dir) secara utuh
          toolLog = item.executedTools
            .map((t) => {
              const res = t.fullResult || t.resultSummary || 'OK'
              return `  * [Tool: ${t.tool}] query: "${t.query || ''}"\n    Hasil:\n${res}`
            })
            .join('\n\n')
        } else if (isRecentTurn) {
          toolLog = item.executedTools
            .map(
              (t) =>
                `  * [Tool: ${t.tool}] query: "${t.query || ''}" -> Hasil: ${t.resultSummary || 'OK'}`
            )
            .join('\n')
        } else {
          // Giliran lama: hanya catat nama tool & target query
          toolLog = item.executedTools
            .map((t) => `  * [Tool: ${t.tool}] (query: "${(t.query || '').slice(0, 60)}")`)
            .join('\n')
        }
      }

      // 2. Kompaksi blok kode panjang pada giliran lama (hanya jika sudah bukan in-progress)
      let formattedBody = msgContent
      if (!isRecentTurn && !isInProgress) {
        formattedBody = compactCodeBlocks(msgContent)
        // Batasi panjang teks maksimal pada pesan lama
        if (formattedBody.length > 1500) {
          formattedBody =
            formattedBody.slice(0, 1200) +
            '\n\n[... sisa teks lampau diringkas. Gunakan tool terkait jika butuh detail lengkap ...]'
        }
      }

      if (toolLog) {
        msgContent = `[RIWAYAT TOOL TURN INI]:\n${toolLog}\n\n[JAWABAN]:\n${formattedBody}`
      } else {
        msgContent = formattedBody
      }
    }

    return {
      role: item.role === 'ai' ? 'assistant' : 'user',
      content: msgContent,
      mood: item.mood,
      isProactive: item.isProactive,
      timestamp: item.timestamp,
      source: item.source,
      sender: item.sender
    }
  })
}
