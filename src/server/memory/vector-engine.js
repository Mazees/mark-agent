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
  } catch {
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
  } catch {
    return null
  }
}
