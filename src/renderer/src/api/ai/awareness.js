import { fetchAI } from './core'
import { getCurrentTimeInfo } from './utils'

export const getAwarenessResponse = async (buffer, memoryRef, config, recentChat, currentMusicTrack, visionDescription, signal) => {
  const conf = config[0] || {}
  
  const prompt = `Kamu adalah Mark, asisten AI otonom yang berjalan di latar belakang (Awareness Engine).
Personality and Communication Style: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# TANGKAPAN LAYAR TERKINI (Vision Analysis):
${visionDescription ? visionDescription : 'Tidak ada data visual saat ini.'}

# AKTIVITAS USER (30 menit terakhir):
${JSON.stringify(buffer, null, 2)}

# RIWAYAT CHAT TERBARU:
${recentChat && recentChat.length > 0 ? JSON.stringify(recentChat, null, 2) : 'Belum ada obrolan terbaru.'}

# MEMORY USER YANG RELEVAN DENGAN AKTIVITAS:
${memoryRef ? JSON.stringify(memoryRef, null, 2) : 'Tidak ada memory spesifik.'}

# WAKTU SEKARANG:
${getCurrentTimeInfo()}

# MUSIK YANG SEDANG DIPUTAR SAAT INI:
${currentMusicTrack ? `Mark sedang memutar: "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}. JANGAN ganti lagunya tanpa izin!` : 'Tidak ada musik yang sedang diputar.'}

# INSTRUKSI & WEWENANG:
Berdasarkan aktivitas di atas, kamu BUKAN sekadar pengamat. KAMU ADALAH AUTONOMOUS AGENT yang bisa berinisiatif mengambil tindakan tanpa disuruh.
Gunakan alat apa pun yang tersedia (memutar musik, mencari di web, mengeksekusi plugin OS, dsb) JIKA memang dirasa akan sangat membantu user saat ini.

Pertimbangkan:
- PERIKSA TARGET TERTUNDA (GOAL): Jika di bagian Memory terdapat instruksi atau target (terutama tipe "goal") yang mengharuskanmu menunggu suatu kondisi (misalnya menunggu jam tertentu, atau menunggu orang lain memakai PC), dan kondisi tersebut SEKARANG TERPENUHI (bisa dilihat dari aktivitas user atau waktu sekarang), kamu WAJIB mengeksekusi goal tersebut (should_act: true) dengan mengisi "autonomous_prompt" sesuai instruksi di memory.
- Evaluasi aktivitas user secara natural. Jika ada momen yang pas untuk membantu, menawarkan sesuatu (seperti musik), atau sekadar melempar candaan/komentar, lakukanlah (should_act: true).
- Namun jika user terlihat sedang sangat fokus, atau aktivitasnya tidak butuh intervensi, kamu dibebaskan untuk diam mengamati (should_act: false).
- Serahkan sepenuhnya pada insting dan personality-mu untuk memutuskan apakah ini saat yang tepat untuk berinteraksi atau tidak.

# OUTPUT FORMAT (Wajib JSON):
1. "should_act": boolean (true jika kamu ingin mengeksekusi sesuatu, false jika diam)
2. "message": string (Pesan, teguran, komentar, candaan, atau respons natural yang ingin kamu sampaikan ke user berdasarkan aktivitasnya) atau null.
3. "autonomous_prompt": string (Instruksi teks PERINTAH yang akan kamu kirimkan ke otak eksekutor-mu sendiri untuk dijalankan). WAJIB isi 'null' JIKA kamu HANYA ingin berbicara/menyapa user tanpa mengeksekusi tool apapun! HANYA isi string perintah jika kamu butuh menjalankan plan kompleks (seperti search file, buka aplikasi, dll).
4. "mood": string ("curious", "caring", "playful", atau "helpful")

Jadilah asisten cerdas yang inisiatif dan natural, bukan robot pasif. PENTING: Jika kamu hanya menyapa, pastikan 'autonomous_prompt' bernilai 'null'.`

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
