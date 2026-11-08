import { parseMemorySearch } from '@shared/memory-search.js'
import { API_BASE } from './web-bridge'

async function requestMemory(operation, body, signal) {
  const response = await fetch(`${API_BASE}/api/memory/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  const result = await response.json()
  if (!response.ok || !result.success)
    throw new Error(result.error || 'Pencarian memori tidak tersedia.')
  return result.data
}

export function getUnifiedContext(query, signal, lexicalQuery = query) {
  return requestMemory('context', { query, lexicalQuery }, signal)
}

export async function getRelevantMemory() {
  return (await getUnifiedContext('')).memories
}

export async function findSimilarMemory(query, type, signal) {
  const { hits } = await requestMemory(
    'search',
    {
      query,
      sources: ['memories'],
      types: [type],
      threshold: 0.82,
      limit: 1,
      semanticOnly: true
    },
    signal
  )
  return hits.memories[0]
}

export function findSimilarMemoryClusters(threshold) {
  return requestMemory('clusters', { threshold })
}

export async function executeMemorySearch(rawQuery, signal) {
  const { query, threshold, limit } = parseMemorySearch(rawQuery)
  const { hits, mode } = await requestMemory(
    'search',
    {
      query,
      threshold,
      limit,
      sources: ['memories', 'chatTurns'],
      types: ['notes', 'learn']
    },
    signal
  )
  const { memories, chatTurns } = hits
  const score = (hit) => (hit.score == null ? 'Kata kunci' : `Score:${hit.score.toFixed(2)}`)
  const sections = []
  if (memories.length) {
    sections.push(
      '[CATATAN & MEMORI PENGGUNA]\n' +
        memories
          .map((m) => `- [${m.type.toUpperCase()}] (ID:${m.id}, ${score(m)}) ${m.memory}`)
          .join('\n')
    )
  }
  if (chatTurns.length) {
    sections.push(
      '[RIWAYAT PERCAKAPAN ASLI (TURN PAIRS)]\n' +
        chatTurns
          .map(
            (t) =>
              `--- [RIWAYAT CHAT: "${t.sessionTitle || 'Session'}" | ${score(t)}] ---\n${t.combinedText}`
          )
          .join('\n\n')
    )
  }
  const title = `[MEMORY SEARCH RESULTS (Threshold: ${threshold}, Limit: ${limit})]`
  const modeNotice = mode === 'keyword' && query ? '\nPencarian terbatas pada kata kunci.' : ''
  return (
    title +
    modeNotice +
    '\n\n' +
    (sections.join('\n\n') ||
      `Tidak ditemukan memori atau percakapan yang relevan dengan "${query}".`)
  )
}
