/**
 * Context Manager Engine (MARK v5.0.0)
 * Mengelola siklus context management per-session:
 * - Batas global konstanta 525.000 karakter (MAX_CONTEXT_CHARS)
 * - Penghitungan karakter presisi in-memory per sesi
 * - Tahap 1: Pruning output tool lama di memori (0ms delay, tanpa AI)
 * - Tahap 2: AI Summarization inkremental (Gemini Web -> fallback active provider)
 * - Pembersihan orphan tool pairs
 * - Perakitan payload prompt berformat [ COMPACTED MESSAGE SUMMARY ]
 */

import { fetchAI } from './core'
import { getSessionCompact, saveSessionCompact, saveSession } from '../db'
import { compactCodeBlocks } from './contextCompactor'

export const MAX_CONTEXT_CHARS = 525000

/**
 * Mendapatkan ID unik dari sebuah objek pesan
 */
export function getMessageId(msg, fallbackIndex = 0) {
  if (!msg) return `msg-${fallbackIndex}`
  return String(msg.id || msg.timestamp || `msg-${fallbackIndex}`)
}

/**
 * Menghitung panjang karakter representasi sebuah pesan
 */
export function calculateMessageChars(msg) {
  if (!msg) return 0
  let total = 0

  // Konten teks
  if (typeof msg.content === 'string') {
    total += msg.content.length
  } else if (Array.isArray(msg.content)) {
    total += JSON.stringify(msg.content).length
  } else if (msg.content && typeof msg.content === 'object') {
    total += JSON.stringify(msg.content).length
  }

  // Reasoning / Thought
  if (typeof msg.reasoning === 'string') total += msg.reasoning.length
  if (typeof msg.thought === 'string') total += msg.thought.length

  // Tool calls & executed tools
  if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
    total += JSON.stringify(msg.executedTools).length
  }
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    total += JSON.stringify(msg.tool_calls).length
  }

  return total
}

/**
 * Menghitung total karakter pesan satu sesi + ringkasan aktif di memori.
 * Jika terdapat lastCompactedMessageId, pesan-pesan sebelum atau sama dengan ID tersebut
 * SUDAH terangkum di dalam summaryBlock sehingga TIDAK dihitung dua kali.
 */
export function calculateSessionChars(
  messages = [],
  summaryBlock = '',
  lastCompactedMessageId = null
) {
  if (!Array.isArray(messages)) return 0
  let total = typeof summaryBlock === 'string' ? summaryBlock.length : 0

  let startIndex = 0
  if (lastCompactedMessageId) {
    const targetId = String(lastCompactedMessageId)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (
        getMessageId(msg, i) === targetId ||
        String(msg?.id) === targetId ||
        String(msg?.timestamp) === targetId
      ) {
        startIndex = i + 1
        break
      }
    }
  }

  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.isThinking || msg.isSearching || msg.isSummarizing || msg.role === 'command') {
      continue
    }
    total += calculateMessageChars(msg)
  }

  return total
}

/**
 * Tahap 1: Pruning output tool lama di memori (tanpa mengubah tabel database langsung)
 * Memangkas executedTools besar dan blok kode panjang di giliran lama.
 */
export function pruneOldToolResultsInMemory(messages = [], preserveRecentTurns = 4) {
  if (!Array.isArray(messages) || messages.length === 0) return []

  const cloned = messages.map((m) => ({ ...m }))
  const totalValid = cloned.filter(
    (m) => m && !m.isThinking && !m.isSearching && !m.isSummarizing && m.role !== 'command'
  ).length

  let validIndex = 0
  for (let i = 0; i < cloned.length; i++) {
    const item = cloned[i]
    if (
      !item ||
      item.isThinking ||
      item.isSearching ||
      item.isSummarizing ||
      item.role === 'command'
    ) {
      continue
    }
    validIndex++

    // Pertahankan N giliran terbaru tanpa pemangkasan penuh
    const isRecent = validIndex > totalValid - preserveRecentTurns
    if (isRecent) {
      // Pangkas fullResult raksasa pada tool yang sudah selesai di giliran non-aktif
      if (
        validIndex < totalValid &&
        Array.isArray(item.executedTools) &&
        item.executedTools.length > 0
      ) {
        item.executedTools = item.executedTools.map((t) => {
          if (typeof t.fullResult === 'string' && t.fullResult.length > 500) {
            return {
              ...t,
              fullResult: t.resultSummary || t.fullResult.slice(0, 250) + '... [output dipangkas]'
            }
          }
          return t
        })
      }
      continue
    }

    // Pangkas executedTools pada giliran lama
    if (Array.isArray(item.executedTools) && item.executedTools.length > 0) {
      item.executedTools = item.executedTools.map((t) => ({
        tool: t.tool || 'unknown_tool',
        query: t.query ? String(t.query).slice(0, 100) : '',
        resultSummary: t.resultSummary || `[tool result dipangkas: ${t.tool || 'tool'}]`,
        fullResult: `[tool result dipangkas: ${t.tool || 'tool'}]`
      }))
    }

    // Kompaksi blok kode panjang di teks lama jika > 300 char
    if (typeof item.content === 'string' && item.content.length > 300) {
      item.content = compactCodeBlocks(item.content)
    }
  }

  return cloned
}

/**
 * Tahap 2: AI Summarizer inkremental
 * Merangkum zona pesan lama + menyertakan existingSummaryBlock sebelumnya
 */
export async function summarizeMiddle(
  messagesToSummarize = [],
  existingSummaryBlock = '',
  activeConfig = {}
) {
  if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
    return existingSummaryBlock || ''
  }

  // Format percakapan baru yang meluap menjadi dialog terstruktur
  const formattedLines = []
  for (let i = 0; i < messagesToSummarize.length; i++) {
    const msg = messagesToSummarize[i]
    if (!msg || msg.isThinking || msg.isSearching || msg.isSummarizing || msg.role === 'command') {
      continue
    }

    const sender = msg.role === 'user' ? 'User' : 'Mark'
    let text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')

    // Ringkas teks jika per giliran terlalu panjang agar tidak overload summarizer
    if (text.length > 2500) {
      text =
        text.substring(0, 1200) + '\n... [potongan teks panjang diringkas] ...\n' + text.slice(-800)
    }

    formattedLines.push(`[Turn ${i + 1}] ${sender}: ${text}`)
  }

  let messagesText = formattedLines.join('\n\n')

  // Safety buffer: jika pesan lama jutaan karakter (legacy backlog), ambil jendela potongan terdekat max ~90.000 karakter
  if (messagesText.length > 90000) {
    messagesText = messagesText.slice(-90000)
  }

  const systemPrompt = `Kamu adalah sistem internal Mark untuk context compaction.
Tugasmu: Buat SATU ringkasan padat dan komprehensif yang memperbarui ringkasan lama dengan percakapan baru.

Aturan Ringkasan:
1. Pertahankan semua keputusan penting dan kesepakatan pengguna.
2. Pertahankan berkas atau kode yang dibuat atau dimodifikasi.
3. Pertahankan status task yang sedang berjalan atau telah selesai.
4. Buang basa-basi, salam, dan log intermediate yang tidak lagi relevan.
5. Gunakan bahasa Indonesia ringkas, padat, dan faktual.
6. HANYA OUTPUT TEKS RANGKUMAN tanpa kalimat pembuka atau penutup.`

  const userPrompt = `[RINGKASAN KOMPAKSI SEBELUMNYA]:
${existingSummaryBlock ? existingSummaryBlock.trim() : '(Belum ada ringkasan sebelumnya / kompaksi pertama kali)'}

[PERCAKAPAN BARU YANG HARUS DIRANGKUM]:
${messagesText}`

  const promptPayload = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  // 1. Coba Gemini Web terlebih dahulu (gratis, hemat kuota)
  try {
    const response = await fetchAI(promptPayload, false, {
      isSmallTask: true,
      configOverride: { aiProvider: 'gemini-web', geminiWebModel: 'gemini-3.5-flash-thinking' }
    })

    if (response && response.content && !response.error) {
      return response.content.trim()
    }
  } catch (err) {
    console.warn(
      '[contextManager] Gemini Web summarizer gagal, beralih ke active provider:',
      err?.message
    )
  }

  // 2. Fallback ke active provider sesi jika offline / Gemini Web gagal
  try {
    const response = await fetchAI(promptPayload, false, {
      isSmallTask: true,
      config: activeConfig
    })

    if (response && response.content && !response.error) {
      return response.content.trim()
    }
  } catch (err) {
    console.error('[contextManager] Fallback active provider summarizer gagal:', err?.message)
  }

  // 3. Jika AI sama sekali tidak dapat dijangkau, buat stub ringkasan darurat berbasis teks
  return `${existingSummaryBlock ? existingSummaryBlock + '\n\n' : ''}[Arsip percakapan lampau: ${messagesToSummarize.length} pesan telah dikompaksi pada ${new Date().toLocaleString('id-ID')}]`
}

/**
 * Tahap 3: Pembersihan pasangan tool yang orphan
 */
export function cleanOrphanToolPairs(messages = []) {
  if (!Array.isArray(messages)) return []

  const valid = []
  const toolCallIds = new Set()

  // Kumpulkan semua tool_call IDs yang valid
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id) toolCallIds.add(tc.id)
      }
    }
  }

  for (const msg of messages) {
    // Jika ada tool response tetapi tool_call pasangannya hilang, abaikan agar tidak error 400
    if (msg.role === 'tool' && msg.tool_call_id && !toolCallIds.has(msg.tool_call_id)) {
      continue
    }
    valid.push(msg)
  }

  return valid
}

/**
 * Orkestrator Utama: Menjalankan Hybrid Compaction untuk satu sesi
 */
export async function executeSessionCompaction({
  sessionId = '1',
  messages = [],
  activeConfig = {},
  onProgress = null,
  force = false
}) {
  // Ambil summary & pointer sebelumnya dari tabel session_compact jika ada
  let existingSummaryBlock = ''
  let existingLastCompactedId = null
  try {
    const existingData = await getSessionCompact(sessionId)
    if (existingData) {
      existingSummaryBlock = existingData.summaryBlock || existingData.summary_block || ''
      existingLastCompactedId =
        existingData.lastCompactedMessageId || existingData.last_compacted_message_id || null
    }
  } catch (err) {
    console.warn('[contextManager] Gagal mengambil session_compact lama:', err)
  }

  const currentChars = calculateSessionChars(
    messages,
    existingSummaryBlock,
    existingLastCompactedId
  )
  if (!force && currentChars < MAX_CONTEXT_CHARS) {
    return {
      success: true,
      isCompacted: false,
      compactedMessages: messages,
      currentChars
    }
  }

  // -------------------------------------------------------------
  // TAHAP 1: Pruning Tool Output di Memori
  // -------------------------------------------------------------
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'pruning', text: 'Memangkas log tool di memori...' })
  }

  const prunedMessages = pruneOldToolResultsInMemory(messages, 4)
  const prunedChars = calculateSessionChars(
    prunedMessages,
    existingSummaryBlock,
    existingLastCompactedId
  )

  // Jika Tahap 1 saja sudah cukup membawa karakter di bawah batas (hanya saat auto-compact / !force):
  if (!force && prunedChars < MAX_CONTEXT_CHARS) {
    // Simpan hasil prune ke tabel sessions
    try {
      await saveSession(sessionId, prunedMessages)
    } catch (e) {
      console.warn('[contextManager] Gagal menyimpan pruned messages ke sessions:', e)
    }

    return {
      success: true,
      isCompacted: true,
      prunedOnly: true,
      compactedMessages: prunedMessages,
      currentChars: prunedChars
    }
  }

  // -------------------------------------------------------------
  // TAHAP 2: AI Summarization (Sliding Window & Delta)
  // -------------------------------------------------------------
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'summarizing', text: 'Merangkum konteks percakapan lama...' })
  }

  // Hanya pertahankan 1 pesan terakhir (prompt user yang baru dikirim pada index N)
  // Seluruh riwayat pesan sebelumnya (0 s/d N-1) dirangkum ke dalam summary block.
  const tailStartIndex = Math.max(0, prunedMessages.length - 1)

  // Cari posisi batas pemadatan sebelumnya jika ada
  let startIndexToSummarize = 0
  if (existingLastCompactedId) {
    const targetId = String(existingLastCompactedId)
    for (let i = 0; i < prunedMessages.length; i++) {
      const msg = prunedMessages[i]
      if (
        getMessageId(msg, i) === targetId ||
        String(msg?.id) === targetId ||
        String(msg?.timestamp) === targetId
      ) {
        startIndexToSummarize = i + 1
        break
      }
    }
  }

  const effectiveTailIndex = Math.max(tailStartIndex, startIndexToSummarize)
  const messagesToSummarize = prunedMessages.slice(startIndexToSummarize, effectiveTailIndex)
  const tailMessages = prunedMessages.slice(effectiveTailIndex)

  let newSummaryBlock = existingSummaryBlock
  let lastCompactedMessageId = existingLastCompactedId

  if (messagesToSummarize.length > 0) {
    const lastCompactedMsg = messagesToSummarize[messagesToSummarize.length - 1]
    lastCompactedMessageId = getMessageId(lastCompactedMsg, effectiveTailIndex - 1)

    newSummaryBlock = await summarizeMiddle(messagesToSummarize, existingSummaryBlock, activeConfig)
  }

  // Simpan metadata ke tabel session_compact
  try {
    await saveSessionCompact(sessionId, {
      summaryBlock: newSummaryBlock,
      lastCompactedMessageId,
      lastCompactedAt: Date.now()
    })
  } catch (err) {
    console.error('[contextManager] Gagal menyimpan session_compact:', err)
  }

  // Simpan juga versi pesan yang sudah dipangkas ke sessions agar database ramping
  try {
    await saveSession(sessionId, prunedMessages)
  } catch (e) {
    console.warn('[contextManager] Gagal menyimpan sessions:', e)
  }

  const finalChars = calculateSessionChars(
    tailMessages,
    newSummaryBlock,
    null // tailMessages sudah merupakan pesan setelah cutIndex
  )

  return {
    success: true,
    isCompacted: true,
    prunedOnly: false,
    compactedMessages: prunedMessages,
    tailMessages,
    lastCompactedMessageId,
    newSummaryBlock,
    currentChars: finalChars
  }
}

/**
 * Merakit payload prompt LLM secara non-destructive dengan summary block jika tersedia
 */
export function assembleCompactedPayload({
  messages = [],
  sessionCompact = null,
  systemPrompt = ''
}) {
  const payload = []

  if (systemPrompt) {
    payload.push({ role: 'system', content: systemPrompt })
  }

  const summaryBlock = sessionCompact?.summaryBlock || sessionCompact?.summary_block
  const lastCompactedId =
    sessionCompact?.lastCompactedMessageId || sessionCompact?.last_compacted_message_id

  if (summaryBlock && lastCompactedId) {
    // Cari index dari pesan dengan id lastCompactedId
    let cutIndex = -1
    for (let i = 0; i < messages.length; i++) {
      if (getMessageId(messages[i], i) === String(lastCompactedId)) {
        cutIndex = i
        break
      }
    }

    // Jika pesan batas ditemukan, ambil pesan setelah cutIndex
    const activeSlice = cutIndex !== -1 ? messages.slice(cutIndex + 1) : messages.slice(-1)

    // Sisipkan summary block sebagai pesan user pembuka konteks
    payload.push({
      role: 'user',
      content: `[ COMPACTED MESSAGE SUMMARY ] ${summaryBlock}`
    })

    // Masukkan pesan-pesan tail terkini
    for (const msg of activeSlice) {
      if (
        !msg ||
        msg.isThinking ||
        msg.isSearching ||
        msg.isSummarizing ||
        msg.role === 'command'
      ) {
        continue
      }
      payload.push({
        role: msg.role === 'ai' ? 'assistant' : msg.role,
        content: msg.content || ''
      })
    }

    return cleanOrphanToolPairs(payload)
  }

  // Jika belum ada summary, susun normal
  for (const msg of messages) {
    if (!msg || msg.isThinking || msg.isSearching || msg.isSummarizing || msg.role === 'command') {
      continue
    }
    payload.push({
      role: msg.role === 'ai' ? 'assistant' : msg.role,
      content: msg.content || ''
    })
  }

  return cleanOrphanToolPairs(payload)
}
