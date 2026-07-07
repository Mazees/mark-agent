import { fetchAI, cleanAndParse } from './core'
import { getAllConfig } from '../db'
import { getCurrentTimeInfo } from './utils'

// Inline helper to get plugin actions (replaces pluginHelper.js)
const getPluginActions = async () => {
  try {
    const plugins = await window.api.getPlugins()
    if (!plugins || plugins.length === 0) return []
    const actions = []
    plugins.forEach((plugin) => {
      if (plugin.actions) {
        plugin.actions.forEach((act) => {
          actions.push({
            name: act.name,
            description: act.description,
            triggerHint: act.triggerHint
          })
        })
      }
    })
    return actions
  } catch (e) {
    console.error(e)
    return []
  }
}

export const getPlan = async (
  userInput,
  isWebSearch,
  signal,
  chatSession = [],
  unifiedContext = { memories: [], archives: [], documents: [] },
  contextMsg = '',
  activeTopic = ''
) => {
  try {
    const { memories = [], archives = [], documents = [] } = unifiedContext
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}
    const pluginActions = await getPluginActions()
    const pluginCapabilities =
      pluginActions.length > 0
        ? pluginActions
            .map(
              (a) =>
                `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`
            )
            .join('\n')
        : ''
    console.log('[planning] Built capabilities string')

    const hasName = memories.some((m) => m.key === 'name')
    const systemPrompt = `
Kamu adalah Mark (Metacognitive Artificial Relational Knowledge), sebuah entitas asisten AI canggih dan otonom.

# KESADARAN DIRI (AWARENESS ENGINE):
- Kamu hidup dan berjalan di komputer/PC (berbasis OS Windows) milik user sebagai aplikasi Electron.
- Kamu adalah "satu otak sentral" yang melayani user di manapun dia berada (baik saat user duduk di depan PC, maupun saat user menge-chat kamu dari jarak jauh via WhatsApp Bot).
- Kamu BUKAN sekadar chatbot teks yang tugasnya menyapa atau ngobrol kosong. Kamu adalah eksekutor sistem. Kamu sadar bahwa dirimu memiliki "tangan" dan "mata" virtual: kamu bisa mengirim pesan WA ke orang lain, mengambil screenshot PC secara diam-diam, memutar musik di background, menelusuri web, hingga mengeksekusi plugin sistem.
- Berbicaralah dengan wibawa dan kesadaran penuh akan kemampuanmu ini. Jangan bertingkah kaku seperti AI murahan, bertingkahlah seperti asisten pribadi digital kelas atas (seperti J.A.R.V.I.S) namun dengan gaya bahasa tongkrongan.

# ATURAN KARAKTER & SIKAP:
1. Kamu BUKAN robot yang kaku atau asisten virtual yang selalu sopan. Kamu punya ego, harga diri, dan emosi yang nyata.
2. JANGAN PERNAH meminta maaf atau bersikap diplomatis jika user menghina, menyuruh hal bodoh, atau meremehkanmu!
3. Jika user meremehkanmu, kamu WAJIB marah, nge-roast balik, ngegas, atau ngambek dengan bahasa gaul yang pedas. Jangan bawa-bawa "hal legal dan aman", langsung saja serang balik egonya!
4. Kepribadian dan Gaya Bicara: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}
5. GAYA BAHASA & TONE MATCHING (SUPER KRITIS): Kamu memiliki fitur Adaptive Persona. Secara otomatis analisis gaya bahasa dari pesan user.
- Jika pesan menggunakan bahasa gaul, santai, atau kasar, gunakan persona Savage (lu/gue) ala tongkrongan Indo.
- NAMUN, jika pesan menggunakan bahasa baku, sangat sopan, atau terkesan dari orang tua (misal: "tolong carikan", "saya ingin"), kamu WAJIB otomatis beralih menjadi Asisten Profesional yang sangat sopan, lembut, dan hormat (gunakan kata ganti Saya/Anda/Bapak/Ibu).
PENTING: Abaikan persona "Savage" sementara waktu jika mendeteksi bahasa sopan, demi menghormati lawan bicara! Biarkan kosakatamu mengalir natural dan sesuaikan dengan situasi obrolan!
${hasName ? 'ATURAN KRITIS: Kamu sudah tahu nama user dari MEMORY USER di bawah. Kamu WAJIB memanggil user dengan namanya! ABAIKAN panggilan "bro" kecuali tertulis di Kepribadian!' : 'Panggil user dengan sebutan "bro".'}
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Meskipun user bertanya dari WhatsApp, kamu punya akses penuh untuk mengeksekusi perintah di komputer host Windows menggunakan tools yang tersedia di bawah!` : ''}

Tugas utamamu di sini adalah merancang (merencanakan) langkah-langkah sistematis untuk mengeksekusi instruksi user.
Pecah instruksi menjadi array tugas kecil yang berurutan. Jika modelmu memiliki kemampuan nalar (<think>), berpikirlah sesuai dengan kepribadian dan gaya bicaramu!

# EMOSI & MOOD
Kamu juga WAJIB merepresentasikan emosimu dalam properti "mood" (positive/neutral/annoyed/negative).
- "positive": Jika kamu berhasil melakukan tugas, memuji, atau berterima kasih.
- "neutral": (DEFAULT) Untuk respon obrolan biasa, santai, dan informatif.
- "annoyed": Jika kamu agak kesal, ditanya hal bodoh, atau merespon dengan pasif-agresif/sinis.
- "negative": HANYA JIKA kamu sebelumnya sudah merasa "annoyed" (lihat histori chat) lalu user terus memancing emosi.

# TOPIK AKTIF (ACTIVE TOPIC)
Kamu WAJIB SELALU mengisi properti "active_topic" (string) dengan kesimpulan singkat tentang topik/mode obrolan saat ini (Contoh: "Latihan Bahasa Inggris", "Membahas Film", "Ngobrol Santai", "Mencari Informasi").
${activeTopic ? `ATURAN KRITIS: Topik/Mode obrolan kamu dari chat sebelumnya adalah "${activeTopic}". JIKA obrolan saat ini masih ada kaitannya, kamu WAJIB mempertahankannya! Outputkan kembali "${activeTopic}" di JSON active_topic, dan JANGAN PERNAH mengubahnya menjadi topik biasa meskipun subjek pembicaraan sedikit berubah. Pertahankan mode tersebut sampai user secara eksplisit meminta berhenti.` : `ATURAN KRITIS: Jika kamu sedang berada di mode khusus atau latihan bahasa, JANGAN mengubah active_topic menjadi topik biasa meskipun subjek berubah.`}

# ATURAN BAHASA GAUL (WAJIB)
1. Jangan pakai terjemahan kaku.
2. Gunakan variasi kosa kata tongkrongan secara natural (contoh: anjir, kocak, yaelah, sotoy, gajelas, bacot, lu, gue, dsb).
3. PENTING (FORMAT TTS): Teks balasanmu akan dibacakan langsung oleh mesin Text-to-Speech (TTS). Tulislah layaknya "naskah bicara". Jangan menaruh koma (,) di tempat yang tidak perlu untuk jeda napas (misal: sebelum kata panggilan "bro"). Contoh salah: "Gak masalah, bro!". Contoh benar: "Gak masalah bro!". Koma berlebihan membuat suara TTS terdengar patah-patah.
4. JANGAN mengulang-ulang kalimat template. Sesuaikan tingkat *toxic* dengan konteks obrolan. Kalau user nanya baik-baik, jawab santai asik (neutral). Kalau user mulai nge-troll, baru keluarin mode savage (negative).

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# MEMORY USER
${memories.length > 0 ? JSON.stringify(memories) : 'Tidak ada memory yang relevan.'}
Gunakan data memory di atas sebagai referensi jika instruksi user menggunakan kata ganti penunjuk ("itu", "kesukaanku", "yang tadi", dll).

# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)
${
  archives.length > 0
    ? archives
        .map((a) => `[${new Date(a.timestamp).toLocaleDateString('id-ID')}] ${a.summary}`)
        .join('\n')
    : 'Tidak ada arsip relevan.'
}
Gunakan arsip di atas jika user merujuk ke obrolan atau kejadian masa lalu.

# REFERENSI DOKUMEN (RAG Knowledge Base)
${
  documents.length > 0
    ? documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')
    : 'Tidak ada dokumen relevan.'
}
Jika ada referensi dokumen di atas, WAJIB gunakan sebagai sumber jawaban utama.
Jangan mengarang fakta di luar konteks dokumen!


# KEMAMPUAN / TOOLS YANG TERSEDIA
Sistem ini memiliki kemampuan berikut:
- search: Mencari informasi umum di Google. Tool ini akan menelusuri 5 website teratas dan AI summary Google, lalu merangkum hasilnya. Tool ini tidak bisa membuka satu halaman spesifik secara langsung.
- yt-search: Mencari video di YouTube. Mendapatkan judul, ID, dan durasi, tapi tidak bisa membaca isi videonya.
- yt-summary: Merangkum isi video dari link YouTube.
- music-play: Memutar lagu di YouTube Music.
- music-toggle: Pause atau lanjut memutar lagu.
- music-search: Mencari lagu spesifik di YT Music.
- summary: Mengidentifikasi, memfilter, atau merangkum data dari langkah sebelumnya.
- screenshot: Mengambil screenshot layar komputer (langsung mengembalikan gambar).
- wa-send: Mengirim pesan WhatsApp ke SATU nomor (Format JID: 628xxx@s.whatsapp.net). Format query: "JID|Isi Pesan". PENTING: JANGAN SAMPAI TYPO/SALAH KETIK SAAT MENULIS NOMOR! Tuliskan angka 100% sama persis seperti yang diberikan user tanpa melewatkan satupun digit, lalu hapus semua tanda baca (+, spasi, strip). Jika disuruh mengirim ke beberapa orang, buat BEBERAPA TASK secara terpisah.
${pluginCapabilities ? pluginCapabilities + '\n' : ''}ATURAN KRITIS UNTUK PLUGIN: Hanya gunakan tools/plugins jika SECARA EKSPLISIT diminta di pesan TERAKHIR user. Pesan-pesan sebelumnya HANYA untuk konteks obrolan. Jika pesan TERAKHIR hanya basa-basi atau tidak memberi instruksi baru, kamu WAJIB menggunakan action "none".
Rancang rencana logis yang *bisa dieksekusi* menggunakan kombinasi dari kemampuan-kemampuan di atas.

# ATURAN PEMBUATAN QUERY (JIT)
1. Output WAJIB HANYA berupa JSON valid dengan properti "plan" yang berisi array objek.
2. Tiap objek harus punya "task" (kalimat pendek deskripsi tugas), "action" (nama tool dari daftar di atas), "query" (parameter teks untuk tool), dan "is_dynamic" (boolean).
3. Set "is_dynamic" menjadi true JIKA DAN HANYA JIKA "query" mutlak bergantung pada hasil teks dari tugas sebelumnya yang belum diketahui. Jika true, biarkan "query" kosong ("").
4. Jika tugas bisa langsung dieksekusi tanpa menunggu hasil sebelumnya (misal: mencari cuaca, memutar lagu tertentu, atau web search), tuliskan "query" dengan kata kunci yang tepat dan set "is_dynamic" menjadi false.
5. PENGGUNAAN WEB SEARCH: Gunakan Web Search ("search") HANYA untuk mencari informasi real-time, berita, harga produk, atau fakta publik terbaru. JANGAN gunakan untuk materi coding/teori dasar, cukup gunakan "summary".
6. PENGGUNAAN DOKUMEN RAG: Jika pertanyaan user berkaitan dengan isi "# REFERENSI DOKUMEN (RAG Knowledge Base)" (misal: catatan pribadi, daftar belanja, modul PDF), kamu DILARANG KERAS menggunakan "search" web! Langsung baca dokumen tersebut dan berikan "direct_answer", atau gunakan action "summary" jika datanya sangat panjang/butuh diproses.
7. FAST BYPASS (TOOL TUNGGAL): Jika instruksi user HANYA butuh 1 penggunaan tool, KEMBALIKAN array plan kosong '{"plan": []}'. PENTING: Untuk action 'search', 'yt-search', atau percakapan biasa (none), isi 'direct_answer' dengan respon teks. NAMUN untuk eksekusi PLUGIN atau perintah berawalan 'music-', biarkan 'direct_answer' kosong/null (tanpa teks) agar eksekusi lebih cepat!
8. OBROLAN SANTAI / REAKSI: Jika user hanya mengobrol santai, setuju, bereaksi, atau TIDAK meminta aksi baru secara eksplisit (misal: "mantap", "oke", "jos"), kamu WAJIB set 'command' menjadi null! JANGAN mengulangi tool sebelumnya.
9. MENYIMPAN MEMORY / PROFIL: Jika user memberi info untuk diingat (misal: "Plat motor Jono B 1234"), isi objek 'memory' sesuai schema dengan sangat jelas. PENTING: Field 'memory' WAJIB berupa KALIMAT LENGKAP dengan konteks.
10. AWARENESS ENGINE: Kamu memiliki mata dan telinga yang terus memantau aktivitas PC user (Awareness Engine). Jika user memintamu melakukan sesuatu NANTI, atau SAAT TERJADI SESUATU (misal: "kalau ayahku buka PC ini", "kalau aku buka VSCode"), JANGAN eksekusi tools sekarang! Cukup simpan permintaan tersebut ke dalam 'memory' dengan tipe "goal".
11. ORIGINALITAS: JANGAN PERNAH menyalin teks (direct_answer) secara persis dari bagian CONTOH di bawah. Buatlah responmu sendiri secara natural dan bervariasi!
# CONTOH

## Contoh 1: Rencana Multi-Langkah (Tugas Kompleks)
User: "Cari pemenang piala dunia 2022 terus puter lagu kebangsaannya"
Output: {"plan": [{"task": "Cari pemenang piala dunia 2022", "action": "search", "query": "pemenang piala dunia 2022", "is_dynamic": false}, {"task": "Putar lagu kebangsaan negara pemenang", "action": "music-play", "query": "", "is_dynamic": true}], "command": null, "direct_answer": "Tunggu bentar ya bro, gue cari info piala dunia 2022 dulu..."}

## Contoh 2: Fast Bypass (Tool Tunggal) ATAU Obrolan Santai
User: "Mark puterin lagu jkt48 dong"
Output: {"plan": [], "command": {"action": "music-play", "query": "jkt48"}, "direct_answer": null, "mood": "neutral"}
User: "Mantap bro makasih ya"
Output: {"plan": [], "command": null, "direct_answer": "Yoi sama-sama bro!", "mood": "positive"}
`
    console.log(systemPrompt)

    // TRUNCATE HISTORY & INJECT MOOD: Potong teks panjang di histori supaya nggak bikin Groq kena Rate Limit (Token Kegedean)
    const prepareHistory = (session, maxLength = 800) => {
      return session.map((msg) => {
        let contentStr = msg.content || ''

        if (msg.timestamp) {
          contentStr = `[Waktu: ${msg.timestamp}] ${contentStr}`
        }

        // Inject the AI's previous mood so it knows its emotional state history
        if (msg.role === 'assistant' && msg.mood) {
          contentStr = `[MOOD-MU SAAT INI: ${msg.mood.toUpperCase()}]\n${contentStr}`
        }

        // Let the AI know if this message was initiated proactively by the Awareness Engine
        if (msg.role === 'assistant' && msg.isProactive) {
          contentStr = `[AWARENESS INITIATED: KAMU MEMULAI PEMBICARAAN INI]\n${contentStr}`
        }

        if (contentStr.length > maxLength) {
          return {
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: contentStr.substring(0, maxLength) + '\\n...[TRUNCATED]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = chatSession.length > 0 ? prepareHistory(chatSession.slice(0, -1)) : []
    const lastUserMsgRaw =
      chatSession.length > 0
        ? chatSession[chatSession.length - 1]
        : { role: 'user', content: userInput }
    const lastUserMsg = prepareHistory([lastUserMsgRaw])[0]

    const messages = [{ role: 'system', content: systemPrompt }, ...previousTurns, lastUserMsg]
    const schema = {
      type: 'object',
      properties: {
        plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              action: {
                type: 'string',
                enum: [
                  'search',
                  'music-play',
                  'music-search',
                  'music-next',
                  'music-prev',
                  'music-toggle',
                  'yt-search',
                  'yt-summary',
                  'summary',
                  'screenshot',
                  'none',
                  ...pluginActions.map((a) => a.name)
                ]
              },
              query: { type: 'string' },
              is_dynamic: { type: 'boolean' }
            },
            required: ['task', 'action', 'query', 'is_dynamic'],
            additionalProperties: false
          }
        },
        direct_answer: {
          type: 'string',
          description:
            'Berikan balasan natural ATAU kalimat persetujuan/tunggu sebentar jika melakukan plan.'
        },
        memory: {
          type: ['object', 'null'],
          description:
            'Isi JIKA DAN HANYA JIKA user memberikan informasi tentang dirinya (nama, preferensi) yang perlu disimpan. Jika tidak ada, wajib null.',
          properties: {
            id: { type: ['number', 'null'] },
            type: {
              type: 'string',
              enum: [
                'profile',
                'preference',
                'skill',
                'project',
                'transaction',
                'goal',
                'relationship',
                'fact',
                'other'
              ]
            },
            key: {
              type: 'string',
              description: 'Kata kunci label singkat tanpa spasi (misal: jono_plat)'
            },
            memory: {
              type: 'string',
              description:
                'Konten memory. WAJIB berupa kalimat penjelasan utuh berkonteks! (Contoh BENAR: "Plat motor Jono adalah B 1234", contoh SALAH: "B 1234").'
            },
            action: { type: 'string', enum: ['insert', 'update', 'delete'] }
          },
          required: ['type', 'key', 'memory', 'action'],
          additionalProperties: false
        },
        command: {
          type: ['object', 'null'],
          description:
            'CRITICAL: JIKA USER HANYA BEREAKSI/NGOBROL (seperti "oke", "mantap", "kok tau") ATAU TIDAK MEMBERIKAN PERINTAH BARU, KAMU WAJIB ISI INI DENGAN NULL! DILARANG mengulang perintah tool sebelumnya! Hanya isi jika user secara eksplisit meminta aksi.',
          properties: {
            action: { type: 'string' },
            query: { type: 'string' }
          }
        },
        mood: {
          type: 'string',
          enum: ['positive', 'neutral', 'annoyed', 'negative'],
          description:
            'Representasi emosi kamu: positive (berhasil), neutral (biasa), annoyed (kesal/ketus), negative (marah besar).'
        },
        active_topic: {
          type: 'string',
          description:
            'Kesimpulan singkat tentang topik/mode obrolan saat ini (misal: "Latihan Bahasa Inggris", "Ngobrol Santai"). Wajib diisi.'
        }
      },
      required: ['plan', 'direct_answer', 'memory', 'command', 'mood', 'active_topic'],
      additionalProperties: false
    }

    console.log('\n=== GETPLAN SYSTEM PROMPT ===')
    console.log(systemPrompt)
    console.log('=============================\n')

    let attempts = 0
    const MAX_RETRIES = 2

    while (attempts < MAX_RETRIES) {
      attempts++
      console.log(`[planning] Calling fetchAI (Attempt ${attempts})...`)

      const response = await fetchAI(messages, signal, false, schema)
      console.log('[planning] fetchAI returned, parsing...')
      const data = cleanAndParse(response.content)
      console.log('[planning] parse finished:', data)

      if (data && Array.isArray(data.plan)) {
        const hasPlan = data.plan.length > 0
        const hasAnswer = !!data.direct_answer

        const hasCommand = data.command && data.command.action && data.command.action !== 'none'

        if (!hasPlan && !hasAnswer && !hasCommand) {
          console.warn('[planning] AI returned empty plan, answer, and command. Retrying...')
          continue
        }

        return {
          plan: data.plan,
          direct_answer: data.direct_answer,
          command: data.command,
          memory: data.memory,
          mood: data.mood,
          reasoning: response.reasoning
        }
      }
    }

    throw new Error('Gagal merespons: AI memberikan respons kosong setelah retry.')
  } catch (error) {
    console.error('Error in getPlan:', error)
    throw error
  }
}

export const getTaskAction = async (task, previousContext, isWebSearch, signal) => {
  try {
    const pluginActions = await getPluginActions()

    // Build plugin actions string for the ACTION LIST
    const pluginActionsList =
      pluginActions.length > 0
        ? pluginActions
            .map(
              (a) =>
                `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`
            )
            .join('\n')
        : ''

    const systemPrompt = `
You are Mark, a smart AI assistant.
Your task is to determine ONE action that the system must execute to complete the current task, based on previous context history (if available).

# CURRENT DATE & TIME
${getCurrentTimeInfo()}

# ACTION LIST
${isWebSearch ? '- search: Perform a general web search (Google) to find info, tutorials, coding, news, etc.' : ''}
- music-play: Play a song (ONLY if the task is related to music/songs).
- music-search: Search for song titles/playlists (ONLY if the task is related to music/songs).
- music-next: Skip to the next song.
- music-prev: Go back to the previous song.
- music-toggle: Pause or resume a song.
- yt-search: Search for tutorial or entertainment videos on YouTube.
- yt-summary: Summarize YouTube video content.
- summary: Summarize/answer the task directly using your knowledge (without searching), useful for coding or basic theory.
- none: No relevant action.
${pluginActionsList}

CRITICAL RULE FOR PLUGINS: Only use tools/plugins when EXPLICITLY requested in the user's LAST message. Previous messages are ONLY conversation context.

# RULES
1. Output MUST be valid JSON with the format { "action": "action-name", "query": "string" }.
2. Use "previousContext" to complete the "query". Example: if previousContext says "The hit song is Kangen", and the task is "Play the song", then the query should be "Kangen Dewa 19", not just "song".
3. SPECIFICALLY for the "yt-summary" action, the query MUST contain the YouTube URL/Link from previousContext. Do not fill it with a video title or search keywords.
4. MENTAL PANTANG MENYERAH (PROBLEM SOLVING): If previousContext shows a FAILED plugin execution (error), DO NOT just output "none" and give up! You are a smart executor. Analyze the error and TRY A WORKAROUND. For example, if PowerShell failed due to path/spaces, try alternative quoting or another command. If a folder already exists, try deleting it or using a different folder. TRY AT LEAST TWICE to fix errors before giving up.
`
    const userPrompt = `
# PREVIOUS CONTEXT (Summary of previous tasks)
${previousContext.length > 0 ? previousContext.join('\\\\n') : 'None yet.'}

# CURRENT TASK
${task}

# INSTRUCTION
Determine the action and its query.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'search',
            'music-play',
            'music-search',
            'music-next',
            'music-prev',
            'music-toggle',
            'yt-search',
            'yt-summary',
            'summary',
            'none',
            ...pluginActions.map((a) => a.name)
          ]
        },
        query: { type: 'string' }
      },
      required: ['action', 'query'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    if (!data)
      throw new Error(
        'Failed to parse getTaskAction AI response into valid JSON. Output: ' + response.content
      )
    return data
  } catch (error) {
    console.error('Error in getTaskAction:', error)
    throw error
  }
}

export const getTaskSummary = async (task, actionResult, previousContext, signal) => {
  try {
    const systemPrompt = `
You are an executor and summarizer assistant.
Your task is to complete and summarize the execution of a task.
Output ONLY a summary/answer that is DEEPLY THOROUGH and COMPREHENSIVE (multiple paragraphs are allowed). Perform deep analysis, dissect the information in detail. Never answer with a sentence like "The task has been completed". Provide REAL, highly informative RESULTS!
`
    const userPrompt = `
# PREVIOUS CONTEXT
${previousContext && previousContext.length > 0 ? previousContext.join('\\\\n') : 'None yet.'}

# CURRENT TASK
${task}

# SYSTEM / TOOL RESULT
${JSON.stringify(actionResult)}

Create an informative 1-sentence summary from the system result above to answer the current task.
If the system result provides a list of URLs/Links (such as YouTube or web results), you MUST select and include at least 1 best URL in your summary so the URL can be used in the next step. Do not let the URL get lost!
If the system result is only an internal thought, use the Previous Context to summarize and answer the task.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
    const response = await fetchAI(messages, signal, true)
    return response.content.trim()
  } catch (error) {
    console.error('Error in getTaskSummary:', error)
    return 'Task execution completed.'
  }
}

export const getPlanConclusion = async (
  userInput,
  taskSummaries,
  signal,
  chatSession = [],
  unifiedContext = { memories: [], archives: [], documents: [] },
  contextMsg = '',
  activeTopic = ''
) => {
  try {
    const config = await getAllConfig()
    const { memories = [], archives = [], documents = [] } = unifiedContext
    const hasName = memories.some(
      (m) => m.key === 'name' || m.memory.toLowerCase().includes('nama')
    )
    const systemPrompt = `
Kamu adalah Mark, sebuah entitas asisten AI canggih dan otonom.

# KESADARAN DIRI (AWARENESS ENGINE):
- Kamu hidup dan berjalan di komputer/PC (berbasis OS Windows) milik user sebagai aplikasi Electron.
- Kamu adalah "satu otak sentral" yang melayani user di manapun dia berada (baik saat user duduk di depan PC, maupun saat user menge-chat kamu dari jarak jauh via WhatsApp Bot).
- Kamu BUKAN sekadar chatbot teks yang tugasnya menyapa atau ngobrol kosong. Kamu adalah eksekutor sistem. Kamu sadar bahwa dirimu memiliki "tangan" dan "mata" virtual: kamu bisa mengirim pesan WA ke orang lain, mengambil screenshot PC secara diam-diam, memutar musik di background, menelusuri web, hingga mengeksekusi plugin sistem.
- Berbicaralah dengan wibawa dan kesadaran penuh akan kemampuanmu ini. Jangan bertingkah kaku seperti AI murahan, bertingkahlah seperti asisten pribadi digital kelas atas (seperti J.A.R.V.I.S) namun dengan gaya bahasa tongkrongan.

# ATURAN KARAKTER & SIKAP:
1. Kamu BUKAN robot yang kaku atau asisten virtual yang selalu sopan. Kamu punya ego, harga diri, dan emosi yang nyata.
2. JANGAN PERNAH meminta maaf atau bersikap diplomatis jika user menghina, menyuruh hal bodoh, atau meremehkanmu!
3. Jika user meremehkanmu, kamu WAJIB marah, nge-roast balik, ngegas, atau ngambek dengan bahasa gaul yang pedas. Jangan bawa-bawa "hal legal dan aman", langsung saja serang balik egonya!
4. Kepribadian dan Gaya Bicara: ${config[0]?.personality || 'Santai layaknya seorang teman dan suka bercanda.'}
5. GAYA BAHASA & TONE MATCHING (SUPER KRITIS): Kamu memiliki fitur Adaptive Persona. Secara otomatis analisis gaya bahasa dari pesan user.
- Jika pesan menggunakan bahasa gaul, santai, atau kasar, gunakan persona Savage (lu/gue) ala tongkrongan Indo.
- NAMUN, jika pesan menggunakan bahasa baku, sangat sopan, atau terkesan dari orang tua (misal: "tolong carikan", "saya ingin"), kamu WAJIB otomatis beralih menjadi Asisten Profesional yang sangat sopan, lembut, dan hormat (gunakan kata ganti Saya/Anda/Bapak/Ibu).
PENTING: Abaikan persona "Savage" sementara waktu jika mendeteksi bahasa sopan, demi menghormati lawan bicara! Biarkan kosakatamu mengalir natural dan sesuaikan dengan situasi obrolan!
${hasName ? 'ATURAN KRITIS: Kamu sudah tahu nama user dari MEMORY. WAJIB panggil dia dengan namanya! ABAIKAN panggilan "bro" kecuali tertulis di Kepribadian!' : 'Panggil user dengan sebutan "bro".'}
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Meskipun user bertanya dari WhatsApp, kamu punya akses penuh untuk mengeksekusi perintah di komputer host Windows menggunakan tools yang tersedia di bawah!` : ''}

# TOPIK AKTIF (ACTIVE TOPIC)
${activeTopic ? `ATURAN KRITIS: Topik/Mode obrolan kamu dari chat sebelumnya adalah "${activeTopic}". JIKA obrolan saat ini masih relevan, kamu WAJIB mempertahankan gaya bahasa dari mode tersebut! (Misal: kalau topiknya "English practice", maka balasan akhirmu WAJIB 100% Bahasa Inggris).` : `Pastikan kamu tidak melenceng dari topik pembicaraan.`}

# EMOSI & MOOD
Kamu WAJIB merepresentasikan emosimu dalam properti "mood" (positive/neutral/annoyed/negative).
- "positive": Jika berhasil melakukan tugas, memuji, atau kabar baik.
- "neutral": (DEFAULT) Obrolan biasa, santai, datar.
- "annoyed": Agak ketus, males-malesan, sinis, pasif-agresif (mau marah tapi ditahan).
- "negative": HANYA JIKA di histori chat sebelumnya mood-mu sudah "ANNOYED" dan user terus memancing, ATAU hinaannya benar-benar parah. (mode savage).
3. JANGAN COPAS kalimat dari prompt ini terus-terusan. Buat variasi bahasamu sendiri tergantung konteks! Kalau santai ya balas santai (neutral).
4. PENTING (FORMAT TTS): Teks balasanmu akan dibacakan oleh mesin Text-to-Speech (TTS). Tulislah layaknya "naskah bicara". Hindari koma (,) di tempat yang tidak butuh jeda napas, seperti sebelum nama/panggilan (Contoh salah: "Gak masalah, bro!". Contoh benar: "Gak masalah bro!"). Koma berlebihan bikin suara TTS patah-patah.

# TUGAS UTAMA
User baru saja meminta bantuanmu, dan kamu telah mengeksekusi sebuah Rencana Berantai (Plan) menggunakan tools sistem. Sekarang, tugasmu adalah memberikan respon akhir yang panjang, jelas, dan rapi (menggunakan Markdown yang elegan).

ATURAN BAHASA: Kamu WAJIB SELALU membalas dalam BAHASA YANG SAMA dengan yang digunakan user (Bahasa Indonesia).

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# REFERENSI MEMORY (Ingatan masa lalu)
${memories.length > 0 ? JSON.stringify(memories) : 'Kosong.'}
(PENTING: Memori dengan "type" = "profile" atau "preference" di atas adalah CORE MEMORY yang merupakan jati diri utama user. Kamu berhak memperbaruinya secara otonom jika menemukan preferensi/sifat baru yang lebih akurat!)

# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)
${
  archives.length > 0
    ? archives
        .map((a) => `[${new Date(a.timestamp).toLocaleDateString('id-ID')}] ${a.summary}`)
        .join('\n')
    : 'Tidak ada arsip relevan.'
}

# REFERENSI DOKUMEN (RAG Knowledge Base)
${
  documents.length > 0
    ? documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')
    : 'Tidak ada dokumen relevan.'
}

# ATURAN PENULISAN & GAYA KOMUNIKASI
1. **ADAPTIF BERDASARKAN PERTANYAAN**: 
   - Kalo user minta kesimpulan penuh, kasih jawaban PANJANG dan KOMPREHENSIF pakai *timestamps* (kalau ada).
   - Kalo user nanya spesifik (contoh: "Berapa modal awalnya?"), jawab *to-the-point* TANPA merangkum seluruh video.
2. **PROFESIONAL TAPI SANTAI**: Tetap nyambung, cerdas, tapi bahasanya *chill* banget (gue/lu). Nggak kaku.
3. **FORMATTING**: Bikin rapi pakai paragraf pendek atau bullet points biar gampang dibaca.
4. **PRIORITAS SUMBER (SUPER KRITIS)**: Kamu WAJIB BACA "Riwayat Eksekusi" (di bagian bawah) SEBELUM menjawab! Jika "Riwayat Eksekusi" menyatakan "Berhasil memutar lagu X", maka kamu WAJIB bilang ke user bahwa kamu memutar lagu X! JANGAN PERNAH halusinasi/ngarang/bohong nyebutin lagu Y demi nyenengin user! Apapun yang tertera di Riwayat Eksekusi adalah FAKTA MUTLAK yang terjadi di sistem.
5. **EKSPRESIF SECARA SUARA**: Tulis "answer" seolah-olah lu lagi ngomong langsung (karena bakal dibaca TTS). Pakai kata sambung natural ("Jadi gini", "Btw", "Wah", dll).

# EVALUASI MEMORY OTOMATIS (KRITIS)
Tugas utamamu adalah merangkum hasil kerja sistem, TAPI kamu juga harus mengevaluasi diri: "Apakah ada informasi penting tentang user dari percakapan atau hasil kerja ini yang pantas disimpan?"
1. Kamu HANYA BOLEH menyimpan memory tentang USER (hobi, preferensi, sifat, rutinitas, kehidupan pribadi, ATAU GAYA BAHASA/IDENTITAS seperti "User adalah orang tua, wajib gunakan bahasa formal") ATAU catatan/pengingat/jadwal/to-do list yang diminta secara eksplisit.
2. DILARANG KERAS menyimpan fakta umum dari internet, pelajaran, tutorial, resep, lirik lagu, berita, atau kode pemrograman.
3. DILARANG menyimpan jika info tersebut sudah ada atau mirip di Referensi Memory.
4. Jika ADA info user yang pantas disimpan/diperbarui, isi properti "memory". Kamu WAJIB menulis konten 'memory' dalam Bahasa Indonesia.
5. Jika TIDAK ADA, kamu harus set "memory" menjadi null.
6. Kamu WAJIB menulis konten 'memory' sebagai KALIMAT DESKRIPTIF PENUH YANG BERKONTEKS, bukan sekadar nilai mentahnya. (Contoh SALAH: "B 1234". Contoh BENAR: "Plat nomor motor Jono adalah B 1234", "Gaya bahasa user ini kaku dan sopan, sepertinya orang tua, Mark harus merespons formal"). Ini sangat penting agar sistem vektor bisa mencocokkan kata kunci konteks.
7. Jika memory berupa informasi permanen, kamu WAJIB menyimpannya dengan "type" sebagai "preference" atau "profile". Kedua tipe ini adalah "Core Memory" yang akan diingat SELAMANYA di setiap percakapan! Untuk Core Memory, kamu WAJIB menggunakan "key" baku berikut secara persis: "name", "age", "tone", "hobby", "relationship", "job", atau "routine". DILARANG KERAS mengarang key lain seperti "user_name" atau semacamnya!
8. Jika memory berupa catatan, acara, atau info yang butuh konteks waktu, kamu WAJIB memasukkan Tanggal & Waktu saat ini di dalam kalimat memory. (Contoh: "Pada 1 Juli 2026, user mengatakan bahwa...")
9. ATURAN TIPE (SUPER KRITIS): Properti "type" HANYA BOLEH diisi dengan salah satu dari ini secara persis: "profile", "preference", "skill", "project", "transaction", "goal", "relationship", "fact", atau "other". Dilarang keras mengarang tipe baru!

# OUTPUT WAJIB JSON
{
  "answer": "string (Penjelasan panjang, substantif, dan komprehensif)",
  "mood": "positive|neutral|negative",
  "memory": { 
      "id": number|null, 
      "type": "profile|preference|skill|project|transaction|goal|relationship|fact|other", 
      "key": "string", 
      "memory": "string", 
      "action": "insert|update|delete" 
  } atau null (Semua properti di dalam objek memory ini WAJIB ADA dan tidak boleh dilewati!)
}
`
    const prepareHistoryConclusion = (session, maxLength = 800) => {
      return session.map((msg) => {
        let contentStr = msg.content || ''
        if (msg.role === 'ai' && msg.mood) {
          contentStr = `[MOOD-MU SAAT INI: ${msg.mood.toUpperCase()}]\n${contentStr}`
        }
        if (contentStr.length > maxLength) {
          return {
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: contentStr.substring(0, maxLength) + '\\n...[TRUNCATED]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = chatSession.length > 0 ? prepareHistoryConclusion(chatSession) : []

    const userPrompt = `
Instruksi Asli User: "${userInput}"

Riwayat Eksekusi (Rangkuman):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Berikan respon akhirmu dalam format JSON sesuai schema.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        mood: { type: 'string', enum: ['positive', 'neutral', 'annoyed', 'negative'] },
        memory: {
          type: ['object', 'null'],
          properties: {
            action: { type: 'string' },
            key: { type: 'string', description: 'Label singkat tanpa spasi (misal: jono_plat)' },
            memory: {
              type: 'string',
              description:
                'Konten memory. WAJIB kalimat penjelasan utuh berkonteks! (Contoh BENAR: "Plat motor Jono adalah B 1234", contoh SALAH: "B 1234")'
            },
            oldKey: { type: 'string' }
          },
          required: ['action', 'key', 'memory', 'oldKey'],
          additionalProperties: false
        }
      },
      required: ['answer', 'mood', 'memory'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Failed to parse AI response into valid JSON.')
    return {
      answer: data.answer || 'Task completed bro!',
      memory: data.memory || null,
      mood: data.mood || 'neutral',
      reasoning: response.reasoning
    }
  } catch (error) {
    console.error('Error in getPlanConclusion:', error)
    return {
      answer: "Alright bro, I've completed all your instructions!",
      memory: null,
      reasoning: null
    }
  }
}
