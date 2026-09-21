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

import { fetchAI } from './core.js'
import { getSessionCompact, saveSessionCompact, saveSession } from '../db.js'
import { compactCodeBlocks } from './contextCompactor.js'

export const MAX_CONTEXT_CHARS = 525000
export const GATEWAY_HYGIENE_THRESHOLD = 0.85 // Jaring pengaman pra-turn (85% kapasitas)
export const IN_LOOP_COMPACT_THRESHOLD = 0.5 // Ambang pemicu in-loop ReAct (50% kapasitas)
export const OLD_TOOL_PRUNE_CHAR_LIMIT = 200 // Batas karakter output tool lama untuk dipangkas
export const CLEARED_TOOL_PLACEHOLDER = '[Old tool output cleared to save context space]'

/**
 * Mendapatkan ID unik dari sebuah objek pesan
 */
export function getMessageId(msg, fallbackIndex = 0) {
  if (!msg) return `msg-${fallbackIndex}`
  return String(msg.id || msg.created_at || msg.timestamp || `msg-${fallbackIndex}`)
}

/**
 * Menghitung panjang karakter representasi sebuah pesan
 */
export function calculateMessageChars(msg) {
  if (!msg) return 0
  let total = 0

  // Konten teks & multimodal (normalisasi bobot gambar Base64)
  if (typeof msg.content === 'string') {
    if (msg.content.includes('data:image/')) {
      const normalized = msg.content.replace(
        /data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g,
        ''
      )
      total += normalized.length + 2000
    } else {
      total += msg.content.length
    }
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (!part) continue
      if (typeof part === 'string') {
        if (part.includes('data:image/')) {
          const normalized = part.replace(/data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g, '')
          total += normalized.length + 2000
        } else {
          total += part.length
        }
      } else if (part.type === 'text') {
        const textStr = part.text || ''
        if (textStr.includes('data:image/')) {
          const normalized = textStr.replace(
            /data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g,
            ''
          )
          total += normalized.length + 2000
        } else {
          total += textStr.length
        }
      } else if (part.type === 'image_url' || part.image_url || part.type === 'image') {
        // Satu gambar pada LLM bernilai ~258 s/d 500 token (~1.000 - 2.000 karakter ekuivalen),
        // BUKAN ukuran string Base64 mentah ratusan ribu karakter.
        total += 2000
      } else {
        total += JSON.stringify(part).length
      }
    }
  } else if (msg.content && typeof msg.content === 'object') {
    if (msg.content.type === 'image_url' || msg.content.image_url) {
      total += 2000
    } else {
      total += JSON.stringify(msg.content).length
    }
  }

  // Reasoning / Thought
  if (typeof msg.reasoning === 'string') total += msg.reasoning.length
  if (typeof msg.thought === 'string') total += msg.thought.length

  // Tool calls & executed tools (abaikan preview dataUrl base64 karena hanya untuk rendering UI)
  if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
    const sanitizedTools = msg.executedTools.map((t) => {
      if (!t) return t
      const copy = { ...t }
      delete copy.preview
      return copy
    })
    total += JSON.stringify(sanitizedTools).length
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
  let startIndex = 0
  let isBoundaryFound = false
  if (lastCompactedMessageId) {
    const targetId = String(lastCompactedMessageId)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (
        getMessageId(msg, i) === targetId ||
        String(msg?.id) === targetId ||
        String(msg?.timestamp) === targetId ||
        String(msg?.created_at) === targetId
      ) {
        startIndex = i + 1
        isBoundaryFound = true
        break
      }
    }
  }

  // Hanya hitung panjang summaryBlock jika batas pesan lama benar-benar ditemukan
  let total = isBoundaryFound && typeof summaryBlock === 'string' ? summaryBlock.length : 0

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
 * Fase 1 Hermes: Prune Old Tool Results (murah, O(n), tanpa panggilan LLM)
 * Mengganti output tool lama (> 200 karakter) di luar tail dengan placeholder:
 * "[Old tool output cleared to save context space]"
 */
export function pruneOldToolResultsInLoop(messages = [], protectLastN = 6) {
  if (!Array.isArray(messages) || messages.length === 0) return []

  const cloned = messages.map((m) => {
    if (!m) return m
    return {
      ...m,
      executedTools: Array.isArray(m.executedTools)
        ? m.executedTools.map((t) => ({ ...t }))
        : m.executedTools
    }
  })

  // Tentukan batas ekor (tail) yang dilindungi 100%
  const tailBoundary = Math.max(0, cloned.length - protectLastN)

  for (let i = 0; i < tailBoundary; i++) {
    const msg = cloned[i]
    if (!msg) continue

    // 1. Pesan role: 'tool' (Format native OpenAI/ReAct)
    if (msg.role === 'tool') {
      let shouldPrune = false
      let parsed = null

      if (typeof msg.content === 'string') {
        if (msg.content.length > OLD_TOOL_PRUNE_CHAR_LIMIT) {
          shouldPrune = true
          try {
            parsed = JSON.parse(msg.content)
          } catch {
            parsed = null
          }
        }
      } else if (typeof msg.content === 'object' && msg.content !== null) {
        shouldPrune = true
        parsed = msg.content
      }

      if (shouldPrune) {
        if (parsed && typeof parsed === 'object') {
          if (parsed.data || parsed.output || parsed.result) {
            parsed.data = CLEARED_TOOL_PLACEHOLDER
            if (parsed.output) parsed.output = CLEARED_TOOL_PLACEHOLDER
            if (parsed.result) parsed.result = CLEARED_TOOL_PLACEHOLDER
            msg.content = JSON.stringify(parsed)
          } else {
            msg.content = CLEARED_TOOL_PLACEHOLDER
          }
        } else {
          msg.content = CLEARED_TOOL_PLACEHOLDER
        }
      }
    }

    // 2. Pesan dengan executedTools (Format historis chat MARK)
    if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
      msg.executedTools = msg.executedTools.map((t) => {
        const next = { ...t }
        if (typeof t.fullResult === 'string' && t.fullResult.length > OLD_TOOL_PRUNE_CHAR_LIMIT) {
          next.fullResult = t.resultSummary || CLEARED_TOOL_PLACEHOLDER
        }
        // Bersihkan data URL base64 preview dari pesan lama untuk menghemat RAM dan storage
        if (typeof next.preview === 'string' && next.preview.startsWith('data:image/')) {
          next.preview = null
        }
        return next
      })
    }

    // 3. Kompaksi blok kode panjang di teks lama jika > 500 char
    if (typeof msg.content === 'string' && msg.content.length > 500) {
      msg.content = compactCodeBlocks(msg.content)
    }
  }

  return cloned
}

/**
 * Kompatibilitas mundur: Pruning output tool lama di memori
 */
export function pruneOldToolResultsInMemory(messages = [], preserveRecentTurns = 4) {
  return pruneOldToolResultsInLoop(messages, preserveRecentTurns * 2)
}

/**
 * Fase 2 Hermes: Penyelarasan batas mundur (Boundary Backward Alignment)
 * Menjaga agar pasangan tool_calls pada role assistant dan tool_result pada role tool
 * tidak pernah terputus/terbelah di antara batas potongan konteks.
 */
export function alignBoundaryBackward(messages = [], splitIndex = 0) {
  if (splitIndex <= 0 || splitIndex >= messages.length) return splitIndex

  let idx = splitIndex

  // Jika elemen di splitIndex adalah role: 'tool', mundur hingga ke role assistant pemanggilnya
  while (idx > 0 && messages[idx]?.role === 'tool') {
    idx--
  }

  // Jika elemen sebelumnya adalah assistant dengan tool_calls yang hasilnya berada di/setelah splitIndex,
  // mundur agar assistant ini berada di blok yang sama dengan hasil tool-nya
  if (idx > 0 && messages[idx]?.role === 'assistant' && Array.isArray(messages[idx]?.tool_calls)) {
    return idx
  }

  return idx
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
    let text = ''
    if (typeof msg.content === 'string') {
      text = msg.content
    } else if (Array.isArray(msg.content)) {
      const textParts = []
      for (const part of msg.content) {
        if (!part) continue
        if (typeof part === 'string') textParts.push(part)
        else if (part.type === 'text') textParts.push(part.text || '')
        else if (part.type === 'image_url' || part.image_url || part.type === 'image') {
          textParts.push('[Gambar terlampir oleh pengguna]')
        } else {
          textParts.push(JSON.stringify(part))
        }
      }
      text = textParts.join('\n')
    } else {
      text = JSON.stringify(msg.content || '')
    }

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

  const systemPrompt = `Kamu adalah Context Compressor untuk MARK AI OS (Handover Engine).
Tugasmu: Hasilkan DOKUMEN SERAH-TERIMA TEKNIS yang padat, terstruktur, dan akurat dengan format markdown berikut:

## Goal
[Apa yang ingin dicapai pengguna dalam tugas atau percakapan ini]

## Constraints & Preferences
[Aturan teknis, batasan pengguna, preferensi gaya koding atau arsitektur]

## Progress
### Done
[Pekerjaan yang telah selesai dilakukan: berkas yang diedit/dibuat, perintah shell, status verifikasi]
### In Progress
[Pekerjaan atau sub-langkah yang sedang berjalan saat ini]
### Blocked
[Hambatan, bug, atau kendala jika ada]

## Key Decisions
[Keputusan arsitektural/teknis penting dan alasannya]

## Relevant Files
[Daftar berkas yang dibaca, dimodifikasi, atau dibuat beserta catatan singkat 1 baris mengenai fungsinya]

## Next Steps
[Langkah kerja konkret berikutnya yang harus dilanjutkan]

## Critical Context
[Nilai konfigurasi, port, nama variabel, ID penting, atau pesan error mentah yang esensial]

Aturan Mutlak:
1. Jika terdapat [RINGKASAN SERAH-TERIMA SEBELUMNYA], PERBARUI dokumen tersebut: pindahkan item dari "In Progress" ke "Done", tambahkan berkas baru ke "Relevant Files", perbarui "Next Steps", dan singkirkan detail usang.
2. Pertahankan akurasi path berkas, nama fungsi, dan detail teknis tanpa halusinasi.
3. HANYA cetak dokumen markdown serah-terima di atas secara langsung tanpa kalimat pembuka atau penutup basa-basi.`

  const userPrompt = `[RINGKASAN SERAH-TERIMA SEBELUMNYA]:
${existingSummaryBlock ? existingSummaryBlock.trim() : '(Belum ada ringkasan sebelumnya / inisiasi pertama kali)'}

[PERCAKAPAN BARU YANG HARUS DIRANGKUM KE DOKUMEN SERAH-TERIMA]:
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
    if (!lastCompactedMsg.id && !lastCompactedMsg.timestamp && !lastCompactedMsg.created_at) {
      lastCompactedMsg.created_at = Date.now()
      lastCompactedMsg.id = `msg_${lastCompactedMsg.created_at}`
    }
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
 * Memformat pesan dengan riwayat executedTools utuh (100% fullResult tanpa batasan turn)
 */
export function formatMessageWithToolLogs(msg) {
  if (!msg) return ''
  if (Array.isArray(msg.content)) {
    let newContent = [...msg.content]
    if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
      const toolLog = msg.executedTools
        .map((t) => {
          const res = t.fullResult || t.resultSummary || 'OK'
          return `  * [Tool: ${t.tool}] query: "${t.query || ''}"\n    Hasil:\n${res}`
        })
        .join('\n\n')
      if (toolLog) {
        newContent.push({ type: 'text', text: `\n\n[RIWAYAT TOOL TURN INI]:\n${toolLog}` })
      }
    }
    const role = (msg.role || '').toLowerCase()
    if ((role === 'ai' || role === 'assistant') && msg.mood) {
      const textItemIdx = newContent.findIndex((p) => p && p.type === 'text')
      if (textItemIdx >= 0) {
        if (!/^(?:<|\[)mood:/i.test(newContent[textItemIdx].text || '')) {
          newContent[textItemIdx] = {
            ...newContent[textItemIdx],
            text: `<mood:${msg.mood}> ${newContent[textItemIdx].text || ''}`
          }
        }
      } else {
        newContent.unshift({ type: 'text', text: `<mood:${msg.mood}>` })
      }
    }
    return newContent
  }

  let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
  if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
    const toolLog = msg.executedTools
      .map((t) => {
        const res = t.fullResult || t.resultSummary || 'OK'
        return `  * [Tool: ${t.tool}] query: "${t.query || ''}"\n    Hasil:\n${res}`
      })
      .join('\n\n')
    if (toolLog) {
      content = `[RIWAYAT TOOL TURN INI]:\n${toolLog}\n\n[JAWABAN]:\n${content}`
    }
  }

  // Sisipkan tag mood pada pesan asisten jika ada dan belum tersemat
  const role = (msg.role || '').toLowerCase()
  if ((role === 'ai' || role === 'assistant') && msg.mood && !/^(?:<|\[)mood:/i.test(content)) {
    content = `<mood:${msg.mood}> ${content}`
  }

  return content
}

/**
 * Merakit payload prompt LLM secara non-destructive dengan summary block jika tersedia,
 * atau seluruh pesan 100% utuh beserta log tool jika belum melewati 525K karakter.
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
      const msg = messages[i]
      if (
        getMessageId(msg, i) === String(lastCompactedId) ||
        String(msg?.id) === String(lastCompactedId) ||
        String(msg?.timestamp) === String(lastCompactedId) ||
        String(msg?.created_at) === String(lastCompactedId)
      ) {
        cutIndex = i
        break
      }
    }

    if (cutIndex !== -1) {
      // Jika pesan batas ditemukan, ambil pesan setelah cutIndex
      const activeSlice = messages.slice(cutIndex + 1)

      // Sisipkan summary block sebagai pesan user pembuka konteks
      payload.push({
        role: 'user',
        content: `[ COMPACTED MESSAGE SUMMARY ] ${summaryBlock}`
      })

      // Masukkan pesan-pesan tail terkini dengan log tool utuh
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
          role: msg.role === 'ai' || msg.role === 'planSteps' ? 'assistant' : msg.role,
          content: formatMessageWithToolLogs(msg),
          mood: msg.mood || undefined
        })
      }

      return cleanOrphanToolPairs(payload)
    }

    // Jika cutIndex === -1 (ID batas tidak ditemukan di riwayat aktif),
    // artinya pointer kompaksi sudah kadaluarsa. JANGAN sisipkan ringkasan basi
    // dan JANGAN memenggal pesan ke slice(-1)! Alirkan seluruh riwayat pesan utuh.
    console.warn(
      `[contextManager] Pointer lastCompactedId "${lastCompactedId}" tidak ditemukan di array pesan aktif. Mengabaikan ringkasan basi dan mengirim seluruh riwayat pesan utuh.`
    )
  }

  // Jika belum ada summary (konteks < 525K), susun SELURUH pesan dan log tool 100% UTUH
  for (const msg of messages) {
    if (!msg || msg.isThinking || msg.isSearching || msg.isSummarizing || msg.role === 'command') {
      continue
    }
    payload.push({
      role: msg.role === 'ai' || msg.role === 'planSteps' ? 'assistant' : msg.role,
      content: formatMessageWithToolLogs(msg),
      mood: msg.mood || undefined
    })
  }

  return cleanOrphanToolPairs(payload)
}

/**
 * In-Flight Pruning untuk loop ReAct.
 * Murni berbasis kapasitas ambang batas 525K karakter (MAX_CONTEXT_CHARS).
 * Jika selama giliran panjang (banyak pemanggilan tool) akumulasi loopMessages >= MAX_CONTEXT_CHARS,
 * pangkas data output tool terlama di dalam loopMessages sampai total karakter kembali < MAX_CONTEXT_CHARS.
 */
export function pruneInFlightMessages(messages = [], maxChars = MAX_CONTEXT_CHARS) {
  if (!Array.isArray(messages) || messages.length === 0) return messages

  let totalChars = 0
  for (const m of messages) {
    totalChars += calculateMessageChars(m)
  }

  if (totalChars < maxChars) return messages

  // Pangkas output tool terlama satu per satu sampai di bawah maxChars
  for (let i = 0; i < messages.length; i++) {
    if (totalChars < maxChars) break
    const m = messages[i]
    if (m && m.role === 'tool' && m.content) {
      const origLen =
        typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length
      let parsed = null
      try {
        parsed = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
      } catch (err) {
        void err
      }

      if (parsed && (parsed.data || parsed.output)) {
        const prunedText = '[Output dipangkas: kapasitas sesi mencapai 525K]'
        parsed.data = prunedText
        if (parsed.output) parsed.output = prunedText
        m.content = JSON.stringify(parsed)
        const newLen = m.content.length
        totalChars -= origLen - newLen
      } else if (typeof m.content === 'string' && m.content.length > 200) {
        m.content = '[Output tool lama dipangkas karena kapasitas 525K]'
        totalChars -= origLen - m.content.length
      }
    }
  }

  return messages
}

/**
 * In-Loop Context Guard untuk ReAct loop (Lead Agent & Sub-Agent).
 * Dipanggil di setiap iterasi ReAct loop sebelum mengirim prompt ke LLM.
 *
 * Mengimplementasikan 4 Fase Hermes secara in-place:
 * - Fase 1: Zero-cost O(n) pruning pada tool output lama di luar tail (>200 karakter)
 * - Fase 2: Backward boundary alignment untuk menjaga pasangan tool_calls dan tool_result
 * - Fase 3: Structured Handover Summary dengan update iteratif
 * - Fase 4: Perakitan pesan in-place stabil pada session ID yang sama
 */
export async function checkAndCompressInLoop({
  loopMessages = [],
  sessionId = '1',
  maxChars = MAX_CONTEXT_CHARS,
  thresholdRatio = IN_LOOP_COMPACT_THRESHOLD,
  protectLastN = 6,
  protectFirstN = 2,
  activeConfig = {},
  onProgress = null
}) {
  if (!Array.isArray(loopMessages) || loopMessages.length <= protectLastN + protectFirstN) {
    return { compressed: false, loopMessages }
  }

  const triggerLimit = maxChars * thresholdRatio
  let totalChars = 0
  let sessionChars = 0
  for (const m of loopMessages) {
    const chars = calculateMessageChars(m)
    totalChars += chars
    if (m.role !== 'system') {
      sessionChars += chars
    }
  }

  // Jika masih di bawah ambang batas (50% dari maxChars) dan jumlah pesan belum terlalu panjang (< 24),
  // tidak memerlukan kompresi
  if (totalChars < triggerLimit && loopMessages.length < 24) {
    return { compressed: false, loopMessages, totalChars: sessionChars }
  }

  if (typeof onProgress === 'function') {
    onProgress({ stage: 'pruning', text: 'In-loop: Memangkas log tool lama...' })
  }

  // FASE 1: Zero-cost O(n) Tool Pruning
  const prunedMessages = pruneOldToolResultsInLoop(loopMessages, protectLastN)
  let prunedChars = 0
  let prunedSessionChars = 0
  for (const m of prunedMessages) {
    const chars = calculateMessageChars(m)
    prunedChars += chars
    if (m.role !== 'system') {
      prunedSessionChars += chars
    }
  }

  // Jika Fase 1 saja sudah cukup membawa konteks di bawah ambang batas 50%:
  if (prunedChars < triggerLimit) {
    const didPrune = prunedChars < totalChars
    return {
      compressed: didPrune,
      prunedOnly: true,
      loopMessages: prunedMessages,
      totalChars: prunedSessionChars
    }
  }

  // FASE 2: Tentukan Batas Head, Middle, dan Tail dengan Backward Alignment
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'summarizing', text: 'In-loop: Merangkum serah-terima teknis...' })
  }

  const head = prunedMessages.slice(0, Math.min(protectFirstN, prunedMessages.length))
  const rawTailStart = Math.max(head.length, prunedMessages.length - protectLastN)
  const alignedTailStart = alignBoundaryBackward(prunedMessages, rawTailStart)
  const middle = prunedMessages.slice(head.length, alignedTailStart)
  const tail = prunedMessages.slice(alignedTailStart)

  if (middle.length === 0) {
    return {
      compressed: true,
      prunedOnly: true,
      loopMessages: prunedMessages,
      totalChars: prunedChars
    }
  }

  // Ambil summary serah-terima sebelumnya jika ada
  let existingSummary = ''
  try {
    const compactRec = await getSessionCompact(sessionId)
    if (compactRec) {
      existingSummary = compactRec.summaryBlock || compactRec.summary_block || ''
    }
  } catch {
    /* ignore */
  }

  // FASE 3: Generate Structured Handover Summary (Iteratif)
  const newSummary = await summarizeMiddle(middle, existingSummary, activeConfig)

  // Simpan ringkasan baru secara in-place ke session_compact
  try {
    const lastMiddleMsg = middle[middle.length - 1]
    await saveSessionCompact(sessionId, {
      summaryBlock: newSummary,
      lastCompactedMessageId: getMessageId(lastMiddleMsg, alignedTailStart - 1),
      lastCompactedAt: Date.now()
    })
  } catch (err) {
    console.warn('[contextManager] In-loop saveSessionCompact gagal:', err)
  }

  // FASE 4: Perakitan Pesan In-Place [Head] + [Handover Summary] + [Tail]
  const handoverContent = `[ CONTEXT COMPACTION (IN-LOOP HANDOVER) ]\n${newSummary}`
  const assembled = [
    ...head,
    {
      role: 'user',
      content: handoverContent
    },
    ...tail
  ]

  const sanitized = cleanOrphanToolPairs(assembled)
  let finalSessionChars = 0
  for (const m of sanitized) {
    if (m.role !== 'system') {
      finalSessionChars += calculateMessageChars(m)
    }
  }

  return {
    compressed: true,
    prunedOnly: false,
    loopMessages: sanitized,
    totalChars: finalSessionChars,
    newSummaryBlock: newSummary
  }
}
