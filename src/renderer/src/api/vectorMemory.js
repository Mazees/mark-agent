import { pipeline, env } from '@huggingface/transformers';
import { getAllConfig } from './db';

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
    return Array.from(output.data);
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
import { searchArchives, searchDocuments } from './oramaStore'

export const getRelevantMemory = async (userInput, memoryList) => {
  // 1. Core memory (profile & preference) dipanggil langsung tanpa filter
  const coreMemories = memoryList
    .filter(m => m.type === 'profile' || m.type === 'preference')
    .map(({ vector, ...rest }) => rest);

  // 2. Jika ada memori notes, cari menggunakan Vector Search
  const notesMemories = memoryList.filter(m => m.type === 'notes');
  
  if (notesMemories.length === 0) {
    return coreMemories;
  }

  const output = await generateVector(userInput);
  if (!output) return coreMemories;
  
  const userVector = Array.from(output);

  const scoredNotes = await Promise.all(notesMemories.map(async (mem) => {
    let currentVector = mem.vector;

    if (!Array.isArray(currentVector) || currentVector.length === 0 || currentVector.length !== userVector.length) {
      console.log(`Dimensi vector tidak cocok untuk notes ID ${mem.id}. Re-generating...`);
      currentVector = await generateVector(mem.memory);
      
      if (currentVector && mem.id) {
         db.memory.update(mem.id, { vector: currentVector }).catch(console.error);
      }
    }

    if (!currentVector || currentVector.length !== userVector.length) {
      return { ...mem, score: 0 }
    }

    return { ...mem, score: cosineSimilarity(userVector, currentVector) }
  }));

  const relevantNotes = scoredNotes
    .filter(m => m.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ vector, ...rest }) => rest);

  return [...coreMemories, ...relevantNotes];
}

export const getUnifiedContext = async (userInput, memoryList) => {
  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories: [], archives: [], documents: [] }
  const userVector = Array.from(output)

  const memories = await getRelevantMemory(userInput, memoryList)
  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)

  return { memories, archives, documents }
}
