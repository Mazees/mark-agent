export const generateVector = async (text) => {
  try {
    const response = await fetch('http://localhost:1234/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        model: "embeddinggemma-300m-qat"
      })
    });
    
    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    console.error("Gagal generate vector via LM Studio:", error);
    return null;
  }
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1)
export const cosineSimilarity = (vecA, vecB) => {
  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}

export const getRelevantMemory = async (userInput, memoryList) => {

  // 1. Ubah input user jadi koordinat (Vector)
  const output = await await generateVector(userInput);
  const userVector = Array.from(output)

  // 2. Bandingkan dengan setiap memori di list
  const scored = memoryList.map((mem) => {
    // Pastikan data memori lo udah ada field 'vector'-nya (hasil generate pas simpan)
    const score = cosineSimilarity(userVector, mem.vector)
    return { ...mem, score }
  })

  // 3. Filter & Sort (Threshold 0.6 biar kasus Sawit kebuang)
  return scored
    .filter((m) => m.score > 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ vector, ...rest }) => rest)
}
