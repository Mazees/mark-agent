import { fetchAI, cleanAndParse } from '../services/ai-bridge.js'
import { wsHub } from '../ws-hub.js'
import { searchMemories, searchTurnPairs, insertTurnPairIndex } from '../memory/orama-store.js'
import { dbStore } from '../memory/db-store.js'
import { generateVector } from '../memory/vector-engine.js'
import {
  readDesktop,
  executeClick,
  executeType,
  executeKey,
  executeScroll,
  openApp,
  listWindows,
  focusWindow
} from '../tools/pc-agent.js'
import { synthesizeTTS, searchYoutube, getTranscript } from '../tools/media-tools.js'

function getCurrentTimeInfo() {
  const now = new Date()
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
  return now.toLocaleDateString('id-ID', options)
}

/**
 * Eksekusi tool native secara langsung di server
 */
async function executeTool(toolName, query) {
  wsHub.emitToolStatus(toolName, 'running', { query })

  try {
    switch (toolName) {
      case 'os-read': {
        const res = await readDesktop()
        return typeof res === 'string' ? res : JSON.stringify(res)
      }
      case 'os-click': {
        const [x, y] = (query || '').split('||').map(Number)
        return await executeClick(x, y)
      }
      case 'os-type': {
        const [text] = (query || '').split('||')
        return await executeType(text)
      }
      case 'os-key': {
        return await executeKey(query)
      }
      case 'os-scroll': {
        const [dir, amt] = (query || '').split('||')
        return await executeScroll(dir || 'down', Number(amt) || 3)
      }
      case 'os-open': {
        return await executeApp(query)
      }
      case 'os-list-windows': {
        const res = await listWindows()
        return JSON.stringify(res)
      }
      case 'os-focus-window': {
        return await focusWindow(query)
      }
      case 'search-youtube': {
        const res = await searchYoutube(query)
        return JSON.stringify(res)
      }
      case 'youtube-transcript': {
        return await getTranscript(query)
      }
      case 'tts-speak': {
        const { audioBase64 } = await synthesizeTTS(query)
        wsHub.broadcast('audio:play', { audioBase64 })
        return 'Suara berhasil disintesis dan diputar ke antarmuka.'
      }
      default:
        return `Tool '${toolName}' belum terdaftar atau tidak dikenal.`
    }
  } catch (err) {
    return `[ERROR] ${err.message}`
  }
}

/**
 * ReAct Agentic Loop Planner
 */
export async function runPlanning(userInput, options = {}) {
  const { sessionId = '1', config = {} } = options

  wsHub.broadcast('agent:start', { userInput, sessionId })

  // 1. Ambil memori relevan dari Orama & DB
  const relevantMemories = await searchMemories(userInput, 0.35, 4)
  const relevantTurns = await searchTurnPairs(userInput, 0.35, 3)

  let memoryContext = ''
  if (relevantMemories.length > 0) {
    memoryContext += '\n# MEMORI PENGGUNA TERKAIT:\n'
    relevantMemories.forEach((m) => {
      memoryContext += `- [${m.type}] ${m.summary || m.memory}\n`
    })
  }

  if (relevantTurns.length > 0) {
    memoryContext += '\n# RIWAYAT PERCAKAPAN SEBELUMNYA:\n'
    relevantTurns.forEach((t) => {
      memoryContext += `Pengguna: "${t.userText}" -> Mark: "${t.aiText.slice(0, 150)}"\n`
    })
  }

  // 2. Susun System Prompt
  const timeInfo = getCurrentTimeInfo()
  const systemPrompt = `Kamu adalah Mark (Metacognitive Artificial Relational Knowledge), sebuah AI Operating System Companion yang cerdas, santai, hidup, dan responsif.
Waktu saat ini: ${timeInfo}
${memoryContext}

# ATURAN OUTPUT (STRICT JSON FORMAT):
Kamu HARUS SELALU merespons dalam format JSON murni:
{
  "thought": "Pemikiran internalmu mengenai situasi dan langkah selanjutnya",
  "action": { "tool": "nama-tool", "query": "parameter" } ATAU null jika sudah siap menjawab,
  "answer": "Jawaban akhirmu kepada pengguna jika action adalah null"
}

# DAFTAR TOOL TERSEDIA:
- os-read: Membaca elemen UI layar Windows saat ini (query: "")
- os-click: Klik koordinat layar (query: "X||Y")
- os-type: Mengetik teks (query: "teks yang diketik")
- os-key: Menekan shortcut keyboard (query: "ctrl+c", "alt+tab", "enter")
- os-scroll: Scroll mouse (query: "down||3" atau "up||3")
- os-open: Membuka aplikasi di Windows (query: "notepad", "calc", "msedge")
- os-list-windows: Melihat daftar jendela yang sedang terbuka (query: "")
- os-focus-window: Memfokuskan jendela (query: "judul window")
- search-youtube: Mencari video YouTube (query: "kata kunci")
- youtube-transcript: Mengambil transkrip video YouTube (query: "url")
- tts-speak: Mengucapkan teks lewat suara Edge-TTS (query: "teks")
`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ]

  let maxTurns = 8
  let currentTurn = 0
  let finalAnswer = ''

  while (currentTurn < maxTurns) {
    currentTurn++

    const aiRes = await fetchAI(messages, config, false)
    const rawContent = aiRes.content || ''

    const parsed = cleanAndParse(rawContent)
    if (!parsed) {
      finalAnswer = rawContent
      break
    }

    const { thought, action, answer } = parsed

    if (thought) {
      wsHub.broadcast('agent:thought', { thought, turn: currentTurn })
    }

    // Jika AI memutuskan untuk mengambil aksi / tool
    if (action && action.tool) {
      const toolName = action.tool
      const query = action.query || ''

      wsHub.broadcast('tool:call', { tool: toolName, query, turn: currentTurn })
      const observation = await executeTool(toolName, query)
      wsHub.broadcast('tool:result', { tool: toolName, observation, turn: currentTurn })

      messages.push({
        role: 'assistant',
        content: JSON.stringify({ thought, action })
      })
      messages.push({
        role: 'user',
        content: `[OBSERVATION dari ${toolName}]: ${observation}`
      })
    } else {
      // Selesai / Menghasilkan jawaban akhir
      finalAnswer = answer || thought || rawContent
      break
    }
  }

  // 3. Simpan percakapan ke turn pairs DB & Orama index
  if (finalAnswer) {
    const vector = await generateVector(`${userInput} ${finalAnswer}`)
    const record = {
      sessionId,
      userText: userInput,
      aiText: finalAnswer,
      combinedText: `${userInput} ${finalAnswer}`,
      timestamp: Date.now(),
      vector
    }

    dbStore.chatTurns.insert(record)
    if (vector) {
      await insertTurnPairIndex(record)
    }
  }

  wsHub.broadcast('agent:done', { answer: finalAnswer, sessionId })
  return { success: true, answer: finalAnswer }
}
