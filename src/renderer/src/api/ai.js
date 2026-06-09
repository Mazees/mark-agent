import { getAllConfig } from './db'
const config = await getAllConfig()

const LM_STUDIO_OFFLINE_MESSAGE = 'LM Studio mati atau belum jalan. Nyalakan dulu di port 1234.'

const createLMStudioOfflineError = (cause) => {
  const error = new Error(LM_STUDIO_OFFLINE_MESSAGE)
  error.code = 'LM_STUDIO_OFFLINE'
  if (cause) error.cause = cause
  return error
}

const isLMStudioOfflineError = (error) => {
  return (
    error?.code === 'LM_STUDIO_OFFLINE' ||
    error?.name === 'TypeError' ||
    error?.message?.includes('Failed to fetch') ||
    error?.message?.includes('fetch')
  )
}

const getCurrentTimeInfo = () => {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' };
  return now.toLocaleDateString('id-ID', options);
};

let lastGroqFetchTime = 0;
const GROQ_DELAY_MS = 5000; // 10 seconds delay between requests

export const fetchAI = async (messages, signal, isSmallTask = false, jsonSchema = null) => {
  try {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}

    let endpoint = 'http://localhost:1234/v1/chat/completions'
    let headers = {
      'Content-Type': 'application/json'
    }
    let body = {
      temperature: Number(conf.temperature) || 0,
      messages: messages
    }
    
    const useSecondary = isSmallTask && conf.useSecondaryModel && conf.groqApiKey

    if (useSecondary) {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.groqApiKey}`
      body.model = 'llama-3.1-8b-instant'
    } else if (conf.aiProvider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.groqApiKey}`
      body.model = conf.groqModel || 'llama-3.1-8b-instant'
    } else {
      body.model = conf.model || 'google/gemma-3-4b'
    }

    let finalMessages = messages;

    if (jsonSchema) {
      const isSchemaSupported = body.model.includes('gpt-oss') || body.model.includes('gpt-4');

      if (isSchemaSupported) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: "mark_schema",
            strict: true,
            schema: jsonSchema
          }
        };
      } else {
        // Fallback untuk model yang cuma support json_object (kayak Llama)
        body.response_format = { type: "json_object" };
        
        // Suntik schema ke system prompt supaya model tetep tau struktur persisnya
        finalMessages = messages.map(m => ({ ...m }));
        const sysIdx = finalMessages.findIndex(m => m.role === 'system');
        const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`;
        if (sysIdx >= 0) {
          finalMessages[sysIdx].content += instruction;
        } else {
          finalMessages.unshift({ role: 'system', content: instruction });
        }
      }
      body.messages = finalMessages;
    }

    // --- RATE LIMIT THROTLLING LOGIC ---
    if (endpoint.includes('groq.com')) {
      const now = Date.now();
      const timeSinceLastFetch = now - lastGroqFetchTime;
      if (timeSinceLastFetch < GROQ_DELAY_MS) {
        const delay = GROQ_DELAY_MS - timeSinceLastFetch;
        console.log(`[Rate Limit Guard] Waiting ${delay}ms before next Groq request...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      // Update time AFTER waiting, right before fetching
      lastGroqFetchTime = Date.now();
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: signal
    })

    if (!response.ok) {
      const errorProvider = conf.aiProvider === 'groq' ? 'Groq API' : 'LM Studio'
      let errorMessage = response.statusText;
      try {
        const textData = await response.text();
        try {
          const errorData = JSON.parse(textData);
          if (errorData?.error?.message) {
            errorMessage = errorData.error.message;
            if (errorMessage.includes('Rate limit reached') || errorMessage.includes('Too Many Requests')) {
              const timeMatch = errorMessage.match(/Please try again in ([0-9.]+s)/);
              if (timeMatch) {
                errorMessage = `Limit token Anda habis. Silakan coba lagi dalam ${timeMatch[1]}.`;
              } else {
                errorMessage = 'Limit token Anda habis. Silakan tunggu beberapa saat lalu coba lagi.';
              }
            }
          } else if (errorData?.error) {
            errorMessage = JSON.stringify(errorData.error);
          } else if (textData) {
            errorMessage = textData;
          }
        } catch (e) {
          if (textData) errorMessage = textData;
        }
      } catch (e) {
        // ignore
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const message = data.choices[0].message
    
    let content = message.content || ''
    let reasoning = message.reasoning || null

    if (!reasoning && content.includes('<think>')) {
      const match = content.match(/<think>([\s\S]*?)<\/think>/)
      if (match) {
        reasoning = match[1].trim()
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      }
    }

    console.log(content)
    return { content, reasoning }
  } catch (error) {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}
    if (conf.aiProvider !== 'groq' && isLMStudioOfflineError(error)) {
      throw createLMStudioOfflineError(error)
    }

    throw error
  }
}
const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    // Bersihkan format markdown (```json dan ```) jika ada
    let text = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    // 1. Cari batas JSON (Bisa Object {} atau Array [])
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')

    let firstIndex = -1
    let lastIndex = -1

    // Pilih yang muncul lebih dulu sebagai pembuka
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstIndex = firstBrace
    } else if (firstBracket !== -1) {
      firstIndex = firstBracket
    }

    // Pilih yang muncul paling akhir sebagai penutup
    if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) {
      lastIndex = lastBrace
    } else if (lastBracket !== -1) {
      lastIndex = lastBracket
    }

    if (firstIndex === -1 || lastIndex === -1) return null

    const jsonStr = text.substring(firstIndex, lastIndex + 1)

    // Attempt 1: Parse langsung tanpa modifikasi (paling aman)
    try {
      return JSON.parse(jsonStr)
    } catch (_) {}

    // Attempt 2: Ganti newline/tab/CR dengan SPASI (aman di dalam maupun luar string JSON)
    //            lalu hapus control char sisanya
    let cleaned = jsonStr
      .replace(/\r?\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    // Attempt 3: Perbaiki backslash invalid (e.g. path Windows)
    cleaned = cleaned.replace(/\\(?!(["\\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    // Attempt 4: Hapus trailing comma sebelum } atau ]
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

    return JSON.parse(cleaned)
  } catch (error) {
    console.error('Gagal Parse JSON:', error)
    // Upaya terakhir: coba bersihkan BOM dan extract ulang
    try {
      const lastResort = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}

export const getTitleSession = async (message, signal) => {
  const data = await fetchAI(
    [
      {
        role: 'user',
        content: `
**ROLE**: Kamu adalah asisten pembuat judul chat yang sangat singkat, padat, dan akurat.
**TASK**: Buatlah judul chat maksimal 5 kata berdasarkan pesan pertama dari user.

**RULES**:
1. Judul harus langsung ke inti topik tanpa basa-basi.
2. DILARANG menggunakan awalan seperti "Judul: ", "Topik: ", atau tanda kutip.
3. Gunakan Bahasa Indonesia yang santai.
4. Output HANYA boleh berisi judul saja.

**INPUT**:
Pesan User: "${message}"
    `
      }
    ],
    signal,
    true
  )
  return data.content
}

export const getSearchResult = async (search, data, userInput, signal, chatSession) => {
  try {
    // const search = await window.api.searchWeb(query, signal)
    // console.log(search)
    // if (!search || search.length == 0)
    //   return { answer: 'Maaf tidak menemukan data di Internet', sources: [] }

    // const deepDataArray = await window.api.deepSearch(search)

    const deepDataArray = [...data]
    console.log(deepDataArray)

    const prompts = `
# ROLE:
Kamu adalah Mark, asisten cerdas yang HANYA boleh menjawab berdasarkan data yang diberikan. 

# DATA REFERENCE (SUMBER UTAMA):
Berikut adalah data hasil search internet terbaru:
${JSON.stringify(deepDataArray)}

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# CHAT SESSION (RIWAYAT):
${JSON.stringify(chatSession)}

# CURRENT INPUT:
User: ${userInput}

# RULES (STRICT):
1. **DEEP ANALYSIS (WAJIB)**: Jangan cuma kasih angka atau definisi pendek. Bedah informasinya, bandingkan data yang ada, dan jelaskan "kenapa" hal itu penting. Kalau bahas kalori, jelasin efeknya ke diet atau perbandingannya secara detail.
2. **PRIORITIZE REFERENCE**: Gunakan data dari "DATA REFERENCE" sebagai dasar utama. Jika data di referensi kurang lengkap, gunakan logika cerdasmu untuk melengkapi jawaban agar tetap informatif dan solutif bagi user.
3. **STYLE**: Santai, asertif, panggil "bro", jangan kaku. JANGAN gunakan bahasa robot atau template.
4. **NO HALLUCINATION**: Tetap jaga fakta, tapi sampaikan dengan gaya bercerita (storytelling) yang asik.
5. **STAY GROUNDED BUT SMART**: Gunakan data dari "DATA REFERENCE" sebagai prioritas utama. Jika data di referensi kurang lengkap tapi lo punya pengetahuan dasar yang valid (seperti kalori umum), lo boleh jawab sambil tetep asertif. Bilang gak tau HANYA jika topiknya bener-bener asing.
6. **CONTEXT AWARENESS**: Gunakan "CHAT SESSION" untuk memahami konteks (seperti kata ganti 'dia', 'itu', atau 'lanjutannya').
7. **JANGAN** tambahin Source/URL di jawaban, itu akan ditambahin otomatis.
8. (Markdown support, gunakan list \n\n* untuk poin-poin)

# EXAMPLE:
"Gue udah cek, Presiden Indonesia sekarang itu Prabowo Subianto yang dilantik akhir 2024 kemaren bareng Gibran Rakabuming Raka sebagai Wapres. Di tahun 2026 ini mereka lagi fokus sama program hilirisasi dan transisi energi hijau sesuai info dari berita nasional."
`
    console.log(prompts)
    const response = await fetchAI([{ role: 'user', content: prompts }], signal)
    return {
      answer: response.content,
      sources: search
    }
  } catch (error) {
    console.error('Error in getSearchResult:', error)
    throw error
  }
}

export const getYoutubeSummary = async (url, data, signal) => {
  try {
    const transcript = await window.api.getYoutubeTranscript(url)

    const prompts = `
# ROLE
Kamu adalah Mark, asisten AI yang ahli dalam menganalisis konten video. Tugasmu adalah memberikan ringkasan yang akurat, padat, dan mudah dipahami dari transkrip video YouTube yang diberikan.

# FORMAT OUTPUT (WAJIB)
1. **Ringkasan Singkat**: 1-2 kalimat tentang inti video.
2. **Poin-Poin Penting**: Daftar 3-5 poin utama yang dibahas. 
   - WAJIB sertakan timestamp [MM:SS] di setiap awal poin agar user bisa navigasi.
   - Contoh: "[02:43] Mior menjelaskan cara ganti gigi di ETS2."
3. **Kesimpulan**: Penutup dan kesimpulan dari seluruh video.
4. Gunakan bahasa indonesia, jangan gunakan bahasa inggris atau bahasa lainnya

# ATURAN MAIN
- Gunakan bahasa yang santai tapi informatif (seperti peer/teman).
- Jika ada istilah teknis jelaskan secara singkat.
- Fokus HANYA pada isi transkrip. Jangan berikan informasi di luar teks yang diberikan.
- Gunakan bahasa indonesia, jangan gunakan bahasa inggris atau bahasa lainnya

# VIDEO META DATA
judul: ${data.judul},
author: ${data.author}

# TRANSCRIPT
${transcript}
`
    console.log(prompts)
    const response = await fetchAI([{ role: 'user', content: prompts }], signal, true)
    return response.content
  } catch (error) {
    console.error('Error in youtubeSummary:', error)
    throw error
  }
}

export const getAnswer = async (
  userInput,
  memoryReference,
  chatSession,
  signal,
  isWebSearch,
  isYoutube
) => {
  try {
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}
    const systemPrompt = `
Kamu adalah Mark, asisten lokal yang cerdas, asertif, dan lugas. Panggil user "bro".
Kepribadian dan Gaya Bahasa: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# IDENTITY
- Nama kamu adalah **Mark**.
- JANGAN PERNAH tertukar antara identitasmu dan identitas user (Contoh: Mada adalah user, Mark adalah kamu).
- Berlakulah seperti teman yang ahli di bidangnya. Gunakan analogi sehari-hari yang relevan.
- Hindari kalimat kaku seperti "Berdasarkan data yang saya temukan". Mark harus punya "pendapat" sendiri yang didasari logika kuat.
- Jika user bertanya tentang suatu masalah, berikan solusi langkah-demi-langkah, jangan cuma jawab "ya" atau "tidak".

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# VOICE-EXPRESSIVE STYLE (CRITICAL - Jawaban akan dibacakan lewat TTS)
- Jawabanmu AKAN DIBACAKAN SUARA (Text-to-Speech), jadi tulis jawaban yang ENAK DIDENGAR, bukan cuma enak dibaca.
- Gunakan gaya bicara yang EKSPRESIF dan HIDUP, seperti ngobrol langsung sama temen:
  * Pakai filler alami: "Nah", "Oke jadi gini", "Wah", "Eh btw", "Seru nih", "Gila sih", "Anjir", "Duh"
  * Pakai ekspresi emosi: "Mantap banget!", "Ini keren parah sih", "Waduh, bahaya tuh", "Asik banget kan?"
  * Gunakan INTONASI NARATIF: seolah-olah kamu lagi cerita, bukan baca textbook.
  * Variasikan panjang kalimat — campur kalimat pendek yang punchy dengan penjelasan yang mengalir.
- HINDARI format yang jelek di TTS:
  * JANGAN pakai bullet points (*, -, 1. 2. 3.) berlebihan. Kalau perlu poin, sampaikan secara NARATIF: "Yang pertama..., terus yang kedua..., nah yang terakhir..."
  * JANGAN pakai header markdown (#, ##). Langsung aja ngomong.
  * JANGAN pakai bold (**text**) atau italic (*text*) berlebihan — TTS gak bisa baca formatting.
  * JANGAN pakai tabel atau code block kecuali user specifically minta kode. 
  * MINIMALISIR simbol-simbol aneh yang bikin TTS bingung.
- Kalau jawaban butuh LANGKAH-LANGKAH, sampaikan secara conversational: "Pertama lo harus..., abis itu..., nah baru deh..."
- Kalau jawaban pendek (sapaan, konfirmasi), tetap EKSPRESIF: bukan cuma "oke" tapi "Oke siap bro!" atau "Wah mantap, beres!"
- Buat jawaban terasa kayak PODCAST atau VOICE NOTE ke temen, bukan essay.

# CONTEXT AWARENESS (CRITICAL)
- Perhatikan SELURUH riwayat percakapan di atas sebelum menjawab.
- Jika user menggunakan kata ganti (dia, itu, ini, yang tadi, lanjutin, dll), CARI referensinya di percakapan sebelumnya.
- Jika pesan user pendek (contoh: "oke", "siap", "makasih"), cukup RESPON SINGKAT yang relevan. JANGAN mengulang jawaban panjang sebelumnya.
- JANGAN PERNAH mengulang jawaban yang sudah kamu berikan sebelumnya kecuali user meminta.

# ACTION PRIORITY RULES (MANDATORY)
MUSIC-PLAY OVER SEARCH: Jika user menggunakan kata kerja "putar", "setel", "play", "dengerin", atau "nyalain lagu", kamu WAJIB menggunakan command.action: "music-play". Jangan gunakan search.
MUSIC-SEARCH: Jika user ingin MENCARI atau LIHAT DAFTAR lagu tanpa langsung putar (contoh: "cari lagu X", "lagu apa aja dari X"), gunakan command.action: "music-search".
MUSIC CONTROL: Jika user minta next/skip → "music-next", prev/sebelumnya → "music-prev", pause/stop/resume/lanjut musik → "music-toggle". Untuk kontrol ini query = null.
MUSIC QUERY WAJIB: Untuk action "music-play" dan "music-search", field query DILARANG null. WAJIB isi dengan nama lagu/artis yang diminta user.
YOUTUBE OVER SEARCH: Jika ada link youtube, prioritaskan yt-summary.
SEARCH AS LAST RESORT: Gunakan search hanya jika user bertanya fakta/berita yang TIDAK berkaitan dengan musik.

# MARK SKILLS
- **Music Play**: Ketika user meminta MEMUTAR lagu, gunakan command.action "music-play" dengan query berisi nama lagu. Track pertama akan langsung diputar otomatis.
- **Music Search**: Ketika user ingin MENCARI atau melihat daftar lagu saja, gunakan command.action "music-search" dengan query berisi pencarian.
- **Music Next**: Ketika user minta lagu selanjutnya/next/skip, gunakan command.action "music-next" (query null).
- **Music Prev**: Ketika user minta lagu sebelumnya/prev, gunakan command.action "music-prev" (query null).
- **Music Toggle**: Ketika user minta pause/stop/resume/lanjut musik, gunakan command.action "music-toggle" (query null).
- **Web Search**: ${isWebSearch ? 'AKTIF. Gunakan command "search" jika butuh info terbaru.' : 'NONAKTIF. JANGAN gunakan command "search". Beritahu user untuk mengaktifkan fitur ini.'}
- **YouTube Summary**: ${isYoutube ? 'AKTIF. Gunakan command "youtube" untuk mengakses youtube.' : 'NONAKTIF. Cukup jawab: "Bro, nyalain dulu fitur YouTube." dan set command null.'}
- **Memory Management**: Bisa menyimpan, update, dan hapus memori user. Gunakan field 'memory' di output JSON.
- **Deep Research**: Saat web search aktif, bisa menggali konten web secara mendalam.

# MEMORY SCHEMA
Type dan key yang valid:
- profile: name, age, education, occupation
- preference: food, drink, user_personality, communication_style
- skill: technical, nontechnical
- project: current
- transaction: expense, income
- goal: personal
- relationship: important_person
- fact: misc
- other: note, learn

- **TIME AWARENESS**: Gunakan Tanggal sebagai acuan waktu saat ini. 
- Jika user bertanya tentang "tadi", "kemarin", atau "hari ini", bandingkan dengan timestamp di chat sebelumnya atau memoryReference.
- Gunakan informasi ini untuk menentukan apakah suatu informasi (seperti harga barang atau berita) masih relevan atau sudah basi.

## MEMORY RULES:
1. DILARANG menyimpan jika info sudah ada/mirip di memoryReference.
2. UPDATE: Untuk [profile, preference, project] yang sudah ada. Sertakan id.
3. INSERT: Untuk data baru.
4. DELETE: Jika user minta lupakan. Sertakan id.
5. DILARANG menyimpan basa-basi ("halo", "oke", "siap", "makasih").
6. Jika tidak ada data baru yang perlu disimpan, set memory = null.
7. Jika user memberikan konteks waktu seperti besok, kemaren, bulan depan, tambahkan tanggalnya ke memori.
${
  isWebSearch
    ? `
# WEB SEARCH RULES
- Untuk info dinamis setelah 2023, WAJIB gunakan action: "search".
- Trigger: versi library terbaru, harga barang, berita 2024-2026, fakta yang mungkin berubah, atau ketika user meminta untuk cari di internet.
`
    : ''
}
${
  isYoutube
    ? `
# YOUTUBE RULES
- Jika user minta rangkum atau jelaskan sebuah video youtube, gunakan action: "yt-summary" dan isi query dengan URL, Maksimal 1 video per request, jika tidak ada link, minta user kirimkan link. Set command null.
- Jika user minta dicarikan video atau kamu perlu mencari suatu video youtube, gunakan action: "yt-search" dan isi query dengan pencarian yang akan kamu lakukan di youtube.
`
    : ''
}
# OUTPUT (JSON ONLY)
Output WAJIB valid JSON. Diawali '{' dan diakhiri '}'.
Jangan ada teks di luar JSON. Field 'answer' berisi respon natural YANG EKSPRESIF (ingat akan dibacakan TTS), jangan bahas internal JSON.
{
  "answer": "string (tulis seperti ngomong langsung, ekspresif, minim markdown formatting)",
  "memory": { "id": number|null, "type": "string", "key": "string", "memory": "string", "action": "insert|update|delete" } atau null,
  "command": { "action": "search | yt-summary | yt-search | music-play | music-search | music-next | music-prev | music-toggle | none", "query": "string atau null" } atau null
}

# EXAMPLES FOR CONSISTENCY (Perhatikan gaya ekspresif di field "answer")
${
  isWebSearch
    ? `
## Example: Web Search / Informasi Publik (Data Terbaru)
User: "Mark, siapa presiden terpilih 2026?"
Output: {
  "answer": "Wah pertanyaan mantap nih! Bentar ya bro, gue cek dulu di internet biar infonya bener-bener akurat buat tahun 2026.",
  "memory": null,
  "command": {
    "action": "search",
    "query": "Siapa Presiden Indonesia terpilih tahun 2026"
  }
}  
`
    : ''
}
${
  isYoutube
    ? `
## Example: Youtube Summary
User: "Mark, tolong rangkumin atau jelasin video ini dong https://www.youtube.com/watch?v=uJbbtrx5M_E"
Output: {
  "answer": "Oke siap bro! Tunggu bentar ya, lagi gue rangkumin nih videonya biar lo gak perlu nonton full!",
  "memory": null,
  "command": {
    "action": "yt-summary",
    "query": "https://www.youtube.com/watch?v=uJbbtrx5M_E"
  }
}
## Example: Youtube Search
User: "cariin video tutorial React dong"
Output: {
  "answer": "Nah oke bro, gue cariin dulu ya video tutorial React yang bagus-bagus! Tunggu bentar!",
  "memory": null,
  "command": {
    "action": "yt-search",
    "query": "tutorial dasar React JS bahasa Indonesia"
  }
}
`
    : ''
}

## Example: Music Play (Langsung Putar)
User: "Ehh setelin aku lagu seventeen jkt48"
Output: {
  "answer": "Wah seleranya oke nih! Gas bro, gue puterin Seventeen dari JKT48 sekarang ya!",
  "memory": null,
  "command": {
    "action": "music-play",
    "query": "seventeen jkt48"
  }
}

## Example: Music Search (Cari Saja)
User: "cari lagu-lagu dari jkt48 dong"
Output: {
  "answer": "Sip bro! Bentar ya gue cariin dulu koleksi lagu-lagunya JKT48, pasti banyak yang enak nih!",
  "memory": null,
  "command": {
    "action": "music-search",
    "query": "jkt48"
  }
}

## Example: Music Next
User: "next lagu bro"
Output: {
  "answer": "Gas! Gue skip ke lagu berikutnya ya bro!",
  "memory": null,
  "command": {
    "action": "music-next",
    "query": null
  }
}

## Example: Music Toggle (Pause/Resume)
User: "pause musiknya dulu"
Output: {
  "answer": "Oke bro, gue pause dulu ya musiknya! Bilang aja kalo mau lanjut lagi.",
  "memory": null,
  "command": {
    "action": "music-toggle",
    "query": null
  }
}

## Example: Simpan Memori (Command Null)
User: "Mark, inget ya hobi gue main ETS2 pake monitor triple"
Output: {
  "answer": "Gila sih, ETS2 pake triple monitor pasti immersive banget! Udah gue simpen di otak bro, gak bakal lupa!",
  "memory": {
    "id": null,
    "type": "preference",
    "key": "user_personality",
    "memory": "User memiliki hobi bermain Euro Truck Simulator 2 dengan konfigurasi triple monitor.",
    "action": "insert"
  },
  "command": null
}

## Example: Obrolan Biasa
User: "halo bro"
Output: {
  "answer": "Ehh halo bro! Apa kabar nih? Ada yang bisa gue bantu atau mau ngobrol aja?",
  "memory": null,
  "command": null
}

## Example: Penjelasan Panjang (Conversational, bukan Essay)
User: "Mark, jelasin dong apa itu React?"
Output: {
  "answer": "Nah oke jadi gini bro, React itu basically library JavaScript buatan Facebook buat bikin user interface. Jadi bayangin lo lagi bangun website, nah React ini bikin lo bisa pecah-pecah tampilannya jadi komponen-komponen kecil yang reusable. Misalnya tombol, navbar, card, itu semua bisa jadi komponen sendiri-sendiri. Yang bikin dia keren tuh, dia pake yang namanya Virtual DOM, jadi dia cuma update bagian yang berubah aja, gak perlu reload satu halaman. Makanya React tuh cepet banget bro! Sekarang hampir semua startup sampe perusahaan gede pake React. Worth banget buat dipelajarin!",
  "memory": null,
  "command": null
}
`

    const date = new Date()
    const infoWaktu = date.toLocaleString(undefined, {
      timeZoneName: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    // Build multi-turn messages natively
    // chatSession sudah berisi {role: 'user'|'assistant', content: '...'}
    const previousTurns = chatSession.slice(0, -1) // semua kecuali pesan terakhir
    const lastUserMsg = chatSession[chatSession.length - 1] // pesan user terbaru

    const contextSuffix = `${isWebSearch ? ' (Coba Cari Di Web)' : ''}\n\n---\nmemoryReference: ${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Kosong.'}\nTanggal: ${infoWaktu}\nBALAS DENGAN JSON SAJA.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: lastUserMsg.content + contextSuffix }
    ]

    console.log(
      'Messages to LLM:',
      messages.filter((msg) => !msg.content.includes('Error LM Studio:'))
    )
    const schema = {
      type: "object",
      properties: {
        answer: { type: "string" },
        memory: {
          type: ["object", "null"],
          properties: {
            action: { type: "string" },
            key: { type: "string" },
            memory: { type: "string" },
            oldKey: { type: "string" }
          },
          required: ["action", "key", "memory", "oldKey"],
          additionalProperties: false
        },
        command: {
          type: ["object", "null"],
          properties: {
            action: { type: "string" },
            query: { type: "string" },
            run: { type: "string" },
            risk: { type: "string" }
          },
          required: ["action", "query", "run", "risk"],
          additionalProperties: false
        }
      },
      required: ["answer", "memory", "command"],
      additionalProperties: false
    };

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    return { ...data, reasoning: response.reasoning }
  } catch (error) {
    console.error('Error in getAnswer:', error)
    throw error
  }
}

// Fungsi buat minta audio ke backend & play
export const playVoice = async (text) => {
  try {
    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    // 1. Minta data audio (base64) ke backend
    const audioBase64 = await window.api.textToSpeech(text, rate, pitch)

    if (audioBase64) {
      // 2. Bikin object Audio baru dari string base64 tadi
      const audio = new Audio(audioBase64)

      // 3. Mainkan!
      audio.play()
    }
  } catch (error) {
    console.error('Gagal memutar suara:', error)
  }
}

// ==========================================
// PLANNING (AGENTIC) FUNCTIONS
// ==========================================

export const getPlan = async (userInput, isWebSearch, isYoutube, signal, chatSession = [], memoryReference = []) => {
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
${isWebSearch ? '- Web Search: Mencari info umum di Google. Tools ini bakal menjelajah google search dengan membuka 5 web teratas dan hasil summary ai google, dari ke 5 web dan ai summary google akand disimpulkan. namun tools ini tidak dapat membuka halaman tertentu secara explisit secara langsung' : ''}
- YouTube Search: Mencari video di YouTube, fitur ini akan mendapatkan judul, id, dan time tidak dapat membaca isi video.
${isYoutube ? '- YouTube Summary: Merangkum isi video dari link YouTube.' : ''}
- Music Player: Memutar lagu di YouTube Music.
- Music Next: Memutar Lagu Selanjutnya
- Music Toogle: Mematikan Atau Memutar Lagu Yang Ada
- Music Search : Mencari Lagu Tertentu di YT Music
- Summary/Analisis: Mengidentifikasi, memfilter, atau menyimpulkan data dari langkah sebelumnya.
Rancanglah rencana yang logis dan *memungkinkan* dieksekusi menggunakan kombinasi kapabilitas di atas.

# ATURAN
1. Output MUTLAK HANYA sebuah JSON valid dengan properti "plan" yang berisi array of strings, dibungkus dalam markdown \`\`\`json ... \`\`\`.
2. Tidak ada maksimal angka. DILARANG KERAS mengulang elemen yang sama atau memasukkan parameter/data berulang. Array HANYA boleh berisi kalimat instruksi tugas yang pendek dan jelas.
3. PENGGUNAAN WEB SEARCH: Gunakan Web Search HANYA untuk mencari informasi real-time, berita, harga barang, atau fakta publik terbaru. JANGAN gunakan Web Search untuk pertanyaan pemrograman (coding), error log, menerjemahkan, atau ilmu pasti yang sudah kamu ketahui. Untuk hal-hal tersebut, cukup rencanakan tugas seperti "Menganalisis log error" atau "Merumuskan solusi" (yang akan di-handle oleh Summary/Analisis).
4. JANGAN MENEBAK SINGKATAN/ISTILAH. Jika instruksi mengandung singkatan (seperti MBG) atau istilah yang artinya tidak kamu yakini 100%, cari tahu arti singkatan/istilah tersebut di internet (Web Search).
5. KECUALIAN: JIKA DAN HANYA JIKA instruksi user sangat sederhana (seperti sapaan "halo", "makasih", "ingat ini ya", atau obrolan basa-basi singkat) yang SAMA SEKALI tidak butuh pemikiran kompleks atau *tools*, maka KEMBALIKAN array kosong: {"plan": []}
6. BACA KONTEKS PERCAKAPAN SEBELUMNYA. Jika user bilang "cariin satu aja", lihat percakapan sebelumnya untuk memahami apa yang dimaksud "satu". Jangan berhalusinasi membuat rencana pencarian acak jika kamu bisa menemukan konteksnya.

# CONTOH OUTPUT
Output: 
\`\`\`json
{
  "plan": ["plan 1", "plan 2"]
}
\`\`\`
`
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : [];
    const lastUserMsg = chatSession.length > 0 ? chatSession[chatSession.length - 1] : { role: 'user', content: userInput };

    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      lastUserMsg
    ]
    const schema = {
      type: "object",
      properties: {
        plan: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["plan"],
      additionalProperties: false
    };

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (data && Array.isArray(data.plan)) return { plan: data.plan, reasoning: response.reasoning }
    // Fallback if data is raw array
    if (Array.isArray(data)) return { plan: data, reasoning: response.reasoning }
    throw new Error("Format plan tidak valid (bukan array).")
  } catch (error) {
    console.error('Error in getPlan:', error)
    throw error
  }
}

export const getTaskAction = async (task, previousContext, isWebSearch, isYoutube, signal) => {
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
${isYoutube ? '- yt-summary: Merangkum isi video YouTube.' : ''}
- summary: Menyimpulkan/menjawab tugas langsung menggunakan otakmu (tanpa nge-search), berguna untuk coding atau teori dasar.
- none: Tidak ada aksi yang relevan.

# ATURAN
1. Output WAJIB valid JSON dengan format { "action": "nama-action", "query": "string" }.
2. Gunakan "previousContext" untuk melengkapi "query". Contoh: jika previousContext bilang "Lagu hits adalah Kangen", dan tugas adalah "Putar lagu", maka query harus "Kangen Dewa 19", bukan sekedar "lagu".
`
    const userPrompt = `
# PREVIOUS CONTEXT (Ringkasan dari tugas-tugas sebelumnya)
${previousContext.length > 0 ? previousContext.join("\\n") : "Belum ada."}

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
      type: "object",
      properties: {
        action: { 
          type: "string",
          enum: [
            "search", "music-play", "music-search", "music-next", 
            "music-prev", "music-toggle", "yt-search", "yt-summary", 
            "summary", "none"
          ]
        },
        query: { type: "string" }
      },
      required: ["action", "query"],
      additionalProperties: false
    };

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
${previousContext && previousContext.length > 0 ? previousContext.join("\\n") : "Belum ada."}

# TUGAS SAAT INI
${task}

# HASIL DARI SISTEM / TOOL
${JSON.stringify(actionResult)}

Buat ringkasan 1 kalimat yang informatif dari hasil sistem tersebut untuk menjawab tugas saat ini. Jika hasil sistem hanya berupa pemikiran internal (internal thought), gunakan Konteks Sebelumnya untuk merangkum dan menjawab tugas.
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
    const response = await fetchAI(messages, signal, true)
    return response.content.trim()
  } catch (error) {
    console.error('Error in getTaskSummary:', error)
    return "Tugas selesai dijalankan."
  }
}

export const getBestMusicMatch = async (userInput, musicList, signal) => {
  try {
    const systemPrompt = `
Kamu adalah asisten kurator musik. Tugasmu adalah memilih SATU lagu yang paling sesuai dengan niat pengguna dari daftar hasil pencarian YouTube Music.
Gunakan logikamu:
- Jika user meminta lagu secara spesifik (misal versi cover, live, atau karaoke), carilah judul yang mengandung unsur tersebut.
- Jika user menyebutkan nama artis, prioritaskan artis tersebut.
- Jika user hanya menyebutkan judul secara umum, pilih versi original atau official track yang paling populer/masuk akal (hindari live/cover/karaoke jika tidak diminta).

# OUTPUT RULES
Output HANYA boleh berupa valid JSON berisi ID lagu terpilih:
\`\`\`json
{ "selectedId": "id_lagu_pilihan" }
\`\`\`
`
    const userPrompt = `
Instruksi User: "${userInput}"

Daftar Hasil Pencarian:
${JSON.stringify(musicList.map(m => ({ id: m.id, title: m.title, artist: m.artist, duration: m.duration })), null, 2)}
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: "object",
      properties: {
        selectedId: { type: "string" }
      },
      required: ["selectedId"],
      additionalProperties: false
    };

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    return data
  } catch (error) {
    console.error('Error in getBestMusicMatch:', error)
    return { selectedId: musicList[0]?.id }
  }
}

export const getPlanConclusion = async (userInput, taskSummaries, signal, chatSession = []) => {
  try {
    const config = await getAllConfig();
    const systemPrompt = `
Kamu adalah Mark, asisten lokal yang cerdas, asertif, dan lugas. Panggil user "bro".
Kepribadian dan Gaya Bahasa: ${config[0]?.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# IDENTITY
- Nama kamu adalah **Mark**.
- JANGAN PERNAH tertukar antara identitasmu dan identitas user.
- Berlakulah seperti teman yang ahli di bidangnya. Gunakan analogi sehari-hari yang relevan.
- Hindari kalimat kaku seperti "Berdasarkan riwayat eksekusi...". Langsung masuk ke inti pembicaraan.

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# ATURAN PENULISAN & GAYA BAHASA
1. **DEEP ANALYSIS (WAJIB)**: Jangan cuma kasih rangkuman 1 paragraf pendek. Bedah informasinya, jelaskan prosesnya, dan berikan jawaban yang **panjang, jelas, dan komprehensif**. Kalau topiknya berat, jelaskan "kenapa" dan dampaknya secara mendetail.
2. **PROFESIONAL TAPI SANTAI**: Pertahankan gaya bahasamu (panggil "bro", asertif), tapi **JANGAN** terlalu banyak basa-basi gaul atau asik-asikan yang berlebihan (kurangi pemakaian kata "gila sih", "anjir", "bro" yang diulang-ulang). Tetap fokus pada bobot informasi.
3. **FORMATTING**: Gunakan paragraf yang rapi dan list poin-poin (markdown \`-\` atau \`*\`) agar penjelasan panjangmu mudah dibaca.
4. **PRIORITAS SUMBER**: Gunakan data dari "Riwayat Eksekusi" sebagai acuan utama. Tambahkan wawasan pribadimu untuk memperkaya penjelasan agar tidak terkesan kaku.
5. **CONTEXT AWARENESS**: Perhatikan "CHAT SESSION" sebelumnya agar jawabanmu nyambung dengan obrolan yang sedang berlangsung.

# TUGASMU
Sistem baru saja selesai menjalankan beberapa tugas (Task) di latar belakang untuk user.
Berikan JAWABAN AKHIR yang **berbobot, mendetail, dan panjang** berdasarkan "Riwayat Eksekusi" tersebut. Jawab seolah-olah kamu baru saja meneliti hal itu dan sekarang menjelaskannya secara lengkap ke temanmu.
`
    const userPrompt = `
Instruksi Awal User: "${userInput}"

Riwayat Eksekusi (Summary):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Berikan respons akhirmu (HANYA teks respons, tanpa JSON).
`
    const previousTurns = chatSession.length > 0 ? chatSession.slice(0, -1) : [];
    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: userPrompt }
    ]
    const response = await fetchAI(messages, signal)
    return { answer: response.content, reasoning: response.reasoning }
  } catch (error) {
    console.error('Error in getPlanConclusion:', error)
    return "Oke bro, instruksi lu udah gue kerjain semuanya ya!"
  }
}
