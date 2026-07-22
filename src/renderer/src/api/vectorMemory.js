import { pipeline, env } from '@huggingface/transformers';
import { getAllConfig, getAllMemory, db } from './db';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;

let extractor = null;
let isDownloading = false;

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (!extractor && !isDownloading) {
    isDownloading = true;
    try {
      extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
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
    const ext = await getExtractor();
    if (!ext) return null;
    const output = await ext(text, { pooling: 'mean', normalize: true, truncation: true, max_length: 512 });
    const result = Array.from(output.data);
    if (output.dispose) output.dispose();
    return result;
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

import { searchArchives, searchDocuments } from './oramaStore'

export const getRelevantMemory = async (userInput, memoryList) => {
  // Hanya Core memory (profile & preference) dipanggil langsung tanpa filter
  const coreMemories = memoryList
    .filter(m => m.type === 'profile' || m.type === 'preference')
    .map(({ vector, ...rest }) => rest);

  return coreMemories;
}

export const searchExtendedMemory = async (query) => {
  const allMemory = await getAllMemory()
  const extendedMemories = allMemory.filter(m => m.type === 'notes' || m.type === 'learn')
  
  if (extendedMemories.length === 0) return []

  const queryVector = await generateVector(query)
  if (!queryVector) return []

  const scored = await Promise.all(extendedMemories.map(async (mem) => {
    let currentVector = mem.vector
    
    // Re-generate jika dimensi tidak cocok
    if (!Array.isArray(currentVector) || currentVector.length !== queryVector.length) {
      currentVector = await generateVector(mem.memory)
      if (currentVector && mem.id) {
        db.memory.update(mem.id, { vector: currentVector }).catch(console.error)
      }
    }

    if (!currentVector) return { ...mem, score: 0 }
    return { ...mem, score: cosineSimilarity(queryVector, currentVector) }
  }))

  return scored
    .filter(m => m.score > 0.3)    // Threshold kemiripan
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)                    // Top 3
    .map(({ vector, ...rest }) => rest)
}

export const getUnifiedContext = async (userInput, memoryList) => {
  const memories = await getRelevantMemory(userInput, memoryList)

  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)

  return { memories, archives, documents }
}
