import Dexie from 'dexie'

export const db = new Dexie('mark-db')

db.version(1).stores({
  // Index gabungan hanya [type+key] agar data lain (summary, confidence) bisa diubah
  memory: '++id, [type+key], type, key, summary, memoryfull, confidence',
  sessions: '++id, title, lastUpdated',
  history: '++id, sessionId, role, content, timestamp'
})

// --- CREATE ---
export async function insertData(data) {
  try {
    await db.memory.add({
      type: data.type,
      key: data.key,
      summary: data.summary,
      memoryfull: data.memoryfull,
      confidence: data.confidence
    })
  } catch (error) {
    console.error('Error Save Data:', error)
  }
}

// --- UPDATE ---
export async function updateData(data) {
  try {
    const cleanType = data.type.toLowerCase().trim()
    const cleanKey = data.key.toLowerCase().trim()

    // 1. Cek dulu apakah datanya memang ada
    const existing = await db.memory.where('[type+key]').equals([cleanType, cleanKey]).first()

    if (existing) {
      // 2. JIKA ADA: Update pakai ID agar tidak duplikat
      await db.memory.update(existing.id, {
        summary: data.summary,
        memoryfull: data.memoryfull || data.memoryfull,
        confidence: data.confidence
      })
      console.log(`✅ Memory [${cleanType}:${cleanKey}] updated.`)
    } else {
      // 3. JIKA BELUM ADA: Otomatis insert (Fallback)
      // Ini solusi buat kasus "user belum punya nama tapi AI minta update"
      await db.memory.add({
        type: cleanType,
        key: cleanKey,
        summary: data.summary,
        memoryfull: data.memoryfull || data.memoryfull,
        confidence: data.confidence
      })
      console.log(`⚠️ [${cleanType}:${cleanKey}] not found. Created new record instead.`)
    }
  } catch (error) {
    console.error('Error in updateData logic:', error)
  }
}

// --- DELETE ---
export async function deleteData(data) {
  try {
    // Menghapus spesifik berdasarkan kombinasi type dan key
    const deletedCount = await db.memory.where('[type+key]').equals([data.type, data.key]).delete()

    console.log(`Berhasil menghapus ${deletedCount} memori.`)
  } catch (error) {
    console.error('Error Delete Data:', error)
  }
}
// --- GET MEMORY ---
export async function getSumMemory() {
  const memories = await db.memory.toArray()
  const summaryMemory = memories.map((item) => ({
    id: item.id,
    type: item.type,
    key: item.key,
    summary: item.summary,
    confidence: item.confidence
  }))
  return summaryMemory
}
// --- GET MEMORY SPECIFIC BY ID FOR ANSWER ---
export async function getSpecificMemory(listId = []) {
  const results = await db.memory.where('id').anyOf(listId).toArray()
  const summaryMemory = results.map((item) => ({
    type: item.type,
    key: item.key,
    memoryfull: item.memoryfull
  }))
  return summaryMemory
}
