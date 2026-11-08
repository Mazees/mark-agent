import { fetchAI } from './core'
import { insertChatArchive } from '../db'

export async function summarizeAndArchive(recentMessages, activeTopic, config) {
  if (!recentMessages || recentMessages.length === 0) return

  const systemPrompt = `Kamu adalah sistem internal Mark. Tugasmu merangkum percakapan di bawah ini menjadi 2-3 kalimat ringkas namun informatif.

Aturan:
1. Sebutkan SIAPA yang membicarakan APA.
2. Jika ada keputusan, kesepakatan, atau fakta penting, wajib dicatat.
3. Jika ada emosi kuat (marah, senang, sedih), sebutkan konteksnya.
4. Gunakan bahasa Indonesia natural.
5. JANGAN melebihi 3 kalimat.
6. HANYA OUTPUT TEKS RANGKUMAN, tanpa penjelasan tambahan apapun.`

  const userPrompt = recentMessages
    .map((m) => `${m.role === 'ai' ? 'Mark' : 'User'}: ${m.content}`)
    .join('\n')

  try {
    const activeConf = config?.[0] || config || {}
    const response = await fetchAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      false,
      {
        isSmallTask: true,
        config: activeConf
      }
    )

    if (response?.error) {
      console.error('[ChatSummarizer] Error dari AI:', response.error)
      return
    }

    const summary = response.content?.trim()
    if (!summary) return

    const timestamp = Date.now()
    const topic = activeTopic || 'Obrolan Umum'

    const dbId = await insertChatArchive({
      summary,
      timestamp,
      topic
    })
    if (!dbId) throw new Error('Ringkasan belum dapat disimpan.')
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
      console.error('[ChatSummarizer] Exception saat merangkum:', error)
    }
  }
}
