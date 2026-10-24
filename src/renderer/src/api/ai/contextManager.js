/**
 * Context Manager Engine (MARK v5.0.0)
 * Mengelola siklus context management per-session:
 * - Batas global konstanta 256.000 tokens (MAX_CONTEXT_TOKENS) via gpt-tokenizer BPE
 * - Penghitungan token presisi in-memory per sesi (system prompt + multimodal + messages)
 * - Tahap 1: Pruning output tool lama di memori (0ms delay, tanpa AI)
 * - Tahap 2: AI Summarization inkremental (Gemini Web -> fallback active provider)
 * - Pembersihan orphan tool pairs
 * - Perakitan payload prompt berformat [ COMPACTED MESSAGE SUMMARY ]
 */

import { countTokens as countBpeTokens } from 'gpt-tokenizer'
import { fetchAI } from './core.js'
import { getSessionCompact, saveSessionCompact, saveSession } from '../db.js'
import { compactCodeBlocks } from './contextCompactor.js'

export const MAX_CONTEXT_TOKENS = 256000 // 256K tokens
export const MAX_CONTEXT_CHARS = 256000 // Legacy backward-compatibility alias disinkronkan ke 256K
export const GATEWAY_HYGIENE_THRESHOLD = 0.9 // 90% kapasitas = 230.4K tokens
export const IN_LOOP_COMPACT_THRESHOLD = GATEWAY_HYGIENE_THRESHOLD
export const OLD_TOOL_PRUNE_CHAR_LIMIT = 200 // Batas karakter output tool lama untuk dipangkas
export const CLEARED_TOOL_PLACEHOLDER = '[Old tool output cleared to save context space]'

const tokenCountCache = new Map()
const TOKEN_CACHE_MAX_ENTRIES = 512
const TOKEN_CACHE_MAX_CHARACTERS = 2_000_000
let tokenCacheCharacters = 0

/**
 * Helper menghitung token teks murni via BPE tokenizer (gpt-tokenizer)
 */
export function countTokens(text) {
  if (!text || typeof text !== 'string') return 0
  const cached = tokenCountCache.get(text)
  if (cached !== undefined) {
    tokenCountCache.delete(text)
    tokenCountCache.set(text, cached)
    return cached
  }
  try {
    const tokens = countBpeTokens(text)
    if (text.length <= TOKEN_CACHE_MAX_CHARACTERS) {
      while (
        tokenCountCache.size >= TOKEN_CACHE_MAX_ENTRIES ||
        tokenCacheCharacters + text.length > TOKEN_CACHE_MAX_CHARACTERS
      ) {
        const oldest = tokenCountCache.keys().next().value
        tokenCountCache.delete(oldest)
        tokenCacheCharacters -= oldest.length
      }
      tokenCountCache.set(text, tokens)
      tokenCacheCharacters += text.length
    }
    return tokens
  } catch {
    return Math.ceil(text.length / 4)
  }
}

/**
 * Mendapatkan ID unik dari sebuah objek pesan
 */
export function getMessageId(msg, fallbackIndex = 0) {
  if (!msg) return `msg-${fallbackIndex}`
  return String(msg.id || msg.created_at || msg.timestamp || `msg-${fallbackIndex}`)
}

/**
 * Menghitung panjang karakter representasi sebuah pesan (legacy helper)
 */
export function calculateMessageChars(msg) {
  if (!msg) return 0
  let total = 0

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

  if (typeof msg.reasoning === 'string') total += msg.reasoning.length
  if (typeof msg.thought === 'string') total += msg.thought.length

  const steps = msg.executionSteps || msg.executedTools
  if (Array.isArray(steps) && steps.length > 0) {
    const sanitizedTools = steps.map((t) => {
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
 * Menghitung estimasi token presisi sebuah pesan.
 * Prioritas:
 * 1. Token yang sudah tersimpan di database/objek pesan (msg.tokens)
 * 2. Token completion resmi dari API (msg.usage.completion_tokens)
 * 3. Fallback hitung lokal via BPE tokenizer (gpt-tokenizer) lalu simpan ke msg.tokens
 */
export function calculateMessageTokens(msg) {
  if (!msg) return 0

  // 1. Jika token sudah tersimpan di database/objek pesan, langsung gunakan tanpa hitung ulang
  if (typeof msg.tokens === 'number' && msg.tokens > 0) {
    return msg.tokens
  }

  // 2. Jika pesan memiliki usage completion_tokens resmi dari API
  if (
    msg.usage &&
    typeof msg.usage.completion_tokens === 'number' &&
    msg.usage.completion_tokens > 0
  ) {
    msg.tokens = msg.usage.completion_tokens
    return msg.tokens
  }

  let total = 0

  // Konten teks & multimodal (normalisasi bobot gambar Base64)
  if (typeof msg.content === 'string') {
    if (msg.content.includes('data:image/')) {
      const normalized = msg.content.replace(
        /data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g,
        ''
      )
      total += countTokens(normalized) + 1000
    } else {
      total += countTokens(msg.content)
    }
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (!part) continue
      if (typeof part === 'string') {
        if (part.includes('data:image/')) {
          const normalized = part.replace(/data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g, '')
          total += countTokens(normalized) + 1000
        } else {
          total += countTokens(part)
        }
      } else if (part.type === 'text') {
        const textStr = part.text || ''
        if (textStr.includes('data:image/')) {
          const normalized = textStr.replace(
            /data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g,
            ''
          )
          total += countTokens(normalized) + 1000
        } else {
          total += countTokens(textStr)
        }
      } else if (part.type === 'image_url' || part.image_url || part.type === 'image') {
        // Satu gambar pada LLM bernilai ~1000 token
        total += 1000
      } else {
        total += countTokens(JSON.stringify(part))
      }
    }
  } else if (msg.content && typeof msg.content === 'object') {
    if (msg.content.type === 'image_url' || msg.content.image_url) {
      total += 1000
    } else {
      total += countTokens(JSON.stringify(msg.content))
    }
  }

  // Reasoning / Thought
  if (typeof msg.reasoning === 'string') total += countTokens(msg.reasoning)
  if (typeof msg.thought === 'string') total += countTokens(msg.thought)

  // Tool calls & executed tools / execution steps (abaikan preview dataUrl base64 karena hanya untuk rendering UI)
  const steps = msg.executionSteps || msg.executedTools
  if (Array.isArray(steps) && steps.length > 0) {
    const sanitizedTools = steps.map((t) => {
      if (!t) return t
      const copy = { ...t }
      delete copy.preview
      return copy
    })
    total += countTokens(JSON.stringify(sanitizedTools))
  }
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    total += countTokens(JSON.stringify(msg.tool_calls))
  }

  // Simpan hasil hitungan ke objek pesan agar tidak dihitung ulang lagi
  msg.tokens = total
  return total
}

/**
 * Menghitung total token pesan satu sesi + ringkasan aktif + system prompt di memori.
 * Prioritas utama: Menggunakan usage.total_tokens dari DB/API jika ada.
 * Fallback: BPE tokenizer (gpt-tokenizer) dengan caching per-pesan.
 */
export function calculateSessionTokens(
  messages = [],
  summaryBlock = '',
  lastCompactedMessageId = null,
  systemPrompt = '',
  lastCompactedAt = null
) {
  void lastCompactedAt
  return calculatePayloadTokens(
    assembleCompactedPayload({
      messages,
      sessionCompact: { summaryBlock, lastCompactedMessageId },
      systemPrompt
    })
  )
}

function countPayloadContentTokens(content) {
  if (typeof content === 'string') {
    const imageMatches = content.match(/data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g)
    if (!imageMatches) return countTokens(content)
    return (
      countTokens(content.replaceAll(/data:image\/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=]+/g, '')) +
      imageMatches.length * 1000
    )
  }
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (part?.type === 'image_url' || part?.image_url || part?.type === 'image') {
        return total + 1000
      }
      return total + countPayloadContentTokens(part?.type === 'text' ? part.text : part)
    }, 0)
  }
  if (content && typeof content === 'object') return countTokens(JSON.stringify(content))
  return 0
}

export function calculatePayloadTokens(messages = []) {
  return messages.reduce((total, msg) => {
    if (
      !msg ||
      msg.isThinking ||
      msg.isSearching ||
      msg.isSummarizing ||
      msg.isCompacting ||
      msg.role === 'command'
    )
      return total
    return (
      total +
      countPayloadContentTokens(msg.content) +
      (Array.isArray(msg.tool_calls) ? countTokens(JSON.stringify(msg.tool_calls)) : 0) +
      4
    )
  }, 0)
}

/**
 * Kompatibilitas mundur: Menghitung session tokens (dialihkan langsung ke calculateSessionTokens)
 */
export function calculateSessionChars(
  messages = [],
  summaryBlock = '',
  lastCompactedMessageId = null,
  systemPrompt = '',
  lastCompactedAt = null
) {
  return calculateSessionTokens(
    messages,
    summaryBlock,
    lastCompactedMessageId,
    systemPrompt,
    lastCompactedAt
  )
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
      executionSteps: Array.isArray(m.executionSteps)
        ? m.executionSteps.map((t) => ({ ...t }))
        : m.executionSteps,
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

    // 2. Pesan dengan executionSteps / executedTools (Format historis chat MARK)
    const targetSteps = msg.executionSteps || msg.executedTools
    if (Array.isArray(targetSteps) && targetSteps.length > 0) {
      const pruned = targetSteps.map((t) => {
        if (!t || t.type === 'narration') return t
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
      if (msg.executionSteps) msg.executionSteps = pruned
      if (msg.executedTools) msg.executedTools = pruned
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
  activeConfig = {},
  onProgress = null,
  signal = null
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

  const chunks = []
  let chunk = ''
  for (const line of formattedLines) {
    if (chunk && chunk.length + line.length + 2 > 90000) {
      chunks.push(chunk)
      chunk = ''
    }
    chunk += `${chunk ? '\n\n' : ''}${line}`
  }
  if (chunk) chunks.push(chunk)

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

  let summary = existingSummaryBlock
  for (let index = 0; index < chunks.length; index++) {
    onProgress?.({
      stage: 'summarizing',
      text: `Merangkum konteks percakapan (${index + 1}/${chunks.length})...`
    })
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timeoutId = setTimeout(abort, 60000)
    try {
      const response = await fetchAI(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `[RINGKASAN SERAH-TERIMA SEBELUMNYA]:\n${summary || '(Belum ada ringkasan sebelumnya)'}\n\n[PERCAKAPAN BARU YANG HARUS DIRANGKUM]:\n${chunks[index]}`
          }
        ],
        false,
        { isSmallTask: true, configOverride: activeConfig, signal: controller.signal }
      )
      if (!response?.content?.trim() || response.error) {
        throw new Error('Context summarizer tidak menghasilkan ringkasan yang valid.')
      }
      summary = response.content.trim()
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abort)
    }
  }
  return summary
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
  force = false,
  systemPrompt = '',
  signal = null
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

  if (
    existingLastCompactedId &&
    !messages.some(
      (msg, index) =>
        getMessageId(msg, index) === String(existingLastCompactedId) ||
        String(msg?.id) === String(existingLastCompactedId) ||
        String(msg?.timestamp) === String(existingLastCompactedId) ||
        String(msg?.created_at) === String(existingLastCompactedId)
    )
  ) {
    existingSummaryBlock = ''
    existingLastCompactedId = null
  }

  const currentTokens = calculateSessionTokens(
    messages,
    existingSummaryBlock,
    existingLastCompactedId,
    systemPrompt
  )
  const triggerTokens = MAX_CONTEXT_TOKENS * GATEWAY_HYGIENE_THRESHOLD
  if (!force && currentTokens < triggerTokens) {
    return {
      success: true,
      isCompacted: false,
      compactedMessages: messages,
      currentTokens,
      currentChars: currentTokens
    }
  }

  // -------------------------------------------------------------
  // TAHAP 1: Pruning Tool Output di Memori
  // -------------------------------------------------------------
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'pruning', text: 'Memangkas log tool di memori...' })
  }

  const prunedMessages = pruneOldToolResultsInMemory(messages, 4)
  const prunedTokens = calculateSessionTokens(
    prunedMessages,
    existingSummaryBlock,
    existingLastCompactedId,
    systemPrompt
  )

  // Jika pruning saja memberi ruang aman untuk giliran berikutnya.
  if (!force && prunedTokens < triggerTokens) {
    // Simpan hasil prune ke tabel sessions
    if (!(await saveSession(sessionId, prunedMessages))) {
      throw new Error('Gagal menyimpan hasil pemangkasan konteks sesi.')
    }

    return {
      success: true,
      isCompacted: true,
      prunedOnly: true,
      compactedMessages: prunedMessages,
      currentTokens: prunedTokens,
      currentChars: prunedTokens
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

    newSummaryBlock = await summarizeMiddle(
      messagesToSummarize,
      existingSummaryBlock,
      activeConfig,
      onProgress,
      signal
    )
  }

  // Simpan pesan sebelum pointer ringkasan agar pointer selalu merujuk riwayat persisten.
  if (!(await saveSession(sessionId, prunedMessages))) {
    throw new Error('Gagal menyimpan riwayat sesi setelah kompaksi.')
  }
  if (
    !(await saveSessionCompact(sessionId, {
      summaryBlock: newSummaryBlock,
      lastCompactedMessageId,
      lastCompactedAt: Date.now()
    }))
  ) {
    throw new Error('Gagal menyimpan ringkasan konteks sesi.')
  }

  const finalTokens = calculateSessionTokens(
    prunedMessages,
    newSummaryBlock,
    lastCompactedMessageId,
    systemPrompt
  )

  return {
    success: true,
    isCompacted: true,
    prunedOnly: false,
    compactedMessages: prunedMessages,
    tailMessages,
    lastCompactedMessageId,
    newSummaryBlock,
    currentTokens: finalTokens,
    currentChars: finalTokens
  }
}

/**
 * Memformat pesan dengan riwayat executionSteps/executedTools utuh (100% fullResult tanpa batasan turn)
 */
export function formatMessageWithToolLogs(msg) {
  if (!msg) return ''
  const steps = msg.executionSteps || msg.executedTools
  if (Array.isArray(msg.content)) {
    let newContent = [...msg.content]
    if (Array.isArray(steps) && steps.length > 0) {
      const toolLog = steps
        .map((t) => {
          if (t.type === 'intervention') {
            return `  * [Intervensi Pengguna]: "${t.text || ''}"`
          }
          if (t.type === 'narration' || (!t.tool && t.text)) {
            return `  * [Catatan Narasi AI]: "${t.text || ''}"`
          }
          const res = t.fullResult || t.resultSummary || 'OK'
          const reasonStr = t.reason ? ` (${t.reason})` : ''
          return `  * [Tool: ${t.tool || t.task || 'tool'}]${reasonStr} query: "${t.query || ''}"\n    Hasil:\n${res}`
        })
        .join('\n\n')
      if (toolLog) {
        newContent.push({
          type: 'text',
          text: `\n\n[RIWAYAT LANGKAH EKSEKUSI TURN INI]:\n${toolLog}`
        })
      }
    }
    const role = (msg.role || '').toLowerCase()
    if ((role === 'ai' || role === 'assistant') && msg.mood) {
      const textItemIdx = newContent.findIndex((p) => p && p.type === 'text')
      if (textItemIdx >= 0) {
        if (!/<mark\b/i.test(newContent[textItemIdx].text || '')) {
          newContent[textItemIdx] = {
            ...newContent[textItemIdx],
            text: `<mark mood="${msg.mood}" done="true" /> ${newContent[textItemIdx].text || ''}`
          }
        }
      } else {
        newContent.unshift({ type: 'text', text: `<mark mood="${msg.mood}" done="true" />` })
      }
    }
    return newContent
  }

  let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
  if (Array.isArray(steps) && steps.length > 0) {
    const toolLog = steps
      .map((t) => {
        if (t.type === 'intervention') {
          return `  * [Intervensi Pengguna]: "${t.text || ''}"`
        }
        if (t.type === 'narration' || (!t.tool && t.text)) {
          return `  * [Catatan Narasi AI]: "${t.text || ''}"`
        }
        const res = t.fullResult || t.resultSummary || 'OK'
        const reasonStr = t.reason ? ` (${t.reason})` : ''
        return `  * [Tool: ${t.tool || t.task || 'tool'}]${reasonStr} query: "${t.query || ''}"\n    Hasil:\n${res}`
      })
      .join('\n\n')
    if (toolLog) {
      content = `[RIWAYAT LANGKAH EKSEKUSI TURN INI]:\n${toolLog}\n\n[JAWABAN]:\n${content}`
    }
  }

  // Sisipkan tag mood pada pesan asisten jika ada dan belum tersemat
  const role = (msg.role || '').toLowerCase()
  if ((role === 'ai' || role === 'assistant') && msg.mood && !/<mark\b/i.test(content)) {
    content = `<mark mood="${msg.mood}" done="true" /> ${content}`
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
 * Berbasis kapasitas ambang batas 256K tokens (MAX_CONTEXT_TOKENS).
 * Jika selama giliran panjang akumulasi loopMessages >= MAX_CONTEXT_TOKENS,
 * pangkas data output tool terlama di dalam loopMessages sampai total token kembali < MAX_CONTEXT_TOKENS.
 */
export function pruneInFlightMessages(messages = [], maxTokens = MAX_CONTEXT_TOKENS) {
  if (!Array.isArray(messages) || messages.length === 0) return messages

  let totalTokens = calculatePayloadTokens(messages)

  if (totalTokens < maxTokens) return messages

  // Pangkas output tool terlama satu per satu sampai di bawah maxTokens
  for (let i = 0; i < messages.length; i++) {
    if (totalTokens < maxTokens) break
    const m = messages[i]
    if (m && m.role === 'tool' && m.content) {
      const origTokens = calculatePayloadTokens([m])
      let parsed = null
      try {
        parsed = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
      } catch (err) {
        void err
      }

      if (parsed && (parsed.data || parsed.output)) {
        const prunedText = '[Output dipangkas: kapasitas sesi mencapai 256K tokens]'
        parsed.data = prunedText
        if (parsed.output) parsed.output = prunedText
        m.content = JSON.stringify(parsed)
        m.tokens = null // invalidate cache
        const newTokens = calculatePayloadTokens([m])
        totalTokens -= origTokens - newTokens
      } else if (typeof m.content === 'string' && m.content.length > 200) {
        m.content = '[Output tool lama dipangkas karena kapasitas 256K tokens]'
        m.tokens = null
        const newTokens = calculatePayloadTokens([m])
        totalTokens -= origTokens - newTokens
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
  maxTokens = MAX_CONTEXT_TOKENS,
  maxChars = null, // backward compatibility
  thresholdRatio = IN_LOOP_COMPACT_THRESHOLD,
  protectLastN = 6,
  protectFirstN = 2,
  activeConfig = {},
  onProgress = null,
  systemPrompt = '',
  reservedTokens = 0,
  signal = null
}) {
  void maxChars
  if (!Array.isArray(loopMessages) || loopMessages.length <= protectLastN + protectFirstN) {
    return { compressed: false, loopMessages }
  }

  const effectiveMaxTokens = maxTokens || MAX_CONTEXT_TOKENS
  const triggerLimit = effectiveMaxTokens * thresholdRatio
  const systemTokens =
    (loopMessages.some((m) => m?.role === 'system') ? 0 : countTokens(systemPrompt)) +
    Math.max(0, Number(reservedTokens) || 0)
  const totalTokens = systemTokens + calculatePayloadTokens(loopMessages)

  if (totalTokens < triggerLimit) {
    return {
      compressed: false,
      loopMessages,
      totalTokens,
      totalChars: totalTokens
    }
  }

  if (typeof onProgress === 'function') {
    onProgress({ stage: 'pruning', text: 'In-loop: Memangkas log tool lama...' })
  }

  // FASE 1: Zero-cost O(n) Tool Pruning
  const prunedMessages = pruneOldToolResultsInLoop(loopMessages, protectLastN)
  const prunedTokens = systemTokens + calculatePayloadTokens(prunedMessages)

  // Pruning yang cukup mengembalikan ruang aman tidak perlu panggilan summarizer.
  if (prunedTokens < triggerLimit) {
    const didPrune = prunedTokens < totalTokens
    return {
      compressed: didPrune,
      prunedOnly: true,
      loopMessages: prunedMessages,
      totalTokens: prunedTokens,
      totalChars: prunedTokens
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
      compressed: prunedTokens < totalTokens,
      prunedOnly: true,
      loopMessages: prunedMessages,
      totalTokens: prunedTokens,
      totalChars: prunedTokens
    }
  }

  void sessionId
  const newSummary = await summarizeMiddle(middle, '', activeConfig, onProgress, signal)

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
  const finalSessionTokens = systemTokens + calculatePayloadTokens(sanitized)

  return {
    compressed: true,
    prunedOnly: false,
    loopMessages: sanitized,
    totalTokens: finalSessionTokens,
    totalChars: finalSessionTokens,
    newSummaryBlock: newSummary
  }
}
