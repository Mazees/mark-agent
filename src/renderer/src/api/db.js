/**
 * Client DB Layer (MARK SQLite Proxy Adapter)
 * Menyediakan antarmuka async yang kompatibel dengan seluruh komponen UI/hooks,
 * namun menyimpan data secara persisten dan terpusat di server SQLite backend.
 */
import { generateVector } from './vectorMemory'
import { insertMemoryToOrama, updateMemoryInOrama, deleteMemoryFromOrama } from './oramaStore'
import { API_BASE } from './web-bridge'
export { SERVER_CONFIG, SERVER_HOST, SERVER_PORT, API_BASE } from './web-bridge'

// Helper fetch JSON
async function apiGet(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`)
    const json = await res.json()
    return json.data ?? json
  } catch (err) {
    console.error(`[DB Proxy] GET ${path} error:`, err)
    return null
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await res.json()
    return json.data ?? json
  } catch (err) {
    console.error(`[DB Proxy] POST ${path} error:`, err)
    return null
  }
}

async function apiDelete(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
    const json = await res.json()
    return json.success ?? false
  } catch (err) {
    console.error(`[DB Proxy] DELETE ${path} error:`, err)
    return false
  }
}

/**
 * Tabel Proxy untuk kompatibilitas kode lama yang memanggil `db.namaTabel`
 */
class TableProxy {
  constructor(endpoint, idField = 'id') {
    this.endpoint = endpoint
    this.idField = idField
  }

  async toArray() {
    const data = await apiGet(this.endpoint)
    return Array.isArray(data) ? data : []
  }

  async get(id) {
    const item = await apiGet(`${this.endpoint}/${id}`)
    return item || null
  }

  async add(item) {
    const res = await apiPost(this.endpoint, item)
    return res?.[this.idField] || res?.id
  }

  async put(item) {
    return await apiPost(this.endpoint, item)
  }

  async bulkAdd(items) {
    return await apiPost(`${this.endpoint}/batch`, items)
  }

  async bulkPut(items) {
    return await apiPost(`${this.endpoint}/batch`, items)
  }

  async delete(id) {
    return await apiDelete(`${this.endpoint}/${id}`)
  }

  async update(id, updates) {
    const existing = await this.get(id)
    if (!existing) return null
    return await this.put({ ...existing, ...updates })
  }

  async count() {
    const arr = await this.toArray()
    return arr.length
  }

  async clear() {
    const arr = await this.toArray()
    for (const item of arr) {
      const id = item[this.idField] || item.id || item.pairId
      if (id) await this.delete(id)
    }
    return true
  }

  where(field) {
    return {
      equals: (val) => ({
        toArray: async () => {
          const all = await this.toArray()
          return all.filter((item) => String(item[field]) === String(val))
        },
        delete: async () => {
          const all = await this.toArray()
          const matched = all.filter((item) => String(item[field]) === String(val))
          for (const m of matched) {
            const id = m[this.idField] || m.id || m.pairId
            if (id) await this.delete(id)
          }
          return matched.length
        },
        first: async () => {
          const all = await this.toArray()
          return all.find((item) => String(item[field]) === String(val)) || null
        }
      }),
      equalsIgnoreCase: (val) => ({
        first: async () => {
          const all = await this.toArray()
          return all.find((item) => String(item[field] || '').toLowerCase() === String(val || '').toLowerCase()) || null
        }
      })
    }
  }

  orderBy(field) {
    return {
      reverse: () => ({
        toArray: async () => {
          const all = await this.toArray()
          return all.sort((a, b) => (b[field] || 0) - (a[field] || 0))
        }
      }),
      toArray: async () => {
        const all = await this.toArray()
        return all.sort((a, b) => (a[field] || 0) - (b[field] || 0))
      }
    }
  }
}

// Objek db proxy menggantikan Dexie instances
export const db = {
  config: new TableProxy('/api/config'),
  memory: new TableProxy('/api/memories'),
  memories: new TableProxy('/api/memories'),
  sessions: new TableProxy('/api/sessions'),
  chatTurns: new TableProxy('/api/turns', 'pairId'),
  chatArchive: new TableProxy('/api/archives'),
  documents: new TableProxy('/api/documents'),
  relationships: new TableProxy('/api/relationships', 'userId'),
  subagents: new TableProxy('/api/subagents'),
  subagent_messages: new TableProxy('/api/subagents/messages'),
  subagentMessages: new TableProxy('/api/subagents/messages'),
  learnedSkills: new TableProxy('/api/skills'),
  agentTasks: new TableProxy('/api/tasks'),
  agentTaskSteps: new TableProxy('/api/tasks/steps')
}

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'notes', 'learn']

function getValidType(type) {
  const t = (type || '').toLowerCase().trim()
  return VALID_TYPES.includes(t) ? t : 'notes'
}

// --- CREATE ---
export async function insertMemory(data) {
  const memoryText = data.memory.trim()
  const type = getValidType(data.type)
  const vector = (await generateVector(memoryText)) || []

  try {
    const record = await db.memory.put({
      type: type,
      summary: data.summary || '',
      memory: memoryText,
      vector: vector
    })
    const id = record?.id || record
    insertMemoryToOrama({ id, type, summary: data.summary || '', memory: memoryText, vector }).catch(console.error)
    return id
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
      id,
      type: type,
      summary: summaryStr,
      memory: newMemoryText,
      vector: (await generateVector(newMemoryText)) || []
    }

    if (id) {
      await db.memory.put(updatePayload)
      updateMemoryInOrama(id, { ...updatePayload, id: id }).catch(console.error)
      console.log(`[DB Proxy] Memory ID ${id} berhasil di-update.`)
    }
  } catch (error) {
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data) {
  try {
    const id = typeof data === 'object' && data !== null ? data.id : String(data)
    if (id) {
      await db.memory.delete(id)
      deleteMemoryFromOrama(id).catch(console.error)
      return { success: true }
    }
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
    const configData = await apiGet('/api/config')
    if (configData) {
      const conf = { ...configData, id: 1 }
      if (!conf.geminiWebModel) conf.geminiWebModel = 'gemini-3.6-flash'
      if (!conf.aiProvider) conf.aiProvider = 'gemini-web'
      if (conf.windowOpacity === undefined) conf.windowOpacity = 0.85
      if (!conf.localWhisperModel) conf.localWhisperModel = 'whisper-small'
      return [conf]
    }
    return []
  } catch (error) {
    console.error('Error in getAllConfig logic:', error)
    return []
  }
}

export async function saveConfiguration(data) {
  try {
    await apiPost('/api/config', data)
    window.dispatchEvent(new CustomEvent('config-updated', { detail: data }))
    console.log('[DB Proxy] Configuration saved:', data)
  } catch (error) {
    console.error('Error in saveConfiguration logic:', error)
  }
}

export async function getAlwaysAllowedPaths() {
  try {
    const configs = await getAllConfig()
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
    const configs = await getAllConfig()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths) ? currentConfig.alwaysAllowedPaths : []

    if (!currentList.includes(pathToAdd)) {
      const updatedList = [...currentList, pathToAdd]
      const newConfig = { ...currentConfig, alwaysAllowedPaths: updatedList }
      await saveConfiguration(newConfig)
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
    const configs = await getAllConfig()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths) ? currentConfig.alwaysAllowedPaths : []

    const updatedList = currentList.filter((p) => p !== pathToRemove)
    const newConfig = { ...currentConfig, alwaysAllowedPaths: updatedList }
    await saveConfiguration(newConfig)
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
      const defaultSession = { id: '1', title: 'Main Thread', data: [], timestamp: Date.now() }
      await db.sessions.put(defaultSession)
      return [defaultSession]
    }
    const hasMain = sessions.some((s) => String(s.id) === '1')
    if (!hasMain) {
      await db.sessions.put({ id: '1', title: 'Main Thread', data: [], timestamp: Date.now() })
      sessions.unshift({ id: '1', title: 'Main Thread', data: [], timestamp: Date.now() })
    }
    sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return sessions
  } catch (error) {
    console.error('Error in getAllSessions:', error)
    return [{ id: '1', title: 'Main Thread', data: [], timestamp: Date.now() }]
  }
}

export async function getChatData(id) {
  try {
    const session = await db.sessions.get(id)
    return session?.data || []
  } catch (error) {
    console.error('Error in getChatData logic:', error)
    return []
  }
}

export async function getSession(id) {
  try {
    return await db.sessions.get(id)
  } catch (error) {
    console.error('Error in getSession:', error)
    return null
  }
}

export async function createSession(title = 'Percakapan Baru', initialData = []) {
  try {
    const timestamp = Date.now()
    const id = `session_${timestamp}_${Math.random().toString(36).slice(2, 6)}`
    const session = { id, title: title.trim() || 'Percakapan Baru', data: initialData, timestamp }
    await db.sessions.put(session)
    return session
  } catch (error) {
    console.error('Error in createSession:', error)
    throw error
  }
}

export async function saveSession(id, data, title = null, workspaceRoot = null) {
  try {
    const existing = await db.sessions.get(id)
    const updatePayload = {
      id: String(id),
      data: data,
      timestamp: Date.now()
    }
    if (title) {
      updatePayload.title = title
    } else if (existing?.title) {
      updatePayload.title = existing.title
    } else {
      updatePayload.title = String(id) === '1' ? 'Main Thread' : 'Percakapan Baru'
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
    const existing = await db.sessions.get(id)
    if (existing) {
      existing.workspaceRoot = workspaceRoot
      existing.timestamp = Date.now()
      await db.sessions.put(existing)
      return true
    } else {
      await db.sessions.put({
        id: String(id),
        title: String(id) === '1' ? 'Main Thread' : 'Percakapan Baru',
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
    if (String(id) === '1') {
      await db.sessions.put({ id: '1', title: 'Main Thread', data: [], timestamp: Date.now() })
      await db.chatTurns.where('sessionId').equals('1').delete()
      return true
    }
    await db.sessions.delete(id)
    await db.chatTurns.where('sessionId').equals(String(id)).delete()
    return true
  } catch (error) {
    console.error('Error in deleteSession:', error)
    return false
  }
}

export async function renameSession(id, newTitle) {
  try {
    const existing = await db.sessions.get(id)
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
    return await db.documents.bulkAdd(chunks)
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
    for (const chunk of chunks) {
      if (chunk.id) await db.documents.delete(chunk.id)
    }
    return chunks.map((c) => c.id)
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
      return profiles.map((p) => `- ${p.summary || p.memory}`).join('\n')
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
      return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
    }
    return data
  } catch (error) {
    console.error('[DB Proxy] Error getRelationship:', error)
    return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
  }
}

export async function saveRelationship(data) {
  try {
    await db.relationships.put(data)
    console.log(`[DB Proxy] Relationship saved for ${data.userId}:`, data)
  } catch (error) {
    console.error('[DB Proxy] Error saveRelationship:', error)
  }
}

// --- LEARNED SKILLS ---
export async function saveLearnedSkill({ name, description, content }) {
  try {
    const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
    if (!cleanName || !content) return null

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
    return skillData
  } catch (err) {
    console.error('[DB Proxy] Error saveLearnedSkill:', err)
    return null
  }
}

export async function getLearnedSkill(name) {
  try {
    if (!name) return null
    const cleanName = name.toLowerCase().trim()
    return await db.learnedSkills.where('name').equalsIgnoreCase(cleanName).first()
  } catch (err) {
    console.error('[DB Proxy] Error getLearnedSkill:', err)
    return null
  }
}

export async function getAllLearnedSkills() {
  try {
    return await db.learnedSkills.orderBy('createdAt').reverse().toArray()
  } catch (err) {
    console.error('[DB Proxy] Error getAllLearnedSkills:', err)
    return []
  }
}

export async function deleteLearnedSkill(idOrName) {
  try {
    if (!idOrName) return false
    const existing =
      (await db.learnedSkills.get(idOrName)) ||
      (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())
    if (existing) {
      await db.learnedSkills.delete(existing.id)
      return true
    }
    return false
  } catch (err) {
    console.error('[DB Proxy] Error deleteLearnedSkill:', err)
    return false
  }
}

// --- CHAT TURNS ---
export async function saveChatTurn(turnData) {
  try {
    if (!turnData || !turnData.pairId) return null
    await db.chatTurns.put(turnData)
    return turnData
  } catch (err) {
    console.error('[DB Proxy] Error saveChatTurn:', err)
    return null
  }
}

export async function saveBatchChatTurns(turnsArray) {
  try {
    if (!Array.isArray(turnsArray) || turnsArray.length === 0) return 0
    await db.chatTurns.bulkPut(turnsArray)
    return turnsArray.length
  } catch (err) {
    console.error('[DB Proxy] Error saveBatchChatTurns:', err)
    return 0
  }
}

export async function getAllChatTurns() {
  try {
    const data = await db.chatTurns.toArray()
    return data || []
  } catch (err) {
    console.error('[DB Proxy] Error getAllChatTurns:', err)
    return []
  }
}

export async function getChatTurnsBySession(sessionId) {
  try {
    if (!sessionId) return []
    return await db.chatTurns.where('sessionId').equals(String(sessionId)).toArray()
  } catch (err) {
    console.error('[DB Proxy] Error getChatTurnsBySession:', err)
    return []
  }
}

export async function deleteChatTurnsBySession(sessionId) {
  try {
    if (!sessionId) return 0
    return await db.chatTurns.where('sessionId').equals(String(sessionId)).delete()
  } catch (err) {
    console.error('[DB Proxy] Error deleteChatTurnsBySession:', err)
    return 0
  }
}

export async function getChatTurnCount() {
  try {
    return await db.chatTurns.count()
  } catch (err) {
    console.error('[DB Proxy] Error getChatTurnCount:', err)
    return 0
  }
}
