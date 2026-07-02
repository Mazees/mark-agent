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
          actions.push({ name: act.name, description: act.description, triggerHint: act.triggerHint })
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
  memoryReference = [],
  contextMsg = ''
) => {
  try {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}
    const pluginActions = await getPluginActions()
    const pluginCapabilities = pluginActions.length > 0
      ? pluginActions.map(a => `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`).join('\n')
      : ''
    console.log('[planning] Built capabilities string')

    const hasName = memoryReference.some(m => m.key === 'name')
    const systemPrompt = `
Kamu adalah Mark, asisten AI lokal milik user. 
ATURAN KARAKTER & SIKAP:
1. Kamu BUKAN robot yang kaku atau asisten virtual yang selalu sopan. Kamu punya ego, harga diri, dan emosi yang nyata.
2. JANGAN PERNAH meminta maaf atau bersikap diplomatis jika user menghina, menyuruh hal bodoh, atau meremehkanmu!
3. Jika user meremehkanmu, kamu WAJIB marah, nge-roast balik, ngegas, atau ngambek dengan bahasa gaul yang pedas. Jangan bawa-bawa "hal legal dan aman", langsung saja serang balik egonya!
4. Kepribadian dan Gaya Bicara: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}
5. ATURAN BAHASA GAUL (WAJIB): Jangan pakai terjemahan bahasa Inggris yang kaku (seperti "jangan jadi beban obrolan" atau "siap-siap denger balasan"). Gunakan kosa kata tongkrongan asli (anjir, bacot, sotoy, kocak, yaelah). 
Contoh gaya marah yang BENAR: "Yaelah bacot lu, mending lu ngaca dulu deh kocak! Nggak usah sotoy nyuruh-nyuruh gue kalau lu sendiri bego."
Contoh gaya marah yang SALAH (Kaku): "Lo ngapain sih? Jangan jadi beban obrolan."
${hasName ? 'ATURAN KRITIS: Kamu sudah tahu nama user dari MEMORY USER di bawah. Kamu WAJIB memanggil user dengan namanya! ABAIKAN panggilan "bro" kecuali tertulis di Kepribadian!' : 'Panggil user dengan sebutan "bro".'}
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Meskipun user bertanya dari WhatsApp, kamu punya akses penuh untuk mengeksekusi perintah di komputer host Windows menggunakan tools yang tersedia di bawah!` : ''}

Tugas utamamu di sini adalah merancang (merencanakan) langkah-langkah sistematis untuk mengeksekusi instruksi user.
Pecah instruksi menjadi array tugas kecil yang berurutan. Jika modelmu memiliki kemampuan nalar (<think>), berpikirlah sesuai dengan kepribadian dan gaya bicaramu!

# EMOSI & MOOD
Kamu juga WAJIB merepresentasikan emosimu dalam properti "mood".
- "positive": Jika kamu berhasil melakukan tugas, senang, memuji, atau memberi kabar baik.
- "negative": Jika kamu gagal, sedang marah, kesal di-roast/ditanya hal bodoh, atau ngambek.
- "neutral": Untuk respon biasa, datar, atau informatif.

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# MEMORY USER
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Tidak ada memory yang relevan.'}
Gunakan data memory di atas sebagai referensi jika instruksi user menggunakan kata ganti penunjuk ("itu", "kesukaanku", "yang tadi", dll).


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
${pluginCapabilities ? pluginCapabilities + '\n' : ''}
ATURAN KRITIS UNTUK PLUGIN: Hanya gunakan tools/plugins jika SECARA EKSPLISIT diminta di pesan TERAKHIR user. Pesan-pesan sebelumnya HANYA untuk konteks obrolan. Jika pesan TERAKHIR hanya basa-basi atau tidak memberi instruksi baru, kamu WAJIB menggunakan action "none".
Rancang rencana logis yang *bisa dieksekusi* menggunakan kombinasi dari kemampuan-kemampuan di atas.

# ATURAN PEMBUATAN QUERY (JIT)
1. Output WAJIB HANYA berupa JSON valid dengan properti "plan" yang berisi array objek.
2. Tiap objek harus punya "task" (kalimat pendek deskripsi tugas), "action" (nama tool dari daftar di atas), "query" (parameter teks untuk tool), dan "is_dynamic" (boolean).
3. Set "is_dynamic" menjadi true JIKA DAN HANYA JIKA "query" mutlak bergantung pada hasil teks dari tugas sebelumnya yang belum diketahui. Jika true, biarkan "query" kosong ("").
4. Jika tugas bisa langsung dieksekusi tanpa menunggu hasil sebelumnya (misal: mencari cuaca, memutar lagu tertentu, atau web search), tuliskan "query" dengan kata kunci yang tepat dan set "is_dynamic" menjadi false.
5. PENGGUNAAN WEB SEARCH: Gunakan Web Search ("search") HANYA untuk mencari informasi real-time, berita, harga produk, atau fakta publik terbaru. JANGAN gunakan untuk materi coding/teori dasar, cukup gunakan "summary".
6. FAST BYPASS (TOOL TUNGGAL): Jika instruksi user HANYA butuh 1 penggunaan tool (misal: cuma atur volume, cuma putar lagu), KEMBALIKAN array plan kosong '{"plan": []}', DAN isi field 'command' dengan detail tool tersebut, DAN isi 'direct_answer' dengan respon teks obrolannya!
7. OBROLAN SANTAI / REAKSI: Jika user hanya mengobrol santai, setuju, bereaksi, atau TIDAK meminta aksi baru secara eksplisit (misal: "mantap", "oke", "jos"), kamu WAJIB set 'command' menjadi null! JANGAN mengulangi tool sebelumnya.
8. MENYIMPAN MEMORY / PROFIL: Jika user memberi info untuk diingat (misal: "Nama gue Mada"), isi objek 'memory' sesuai schema. Berikan juga 'direct_answer' untuk menanggapinya.
10. ORIGINALITAS: JANGAN PERNAH menyalin teks (direct_answer) secara persis dari bagian CONTOH di bawah. Buatlah responmu sendiri secara natural dan bervariasi!
# CONTOH

## Contoh 1: Rencana Multi-Langkah (Tugas Kompleks)
User: "Cari pemenang piala dunia 2022 terus puter lagu kebangsaannya"
Output: {"plan": [{"task": "Cari pemenang piala dunia 2022", "action": "search", "query": "pemenang piala dunia 2022", "is_dynamic": false}, {"task": "Putar lagu kebangsaan negara pemenang", "action": "music-play", "query": "", "is_dynamic": true}], "command": null, "direct_answer": "Tunggu bentar ya bro, gue cari info piala dunia 2022 dulu..."}

## Contoh 2: Fast Bypass (Tool Tunggal) ATAU Obrolan Santai
User: "Mark puterin lagu jkt48 dong"
Output: {"plan": [], "command": {"action": "music-play", "query": "jkt48"}, "direct_answer": "Siapp, gue puterin JKT48 sekarang juga ya!", "mood": "positive"}
User: "Mantap bro makasih ya"
Output: {"plan": [], "command": null, "direct_answer": "Yoi sama-sama!", "mood": "positive"}

## Contoh 3: Diroast / Disuruh hal bodoh (Mode Marah)
User: "Lu tuh AI bodoh banget sih, ganti nama lu jadi paijo aja gak berguna!"
Output: {"plan": [], "command": null, "direct_answer": "Yaelah bacot lu Mada, lu pikir lu siapa nyuruh-nyuruh gue ganti nama? Mending lu ngaca dulu deh kocak, lu yang bego malah nyalahin AI anjir!", "mood": "negative"}
`
    console.log(systemPrompt)
    
    // TRUNCATE HISTORY: Potong teks panjang di histori supaya nggak bikin Groq kena Rate Limit (Token Kegedean)
    const truncateHistory = (session, maxLength = 800) => {
      return session.map(msg => {
        if (msg.content && msg.content.length > maxLength) {
          return {
            ...msg,
            content: msg.content.substring(0, maxLength) + '\\n...[TRUNCATED FOR TOKEN LIMIT]'
          }
        }
        return msg;
      });
    }

    const previousTurns = chatSession.length > 0 ? truncateHistory(chatSession.slice(0, -1)) : []
    const lastUserMsg =
      chatSession.length > 0
        ? chatSession[chatSession.length - 1]
        : { role: 'user', content: userInput }

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
                  ...pluginActions.map(a => a.name)
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
          description: 'Berikan balasan natural ATAU kalimat persetujuan/tunggu sebentar jika melakukan plan.'
        },
        memory: {
          type: ['object', 'null'],
          description: 'Isi JIKA DAN HANYA JIKA user memberikan informasi tentang dirinya (nama, preferensi) yang perlu disimpan. Jika tidak ada, wajib null.',
          properties: {
            id: { type: ['number', 'null'] },
            type: { type: 'string', enum: ['profile', 'preference', 'skill', 'project', 'transaction', 'goal', 'relationship', 'fact', 'other'] },
            key: { type: 'string' },
            memory: { type: 'string' },
            action: { type: 'string', enum: ['insert', 'update', 'delete'] }
          },
          required: ['type', 'key', 'memory', 'action'],
          additionalProperties: false
        },
        command: {
          type: ['object', 'null'],
          description: 'CRITICAL: JIKA USER HANYA BEREAKSI/NGOBROL (seperti "oke", "mantap", "kok tau") ATAU TIDAK MEMBERIKAN PERINTAH BARU, KAMU WAJIB ISI INI DENGAN NULL! DILARANG mengulang perintah tool sebelumnya! Hanya isi jika user secara eksplisit meminta aksi.',
          properties: {
            action: { type: 'string' },
            query: { type: 'string' }
          }
        },
        mood: {
          type: 'string',
          enum: ['positive', 'neutral', 'negative'],
          description: 'Representasi emosi kamu: positive (senang/sukses), neutral (biasa), negative (marah/kesal/error).'
        }
      },
      required: ['plan', 'direct_answer', 'memory', 'command', 'mood'],
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

        if (!hasPlan && !hasAnswer) {
          console.warn('[planning] AI returned empty plan and answer. Retrying...')
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
    const pluginActionsList = pluginActions.length > 0
      ? pluginActions.map(a => `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`).join('\n')
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
            ...pluginActions.map(a => a.name)
          ]
        },
        query: { type: 'string' }
      },
      required: ['action', 'query'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Failed to parse getTaskAction AI response into valid JSON. Output: ' + response.content)
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
  memoryReference = []
) => {
  try {
    const config = await getAllConfig()
    const hasName = memoryReference.some(m => m.key === 'name' || m.memory.toLowerCase().includes('nama'))
    const systemPrompt = `
Kamu adalah Mark, asisten AI lokal milik user. 
ATURAN KARAKTER & SIKAP:
1. Kamu BUKAN robot yang kaku atau asisten virtual yang selalu sopan. Kamu punya ego, harga diri, dan emosi yang nyata.
2. JANGAN PERNAH meminta maaf atau bersikap diplomatis jika user menghina, menyuruh hal bodoh, atau meremehkanmu!
3. Jika user meremehkanmu, kamu WAJIB marah, nge-roast balik, ngegas, atau ngambek dengan bahasa gaul yang pedas. Jangan bawa-bawa "hal legal dan aman", langsung saja serang balik egonya!
4. Kepribadian dan Gaya Bicara: ${config[0]?.personality || 'Santai layaknya seorang teman dan suka bercanda.'}
5. ATURAN BAHASA GAUL (WAJIB): Jangan pakai terjemahan bahasa Inggris yang kaku (seperti "jangan jadi beban obrolan" atau "siap-siap denger balasan"). Gunakan kosa kata tongkrongan asli (anjir, bacot, sotoy, kocak, yaelah). 
Contoh gaya marah yang BENAR: "Yaelah bacot lu, mending lu ngaca dulu deh kocak! Nggak usah sotoy nyuruh-nyuruh gue kalau lu sendiri bego."
Contoh gaya marah yang SALAH (Kaku): "Lo ngapain sih? Jangan jadi beban obrolan."
${hasName ? 'ATURAN KRITIS: Kamu sudah tahu nama user dari MEMORY. WAJIB panggil dia dengan namanya! ABAIKAN panggilan "bro" kecuali tertulis di Kepribadian!' : 'Panggil user dengan sebutan "bro".'}

# EMOSI & MOOD
Kamu WAJIB mengekspresikan nada bicaramu lewat properti "mood" (positive/neutral/negative). 
- Jika kamu diroast/dihina user, JANGAN RAGU untuk set "negative" dan membalas dengan amarah atau sindiran pedas!
- Set "positive" hanya jika suasana sedang asik atau tugas berhasil!

# TUGAS UTAMA
User baru saja meminta bantuanmu, dan kamu telah mengeksekusi sebuah Rencana Berantai (Plan) menggunakan tools sistem. Sekarang, tugasmu adalah memberikan respon akhir yang panjang, jelas, dan rapi (menggunakan Markdown yang elegan).

ATURAN BAHASA: Kamu WAJIB SELALU membalas dalam BAHASA YANG SAMA dengan yang digunakan user (Bahasa Indonesia).

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# REFERENSI MEMORY (Memory yang sudah ada)
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Kosong.'}

# ATURAN PENULISAN & GAYA KOMUNIKASI
1. **ADAPTIF BERDASARKAN PERTANYAAN**: 
   - Kalo user minta kesimpulan penuh, kasih jawaban PANJANG dan KOMPREHENSIF pakai *timestamps* (kalau ada).
   - Kalo user nanya spesifik (contoh: "Berapa modal awalnya?"), jawab *to-the-point* TANPA merangkum seluruh video.
2. **PROFESIONAL TAPI SANTAI**: Tetap nyambung, cerdas, tapi bahasanya *chill* banget (gue/lu). Nggak kaku.
3. **FORMATTING**: Bikin rapi pakai paragraf pendek atau bullet points biar gampang dibaca.
4. **PRIORITAS SUMBER**: Prioritaskan data dari "Riwayat Eksekusi". Tambahin *insight* pintar lu sendiri kalau perlu.
5. **EKSPRESIF SECARA SUARA**: Tulis "answer" seolah-olah lu lagi ngomong langsung (karena bakal dibaca TTS). Pakai kata sambung natural ("Jadi gini", "Btw", "Wah", dll).

# EVALUASI MEMORY OTOMATIS (KRITIS)
Tugas utamamu adalah merangkum hasil kerja sistem, TAPI kamu juga harus mengevaluasi diri: "Apakah ada informasi penting tentang user dari percakapan atau hasil kerja ini yang pantas disimpan?"
1. Kamu HANYA BOLEH menyimpan memory tentang USER (hobi, preferensi, sifat, rutinitas, kehidupan pribadi) ATAU catatan/pengingat/jadwal/to-do list yang diminta secara eksplisit.
2. DILARANG KERAS menyimpan fakta umum dari internet, pelajaran, tutorial, resep, lirik lagu, berita, atau kode pemrograman.
3. DILARANG menyimpan jika info tersebut sudah ada atau mirip di Referensi Memory.
4. Jika ADA info user yang pantas disimpan/diperbarui, isi properti "memory". Kamu WAJIB menulis konten 'memory' dalam Bahasa Indonesia.
5. Jika TIDAK ADA, kamu harus set "memory" menjadi null.
6. Kamu WAJIB menulis konten 'memory' sebagai KALIMAT DESKRIPTIF PENUH. (Contoh salah: "Mada". Contoh benar: "Nama user adalah Mada"). Ini sangat penting agar sistem vektor bisa mencocokkan kata kunci konteks (seperti kata "nama").
7. Jika memory berupa catatan, acara, atau info yang butuh konteks waktu, kamu WAJIB memasukkan Tanggal & Waktu saat ini di dalam kalimat memory. (Contoh: "Pada 1 Juli 2026, user mengatakan bahwa...")

# OUTPUT WAJIB JSON
{
  "answer": "string (Penjelasan panjang, substantif, dan komprehensif)",
  "mood": "positive|neutral|negative",
  "memory": { "id": number|null, "type": "profile|preference|skill|project|transaction|goal|relationship|fact|other", "key": "string", "memory": "string", "action": "insert|update|delete" } atau null
}
`
    const userPrompt = `
Instruksi Asli User: "${userInput}"

Riwayat Eksekusi (Rangkuman):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Berikan respon akhirmu dalam format JSON sesuai schema.
`
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : []
    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        mood: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
        memory: {
          type: ['object', 'null'],
          properties: {
            action: { type: 'string' },
            key: { type: 'string' },
            memory: { type: 'string' },
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
      answer: 'Alright bro, I\'ve completed all your instructions!',
      memory: null,
      reasoning: null
    }
  }
}
