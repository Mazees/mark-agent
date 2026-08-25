import path from 'path'
import os from 'os'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { pipeline, env } = require('@huggingface/transformers')

// Konfigurasi cache direktori lokal persisten
const CACHE_DIR = path.join(os.homedir(), '.cache', 'mark-transformers')
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

env.cacheDir = CACHE_DIR
env.allowLocalModels = true
env.allowRemoteModels = true

let extractor = null
let isInitializing = false
const initWaiters = []

/**
 * Inisialisasi pipeline feature-extraction MiniLM-L12-v2 secara lokal
 */
export async function getExtractor() {
  if (extractor) return extractor
  if (isInitializing) {
    return new Promise((resolve) => initWaiters.push(resolve))
  }

  isInitializing = true

  try {
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      {
        quantized: true
      }
    )
    isInitializing = false
    initWaiters.forEach((resolve) => resolve(extractor))
    initWaiters.length = 0
    return extractor
  } catch (err) {
    isInitializing = false
    initWaiters.forEach((resolve) => resolve(null))
    initWaiters.length = 0
    return null
  }
}

/**
 * Menghasilkan vektor 384 dimensi untuk suatu teks
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function generateVector(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null
  const clean = text.trim().slice(0, 1000)

  try {
    const ext = await getExtractor()
    if (!ext) return null

    const output = await ext(clean, { pooling: 'mean', normalize: true })
    return Array.from(output.data)
  } catch (_) {
    return null
  }
}

/**
 * Menghasilkan vektor batch untuk beberapa teks sekaligus
 * @param {Array<{id: any, text: string}>} items
 * @returns {Promise<Array<{id: any, vector: number[]|null}>>}
 */
export async function generateVectorBatch(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const results = []

  for (const item of items) {
    const vector = await generateVector(item.text)
    results.push({ id: item.id, vector })
  }

  return results
}

/**
 * Menghitung cosine similarity antara 2 vektor
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
