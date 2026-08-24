import { pipeline } from '@huggingface/transformers'

let extractor = null
let isInitializing = false

export async function getExtractor() {
  if (!extractor && !isInitializing) {
    isInitializing = true
    try {
      extractor = await pipeline(
        'feature-extraction',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
      )
    } finally {
      isInitializing = false
    }
  }
  return extractor
}

export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null
  }

  try {
    const ext = await getExtractor()
    if (!ext) return null

    const output = await ext(text, {
      pooling: 'mean',
      normalize: true,
      truncation: true,
      max_length: 512
    })

    const vector = Array.from(output.data)
    if (output.dispose) output.dispose()
    return vector
  } catch (error) {
    console.error('[VectorService] Error generating embedding:', error.message)
    return null
  }
}

export async function generateEmbeddingBatch(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return []
  }

  try {
    const ext = await getExtractor()
    if (!ext) return []

    const results = []
    for (const item of items) {
      const text = item.text || item.content || ''
      if (!text.trim()) {
        results.push({ id: item.id, vector: null })
        continue
      }

      const output = await ext(text, {
        pooling: 'mean',
        normalize: true,
        truncation: true,
        max_length: 512
      })

      const vector = Array.from(output.data)
      if (output.dispose) output.dispose()
      results.push({ id: item.id, vector })
    }

    return results
  } catch (error) {
    console.error('[VectorService] Error generating batch embeddings:', error.message)
    return []
  }
}
