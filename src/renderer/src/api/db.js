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
 * Collection Proxy untuk chaining Dexie-like queries:
 * where().equals(), anyOf(), filter(), sortBy(), limit(), reverse(), toArray(), delete(), first()
 */
class CollectionProxy {
  constructor(tableProxy, filterFn = null, sortField = null, isReverse = false, limitCount = null) {
    this.tableProxy = tableProxy
    this.filterFn = filterFn
    this.sortField = sortField
    this.isReverse = isReverse
    this.limitCount = limitCount
  }

  filter(fn) {
    const prev = this.filterFn
    const combined = prev ? (item) => prev(item) && fn(item) : fn
    return new CollectionProxy(this.tableProxy, combined, this.sortField, this.isReverse, this.limitCount)
  }

  sortBy(field) {
    return new CollectionProxy(this.tableProxy, this.filterFn, field, this.isReverse, this.limitCount)
  }

  reverse() {
    return new CollectionProxy(this.tableProxy, this.filterFn, this.sortField, !this.isReverse, this.limitCount)
  }

  limit(count) {
    return new CollectionProxy(this.tableProxy, this.filterFn, this.sortField, this.isReverse, count)
  }

  async toArray() {
    let all = await this.tableProxy.toArray()
    if (this.filterFn) {
      all = all.filter(this.filterFn)
    }
    if (this.sortField) {
      const sf = this.sortField
      all = all.slice().sort((a, b) => {
        const valA = a[sf] ?? ''
        const valB = b[sf] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valA - valB
        }
        return String(valA).localeCompare(String(valB))
      })
    }
    if (this.isReverse) {
      all.reverse()
    }
    if (typeof this.limitCount === 'number' && this.limitCount > 0) {
      all = all.slice(0, this.limitCount)
    }
    return all
  }

  async first() {
    const list = await this.limit(1).toArray()
    return list[0] || null
  }

  async count() {
    const list = await this.toArray()
    return list.length
  }

  async delete() {
    const list = await this.toArray()
    for (const item of list) {
      const id = item[this.tableProxy.idField] || item.id || item.pairId
      if (id) await this.tableProxy.delete(id)
    }
    return list.length
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
      equals: (val) => {
        return new CollectionProxy(this, (item) => String(item[field]) === String(val))
      },
      equalsIgnoreCase: (val) => {
        const lowerVal = String(val || '').toLowerCase()
        return new CollectionProxy(this, (item) => String(item[field] || '').toLowerCase() === lowerVal)
      },
      anyOf: (values) => {
        const set = new Set((Array.isArray(values) ? values : [values]).map((v) => String(v)))
        return new CollectionProxy(this, (item) => set.has(String(item[field])))
      }
    }
  }

  orderBy(field) {
    return new CollectionProxy(this, null, field, false, null)
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
  agentTaskSteps: new TableProxy('/api/tasks/steps'),
  transaction: async (...args) => {
    // Penanganan db.transaction(mode, ...tables, callback)
    const callback = args[args.length - 1]
    if (typeof callback === 'function') {
      return await callback()
    }
  }
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

// --- SESSIONS & CHAT DATA HELPERS ---
export async function getAllSessions() {
  try {
    return await db.sessions.toArray()
  } catch (error) {
    console.error('Error getAllSessions:', error)
    return []
  }
}

export async function getSession(id) {
  try {
    return await db.sessions.get(id)
  } catch (error) {
    console.error(`Error getSession ${id}:`, error)
    return null
  }
}

export async function createSession(title = 'Percakapan Baru') {
  try {
    const id = Date.now()
    const session = { id, title, data: [], timestamp: Date.now() }
    await db.sessions.put(session)
    return session
  } catch (error) {
    console.error('Error createSession:', error)
    return null
  }
}

export async function saveSession(id, data, title = null) {
  try {
    const existing = await db.sessions.get(id)
    const session = {
      ...(existing || { id }),
      data: Array.isArray(data) ? data : [],
      ...(title ? { title } : {}),
      timestamp: Date.now()
    }
    await db.sessions.put(session)
    return session
  } catch (error) {
    console.error(`Error saveSession ${id}:`, error)
  }
}

export async function deleteSession(id) {
  try {
    await db.sessions.delete(id)
    return { success: true }
  } catch (error) {
    console.error(`Error deleteSession ${id}:`, error)
    return { success: false, error: error.message }
  }
}

export async function renameSession(id, title) {
  try {
    const existing = await db.sessions.get(id)
    if (existing) {
      await db.sessions.put({ ...existing, title, timestamp: Date.now() })
    }
  } catch (error) {
    console.error(`Error renameSession ${id}:`, error)
  }
}

export async function getChatData(sessionId = 1) {
  try {
    const session = await db.sessions.get(sessionId)
    return session && Array.isArray(session.data) ? session.data : []
  } catch (error) {
    console.error(`Error getChatData ${sessionId}:`, error)
    return []
  }
}

export async function setSessionWorkspace(sessionId, workspace) {
  try {
    const existing = await db.sessions.get(sessionId)
    if (existing) {
      await db.sessions.put({ ...existing, workspace, timestamp: Date.now() })
    }
  } catch (error) {
    console.error(`Error setSessionWorkspace ${sessionId}:`, error)
  }
}

// Bulk insert chatTurns
export async function bulkInsertTurns(turns) {
  try {
    if (!Array.isArray(turns) || turns.length === 0) return []
    const res = await db.chatTurns.bulkPut(turns)
    return res
  } catch (error) {
    console.error('Error bulkInsertTurns:', error)
    return []
  }
}

export async function saveBatchChatTurns(turns) {
  return await bulkInsertTurns(turns)
}

export async function saveChatTurn(turn) {
  try {
    const res = await db.chatTurns.put(turn)
    return res
  } catch (error) {
    console.error('Error saveChatTurn:', error)
    return null
  }
}

// Bulk insert documents
export async function bulkInsertDocuments(documents) {
  try {
    if (!Array.isArray(documents) || documents.length === 0) return []
    const res = await db.documents.bulkPut(documents)
    return res?.data?.map((d) => d.id) || documents.map((_, i) => i + 1)
  } catch (error) {
    console.error('Error bulkInsertDocuments:', error)
    return []
  }
}

export async function deleteDocumentByName(docName) {
  try {
    const docs = await db.documents.where('docName').equals(docName).toArray()
    for (let d of docs) {
      await db.documents.delete(d.id)
    }
  } catch (error) {
    console.error('Error deleteDocumentByName:', error)
  }
}

export async function getAllDocuments() {
  try {
    return await db.documents.toArray()
  } catch (error) {
    console.error('Error getAllDocuments:', error)
    return []
  }
}

export async function getAllChatArchives() {
  try {
    return await db.chatArchive.toArray()
  } catch (error) {
    console.error('Error getAllChatArchives:', error)
    return []
  }
}

export async function insertChatArchive(data) {
  try {
    const record = await db.chatArchive.put(data)
    return record?.id || record
  } catch (error) {
    console.error('Error insertChatArchive:', error)
  }
}

export async function deleteChatArchive(id) {
  try {
    await db.chatArchive.delete(id)
  } catch (error) {
    console.error('Error deleteChatArchive:', error)
  }
}

export async function updateMemory(id, data) {
  try {
    const existing = await db.memory.get(id)
    if (!existing) {
      console.warn(`[DB Proxy] Memory dengan ID ${id} tidak ditemukan untuk diupdate.`)
      return
    }

    const memoryText = (data.memory || existing.memory).trim()
    const type = getValidType(data.type || existing.type)
    const summary = data.summary || existing.summary || ''

    let vector = existing.vector
    if (data.memory && data.memory !== existing.memory) {
      vector = (await generateVector(memoryText)) || existing.vector
    }

    const updatedRecord = {
      ...existing,
      type,
      summary,
      memory: memoryText,
      vector,
      updated_at: Date.now()
    }

    await db.memory.put(updatedRecord)
    if (vector && vector.length === 384) {
      updateMemoryInOrama(id, updatedRecord).catch(console.error)
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
      if (!conf.speechLanguage) conf.speechLanguage = 'id-ID'
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
      await saveConfiguration({ ...currentConfig, alwaysAllowedPaths: updatedList })
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
    if (!pathToRemove) return []
    const configs = await getAllConfig()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths) ? currentConfig.alwaysAllowedPaths : []
    const updatedList = currentList.filter((p) => p !== pathToRemove)
    await saveConfiguration({ ...currentConfig, alwaysAllowedPaths: updatedList })
    return updatedList
  } catch (error) {
    console.error('Error in removeAlwaysAllowedPath logic:', error)
    return []
  }
}

// --- RELATIONSHIP 4D ---
export async function getRelationship(userId = 'owner') {
  try {
    const rel = await db.relationships.get(userId)
    return (
      rel || {
        userId,
        warmth: 0.5,
        sarcasm_level: 0.5,
        trust: 0.5,
        energy: 0.5,
        obedience: 0.5,
        evalCount: 0,
        lastChatIndex: 0
      }
    )
  } catch (error) {
    console.error('Error in getRelationship logic:', error)
    return {
      userId,
      warmth: 0.5,
      sarcasm_level: 0.5,
      trust: 0.5,
      energy: 0.5,
      obedience: 0.5,
      evalCount: 0,
      lastChatIndex: 0
    }
  }
}

export async function saveRelationship(data) {
  try {
    const userId = data.userId || 'owner'
    const record = { ...data, userId }
    await db.relationships.put(record)
    return record
  } catch (error) {
    console.error('Error in saveRelationship logic:', error)
  }
}

// --- LEARNED SKILLS ---
export async function getAllLearnedSkills() {
  try {
    return await db.learnedSkills.toArray()
  } catch (error) {
    console.error('Error in getAllLearnedSkills logic:', error)
    return []
  }
}

export async function saveLearnedSkill(skill) {
  try {
    const id = skill.id || `skill_${Date.now()}`
    const record = { ...skill, id, updatedAt: Date.now() }
    await db.learnedSkills.put(record)
    return record
  } catch (error) {
    console.error('Error in saveLearnedSkill logic:', error)
  }
}

export async function deleteLearnedSkill(id) {
  try {
    await db.learnedSkills.delete(id)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteLearnedSkill logic:', error)
    return { success: false, error: error.message }
  }
}


