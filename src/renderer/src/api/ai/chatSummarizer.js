import { fetchAI } from './core'
import { generateVector } from '../vectorMemory'
import { insertChatArchive } from '../db'
import { insertArchiveToOrama } from '../oramaStore'

export async function summarizeAndArchive(recentMessages, activeTopic, config) {
  if (!recentMessages || recentMessages.length === 0) return

  const systemPrompt = `Kamu adalah sistem internal Mark. Tugasmu merangkum percakapan di bawah ini menjadi 2-3 kalimat ringkas namun informatif.

Aturan:
1. Sebutkan SIAPA yang membicarakan APA.
2. Jika ada keputusan, kesepakatan, atau fakta penting, wajib dicatat.
3. Jika ada emosi kuat (marah, senang, sedih), sebutkan konteksnya.
4. Gunakan bahasa Indonesia natural.
5. JANGAN melebihi 3 kalimat.
6. HANYA OUTPUT TEKS RANGKUMAN, tanpa penjelasan tambahan apapun.`;

  const userPrompt = recentMessages
    .map(m => `${m.role === 'ai' ? 'Mark' : 'User'}: ${m.content}`)
    .join('\n')

  try {
    const response = await fetchAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      null, // signal
      true, // isSmallTask
      null // jsonSchema
    )

    if (response?.error) {
      console.error('[ChatSummarizer] Error dari AI:', response.error)
      return
    }

    const summary = response.content?.trim()
    if (!summary) return

    const vector = await generateVector(summary)
    if (!vector) {
      console.error('[ChatSummarizer] Gagal generate vector untuk summary')
      return
    }

    const timestamp = Date.now()
    const topic = activeTopic || 'Obrolan Umum'

    // 1. Simpan ke IndexedDB
    const dexieId = await insertChatArchive({
      summary,
      timestamp,
      topic,
      vector
    })

    // 2. Insert ke Orama
    await insertArchiveToOrama({
      summary,
      topic,
      timestamp,
      dexieId,
      vector
    })

    console.log('[ChatSummarizer] Sukses merangkum dan mengarsipkan:', summary.substring(0, 60) + '...')
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
      console.error('[ChatSummarizer] Exception saat merangkum:', error)
    }
  }
}
