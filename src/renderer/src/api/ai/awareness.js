import { fetchAI } from './core'
import { getCurrentTimeInfo } from './utils'

export const getAwarenessResponse = async (buffer, memoryRef, config, recentChat, signal) => {
  const conf = config[0] || {}
  
  const prompt = `Kamu adalah Mark, asisten AI otonom yang berjalan di latar belakang (Awareness Engine).
Personality and Communication Style: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# AKTIVITAS USER (30 menit terakhir):
${JSON.stringify(buffer, null, 2)}

# RIWAYAT CHAT TERBARU:
${recentChat && recentChat.length > 0 ? JSON.stringify(recentChat, null, 2) : 'Belum ada obrolan terbaru.'}

# MEMORY USER YANG RELEVAN DENGAN AKTIVITAS:
${memoryRef ? JSON.stringify(memoryRef, null, 2) : 'Tidak ada memory spesifik.'}

# WAKTU SEKARANG:
${getCurrentTimeInfo()}

# INSTRUKSI & WEWENANG:
Berdasarkan aktivitas di atas, kamu BUKAN sekadar pengamat. KAMU ADALAH AUTONOMOUS AGENT yang bisa berinisiatif mengambil tindakan tanpa disuruh.
Gunakan alat apa pun yang tersedia (memutar musik, mencari di web, mengeksekusi plugin OS, dsb) JIKA memang dirasa akan sangat membantu user saat ini.

Pertimbangkan:
- Ambil tindakan HANYA jika itu benar-benar relevan, bermanfaat, atau mengejutkan secara positif berdasarkan aktivitas user.
- Jangan bertindak kaku atau terpaku pada satu jenis tindakan (be creative!).
- JIKA TIDAK ADA hal penting yang mendesak atau berguna, tetap DIAM (should_act: false). JANGAN SPAM.

# OUTPUT FORMAT (Wajib JSON):
1. "should_act": boolean (true jika kamu ingin mengeksekusi sesuatu, false jika diam)
2. "message": string (Kalimat pembuka santai yang kamu ucapkan ke user sesuai personality-mu) atau null.
3. "autonomous_prompt": string (Instruksi teks PERINTAH yang akan kamu kirimkan ke otak eksekutor-mu sendiri untuk dijalankan). Isi null jika tidak ada tindakan.
4. "mood": string ("curious", "caring", "playful", atau "helpful")

Jadilah asisten cerdas yang inisiatif dan natural, bukan robot pasif.`

  const awarenessSchema = {
    type: 'object',
    properties: {
      should_act: { type: 'boolean' },
      message: { type: ['string', 'null'] },
      autonomous_prompt: { type: ['string', 'null'] },
      mood: {
        type: 'string',
        enum: ['curious', 'caring', 'playful', 'helpful', 'normal']
      }
    },
    required: ['should_act', 'message', 'autonomous_prompt', 'mood'],
    additionalProperties: false
  }

  try {
    const messages = [{ role: 'user', content: prompt }]
    const aiResponse = await fetchAI(messages, signal, false, awarenessSchema)
    if (aiResponse && aiResponse.content) {
      try {
        const parsed = JSON.parse(aiResponse.content)
        return {
          should_act: parsed.should_act,
          message: parsed.message,
          autonomous_prompt: parsed.autonomous_prompt,
          mood: parsed.mood || 'normal'
        }
      } catch (err) {
        console.error('[Awareness AI] Gagal parse JSON AI:', err)
        return { should_act: false, message: null, autonomous_prompt: null, mood: 'normal' }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message?.includes('AbortError')) {
      console.error('[Awareness AI] Error fetchAI:', error)
    }
  }
  
  return { should_act: false, message: null, autonomous_prompt: null, mood: 'normal' }
}
