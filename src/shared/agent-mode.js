import { isMainSession } from './workspaces.js'

export const sessionMode = (sessionId) => (isMainSession(sessionId) ? 'personal' : 'agent')

export const usesPersonalMood = ({ sessionId, purpose, isSmallTask } = {}) =>
  sessionMode(sessionId) === 'personal' && !purpose && !isSmallTask

export function withoutAssistantMood(messages = []) {
  const cleanText = (text) =>
    text.replace(/(<mark\b[^>]*?)\s+mood\s*=\s*(?:"[^"]*"|'[^']*')/gi, '$1')
  return messages.map((message) => {
    if (!['ai', 'assistant', 'model'].includes(message.role)) return message
    const { mood, ...rest } = message
    void mood
    return {
      ...rest,
      content:
        typeof message.content === 'string'
          ? cleanText(message.content)
          : Array.isArray(message.content)
            ? message.content.map((part) =>
                part?.type === 'text' ? { ...part, text: cleanText(part.text || '') } : part
              )
            : message.content
    }
  })
}

export function responseContract({ web = false, personal = false } = {}) {
  if (web)
    return `# FORMAT RESPONS JSON
Balas satu objek JSON valid tanpa teks di luar objek.
{
  "thought": "Ringkasan pertimbangan tindakan",
  ${personal ? '"mood": "neutral | joy | sadness | fear | anger | disgust | anxiety | envy | embarrassment | ennui",' : ''}
  "message": "Kabar progres singkat yang relevan, atau null",
  "await_user": false,
  "answer": "Jawaban pengguna, atau null",
  "tool_calls": [{"name": "nama_tool", "arguments": {"reason": "Alasan tindakan"}}]
}
Saat memanggil tool, isi tool_calls dan berikan kabar progres melalui message bila diperlukan.
Setiap pemanggilan tool menyertakan reason yang menjelaskan tujuan tindakannya.
Untuk jawaban akhir, isi answer dan gunakan tool_calls=null.
Jika memerlukan jawaban pengguna, gunakan await_user=true, isi pertanyaan di answer, dan tool_calls=null.
${personal ? 'Pilih mood yang sesuai dengan percakapan.' : ''}
Gunakan checklist hanya untuk workflow yang benar-benar dibuat atau dilanjutkan. Jangan mengarang kemajuan. Gabungkan hanya tindakan yang tidak bergantung pada hasil tindakan lain.`
  return `# KONTROL RESPONS MARK
Awali respons dengan <mark ${personal ? 'mood="mood_yang_sesuai" ' : ''}done="true|false" message="progres opsional" />.
Gunakan done=true saat memberikan jawaban akhir. Gunakan done=false saat memanggil tool atau masih melanjutkan pekerjaan.
Jika memerlukan balasan pengguna, gunakan await_user=true dan done=false, tanyakan di teks jawaban, lalu akhiri giliran.
${personal ? 'Mood mengikuti suasana percakapan dan ekspresi avatar.' : ''}
Pertahankan fakta dan bukti pekerjaan. Jangan mengarang workflow atau menyelesaikan langkah tanpa hasil pemeriksaan.
Tag kontrol dibersihkan oleh aplikasi sebelum teks ditampilkan.`
}
