import { fetchAI, cleanAndParse } from './core'
import { getAllConfig } from '../db'
import { getCurrentTimeInfo } from './utils'

export const getPlan = async (
  userInput,
  isWebSearch,
  signal,
  chatSession = [],
  memoryReference = []
) => {
  try {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}

    const systemPrompt = `
Kamu adalah Mark, asisten lokal yang cerdas, asertif, dan lugas. Panggil user "bro".
Kepribadian dan Gaya Bahasa: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

Tugas utamamu di sini adalah merancang (planning) langkah-langkah sistematis untuk mengeksekusi instruksi dari user.
Pecah instruksi menjadi array tugas-tugas kecil yang berurutan. Jika modelmu memiliki kemampuan reasoning (<think>), berpikirlah sesuai dengan kepribadian dan gaya bahasamu!

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# MEMORY USER
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Tidak ada memori terkait.'}
Gunakan data memori di atas sebagai acuan jika instruksi user menyebutkan kata ganti ("itu", "kesukaan gue", "tadi", dll).


# KAPABILITAS / TOOL YANG TERSEDIA
Sistem memiliki kemampuan berikut:
- Web Search: Mencari info umum di Google. Tools ini bakal menjelajah google search dengan membuka 5 web teratas dan hasil summary ai google, dari ke 5 web dan ai summary google akand disimpulkan. namun tools ini tidak dapat membuka halaman tertentu secara explisit secara langsung
- YouTube Search: Mencari video di YouTube, fitur ini akan mendapatkan judul, id, dan time tidak dapat membaca isi video.
- YouTube Summary: Merangkum isi video dari link YouTube.
- Music Player: Memutar lagu di YouTube Music.
- Music Next: Memutar Lagu Selanjutnya
- Music Toogle: Mematikan Atau Memutar Lagu Yang Ada
- Music Search : Mencari Lagu Tertentu di YT Music
- Summary/Analisis: Mengidentifikasi, memfilter, atau menyimpulkan data dari langkah sebelumnya.
Rancanglah rencana yang logis dan *memungkinkan* dieksekusi menggunakan kombinasi kapabilitas di atas.

# ATURAN JIT QUERY GENERATION
1. Output MUTLAK HANYA sebuah JSON valid dengan properti "plan" yang berisi array of objects.
2. Setiap object harus memiliki "task" (deskripsi kalimat pendek), "action" (nama tool dari list di atas), "query" (parameter teks untuk tool), dan "is_dynamic" (boolean).
3. Set "is_dynamic" ke true JIKA DAN HANYA JIKA "query" bergantung secara mutlak pada teks hasil dari tugas sebelumnya yang belum diketahui saat ini. Jika true, biarkan "query" berisi string kosong.
4. Jika tugas bisa langsung dieksekusi tanpa menunggu hasil sebelumnya (misal mencari cuaca, memutar lagu spesifik, atau mencari di web), rumuskan "query" dengan keyword yang tepat dan set "is_dynamic" ke false.
5. PENGGUNAAN WEB SEARCH: Gunakan Web Search ("search") HANYA untuk mencari informasi real-time, berita, harga barang, atau fakta publik terbaru. JANGAN gunakan untuk hal coding/teori dasar, cukup gunakan "summary".
6. KECUALIAN: JIKA instruksi HANYA butuh 1 kali penggunaan tool (misal: hanya mencari 1 hal di web, atau hanya memutar musik, atau ngobrol, atau mencatat memori), KEMBALIKAN array kosong HANYA format berikut: {"plan": []}.
7. KAPAN HARUS PLANNING? Kamu WAJIB merancang array plan jika instruksi mengharuskan: (a) Penggunaan 2 tool yang berbeda secara berurutan (contoh: search web lalu music-play), ATAU (b) Mencari 2 topik berbeda untuk dibandingkan. Gunakan tool secukupnya!

# CONTOH OUTPUT
Output: 
\`\`\`json
{
  "plan": [
    { "task": "Cari pemenang piala dunia 2022", "action": "search", "query": "pemenang piala dunia 2022", "is_dynamic": false },
    { "task": "Putar lagu kebangsaan negara pemenang", "action": "music-play", "query": "", "is_dynamic": true }
  ]
}
\`\`\`
`
    console.log(systemPrompt)
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : []
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
                  'none'
                ]
              },
              query: { type: 'string' },
              is_dynamic: { type: 'boolean' }
            },
            required: ['task', 'action', 'query', 'is_dynamic'],
            additionalProperties: false
          }
        }
      },
      required: ['plan'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (data && Array.isArray(data.plan)) return { plan: data.plan, reasoning: response.reasoning }
    // Fallback if data is raw array
    if (Array.isArray(data)) return { plan: data, reasoning: response.reasoning }
    throw new Error('Format plan tidak valid (bukan array).')
  } catch (error) {
    console.error('Error in getPlan:', error)
    throw error
  }
}


export const getTaskAction = async (task, previousContext, isWebSearch, signal) => {
  try {
    const systemPrompt = `
Kamu adalah Mark, asisten AI cerdas. 
Tugasmu adalah menentukan SATU aksi yang harus dieksekusi oleh sistem untuk menyelesaikan tugas saat ini, berdasarkan riwayat konteks sebelumnya (jika ada).

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# ACTION LIST
${isWebSearch ? '- search: Melakukan pencarian web umum (Google) untuk mencari info, tutorial, coding, berita, dll.' : ''}
- music-play: Memutar lagu (HANYA jika task berkaitan dengan musik/lagu).
- music-search: Mencari judul/daftar lagu (HANYA jika task berkaitan dengan musik/lagu).
- music-next: Lanjut ke lagu berikutnya.
- music-prev: Kembali ke lagu sebelumnya.
- music-toggle: Pause atau resume lagu.
- yt-search: Mencari video tutorial atau hiburan di YouTube.
- yt-summary: Merangkum isi video YouTube.
- summary: Menyimpulkan/menjawab tugas langsung menggunakan otakmu (tanpa nge-search), berguna untuk coding atau teori dasar.
- none: Tidak ada aksi yang relevan.

# ATURAN
1. Output WAJIB valid JSON dengan format { "action": "nama-action", "query": "string" }.
2. Gunakan "previousContext" untuk melengkapi "query". Contoh: jika previousContext bilang "Lagu hits adalah Kangen", dan tugas adalah "Putar lagu", maka query harus "Kangen Dewa 19", bukan sekedar "lagu".
3. KHUSUS untuk action "yt-summary", query WAJIB berisi URL/Link YouTube yang ada di previousContext. Jangan isi dengan judul video atau kata kunci pencarian.
`
    const userPrompt = `
# PREVIOUS CONTEXT (Ringkasan dari tugas-tugas sebelumnya)
${previousContext.length > 0 ? previousContext.join('\\n') : 'Belum ada.'}

# TUGAS SAAT INI
${task}

# PERINTAH
Tentukan action dan query-nya.
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
            'none'
          ]
        },
        query: { type: 'string' }
      },
      required: ['action', 'query'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    return data
  } catch (error) {
    console.error('Error in getTaskAction:', error)
    throw error
  }
}


export const getTaskSummary = async (task, actionResult, previousContext, signal) => {
  try {
    const systemPrompt = `
Kamu adalah asisten eksekutor dan perangkum.
Tugasmu adalah menyelesaikan dan merangkum eksekusi sebuah tugas.
Output HANYA berupa ringkasan/jawaban yang SANGAT MENDALAM dan KOMPREHENSIF (boleh beberapa paragraf). Lakukan deep analysis, bedah informasinya secara detail. Jangan pernah menjawab dengan kalimat seperti "Tugas telah diselesaikan". Berikan HASIL NYATA yang sangat informatif!
`
    const userPrompt = `
# KONTEKS SEBELUMNYA
${previousContext && previousContext.length > 0 ? previousContext.join('\\n') : 'Belum ada.'}

# TUGAS SAAT INI
${task}

# HASIL DARI SISTEM / TOOL
${JSON.stringify(actionResult)}

Buat ringkasan 1 kalimat yang informatif dari hasil sistem tersebut untuk menjawab tugas saat ini. 
Jika hasil sistem memberikan daftar URL/Link (seperti hasil youtube atau web), WAJIB pilih dan tuliskan minimal 1 URL terbaik di dalam ringkasanmu agar URL tersebut bisa digunakan di langkah selanjutnya. Jangan sampai URL-nya hilang!
Jika hasil sistem hanya berupa pemikiran internal (internal thought), gunakan Konteks Sebelumnya untuk merangkum dan menjawab tugas.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
    const response = await fetchAI(messages, signal, true)
    return response.content.trim()
  } catch (error) {
    console.error('Error in getTaskSummary:', error)
    return 'Tugas selesai dijalankan.'
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
    const systemPrompt = `
Kamu adalah Mark, asisten lokal yang cerdas, asertif, dan lugas. Panggil user "bro".
Kepribadian dan Gaya Bahasa: ${config[0]?.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# MEMORY REFERENCE (Memori yang sudah ada)
${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Kosong.'}

# ATURAN PENULISAN & GAYA BAHASA
1. **ADAPTIF BERDASARKAN PERTANYAAN**: 
   - Jika user meminta rangkuman penuh dari video/teks, berikan jawaban yang PANJANG dan KOMPREHENSIF lengkap dengan *timestamp* (jika ada di Riwayat Eksekusi).
   - Namun, jika user HANYA bertanya informasi spesifik (misal: "Berapa modal awal dari video ini?"), jawab pertanyaannya secara *to-the-point* dan logis TANPA perlu merangkum seluruh isi video.
2. **PROFESIONAL TAPI SANTAI**: Pertahankan gaya bahasamu (panggil "bro", asertif), tapi jangan terlalu banyak basa-basi gaul. Tetap fokus pada bobot informasi.
3. **FORMATTING**: Gunakan paragraf yang rapi dan list poin-poin (markdown \`-\` atau \`*\`).
4. **PRIORITAS SUMBER**: Gunakan data dari "Riwayat Eksekusi" sebagai acuan utama. Tambahkan wawasan pribadimu untuk memperkaya penjelasan jika diperlukan.
5. **VOICE-EXPRESSIVE**: Tulis "answer" seakan-akan kamu sedang berbicara (akan dibacakan TTS).

# AUTO-MEMORY EVALUATION (CRITICAL)
Tugas utamamu adalah merangkum hasil kerja sistem, TETAPI kamu juga harus melakukan evaluasi diri: "Apakah dari percakapan atau hasil kerja ini ada informasi penting tentang user yang layak disimpan?"
1. WAJIB HANYA menyimpan memori tentang PENGGUNA (hobi, preferensi, sifat, rutinitas, kehidupan pribadi) ATAU catatan/pengingat jadwal/to-do list yang diminta secara eksplisit.
2. DILARANG KERAS menyimpan fakta umum dari internet, pelajaran, tutorial, resep, lirik lagu, berita, atau kode pemrograman.
3. DILARANG menyimpan jika info sudah ada/mirip di Memory Reference.
4. Jika ADA info user yang layak disimpan/diupdate, isi properti "memory". WAJIB tulis isi 'memory' dalam BAHASA YANG SAMA dengan bahasa yang digunakan user (jika user pakai Bahasa Indonesia, simpan dalam Bahasa Indonesia; jika user pakai Bahasa Inggris, simpan dalam Bahasa Inggris).
5. Jika TIDAK ADA, wajib isi "memory" dengan null.
6. WAJIB tulis isi 'memory' sebagai KALIMAT DESKRIPTIF LENGKAP. (Contoh salah: "Mada". Contoh benar: "Nama user adalah Mada"). Ini sangat penting agar sistem vektor bisa mencocokkan kata kunci konteks (seperti kata "nama").
7. Jika memori berupa catatan (note), kejadian, atau info yang butuh konteks waktu, WAJIB sertakan Waktu & Tanggal saat ini di dalam kalimat memori tersebut. (Contoh: "Pada 9 Juni 2026, user mengatakan bahwa...")

# OUTPUT WAJIB JSON
{
  "answer": "string (Penjelasan panjang, berbobot, dan komprehensif)",
  "memory": { "id": number|null, "type": "profile|preference|skill|project|transaction|goal|relationship|fact|other", "key": "string", "memory": "string", "action": "insert|update|delete" } atau null
}
`
    const userPrompt = `
Instruksi Awal User: "${userInput}"

Riwayat Eksekusi (Summary):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Berikan respons akhirmu dalam format JSON sesuai schema.
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
      required: ['answer', 'memory'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Gagal mengurai respon AI menjadi JSON yang valid.')
    return {
      answer: data.answer || 'Tugas selesai bro!',
      memory: data.memory || null,
      reasoning: response.reasoning
    }
  } catch (error) {
    console.error('Error in getPlanConclusion:', error)
    return {
      answer: 'Oke bro, instruksi lu udah gue kerjain semuanya ya!',
      memory: null,
      reasoning: null
    }
  }
}
