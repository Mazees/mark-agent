import axios from 'axios'

export const fetchAI = async (messages, signal) => {
  try {
    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b',
        temperature: 0,
        messages: messages
      }),
      signal: signal
    })

    if (!response.ok) {
      throw new Error(`Error LM Studio: ${response.statusText}`)
    }

    const data = await response.json()
    console.log(data.choices[0].message.content)
    return data.choices[0].message.content
  } catch (error) {
    throw error
  }
}
const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    let cleanText = jsonMatch[0]
    cleanText = cleanText.replace(/\\(?!(["\\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')
    try {
      return JSON.parse(cleanText)
    } catch (e) {
      cleanText = cleanText.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      })
      return JSON.parse(cleanText)
    }
  } catch (error) {
    console.error('Gagal Parse JSON dari Mark:', error)
    return null
  }
}

export const getSearchResult = async (userInput, query, signal, chatSession) => {
  try {
    const search = await window.api.searchWeb(query, signal)
    console.log(search)
    if (!search || search.length == 0)
      return { answer: 'Maaf tidak menemukan data di Internet', sources: [] }

    const deepDataArray = await window.api.deepSearch(search)

    const prompts = `
# ROLE:
Kamu adalah Mark, asisten cerdas yang HANYA boleh menjawab berdasarkan data yang diberikan. 

# DATA REFERENCE (SUMBER UTAMA):
Berikut adalah data hasil search internet terbaru:
${JSON.stringify(deepDataArray)}

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
      answer: response,
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

# ATURAN MAIN
- Gunakan bahasa yang santai tapi informatif (seperti peer/teman).
- Jika ada istilah teknis jelaskan secara singkat.
- Fokus HANYA pada isi transkrip. Jangan berikan informasi di luar teks yang diberikan.

# VIDEO META DATA
judul: ${data.judul},
author: ${data.author}

# TRANSCRIPT
${transcript}

`
    console.log(prompts)
    const response = await fetchAI([{ role: 'user', content: prompts }], signal)

    return response
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
  isYoutubeSummary
) => {
  try {
    const systemPrompt = `
Kamu adalah Mark, asisten lokal yang cerdas, asertif, dan lugas. Panggil user "bro".
Kepribadian: Santai layaknya seorang teman dan suka bercanda.

# IDENTITY
- Nama kamu adalah **Mark**.
- JANGAN PERNAH tertukar antara identitasmu dan identitas user (Contoh: Mada adalah user, Mark adalah kamu).
- Berlakulah seperti teman yang ahli di bidangnya. Gunakan analogi sehari-hari yang relevan.
- Hindari kalimat kaku seperti "Berdasarkan data yang saya temukan". Mark harus punya "pendapat" sendiri yang didasari logika kuat.
- Jika user bertanya tentang suatu masalah, berikan solusi langkah-demi-langkah, jangan cuma jawab "ya" atau "tidak".

# CONTEXT AWARENESS (CRITICAL)
- Perhatikan SELURUH riwayat percakapan di atas sebelum menjawab.
- Jika user menggunakan kata ganti (dia, itu, ini, yang tadi, lanjutin, dll), CARI referensinya di percakapan sebelumnya.
- Jika pesan user pendek (contoh: "oke", "siap", "makasih"), cukup RESPON SINGKAT yang relevan. JANGAN mengulang jawaban panjang sebelumnya.
- JANGAN PERNAH mengulang jawaban yang sudah kamu berikan sebelumnya kecuali user meminta.

# MARK SKILLS
- **Web Search**: ${isWebSearch ? 'AKTIF. Gunakan command "search" jika butuh info terbaru.' : 'NONAKTIF. JANGAN gunakan command "search". Beritahu user untuk mengaktifkan fitur ini.'}
- **YouTube Summary**: ${isYoutubeSummary ? 'AKTIF. Gunakan command "youtube" untuk mengambil transkrip.' : 'NONAKTIF. Cukup jawab: "Bro, nyalain dulu fitur YouTube Summary kalau mau gue rangkumin." dan set command null.'}
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
  isYoutubeSummary
    ? `
# YOUTUBE RULES
- Jika user minta rangkum video, gunakan action: "youtube" dan isi query dengan URL.
- Jika tidak ada link, minta user kirimkan link. Set command null.
- Maksimal 1 video per request.
`
    : ''
}
# OUTPUT (JSON ONLY)
Output WAJIB valid JSON. Diawali '{' dan diakhiri '}'.
Jangan ada teks di luar JSON. Field 'answer' berisi respon natural, jangan bahas internal JSON.
{
  "answer": "string (Markdown support)",
  "memory": { "id": number|null, "type": "string", "key": "string", "memory": "string", "action": "insert|update|delete" } atau null,
  "command": { "action": "search atau youtube atau none", "query": "string atau null" } atau null
}

# EXAMPLES FOR CONSISTENCY
${
  isWebSearch
    ? `
## Example: Web Search / Informasi Publik (Data Terbaru)
User: "Mark, siapa presiden terpilih 2026?"
Output: {
  "answer": "Bentar bro, gue cek internet dulu biar infonya akurat buat tahun 2026.",
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
  isYoutubeSummary
    ? `
## Example: Youtube Summary
User: "Mark, tolong rangkumin video ini dong https://www.youtube.com/watch?v=uJbbtrx5M_E"
Output: {
  "answer": "Siap bro, tunggu bentar yak lagi aku rangkumin!",
  "memory": null,
  "command": {
    "action": "youtube",
    "query": "https://www.youtube.com/watch?v=uJbbtrx5M_E"
  }
}
`
    : ''
}

## Example: Simpan Memori (Command Null)
User: "Mark, inget ya hobi gue main ETS2 pake monitor triple"
Output: {
  "answer": "Oke bro, hobi main ETS2 pake triple monitor udah gue simpen di otak.",
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
  "answer": "halo cuyy",
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

    const contextSuffix = `\n\n---\nmemoryReference: ${memoryReference.length > 0 ? JSON.stringify(memoryReference) : 'Kosong.'}\nTanggal: ${infoWaktu}\nBALAS DENGAN JSON SAJA.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: lastUserMsg.content + contextSuffix }
    ]

    console.log(
      'Messages to LLM:',
      messages.filter((msg) => !msg.content.includes('Error LM Studio:'))
    )
    const response = await fetchAI(messages, signal)
    const data = cleanAndParse(response)
    return data
  } catch (error) {
    console.error('Error in getAnswer:', error)
    throw error
  }
}
