import { pipeline, env } from '@huggingface/transformers';
import { getAllConfig } from './db';

env.allowLocalModels = false;

let extractor = null;
let isDownloading = false;

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (!extractor && !isDownloading) {
    isDownloading = true;
    try {
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'wasm',
        progress_callback: onProgress
      });
    } catch (e) {
      console.error("Failed to load transformer model", e);
    } finally {
      isDownloading = false;
    }
  }
  return extractor;
};

export const generateVector = async (text) => {
  try {
    const configs = await getAllConfig();
    const conf = configs[0] || {};
    const embedProvider = conf.embedProvider || 'lm-studio';

    if (embedProvider === 'transformers') {
      const ext = await getExtractor();
      if (!ext) return null;
      const output = await ext(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } else {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      try {
        const response = await fetch('http://localhost:1234/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: text,
            model: conf.lmStudioEmbedModel || "embeddinggemma-300m-qat"
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId)
        const result = await response.json();
        return result.data[0].embedding;
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    }
  } catch (error) {
    console.error("Gagal generate vector:", error);
    return null;
  }
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1)
export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}

import { db } from './db';

export const getRelevantMemory = async (userInput, memoryList) => {
  // 1. Ubah input user jadi koordinat (Vector)
  const output = await generateVector(userInput);
  if (!output) return []

  const userVector = Array.from(output)

  // 2. Bandingkan dengan setiap memori di list
  const scored = await Promise.all(memoryList.map(async (mem) => {
    let currentVector = mem.vector;

    // Jika belum ada vector atau dimensinya beda (karena pindah provider LM Studio <-> Transformers)
    if (!Array.isArray(currentVector) || currentVector.length === 0 || currentVector.length !== userVector.length) {
      console.log(`Dimensi vector tidak cocok untuk memory ID ${mem.id}. Re-generating...`);
      currentVector = await generateVector(mem.memory);
      
      // Update DB secara asinkron agar permanen
      if (currentVector && mem.id) {
         db.memory.update(mem.id, { vector: currentVector }).catch(console.error);
      }
    }

    if (!currentVector || currentVector.length !== userVector.length) {
      return { ...mem, score: 0 }
    }

    const score = cosineSimilarity(userVector, currentVector)
    return { ...mem, score }
  }))

  // 3. Filter & Sort (Threshold 0.3 biar kasus Sawit kebuang)
  return scored
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ vector, ...rest }) => rest)
}
