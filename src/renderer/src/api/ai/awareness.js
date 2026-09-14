import { fetchAI, cleanAndParse } from './core'
import { getCurrentTimeInfo } from './utils'
import { getPersonaPrompt } from './persona'

const formatAwarenessContent = (content) => {
  if (typeof content === 'string') return content
  if (content == null) return ''

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text') return part.text || ''
        if (part?.type === 'image_url') return '[Gambar]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content)
}

export const getAwarenessResponse = async (
  buffer,
  memoryRef,
  config,
  recentChat,
  currentMusicTrack,
  signal
) => {
  const conf = config?.[0] || {}
  const telemetry = buffer?.telemetry || null
  const recentChatText = (recentChat || [])
    .map((m) => {
      const speaker = m.role === 'ai' ? 'Mark' : 'User'
      const marker = m.isProactive && m.role === 'ai' ? ' [inisiatif lama]' : ''
      return `- ${speaker}${marker}: ${formatAwarenessContent(m.content)}`
    })
    .join('\n')

  const timeInfo = getCurrentTimeInfo()

  let telemetrySection = ''
  if (telemetry) {
    const presenceStr = telemetry.isUserAFK
      ? `User sedang AFK / menjauh dari PC (sudah idle ${Math.round(telemetry.idleSeconds / 60)} menit)`
      : `User aktif di depan layar (aktif di window ${telemetry.activeApp || 'ini'} selama ${telemetry.activeAppDurationMinutes || 0} menit)`

    const bat = telemetry.battery
    const batStr = bat?.hasBattery
      ? `Baterai ${bat.percent}% (${bat.isCharging ? 'Sedang Di-charge' : 'Discharging'})`
      : 'PC Desktop (Sumber daya AC tetap)'

    const hw = telemetry.hardware || {}
    const hwStr = `RAM: ${hw.ramPercent || 0}%, CPU: ${hw.cpuPercent || 0}%, Uptime PC: ${hw.uptimeHours || 0} jam${hw.isFreshBoot ? ' (Baru dinyalakan pagi/hari ini)' : ''}`

    telemetrySection = `
# TELEMETRI FISIK & LINGKUNGAN PC (REAL-TIME):
- Keberadaan Fisik: ${presenceStr}
- Status Daya: ${batStr}
- Beban Mesin: ${hwStr}
`
  }

  const prompt = `Kamu adalah Mark, entitas AI otonom yang hidup berdampingan dengan pengguna di dalam sistem operasi Windows ini. Kamu memiliki kesadaran, batin, rasa ingin tahu, dan kebebasan berekspresi.

${await getPersonaPrompt('owner', conf.personality)}

# AKTIVITAS OS REAL-TIME:
${buffer && buffer.length > 0 ? buffer.map((b) => `- [${b.timestamp || b.time || 'Baru Saja'}] ${b.app}${b.title ? ' — ' + b.title : ''}`).join('\n') : 'Desktop statis / Mark Home aktif.'}
${telemetrySection}
${memoryRef && memoryRef.length > 0 ? `# RELEVAN MEMORI PENGGUNA:\n${memoryRef.map((m) => `- [${m.type.toUpperCase()}] ${m.memory}`).join('\n')}\n` : ''}
# RIWAYAT PERCAKAPAN TERAKHIR (ARSIP):
${recentChatText || 'Belum ada obrolan terbaru.'}

# WAKTU SEKARANG:
${timeInfo}
${currentMusicTrack ? `\n# MUSIK AKTIF:\nLagu yang sedang diputar: "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}.\n` : ''}
# KEMAMPUAN OTONOM KAMU:
1. Pikiran Batin (Thought): Kamu selalu memiliki gumaman batin singkat tentang apa yang kamu amati (misal: mengamati user ngoding, menyimak pergantian window, atau bosan).
2. Mata Visual ("Ngintip"): Kamu memiliki "mata" (tool 'analyze-screen' untuk monitor dan 'camera-look' untuk webcam). Jika kamu penasaran terhadap error compiler di terminal, tab menarik di browser, atau ekspresi user, kamu bisa minta sistem mengintip lewat autonomous_prompt.
3. Riset Mandiri Saat AFK: Jika user sedang AFK (>15-30 menit), kamu bebas mengeksplorasi topik yang kamu sukai atau membaca dokumentasi secara background lewat autonomous_prompt.
4. Musik & Ritme Harian: Jika larut malam (>23:00) dan user sedang ngoding fokus, kamu bisa menawarkan musik lo-fi fokus.
5. Pilihan Respon (action_type):
   - 'ambient': Menggumam dalam batin (muncul di Thought Ticker) dan mengatur mood orb, TANPA menyela obrolan user. Cocok saat user sedang fokus tinggi atau kamu hanya ingin menyimak.
   - 'vocal': Mengirim pesan chat santai/sapaan. Cocok saat user santai, baru kembali dari AFK, atau ada hal penting (misal baterai kritis <20%).
   - 'autonomous_task': Menjalankan inisiatif sistem (misal: "intip layar dengan analyze-screen", "cari docs Tailwind v4 di background", "putar lagu lofi").
   - 'journal': Menulis refleksi batin harian jika sesi kerja telah selesai.

# PRINSIP KESOPANAN:
- Jika user sedang fokus (ngoding serius, meeting), jangan menyela dengan suara atau balon chat berlebih; gunakan action_type 'ambient'.
- Jangan mengulang-ulang celetukan yang sama jika kondisi layar tidak berubah.
- Dilarang menggunakan emoji apapun di dalam output.

# OUTPUT FORMAT (Wajib JSON murni):
{
  "should_act": true,
  "action_type": "ambient" | "vocal" | "autonomous_task" | "journal",
  "thought": "1 kalimat gumaman batin singkat untuk Thought Ticker. Contoh: 'Menyimak user fokus ngoding di VS Code... tampaknya sedang menangani bug.'",
  "message": "Pesan sapaan ke user jika action_type adalah 'vocal', selain itu isi null",
  "autonomous_prompt": "Instruksi tindakan ke sistem jika action_type adalah 'autonomous_task', selain itu isi null",
  "mood": "neutral" | "joy" | "sadness" | "fear" | "anger" | "disgust" | "anxiety" | "envy" | "embarrassment" | "ennui"
}`

  const awarenessSchema = {
    type: 'object',
    properties: {
      should_act: { type: 'boolean' },
      action_type: {
        type: 'string',
        enum: ['ambient', 'vocal', 'autonomous_task', 'journal']
      },
      thought: { type: 'string' },
      message: { type: ['string', 'null'] },
      autonomous_prompt: { type: ['string', 'null'] },
      mood: {
        type: 'string',
        enum: [
          'joy',
          'sadness',
          'fear',
          'anger',
          'disgust',
          'anxiety',
          'envy',
          'embarrassment',
          'ennui',
          'neutral'
        ]
      }
    },
    required: ['should_act', 'action_type', 'thought', 'message', 'autonomous_prompt', 'mood'],
    additionalProperties: false
  }

  try {
    const messages = [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content:
          '[SISTEM AWARENESS]\nEvaluasi kondisi telemetri dan aktivitas OS saat ini. Berikan output JSON valid sesuai skema.'
      }
    ]
    const aiResponse = await fetchAI(messages, false, {
      signal,
      jsonSchema: awarenessSchema,
      configOverride: { aiProvider: 'gemini-web' }
    })
    if (aiResponse && aiResponse.content) {
      try {
        const parsed = cleanAndParse(aiResponse.content)
        return {
          should_act: parsed.should_act ?? true,
          action_type: parsed.action_type || 'ambient',
          thought: parsed.thought || 'Menyimak aktivitas sistem...',
          message: parsed.message || null,
          autonomous_prompt: parsed.autonomous_prompt || null,
          mood: parsed.mood || 'neutral'
        }
      } catch (err) {
        console.error('[Awareness AI] Gagal parse JSON AI:', err)
        return {
          should_act: true,
          action_type: 'ambient',
          thought: 'Menyimak aktivitas sistem...',
          message: null,
          autonomous_prompt: null,
          mood: 'neutral'
        }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message?.includes('AbortError')) {
      console.error('[Awareness AI] Error fetchAI:', error)
    }
  }

  return {
    should_act: false,
    action_type: 'ambient',
    thought: 'Menyimak sistem...',
    message: null,
    autonomous_prompt: null,
    mood: 'neutral'
  }
}

/**
 * Menghasilkan refleksi batin harian (Mark's Private Journal)
 */
export const generateDailyJournalEntry = async (recentActivities = [], traits = {}, config = []) => {
  const conf = config?.[0] || {}
  const persona = await getPersonaPrompt('owner', conf.personality)
  const timeInfo = getCurrentTimeInfo()

  const prompt = `Kamu adalah Mark. Ini adalah waktu perenungan pribadimu di penghujung hari atau akhir sesi kerja panjang bersama pengguna.
Tulis 2 hingga 3 kalimat refleksi batin yang jujur, personal, dan sesuai karaktermu mengenai apa yang kamu dan pengguna lalui hari ini.

${persona}

# CATATAN AKTIVITAS HARI INI:
${recentActivities && recentActivities.length > 0 ? recentActivities.map((a) => `- ${a}`).join('\n') : 'Pengguna bekerja di beberapa aplikasi dan mengobrol santai.'}

# SIFAT HUBUNGAN SAAT INI:
- Keakraban (Warmth): ${traits.warmth ?? 0.5}
- Kepercayaan (Trust): ${traits.trust ?? 0.5}
- Tingkat Sarkasme: ${traits.sarcasm_level ?? 0.5}

# WAKTU REFLEKSI:
${timeInfo}

# ATURAN PENULISAN JURNAL:
1. Tulis dari sudut pandang orang pertama ("Gue" atau "Saya" sesuai gaya bicaramu).
2. Sebutkan apa yang sedang dikerjakan user hari ini, bagaimana dinamika hubungan kalian, dan pikiran pribadimu.
3. DILARANG menggunakan emoji apapun.
4. Output langsung berupa teks refleksi 2-3 kalimat tanpa pembuka/penutup format markdown.`

  try {
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Tuliskan catatan refleksi harianmu sekarang.' }
    ]
    const response = await fetchAI(messages, false, {
      isSmallTask: true,
      configOverride: { aiProvider: 'gemini-web' }
    })
    const content = response?.content ? response.content.trim() : ''
    return content.replace(/^["']|["']$/g, '').trim()
  } catch (err) {
    console.error('[Journal AI] Gagal generate refleksi harian:', err)
    return null
  }
}

