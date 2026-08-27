import { create, insert, insertMultiple, search, remove, removeMultiple } from '@orama/orama'
import { generateVector, cosineSimilarity } from './vector-engine.js'

const VECTOR_SIZE = 384

let memoryIndex = null
let archiveIndex = null
let documentIndex = null
let turnPairIndex = null

/**
 * Inisialisasi 4 indeks pencarian Orama di server
 */
export async function initOramaIndices() {
  memoryIndex = await create({
    schema: {
      type: 'string',
      summary: 'string',
      memory: 'string',
      timestamp: 'number',
      dbId: 'string',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })

  archiveIndex = await create({
    schema: {
      summary: 'string',
      topic: 'string',
      timestamp: 'number',
      dbId: 'string',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })

  documentIndex = await create({
    schema: {
      docName: 'string',
      chunkIndex: 'number',
      content: 'string',
      timestamp: 'number',
      dbId: 'string',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })

  turnPairIndex = await create({
    schema: {
      pairId: 'string',
      sessionId: 'string',
      sessionTitle: 'string',
      userText: 'string',
      aiText: 'string',
      combinedText: 'string',
      timestamp: 'number',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })
}

/**
 * Insert atau update item di memoryIndex
 */
export async function insertMemoryIndex(item) {
  if (!memoryIndex) return
  await insert(memoryIndex, {
    type: String(item.type || 'profile'),
    summary: String(item.summary || ''),
    memory: String(item.memory || item.content || ''),
    timestamp: Number(item.timestamp) || Date.now(),
    dbId: String(item.id || ''),
    vector: item.vector
  })
}

/**
 * Search Memories di Orama
 */
export async function searchMemories(queryText, threshold = 0.3, limit = 5) {
  if (!memoryIndex || !queryText) return []
  const queryVector = await generateVector(queryText)
  if (!queryVector) return []

  try {
    const results = await search(memoryIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    return results.hits.map((h) => ({ ...h.document, score: h.score }))
  } catch (_) {
    return []
  }
}

/**
 * Insert turn pair ke turnPairIndex
 */
export async function insertTurnPairIndex(item) {
  if (!turnPairIndex) return
  await insert(turnPairIndex, {
    pairId: String(item.pairId || item.id || ''),
    sessionId: String(item.sessionId || '1'),
    sessionTitle: String(item.sessionTitle || 'Session'),
    userText: String(item.userText || ''),
    aiText: String(item.aiText || ''),
    combinedText: String(item.combinedText || `${item.userText} ${item.aiText}`),
    timestamp: Number(item.timestamp) || Date.now(),
    vector: item.vector
  })
}

/**
 * Search Turn Pairs di Orama
 */
export async function searchTurnPairs(queryText, threshold = 0.35, limit = 4) {
  if (!turnPairIndex || !queryText) return []
  const queryVector = await generateVector(queryText)
  if (!queryVector) return []

  try {
    const results = await search(turnPairIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    return results.hits.map((h) => ({ ...h.document, score: h.score }))
  } catch (_) {
    return []
  }
}

/**
 * Search Archives di Orama
 */
export async function searchArchives(queryText, threshold = 0.3, limit = 3) {
  if (!archiveIndex || !queryText) return []
  const queryVector = await generateVector(queryText)
  if (!queryVector) return []

  try {
    const results = await search(archiveIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    return results.hits.map((h) => ({ ...h.document, score: h.score }))
  } catch (_) {
    return []
  }
}

/**
 * Search Documents (RAG) di Orama
 */
export async function searchDocuments(queryText, threshold = 0.3, limit = 4) {
  if (!documentIndex || !queryText) return []
  const queryVector = await generateVector(queryText)
  if (!queryVector) return []

  try {
    const results = await search(documentIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    return results.hits.map((h) => ({ ...h.document, score: h.score }))
  } catch (_) {
    return []
  }
}

export { memoryIndex, archiveIndex, documentIndex, turnPairIndex, insertMultiple }
