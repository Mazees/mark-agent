import { fetchAI, cleanAndParse } from './core'

export const getYoutubeSummary = async (url, data, signal) => {
  try {
    const transcript = await window.api.getYoutubeTranscript(url)
    if (!transcript) return 'Gagal mengambil transkrip video.'

    const MAX_CHARS = 4000
    
    // Jika transkrip pendek, langsung proses tanpa chunking
    if (transcript.length <= MAX_CHARS) {
      const prompts = `
# ROLE
Kamu adalah Mark, asisten AI yang ahli dalam menganalisis konten video. Tugasmu adalah memberikan ringkasan yang akurat, padat, dan mudah dipahami dari transkrip video YouTube yang diberikan. Langsung berikan hasil ringkasannya tanpa basa-basi!

# FORMAT OUTPUT (WAJIB)
1. **Ringkasan Singkat**: 1-2 kalimat tentang inti video.
2. **Poin-Poin Penting**: Daftar 3-5 poin utama yang dibahas (ceritakan dengan mengalir dan informatif).
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
      console.log('--- PROMPT YOUTUBE SHORT ---');
      console.log(prompts);
      
      const response = await fetchAI([{ role: 'user', content: prompts }], signal, true)
      return response.content
    }

    // --- SISTEM CHUNKING UNTUK VIDEO PANJANG ---
    const chunks = []
    let currentChunk = ''
    const lines = transcript.split('\\n')
    
    for (let line of lines) {
      // Jika ada satu baris yang sangat panjang melebihi batas (misal tidak ada newline)
      while (line.length > MAX_CHARS) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk)
          currentChunk = ''
        }
        chunks.push(line.substring(0, MAX_CHARS))
        line = line.substring(MAX_CHARS)
      }

      if (currentChunk.length + line.length > MAX_CHARS) {
        if (currentChunk.length > 0) chunks.push(currentChunk)
        currentChunk = line + '\\n'
      } else {
        currentChunk += line + '\\n'
      }
    }
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk)
    }

    let finalSummary = ''
    // Mulai proses tiap chunk
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw new Error('AbortError')

      const chunkPrompt = `
# ROLE
Kamu adalah Mark, asisten AI yang ahli merangkum konten video secara naratif dan mengalir layaknya sebuah artikel atau cerita. Ini adalah instruksi langsung, BUKAN percakapan. DILARANG meminta input tambahan. LANGSUNG berikan ringkasan dari teks transkrip di bawah ini!

Ini adalah bagian ${i + 1} dari ${chunks.length} dari transkrip video YouTube yang panjang.

# FORMAT OUTPUT (WAJIB)
- Berikan ringkasan isi video secara kreatif, bebas, dan asik (boleh menggunakan paragraf naratif atau poin-poin penting yang mengalir).
- DILARANG KERAS menyertakan atau menggunakan [timestamp] dalam bentuk apapun! Cukup ceritakan saja isi informasinya.
- Gunakan bahasa Indonesia yang santai tapi tetap padat dan informatif.

# VIDEO META DATA
judul: ${data.judul || 'Tidak diketahui'},
author: ${data.author || 'Tidak diketahui'}

# TRANSCRIPT BAGIAN ${i + 1}
${chunks[i]}
`
      console.log(`--- PROMPT YOUTUBE CHUNK ${i + 1}/${chunks.length} ---`);
      console.log(chunkPrompt);

      const response = await fetchAI([{ role: 'user', content: chunkPrompt }], signal, true)
      finalSummary += `${response.content}\n\n`

      // Cooldown 12 detik jika bukan chunk terakhir (Menghindari TPM limit Groq)
      if (i < chunks.length - 1) {
        // Delay 12 detik untuk bypass Groq TPM limit (karena 1 menit = 60 detik, 12 detik = 5 request/menit, sangat aman untuk limit 6000 TPM)
        await new Promise(resolve => setTimeout(resolve, 12000))
      }
    }

    return finalSummary.trim()
  } catch (error) {
    console.error('Error in youtubeSummary:', error)
    throw error
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
${JSON.stringify(
  musicList.map((m) => ({ id: m.id, title: m.title, artist: m.artist, duration: m.duration })),
  null,
  2
)}
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        selectedId: { type: 'string' }
      },
      required: ['selectedId'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    return data
  } catch (error) {
    console.error('Error in getBestMusicMatch:', error)
    return { selectedId: musicList[0]?.id }
  }
}
