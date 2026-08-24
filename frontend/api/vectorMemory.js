import { pipeline } from '@huggingface/transformers'
import { searchArchives, searchDocuments, searchMemoriesInOrama, searchTurnPairsInOrama } from './oramaStore'
import { getAllMemory } from './db'

let worker = null
let nextId = 1
const pendingPromises = new Map()
const progressListeners = new Set()

function getWorker() {
  if (!worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./embedding.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (event) => {
        const { id, type, success, vector, results, error, data } = event.data || {}

        if (type === 'progress') {
          progressListeners.forEach((cb) => {
            try {
              cb(data)
            } catch (_) {}
          })
          return
        }

        if (pendingPromises.has(id)) {
          const { resolve } = pendingPromises.get(id)
          pendingPromises.delete(id)
          if (success) {
            resolve(vector !== undefined ? vector : results)
          } else {
            console.warn('[EmbeddingWorker] Worker task error:', error)
            resolve(null)
          }
        }
      }

      worker.onerror = (err) => {
        console.error('[EmbeddingWorker] Worker uncaught error:', err)
      }
    } catch (e) {
      console.warn('[EmbeddingWorker] Failed to initialize worker, fallback to main thread:', e)
      worker = null
    }
  }
  return worker
}

// Fallback main-thread extractor jika Web Worker tidak tersedia
let directExtractor = null
let isDirectDownloading = false

async function getDirectExtractor(onProgress) {
  if (!directExtractor && !isDirectDownloading) {
    isDirectDownloading = true
    try {
      const device = typeof window !== 'undefined' && typeof caches !== 'undefined' ? 'wasm' : 'cpu'
      directExtractor = await pipeline(
        'feature-extraction',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        {
          device,
          progress_callback: onProgress
        }
      )
    } catch (e) {
      console.error('Failed to load transformer model directly', e)
    } finally {
      isDirectDownloading = false
    }
  }
  return directExtractor
}

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (typeof onProgress === 'function') {
    progressListeners.add(onProgress)
  }
  const w = getWorker()
  if (w) {
    return new Promise((resolve) => {
      const id = nextId++
      pendingPromises.set(id, {
        resolve: () => resolve(w),
        reject: () => resolve(w)
      })
      w.postMessage({ id, type: 'init' })
    })
  }
  return await getDirectExtractor(onProgress)
}

export const generateVector = async (text) => {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null
  }

  const w = getWorker()
  if (w) {
    return new Promise((resolve) => {
      const id = nextId++
      pendingPromises.set(id, {
        resolve,
        reject: () => resolve(null)
      })
      w.postMessage({ id, type: 'embed', text })
    })
  }

  // Fallback direct
  try {
    const ext = await getDirectExtractor()
    if (!ext) return null
    const output = await ext(text, {
      pooling: 'mean',
      normalize: true,
      truncation: true,
      max_length: 512
    })
    const result = Array.from(output.data)
    if (output.dispose) output.dispose()
    return result
  } catch (error) {
    console.error('Gagal generate vector directly:', error)
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
  // Hanya Core memory (profile & preference) dipanggil langsung tanpa filter
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

  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [], turnPairs: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)
  const turnPairs = await searchTurnPairsInOrama(userInput, userVector, 3, 0.3)

  return { memories, archives, documents, turnPairs }
}
