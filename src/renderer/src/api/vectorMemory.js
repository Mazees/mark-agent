import { pipeline, env } from '@xenova/transformers'

env.allowLocalModels = false
env.useBrowserCache = false

let embedder = null

export const initEmbedder = async () => {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
}

// GENERATE: Ngerubah teks jadi deretan angka (Vector)
export const generateVector = async (text) => {
  await initEmbedder()
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1)
export const cosineSimilarity = (vecA, vecB) => {
  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}

export const getRelevantMemory = async (userInput, memoryList) => {
  await initEmbedder() // Pastiin mesin standby

  // 1. Ubah input user jadi koordinat (Vector)
  const output = await embedder(userInput, { pooling: 'mean', normalize: true })
  const userVector = Array.from(output.data)

  // 2. Bandingkan dengan setiap memori di list
  const scored = memoryList.map((mem) => {
    // Pastikan data memori lo udah ada field 'vector'-nya (hasil generate pas simpan)
    const score = cosineSimilarity(userVector, mem.vector)
    return { ...mem, score }
  })

  // 3. Filter & Sort (Threshold 0.6 biar kasus Sawit kebuang)
  return scored
    .filter((m) => m.score > 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ vector, ...rest }) => rest)
}
