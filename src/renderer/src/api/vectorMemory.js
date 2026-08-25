import { searchArchives, searchDocuments, searchMemoriesInOrama, searchTurnPairsInOrama } from './oramaStore'
import { getAllMemory } from './db'

export const getExtractor = async () => {
  return true
}

export const generateVector = async (text) => {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null
  }

  try {
    const res = await fetch('http://localhost:3000/api/vector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    const json = await res.json()
    return json.vector || null
  } catch (error) {
    console.error('Gagal generate vector via server API:', error)
    return null
  }
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1)
export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}

export const getRelevantMemory = async (userInput, memoryList) => {
  let list = memoryList
  if (!Array.isArray(list)) {
    try {
      list = await getAllMemory()
    } catch (e) {
      list = []
    }
  }
  if (!Array.isArray(list)) {
    list = []
  }
  const coreMemories = list
    .filter((m) => m && typeof m === 'object' && (m.type === 'profile' || m.type === 'preference'))
    .map(({ vector, ...rest }) => rest)

  return coreMemories
}

export const searchExtendedMemory = async (query, threshold = 0.5, limit = 5) => {
  const queryVector = await generateVector(query)
  if (!queryVector) return { memories: [], chatTurns: [] }

  const memories = await searchMemoriesInOrama(query, queryVector, limit, ['notes', 'learn'], threshold)
  const chatTurns = await searchTurnPairsInOrama(query, queryVector, limit, threshold)

  return { memories, chatTurns }
}

export const executeMemorySearch = async (rawQuery) => {
  const parts = (rawQuery || '').split('||')
  const searchKeyword = parts[0]?.trim() || ''
  const customThreshold = parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1].trim()) : 0.5
  const customLimit = parts[2] && !isNaN(parseInt(parts[2], 10)) ? parseInt(parts[2].trim(), 10) : 5

  const { memories = [], chatTurns = [] } = await searchExtendedMemory(searchKeyword, customThreshold, customLimit)

  const formattedMemories =
    memories.length > 0
      ? memories
          .map(
            (m) =>
              `- [${m.type.toUpperCase()}] (ID:${m.id}, Score:${(m.score || 0).toFixed(2)}) ${m.memory}`
          )
          .join('\n')
      : ''

  const formattedTurns =
    chatTurns.length > 0
      ? chatTurns
          .map(
            (t) =>
              `--- [RIWAYAT CHAT: "${t.sessionTitle || 'Session'}" | Score:${(t.score || 0).toFixed(2)}] ---\n${t.combinedText}`
          )
          .join('\n\n')
      : ''

  let sections = []
  if (formattedMemories) {
    sections.push(`[CATATAN & MEMORI PENGGUNA]\n${formattedMemories}`)
  }
  if (formattedTurns) {
    sections.push(`[RIWAYAT PERCAKAPAN ASLI (TURN PAIRS)]\n${formattedTurns}`)
  }

  if (sections.length > 0) {
    return `[MEMORY SEARCH RESULTS (Threshold: ${customThreshold}, Limit: ${customLimit})]\n\n${sections.join('\n\n')}`
  }
  return `[MEMORY SEARCH RESULTS (Threshold: ${customThreshold}, Limit: ${customLimit})]\nTidak ditemukan memori atau percakapan yang relevan dengan kata kunci "${searchKeyword}".`
}

export const getUnifiedContext = async (userInput, memoryList) => {
  const memories = await getRelevantMemory(userInput, memoryList)

  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [], turnPairs: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)
  const turnPairs = await searchTurnPairsInOrama(userInput, userVector, 3, 0.3)

  return { memories, archives, documents, turnPairs }
}
