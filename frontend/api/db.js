import Dexie from 'dexie'
import { generateVector } from './vectorMemory'
import { insertMemoryToOrama, updateMemoryInOrama, deleteMemoryFromOrama } from './oramaStore'

export const db = new Dexie('mark-db')

db.version(1).stores({
  // Index gabungan hanya [type+key] agar data lain (summary, confidence) bisa diubah
  memory: '++id, [type+key], type, key, summary, memory, confidence',
  sessions: '++id, title, data, timestamp',
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch'
})

db.version(2).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel'
})

db.version(3).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider'
})

db.version(4).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel'
})

db.version(5).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel'
})

db.version(6).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins'
})

db.version(7).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel'
})

db.version(8).stores({
  chatArchive: '++id, summary, timestamp, topic',
  documents: '++id, docName, chunkIndex, content, timestamp'
})

db.version(9).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled'
})

db.version(10).upgrade(async tx => {
  // Reset all vectors to force re-indexing with the new multilingual MiniLM model
  return tx.memory.toCollection().modify(mem => {
    mem.vector = [];
  });
})

db.version(11).upgrade(async tx => {
  // Reset vectors for chatArchive and documents as well because of the model change
  await tx.chatArchive.toCollection().modify(arc => {
    arc.vector = [];
  });
  await tx.documents.toCollection().modify(doc => {
    doc.vector = [];
  });
})

db.version(12).upgrade(async tx => {
  // BUMP VERSION 12: Memastikan benar-benar terhapus (jika v11 ke-skip)
  await tx.chatArchive.toCollection().modify(arc => {
    arc.vector = [];
  });
  await tx.documents.toCollection().modify(doc => {
    doc.vector = [];
  });
})

db.version(13).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled'
})

db.version(14).stores({
  relationships: 'userId, warmth, sarcasm_level, trust, energy, obedience, lastEvaluation, evalCount'
})

db.version(15).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel'
})

db.version(16).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel'
}).upgrade(async tx => {
  return tx.table('config').toCollection().modify(config => {
    config.tgBotToken = config.tgBotToken || ''
    config.tgAdminIds = config.tgAdminIds || ''
    delete config.waAdminNumber
    delete config.waPendingAdmins
    delete config.waApprovedAdmins
  })
})

db.version(17).stores({
  agentTasks: 'id, status, mode, updatedAt, createdAt',
  agentTaskSteps: 'id, taskId, [taskId+index], status, updatedAt'
})

db.version(18).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity'
}).upgrade(tx => {
  return tx.table('config').toCollection().modify(config => {
    config.windowOpacity = config.windowOpacity ?? 0.85
  })
})

db.version(19).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, localWhisperModel'
}).upgrade(tx => {
  return tx.table('config').toCollection().modify(config => {
    config.localWhisperModel = config.localWhisperModel ?? 'web-speech'
  })
})

db.version(20).stores({
  subagents: 'id, status, parentSessionId, createdAt, updatedAt',
  subagent_messages: '++id, subagentId, sender, timestamp'
})

db.version(21).stores({
  learnedSkills: 'id, name, createdAt, updatedAt'
})

db.version(22).stores({
  chatTurns: 'pairId, sessionId, timestamp'
})

db.version(23).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, localWhisperModel, wakeWordEnabled, wakeWordKeyword'
}).upgrade(tx => {
  return tx.table('config').toCollection().modify(config => {
    config.wakeWordEnabled = config.wakeWordEnabled ?? false
    config.wakeWordKeyword = config.wakeWordKeyword ?? 'hey-mark'
  })
})

db.version(24).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, wakeWordEnabled, wakeWordKeyword'
}).upgrade(tx => {
  return tx.table('config').toCollection().modify(config => {
    delete config.localWhisperModel
    delete config.groqApiKey
    delete config.groqModel
  })
})

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'notes', 'learn'];

function getValidType(type) {
  const t = (type || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'notes';
}

// --- CREATE ---
export async function insertMemory(data) {
  const memoryText = data.memory.trim()
  const type = getValidType(data.type)
  const vector = (await generateVector(memoryText)) || []

  try {
    const id = await db.memory.add({
      type: type,
      summary: data.summary || '',
      memory: memoryText,
      vector: vector
    })
    insertMemoryToOrama({ id, type, summary: data.summary || '', memory: memoryText, vector }).catch(console.error)
  } catch (error) {
    console.error('Error Save Memory:', error)
  }
}

export async function saveMainThread(data) {
  try {
    await db.sessions.put({ id: 1, title: 'Main Thread', data: data, timestamp: Date.now() })
  } catch (error) {
    console.error('Error saving main thread:', error)
  }
}

export async function getMainThread() {
  try {
    const thread = await db.sessions.get(1)
    return thread ? thread.data : []
  } catch (error) {
    console.error('Error fetching main thread:', error)
    return []
  }
}

// --- UPDATE ---
export async function updateMemory(data, maybeMemory, maybeType) {
  try {
    let id, memoryText, typeStr, summaryStr
    if (typeof data === 'object' && data !== null) {
      id = data.id
      memoryText = data.memory || ''
      typeStr = data.type
      summaryStr = data.summary || ''
    } else {
      id = Number(data)
      memoryText = String(maybeMemory || '')
      typeStr = maybeType || 'profile'
      summaryStr = ''
    }

    const newMemoryText = memoryText.trim()
    const type = getValidType(typeStr)
    
    let updatePayload = {
      type: type,
      summary: summaryStr,
      memory: newMemoryText,
      vector: (await generateVector(newMemoryText)) || []
    }

    if (id && !isNaN(id)) {
      await db.memory.update(id, updatePayload)
      updateMemoryInOrama(id, { ...updatePayload, id: id }).catch(console.error)
      console.log(`✅ Memory ID ${id} berhasil di-update.`)
    } else {
      console.warn('⚠️ Gagal update: ID tidak ditemukan.')
    }
  } catch (error) {
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data) {
  try {
    const id = typeof data === 'object' && data !== null ? data.id : Number(data)
    if (id && !isNaN(id)) {
      await db.memory.delete(id)
      deleteMemoryFromOrama(id).catch(console.error)
      console.log(`🗑️ Memory ID ${id} berhasil dihapus oleh Mark.`)
      return { success: true }
    }
    
    console.warn('⚠️ Gagal menghapus memory: ID tidak ditemukan dalam perintah delete.')
    return { success: false, error: 'ID is required for deletion' }
  } catch (error) {
    console.error('Error in deleteMemory logic:', error)
    return { success: false, error: error.message }
  }
}

export async function getAllMemory() {
  try {
    const data = await db.memory.toArray()
    return data || []
  } catch (error) {
    console.error('Error in getAllMemory logic:', error)
    return []
  }
}

export async function getAllConfig() {
  try {
    const data = await db.config.toArray()
    if (data && data.length > 0) {
      if (!data[0].geminiWebModel) {
        data[0].geminiWebModel = 'gemini-3.6-flash'
      }
      if (!data[0].aiProvider) {
        data[0].aiProvider = 'gemini-web'
      }
      if (data[0].windowOpacity === undefined) {
        data[0].windowOpacity = 0.85
      }
      if (data[0].wakeWordEnabled === undefined) {
        data[0].wakeWordEnabled = false
      }
      if (!data[0].wakeWordKeyword) {
        data[0].wakeWordKeyword = 'hey-mark'
      }
    }
    return data || []
  } catch (error) {
    console.error('Error in getAllConfig logic:', error)
    return []
  }
}

export async function saveConfiguration(data) {
  try {
    await db.config.put({ ...data, id: 1 })
    if (window.api && window.api.syncConfig) {
      window.api.syncConfig(data)
    }
    window.dispatchEvent(new CustomEvent('config-updated', { detail: data }))
    console.log('Configuration saved:', data)
  } catch (error) {
    console.error('Error in saveConfiguration logic:', error)
  }
}

export async function getAlwaysAllowedPaths() {
  try {
    const configs = await db.config.toArray()
    if (configs && configs.length > 0 && Array.isArray(configs[0].alwaysAllowedPaths)) {
      return configs[0].alwaysAllowedPaths
    }
    return []
  } catch (error) {
    console.error('Error in getAlwaysAllowedPaths logic:', error)
    return []
  }
}

export async function addAlwaysAllowedPath(pathToAdd) {
  try {
    if (!pathToAdd) return []
    const configs = await db.config.toArray()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths)
      ? currentConfig.alwaysAllowedPaths
      : []

    if (!currentList.includes(pathToAdd)) {
      const updatedList = [...currentList, pathToAdd]
      const newConfig = { ...currentConfig, id: 1, alwaysAllowedPaths: updatedList }
      await db.config.put(newConfig)
      if (window.api && window.api.syncConfig) {
        window.api.syncConfig(newConfig)
      }
      window.dispatchEvent(new CustomEvent('config-updated', { detail: newConfig }))
      return updatedList
    }
    return currentList
  } catch (error) {
    console.error('Error in addAlwaysAllowedPath logic:', error)
    return []
  }
}

export async function removeAlwaysAllowedPath(pathToRemove) {
  try {
    const configs = await db.config.toArray()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths)
      ? currentConfig.alwaysAllowedPaths
      : []

    const updatedList = currentList.filter((p) => p !== pathToRemove)
    const newConfig = { ...currentConfig, id: 1, alwaysAllowedPaths: updatedList }
    await db.config.put(newConfig)
    if (window.api && window.api.syncConfig) {
      window.api.syncConfig(newConfig)
    }
    window.dispatchEvent(new CustomEvent('config-updated', { detail: newConfig }))
    return updatedList
  } catch (error) {
    console.error('Error in removeAlwaysAllowedPath logic:', error)
    return []
  }
}

export async function getAllSessionTitle() {
  try {
    const data = await db.sessions.toArray()
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return data || []
  } catch (error) {
    console.error('Error in getAllSessionTitle logic:', error)
    return []
  }
}

export async function getAllSessions() {
  try {
    const sessions = await db.sessions.toArray()
    if (!sessions || sessions.length === 0) {
      const defaultSession = { id: 1, title: 'Main Thread', data: [], timestamp: Date.now() }
      await db.sessions.put(defaultSession)
      return [defaultSession]
    }
    // Pastikan session id: 1 ada
    const hasMain = sessions.some((s) => s.id === 1)
    if (!hasMain) {
      await db.sessions.put({ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() })
      sessions.unshift({ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() })
    }
    sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return sessions
  } catch (error) {
    console.error('Error in getAllSessions:', error)
    return [{ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() }]
  }
}

export async function getChatData(id) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    const session = await db.sessions.get(numId)
    return session?.data || []
  } catch (error) {
    console.error('Error in getChatData logic:', error)
    return []
  }
}

export async function getSession(id) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    return await db.sessions.get(numId)
  } catch (error) {
    console.error('Error in getSession:', error)
    return null
  }
}

export async function createSession(title = 'Percakapan Baru', initialData = []) {
  try {
    const timestamp = Date.now()
    const id = await db.sessions.add({
      title: title.trim() || 'Percakapan Baru',
      data: initialData,
      timestamp
    })
    return { id, title, data: initialData, timestamp }
  } catch (error) {
    console.error('Error in createSession:', error)
    throw error
  }
}

export async function saveSession(id, data, title = null, workspaceRoot = null) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    const existing = await db.sessions.get(numId)
    const updatePayload = {
      id: numId,
      data: data,
      timestamp: Date.now()
    }
    if (title) {
      updatePayload.title = title
    } else if (existing?.title) {
      updatePayload.title = existing.title
    } else {
      updatePayload.title = numId === 1 ? 'Main Thread' : 'Percakapan Baru'
    }
    if (workspaceRoot !== null && workspaceRoot !== undefined) {
      updatePayload.workspaceRoot = workspaceRoot
    } else if (existing?.workspaceRoot) {
      updatePayload.workspaceRoot = existing.workspaceRoot
    }
    await db.sessions.put(updatePayload)
    return true
  } catch (error) {
    console.error('Error in saveSession:', error)
    return false
  }
}

export async function setSessionWorkspace(id, workspaceRoot) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    const existing = await db.sessions.get(numId)
    if (existing) {
      existing.workspaceRoot = workspaceRoot
      existing.timestamp = Date.now()
      await db.sessions.put(existing)
      return true
    } else {
      await db.sessions.put({
        id: numId,
        title: numId === 1 ? 'Main Thread' : 'Percakapan Baru',
        data: [],
        workspaceRoot,
        timestamp: Date.now()
      })
      return true
    }
  } catch (e) {
    console.error('Error in setSessionWorkspace:', e)
    return false
  }
}

export async function deleteSession(id) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    if (numId === 1) {
      // Main Thread tidak boleh dihapus barisnya, hanya dikosongkan pesannya
      await db.sessions.put({ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() })
      await db.chatTurns.where('sessionId').equals(1).delete()
      try {
        const { deleteTurnPairsBySessionFromOrama } = await import('./oramaStore')
        await deleteTurnPairsBySessionFromOrama(1)
      } catch (_) {}
      return true
    }
    await db.sessions.delete(numId)
    await db.chatTurns.where('sessionId').equals(Number(numId)).delete()
    try {
      const { deleteTurnPairsBySessionFromOrama } = await import('./oramaStore')
      await deleteTurnPairsBySessionFromOrama(numId)
    } catch (_) {}
    return true
  } catch (error) {
    console.error('Error in deleteSession:', error)
    return false
  }
}

export async function renameSession(id, newTitle) {
  try {
    const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
    const existing = await db.sessions.get(numId)
    if (existing) {
      existing.title = newTitle.trim() || existing.title
      existing.timestamp = Date.now()
      await db.sessions.put(existing)
      return true
    }
    return false
  } catch (error) {
    console.error('Error in renameSession:', error)
    return false
  }
}

// --- CHAT ARCHIVE CRUD ---
export async function insertChatArchive(data) {
  try {
    return await db.chatArchive.add(data)
  } catch (error) {
    console.error('Error in insertChatArchive:', error)
    throw error
  }
}

export async function getAllChatArchives() {
  try {
    return await db.chatArchive.toArray()
  } catch (error) {
    console.error('Error in getAllChatArchives:', error)
    return []
  }
}

export async function deleteChatArchive(id) {
  try {
    await db.chatArchive.delete(id)
  } catch (error) {
    console.error('Error in deleteChatArchive:', error)
    throw error
  }
}

// --- DOCUMENTS CRUD ---
export async function bulkInsertDocuments(chunks) {
  try {
    return await db.documents.bulkAdd(chunks, { allKeys: true })
  } catch (error) {
    console.error('Error in bulkInsertDocuments:', error)
    throw error
  }
}

export async function getAllDocuments() {
  try {
    return await db.documents.toArray()
  } catch (error) {
    console.error('Error in getAllDocuments:', error)
    return []
  }
}

export async function deleteDocumentByName(docName) {
  try {
    const chunks = await db.documents.where('docName').equals(docName).toArray()
    const ids = chunks.map(c => c.id)
    await db.documents.bulkDelete(ids)
    return ids
  } catch (error) {
    console.error('Error in deleteDocumentByName:', error)
    throw error
  }
}

// --- CORE MEMORY ---
export async function getCoreMemory() {
  try {
    const profiles = await db.memory.where('type').equals('profile').toArray()
    if (profiles && profiles.length > 0) {
      return profiles.map(p => `- ${p.summary || p.memory}`).join('\n')
    }
  } catch (error) {
    console.error('Error in getCoreMemory:', error)
  }
  return 'Tidak ada profil user.'
}

// --- RELATIONSHIPS ---
const DEFAULT_TRAITS = {
  warmth: 0.5,
  sarcasm_level: 0.5,
  trust: 0.5,
  energy: 0.5,
  obedience: 0.5,
  evalCount: 0,
  lastChatIndex: 0,
  reasoning: 'Baseline netral — belum ada evaluasi.'
}

export async function getRelationship(userId = 'owner') {
  try {
    const data = await db.relationships.get(userId)
    if (!data) {
      // Return default traits untuk user baru
      return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
    }
    return data
  } catch (error) {
    console.error('[DB] Error getRelationship:', error)
    return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
  }
}

export async function saveRelationship(data) {
  try {
    await db.relationships.put(data)
    console.log(`[DB] Relationship saved for ${data.userId}:`, data)
  } catch (error) {
    console.error('[DB] Error saveRelationship:', error)
  }
}

// --- LEARNED SKILLS (METASYSTEM SELF-IMPROVEMENT) ---
export async function saveLearnedSkill({ name, description, content }) {
  try {
    const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
    if (!cleanName || !content) return null

    // Cek apakah skill dengan nama ini sudah ada (update) atau baru (create)
    const existing = await db.learnedSkills.where('name').equalsIgnoreCase(cleanName).first()
    const id = existing?.id || `learned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    
    const skillData = {
      id,
      name: cleanName,
      description: description || 'Prosedur teknis teruji buatan Mark',
      content: content.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    }

    await db.learnedSkills.put(skillData)
    console.log(`[DB] Learned skill saved: /${cleanName}`, skillData)
    return skillData
  } catch (err) {
    console.error('[DB] Error saveLearnedSkill:', err)
    return null
  }
}

export async function getLearnedSkill(name) {
  try {
    if (!name) return null
    const cleanName = name.toLowerCase().trim()
    return await db.learnedSkills.where('name').equalsIgnoreCase(cleanName).first()
  } catch (err) {
    console.error('[DB] Error getLearnedSkill:', err)
    return null
  }
}

export async function getAllLearnedSkills() {
  try {
    return await db.learnedSkills.orderBy('createdAt').reverse().toArray()
  } catch (err) {
    console.error('[DB] Error getAllLearnedSkills:', err)
    return []
  }
}

export async function deleteLearnedSkill(idOrName) {
  try {
    if (!idOrName) return false
    const existing = (await db.learnedSkills.get(idOrName)) || (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())
    if (existing) {
      await db.learnedSkills.delete(existing.id)
      return true
    }
    return false
  } catch (err) {
    console.error('[DB] Error deleteLearnedSkill:', err)
    return false
  }
}

// ==========================================================================
// CHAT TURNS (TURN-PAIR VECTOR MEMORY)
// ==========================================================================

export async function saveChatTurn(turnData) {
  try {
    if (!turnData || !turnData.pairId) return null
    await db.chatTurns.put(turnData)
    return turnData
  } catch (err) {
    console.error('[DB] Error saveChatTurn:', err)
    return null
  }
}

export async function saveBatchChatTurns(turnsArray) {
  try {
    if (!Array.isArray(turnsArray) || turnsArray.length === 0) return 0
    await db.chatTurns.bulkPut(turnsArray)
    return turnsArray.length
  } catch (err) {
    console.error('[DB] Error saveBatchChatTurns:', err)
    return 0
  }
}

export async function getAllChatTurns() {
  try {
    return await db.chatTurns.toArray()
  } catch (err) {
    console.error('[DB] Error getAllChatTurns:', err)
    return []
  }
}

export async function getChatTurnsBySession(sessionId) {
  try {
    if (!sessionId) return []
    return await db.chatTurns.where('sessionId').equals(Number(sessionId)).toArray()
  } catch (err) {
    console.error('[DB] Error getChatTurnsBySession:', err)
    return []
  }
}

export async function deleteChatTurnsBySession(sessionId) {
  try {
    if (!sessionId) return 0
    return await db.chatTurns.where('sessionId').equals(Number(sessionId)).delete()
  } catch (err) {
    console.error('[DB] Error deleteChatTurnsBySession:', err)
    return 0
  }
}

export async function getChatTurnCount() {
  try {
    return await db.chatTurns.count()
  } catch (err) {
    console.error('[DB] Error getChatTurnCount:', err)
    return 0
  }
}

