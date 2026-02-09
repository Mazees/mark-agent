import Dexie from 'dexie'
import { generateVector } from './vectorMemory'

export const db = new Dexie('mark-db')

db.version(1).stores({
  // Index gabungan hanya [type+key] agar data lain (summary, confidence) bisa diubah
  memory: '++id, [type+key], type, key, summary, memory, confidence',
  sessions: '++id, title, lastUpdated',
  history: '++id, sessionId, role, content, timestamp'
})

// --- CREATE ---
export async function insertData(data) {
  const memoryText = data.memory.trim()
  const vector = await generateVector(memoryText)
  try {
    await db.memory.add({
      type: data.type,
      key: data.key,
      memory: memoryText,
      vector: vector
    })
  } catch (error) {
    console.error('Error Save Data:', error)
  }
}

// --- UPDATE ---
export async function updateData(data) {
  try {
    const newMemoryText = data.memory.trim()
    const newVector = await generateVector(newMemoryText)
    await db.memory.upsert(data.id, {
      id: data.id || undefined,
      type: data.type.toLowerCase().trim(),
      key: data.key.toLowerCase().trim(),
      memory: newMemoryText,
      vector: newVector
    })
  } catch (error) {
    console.error('Error in updateData logic:', error)
  }
}

// --- DELETE ---
export async function deleteData(data) {
  try {
    // 1. Prioritas utama: Hapus pake ID yang dikasih Mark
    if (data.id) {
      await db.memory.delete(data.id)
      console.log(`🗑️ Memory ID ${data.id} berhasil dihapus oleh Mark.`)
      return { success: true }
    }

    // 2. Fallback: Kalau Mark nggak kasih ID (tapi ini harusnya jarang)
    // Kita hapus berdasarkan type dan key
    if (data.type && data.key) {
      const deletedCount = await db.memory
        .where('[type+key]')
        .equals([data.type.toLowerCase(), data.key.toLowerCase()])
        .delete()

      console.log(`⚠️ Hapus via fallback: ${deletedCount} data terhapus.`)
      return { success: true }
    }

    console.warn('Mark mau hapus data tapi gak kasih ID atau Type/Key yang jelas.')
  } catch (error) {
    console.error('Error saat mencoba menghapus memori:', error)
    throw error
  }
}

export async function getAllMemory() {
  try {
    const data = await db.memory.toArray()
    return data || [] // Kembalikan array kosong kalau gak ada data
  } catch (error) {
    console.error('Gagal ambil semua memori:', error)
    return []
  }
}
