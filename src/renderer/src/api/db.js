import Dexie from 'dexie'
import { generateVector } from './vectorMemory'

export const db = new Dexie('mark-db')

db.version(1).stores({
  // Index gabungan hanya [type+key] agar data lain (summary, confidence) bisa diubah
  memory: '++id, [type+key], type, key, summary, memory, confidence',
  sessions: '++id, title, data, timestamp'
})

// --- CREATE ---
export async function insertMemory(data) {
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
    console.error('Error Save Memory:', error)
  }
}

export async function createSession(title, data) {
  try {
    const id = await db.sessions.add({ title: title, data: data, timestamp: Date.now() })
    return id
  } catch (error) {
    console.error('Error in createSession logic:', error)
  }
}
export async function insertSession(id, data) {
  try {
    await db.sessions.update(id, { data: data, timestamp: Date.now() })
  } catch (error) {
    console.error('Error in insertSession logic:', error)
  }
}

// --- UPDATE ---
export async function updateMemory(data) {
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
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data) {
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
    console.error('Error in deleteMemory logic:', error)
    throw error
  }
}

export async function getAllMemory() {
  try {
    const data = await db.memory.toArray()
    return data || [] // Kembalikan array kosong kalau gak ada data
  } catch (error) {
    console.error('Error in getAllMemory logic:', error)
    return []
  }
}
export async function getAllSessionTitle() {
  try {
    const data = await db.sessions.toArray()
    console.log(data)
    return data || []
  } catch (error) {
    console.error('Error in getAllSessionTitle logic:', error)
    return []
  }
}
export async function getChatData(id) {
  try {
    const session = await db.sessions.where('id').equals(id).toArray()
    console.log(session[0].data)
    return session[0].data
  } catch (error) {
    console.error('Error in getChatData logic:', error)
    return []
  }
}
