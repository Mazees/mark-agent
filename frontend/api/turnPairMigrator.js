import { generateVector } from './vectorMemory'
import {
  getAllSessions,
  saveBatchChatTurns,
  saveChatTurn
} from './db'
import { insertBatchTurnPairsToOrama, insertTurnPairToOrama } from './oramaStore'

/**
 * Ekstraksi teks murni dari objek pesan (mendukung string biasa atau array multimodal)
 */
function cleanMessageContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const textPart = content.find((c) => c.type === 'text')
    return textPart?.text ? textPart.text.trim() : ''
  }
  if (content && typeof content === 'object' && content.text) {
    return String(content.text).trim()
  }
  return ''
}

function normalizeTimestamp(ts) {
  if (typeof ts === 'number' && !isNaN(ts)) return ts
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts)
    if (!isNaN(parsed)) return parsed
    const num = Number(ts)
    if (!isNaN(num)) return num
  }
  return Date.now()
}

/**
 * Memetakan riwayat pesan satu sesi menjadi array Turn Pairs (Tanya - Jawab)
 */
export function extractTurnPairsFromSession(sessionData, sessionId, sessionTitle) {
  const pairs = []
  if (!Array.isArray(sessionData) || sessionData.length === 0) return pairs

  const cleanTitle = sessionTitle || `Session ${sessionId}`

  for (let i = 0; i < sessionData.length; i++) {
    const msg = sessionData[i]
    if (!msg) continue

    // Abaikan pesan intermediate / thinking / searching
    if (msg.isThinking || msg.isSearching || msg.isSummarizing) continue

    if (msg.role === 'user') {
      const userText = cleanMessageContent(msg.content)
      if (!userText || userText.length < 2) continue

      // Cari balasan AI yang sesuai setelah pesan user ini
      let aiText = ''
      let aiMsgTimestamp = null

      for (let j = i + 1; j < sessionData.length; j++) {
        const nextMsg = sessionData[j]
        if (!nextMsg) continue
        if (nextMsg.role === 'user') break // Berhenti jika sudah bertemu pesan user berikutnya
        if (nextMsg.role === 'ai' && !nextMsg.isThinking && !nextMsg.isSearching && !nextMsg.isSummarizing) {
          aiText = cleanMessageContent(nextMsg.content)
          aiMsgTimestamp = nextMsg.timestamp
          break
        }
      }

      // Pastikan ada konten yang bermakna
      if (userText.length > 2 || aiText.length > 2) {
        const rawTs = msg.timestamp || aiMsgTimestamp || Date.now()
        const timestamp = normalizeTimestamp(rawTs)
        const pairId = `turn-${sessionId}-${timestamp}-${i}`
        const combinedText = `[User]: ${userText}\n[Mark]: ${aiText || '(Menjalankan instruksi)'}`

        pairs.push({
          pairId,
          sessionId: Number(sessionId),
          sessionTitle: cleanTitle,
          userText,
          aiText,
          combinedText,
          timestamp
        })
      }
    }
  }

  return pairs
}

/**
 * Migrasi bertahap data chat lama ke dalam format Turn-Pair Vektor (Smart Incremental Queue)
 */
export async function migrateOldSessionsToTurns(onProgress) {
  try {
    const sessions = await getAllSessions()
    if (!Array.isArray(sessions) || sessions.length === 0) return 0

    // Kumpulkan seluruh turn pair dari semua sesi
    const allPairs = []
    for (const session of sessions) {
      const turns = extractTurnPairsFromSession(session.data, session.id, session.title)
      allPairs.push(...turns)
    }

    const totalCount = allPairs.length
    if (totalCount === 0) return 0

    console.log(`[TurnMigrator] Memulai migrasi ${totalCount} turn pairs lama...`)
    if (typeof onProgress === 'function') {
      onProgress(0, totalCount)
    }

    const BATCH_SIZE = 5
    let processedCount = 0

    for (let i = 0; i < allPairs.length; i += BATCH_SIZE) {
      const batch = allPairs.slice(i, i + BATCH_SIZE)
      const validTurns = []

      for (const turn of batch) {
        try {
          const vector = await generateVector(turn.combinedText)
          if (vector && vector.length === 384) {
            validTurns.push({
              ...turn,
              vector
            })
          }
        } catch (err) {
          console.warn(`[TurnMigrator] Gagal generate vector untuk turn ${turn.pairId}:`, err)
        }
      }

      if (validTurns.length > 0) {
        await saveBatchChatTurns(validTurns)
        await insertBatchTurnPairsToOrama(validTurns)
      }

      processedCount += batch.length
      if (typeof onProgress === 'function') {
        onProgress(Math.min(processedCount, totalCount), totalCount)
      }

      // Jeda istirahat CPU (60ms) agar event loop tetap responsif
      await new Promise((resolve) => setTimeout(resolve, 60))
    }

    console.log(`[TurnMigrator] Sukses menyelesaikan migrasi ${totalCount} turn pairs!`)
    return totalCount
  } catch (error) {
    console.error('[TurnMigrator] Error saat migrasi sessions to turns:', error)
    return 0
  }
}

/**
 * Pengindeksan instan 1 pasang percakapan secara real-time saat chat selesai
 */
export async function indexSingleTurn(sessionId, sessionTitle, userMsg, aiMsg) {
  try {
    const userText = cleanMessageContent(userMsg?.content || userMsg)
    const aiText = cleanMessageContent(aiMsg?.content || aiMsg)

    if (!userText && !aiText) return null
    if (userText.length < 2 && aiText.length < 2) return null

    const timestamp = Date.now()
    const pairId = `turn-${sessionId}-${timestamp}`
    const combinedText = `[User]: ${userText}\n[Mark]: ${aiText || '(Menjalankan instruksi)'}`

    const vector = await generateVector(combinedText)
    if (!vector || vector.length !== 384) {
      console.warn('[TurnMigrator] Gagal generate vector untuk turn baru')
      return null
    }

    const turnData = {
      pairId,
      sessionId: Number(sessionId) || 1,
      sessionTitle: sessionTitle || 'Main Thread',
      userText,
      aiText,
      combinedText,
      timestamp,
      vector
    }

    await saveChatTurn(turnData)
    await insertTurnPairToOrama(turnData)

    console.log(`[TurnMigrator] Realtime indexed turn pair: ${pairId}`)
    return turnData
  } catch (err) {
    console.error('[TurnMigrator] Error indexSingleTurn:', err)
    return null
  }
}
