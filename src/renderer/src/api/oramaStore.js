import { create, insert, insertMultiple, search, remove, removeMultiple } from '@orama/orama'
import { generateVector } from './vectorMemory'

// Dimensi vektor sesuai model Transformers.js (all-MiniLM-L6-v2 = 384)
const VECTOR_SIZE = 384

let archiveIndex = null
let documentIndex = null
let memoryIndex = null
let turnPairIndex = null

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

// Dipanggil saat app start: load semua data dari SQLite database ke Orama
export async function hydrateFromDb(onProgress) {
  const { db } = await import('./db')

  // 1. CHAT TURNS HYDRATION & SMART MIGRATION
  let validTurnsCount = 0
  try {
    const turnCount = await db.chatTurns.count()
    const sessionCount = await db.sessions.count()

    if (turnCount === 0 && sessionCount > 0) {
      console.log('[Orama] Kondisi 1: chatTurns kosong & sessions ada. Memulai smart migration...')
      const { migrateOldSessionsToTurns } = await import('./turnPairMigrator')
      validTurnsCount = await migrateOldSessionsToTurns(onProgress)
    } else if (turnCount > 0) {
      const turns = await db.chatTurns.toArray()
      const validTurns = turns
        .filter((t) => t.vector && t.vector.length === VECTOR_SIZE)
        .map((t) => {
          const rawTs = t.timestamp
          const numericTs =
            typeof rawTs === 'number' && !isNaN(rawTs)
              ? rawTs
              : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
                ? Date.parse(rawTs)
                : Number(rawTs) || Date.now()
          return {
            pairId: String(t.pairId || t.id || ''),
            sessionId: String(t.sessionId || t.session_id || '1'),
            sessionTitle: String(t.sessionTitle || t.session_title || 'Session'),
            userText: String(t.userText || t.user_text || ''),
            aiText: String(t.aiText || t.ai_text || ''),
            combinedText: String(t.combinedText || t.combined_text || ''),
            timestamp: numericTs,
            vector: t.vector
          }
        })
      if (validTurns.length > 0) {
        await insertMultiple(turnPairIndex, validTurns)
        validTurnsCount = validTurns.length
      }
      console.log(`[Orama] Kondisi 2: Hydrated ${validTurnsCount} turn pairs from database`)
    } else {
      console.log('[Orama] Kondisi 3: Fresh install, no chat turns to migrate')
    }
  } catch (err) {
    console.error('[Orama] Error hydrating turn pairs:', err)
  }

  const archives = await db.chatArchive.toArray()
  const validArchives = []
  const needsMigration = localStorage.getItem('migrated_vectors_v1') !== 'true'

  for (let a of archives) {
    if (needsMigration || !a.vector || a.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for archive ID ${a.id}`)
      a.vector = await generateVector(a.summary)
      if (a.vector && a.vector.length === VECTOR_SIZE) {
        db.chatArchive.update(a.id, { vector: a.vector }).catch(console.error)
      }
    }
    if (a.vector && a.vector.length === VECTOR_SIZE) {
      validArchives.push({
        summary: String(a.summary || ''),
        topic: String(a.topic || 'General'),
        timestamp: Number(a.timestamp) || Date.now(),
        dbId: String(a.id || ''),
        vector: a.vector
      })
    }
  }

  if (validArchives.length > 0) {
    await insertMultiple(archiveIndex, validArchives)
  }

  const docs = await db.documents.toArray()
  const validDocs = []
  for (let d of docs) {
    if (needsMigration || !d.vector || d.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for doc ID ${d.id}`)
      d.vector = await generateVector(d.content)
      if (d.vector && d.vector.length === VECTOR_SIZE) {
        db.documents.update(d.id, { vector: d.vector }).catch(console.error)
      }
    }
    if (d.vector && d.vector.length === VECTOR_SIZE) {
      validDocs.push({
        docName: String(d.docName || d.doc_name || ''),
        chunkIndex: Number(d.chunkIndex ?? d.chunk_index ?? 0),
        content: String(d.content || ''),
        timestamp: Number(d.timestamp) || Date.now(),
        dbId: String(d.id || ''),
        vector: d.vector
      })
    }
  }

  if (validDocs.length > 0) {
    await insertMultiple(documentIndex, validDocs)
  }

  const memories = await db.memory.toArray()
  const validMemories = []
  for (let m of memories) {
    if (needsMigration || !m.vector || m.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for memory ID ${m.id}`)
      m.vector = await generateVector(m.memory)
      if (m.vector && m.vector.length === VECTOR_SIZE) {
        db.memory.update(m.id, { vector: m.vector }).catch(console.error)
      }
    }
    if (m.vector && m.vector.length === VECTOR_SIZE) {
      validMemories.push({
        type: String(m.type || 'notes'),
        summary: String(m.summary || ''),
        memory: String(m.memory || ''),
        timestamp: Number(m.created_at || m.timestamp) || Date.now(),
        dbId: String(m.id || ''),
        vector: m.vector
      })
    }
  }

  if (validMemories.length > 0) {
    await insertMultiple(memoryIndex, validMemories)
  }

  if (needsMigration) {
    localStorage.setItem('migrated_vectors_v1', 'true')
    console.log('[Orama] Successfully migrated all old vectors to new model!')
  }

  console.log(`[Orama] Hydrated: ${validTurnsCount} turn pairs, ${validArchives.length} archives, ${validDocs.length} doc chunks, ${validMemories.length} memories`)
}

// Vector search di arsip obrolan
export async function searchArchives(queryVector, limit = 3) {
  if (!archiveIndex) return []
  try {
    const results = await search(archiveIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    })
    return results.hits.map(hit => hit.document)
  } catch (err) {
    console.error('[Orama] Error in searchArchives:', err)
    return []
  }
}

// Vector search di dokumen RAG
export async function searchDocuments(queryText, queryVector, limit = 5) {
  if (!documentIndex) return []
  try {
    const results = await search(documentIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    })
    return results.hits.map(hit => hit.document)
  } catch (error) {
    console.error('[Orama] Error in searchDocuments:', error)
    return []
  }
}

// Insert baru (dipanggil setelah penyimpanan arsip)
export async function insertArchiveToOrama(data) {
  if (!archiveIndex) return
  await insert(archiveIndex, {
    summary: String(data.summary || ''),
    topic: String(data.topic || 'General'),
    timestamp: Number(data.timestamp) || Date.now(),
    dbId: String(data.dbId || data.id || ''),
    vector: data.vector
  })
}

export async function insertDocumentChunksToOrama(chunks) {
  if (!documentIndex || !Array.isArray(chunks)) return
  const validChunks = chunks.map((c) => ({
    docName: String(c.docName || c.doc_name || ''),
    chunkIndex: Number(c.chunkIndex ?? c.chunk_index ?? 0),
    content: String(c.content || ''),
    timestamp: Number(c.timestamp) || Date.now(),
    dbId: String(c.dbId || c.id || ''),
    vector: c.vector
  }))
  await insertMultiple(documentIndex, validChunks)
}

export async function deleteArchiveFromOrama(dbId) {
  if (!archiveIndex || !dbId) return
  try {
    const res = await search(archiveIndex, { where: { dbId: String(dbId) } })
    if (res.hits.length > 0) {
      for (let h of res.hits) {
        await remove(archiveIndex, h.id)
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteArchiveFromOrama:', err)
  }
}

export async function deleteDocumentFromOrama(docName) {
  if (!documentIndex) return
  const res = await search(documentIndex, { term: docName, properties: ['docName'] })
  const ids = res.hits.map(h => h.id)
  await removeMultiple(documentIndex, ids)
}

// ======================== TURN PAIR ORAMA INDEX ========================

export async function insertTurnPairToOrama(data) {
  if (!turnPairIndex || !data.vector || data.vector.length !== VECTOR_SIZE) return
  try {
    const rawTs = data.timestamp
    const numericTs =
      typeof rawTs === 'number' && !isNaN(rawTs)
        ? rawTs
        : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
          ? Date.parse(rawTs)
          : Number(rawTs) || Date.now()

    await insert(turnPairIndex, {
      pairId: String(data.pairId || data.id || ''),
      sessionId: String(data.sessionId || data.session_id || '1'),
      sessionTitle: String(data.sessionTitle || data.session_title || 'Session'),
      userText: String(data.userText || data.user_text || ''),
      aiText: String(data.aiText || data.ai_text || ''),
      combinedText: String(data.combinedText || data.combined_text || ''),
      timestamp: numericTs,
      vector: data.vector
    })
  } catch (err) {
    console.error('[Orama] Error insertTurnPairToOrama:', err)
  }
}

export async function insertBatchTurnPairsToOrama(turns) {
  if (!turnPairIndex || !Array.isArray(turns) || turns.length === 0) return
  try {
    const valid = turns
      .filter((t) => t.vector && t.vector.length === VECTOR_SIZE)
      .map((t) => {
        const rawTs = t.timestamp
        const numericTs =
          typeof rawTs === 'number' && !isNaN(rawTs)
            ? rawTs
            : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
              ? Date.parse(rawTs)
              : Number(rawTs) || Date.now()

        return {
          pairId: String(t.pairId || t.id || ''),
          sessionId: String(t.sessionId || t.session_id || '1'),
          sessionTitle: String(t.sessionTitle || t.session_title || 'Session'),
          userText: String(t.userText || t.user_text || ''),
          aiText: String(t.aiText || t.ai_text || ''),
          combinedText: String(t.combinedText || t.combined_text || ''),
          timestamp: numericTs,
          vector: t.vector
        }
      })

    if (valid.length > 0) {
      await insertMultiple(turnPairIndex, valid)
    }
  } catch (err) {
    console.error('[Orama] Error insertBatchTurnPairsToOrama:', err)
  }
}

export async function searchTurnPairsInOrama(queryText, queryVector, limit = 5, threshold = 0.5) {
  if (!turnPairIndex || !queryVector) return []
  try {
    const results = await search(turnPairIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    return results.hits.map((hit) => ({
      ...hit.document,
      score: hit.score
    }))
  } catch (err) {
    console.error('[Orama] Error in searchTurnPairsInOrama:', err)
    return []
  }
}

export async function deleteTurnPairsBySessionFromOrama(sessionId) {
  if (!turnPairIndex || !sessionId) return
  try {
    const results = await search(turnPairIndex, {
      where: { sessionId: String(sessionId) }
    })
    if (results.hits.length > 0) {
      const ids = results.hits.map((h) => h.id)
      await removeMultiple(turnPairIndex, ids)
    }
  } catch (err) {
    console.error('[Orama] Error deleteTurnPairsBySessionFromOrama:', err)
  }
}

// ======================== MEMORY ORAMA INDEX ========================

export async function searchMemoriesInOrama(queryText, queryVector, limit = 5, filterTypes = null, threshold = 0.5) {
  if (!memoryIndex || !queryVector) return []
  try {
    const results = await search(memoryIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit: limit * 4
    })
    let hits = results.hits.map(hit => ({ ...hit.document, id: hit.document.dbId, score: hit.score }))
    if (filterTypes) {
      const typesArr = Array.isArray(filterTypes) ? filterTypes : [filterTypes]
      hits = hits.filter(h => typesArr.includes(h.type))
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, limit)
  } catch (err) {
    console.error('[Orama] Error in searchMemoriesInOrama:', err)
    return []
  }
}

export async function insertMemoryToOrama(data) {
  if (!memoryIndex || !data.vector || data.vector.length !== VECTOR_SIZE) return
  try {
    await insert(memoryIndex, {
      type: String(data.type || 'notes'),
      summary: String(data.summary || ''),
      memory: String(data.memory || ''),
      timestamp: Number(data.created_at || data.timestamp) || Date.now(),
      dbId: String(data.id || data.dbId || ''),
      vector: data.vector
    })
  } catch (err) {
    console.error('[Orama] Error insertMemoryToOrama:', err)
  }
}

export async function updateMemoryInOrama(dbId, data) {
  if (!memoryIndex) return
  await deleteMemoryFromOrama(dbId)
  await insertMemoryToOrama({ ...data, id: String(dbId), dbId: String(dbId) })
}

export async function deleteMemoryFromOrama(dbId) {
  if (!memoryIndex || !dbId) return
  try {
    const res = await search(memoryIndex, { where: { dbId: String(dbId) } })
    if (res.hits.length > 0) {
      for (let h of res.hits) {
        await remove(memoryIndex, h.id)
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteMemoryFromOrama:', err)
  }
}

export async function findSimilarMemoryClusters(threshold = 0.60) {
  if (!memoryIndex) {
    console.warn('[Orama Groomer] memoryIndex belum siap!')
    return []
  }
  try {
    console.log('[Orama Groomer] Memulai scanning cluster memori di Orama dengan threshold:', threshold)
    const results = await search(memoryIndex, {
      term: '',
      limit: 1000
    })
    let memories = results.hits
      .map(hit => ({
        ...hit.document,
        id: hit.document.dbId
      }))
      .filter(m => m.type === 'profile' || m.type === 'preference')

    const visited = new Set()
    const clusters = []
    let groupCount = 1

    for (const mem of memories) {
      if (visited.has(mem.id)) continue
      if (!mem.vector || !Array.isArray(mem.vector)) {
        visited.add(mem.id)
        continue
      }

      const simResults = await search(memoryIndex, {
        term: mem.memory,
        mode: 'hybrid',
        vector: { value: mem.vector, property: 'vector' },
        similarity: threshold,
        limit: 20
      })

      const similarHits = simResults.hits
        .map(hit => ({
          ...hit.document,
          id: hit.document.dbId,
          score: hit.score
        }))
        .filter(
          h =>
            (h.type === 'profile' || h.type === 'preference') &&
            h.score >= threshold &&
            !visited.has(h.id)
        )

      if (similarHits.length >= 2) {
        similarHits.forEach(h => visited.add(h.id))
        clusters.push({
          group: groupCount++,
          items: similarHits.map(h => ({
            id: h.id,
            type: h.type,
            memory: h.memory,
            timestamp: h.timestamp
          }))
        })
      } else {
        visited.add(mem.id)
      }
    }

    console.log(`[Orama Groomer] Ditemukan ${clusters.length} cluster dari total ${memories.length} memori profile/preference.`)
    return clusters
  } catch (err) {
    console.error('[Orama] Error in findSimilarMemoryClusters:', err)
    return []
  }
}

// On-the-fly Orama Hybrid Vector Search for read-document
export async function searchDocumentWithOrama(rawText, searchQuery, limit = 5) {
  try {
    if (!rawText || !searchQuery) return []

    // 1. Chunk text (500 chars with 50 overlap)
    const chunks = []
    let start = 0
    const chunkSize = 500
    const overlap = 50
    while (start < rawText.length) {
      const end = Math.min(start + chunkSize, rawText.length)
      const chunkStr = rawText.slice(start, end).trim()
      if (chunkStr) chunks.push(chunkStr)
      start += chunkSize - overlap
    }

    if (chunks.length === 0) return []

    // 2. Pre-filter candidate chunks to avoid CPU freeze (Max 20 chunks)
    const terms = searchQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
    let candidateChunks = chunks
    if (chunks.length > 20) {
      if (terms.length > 0) {
        const scored = chunks.map((c) => {
          const lower = c.toLowerCase()
          let score = 0
          for (const term of terms) {
            if (lower.includes(term)) score += 1
          }
          return { chunk: c, score }
        })
        scored.sort((a, b) => b.score - a.score)
        candidateChunks = scored.slice(0, 20).map((s) => s.chunk)
      } else {
        candidateChunks = chunks.slice(0, 20)
      }
    }

    // 3. Generate query vector
    const queryVector = await generateVector(searchQuery)
    if (!queryVector || queryVector.length !== VECTOR_SIZE) {
      return candidateChunks.slice(0, limit)
    }

    // 4. Create ephemeral in-memory Orama index
    const tempIndex = await create({
      schema: {
        content: 'string',
        vector: `vector[${VECTOR_SIZE}]`
      }
    })

    // 5. Generate embeddings for candidate chunks
    const chunkVectors = await Promise.all(
      candidateChunks.map(async (c) => {
        const v = await generateVector(c)
        return { content: c, vector: v }
      })
    )

    const validDocs = chunkVectors.filter((d) => d.vector && d.vector.length === VECTOR_SIZE)
    if (validDocs.length === 0) return candidateChunks.slice(0, limit)

    await insertMultiple(tempIndex, validDocs)

    // 6. Execute Hybrid Search
    const searchRes = await search(tempIndex, {
      term: searchQuery,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    })

    if (searchRes.hits && searchRes.hits.length > 0) {
      return searchRes.hits.map((h) => h.document.content)
    }

    return candidateChunks.slice(0, limit)
  } catch (err) {
    console.error('[Orama] Ephemeral searchDocumentWithOrama error:', err)
    return []
  }
}
