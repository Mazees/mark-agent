import path from 'path'
import os from 'os'
import fs from 'fs'
import Database from 'better-sqlite3'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mark-agent')
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

const DB_PATH = path.join(CONFIG_DIR, 'mark.db')

// Inisialisasi Database SQLite
export const sqlite = new Database(DB_PATH)

// Optimasi performa SQLite (WAL mode, memory temp store, normal sync)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('temp_store = MEMORY')

// Buat Skema Tabel
sqlite.exec(`
  -- 1. Configuration Store
  CREATE TABLE IF NOT EXISTS config (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 2. Cognitive Memory Store (MMS)
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT DEFAULT 'notes',
    summary TEXT DEFAULT '',
    memory TEXT NOT NULL,
    vector TEXT,
    confidence REAL DEFAULT 1.0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );

  -- 3. Sessions & Threads
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT 'New Session',
    data TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );

  -- 4. Chat Turns / History
  CREATE TABLE IF NOT EXISTS chat_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT DEFAULT '1',
    session_title TEXT DEFAULT '',
    user_text TEXT NOT NULL,
    ai_text TEXT NOT NULL,
    combined_text TEXT,
    vector TEXT,
    timestamp INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );

  -- 5. Chat Archives
  CREATE TABLE IF NOT EXISTS chat_archives (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    topic TEXT DEFAULT '',
    vector TEXT,
    timestamp INTEGER NOT NULL
  );

  -- 6. Knowledge Documents (RAG)
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    doc_name TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    vector TEXT,
    timestamp INTEGER NOT NULL
  );

  -- 7. Relational Growth 4D
  CREATE TABLE IF NOT EXISTS relationships (
    user_id TEXT PRIMARY KEY,
    warmth REAL DEFAULT 0.5,
    sarcasm_level REAL DEFAULT 0.5,
    trust REAL DEFAULT 0.5,
    energy REAL DEFAULT 0.5,
    obedience REAL DEFAULT 0.8,
    last_evaluation INTEGER,
    eval_count INTEGER DEFAULT 0
  );

  -- 8. Sub-Agents
  CREATE TABLE IF NOT EXISTS subagents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    status TEXT DEFAULT 'running',
    turn_count INTEGER DEFAULT 0,
    parent_session_id TEXT DEFAULT '1',
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );

  -- 9. Sub-Agent Messages
  CREATE TABLE IF NOT EXISTS subagent_messages (
    id TEXT PRIMARY KEY,
    subagent_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    role TEXT DEFAULT 'assistant',
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  -- 10. Learned Skills
  CREATE TABLE IF NOT EXISTS learned_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    content TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );

  -- 11. Agent Tasks
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    mode TEXT DEFAULT 'ephemeral',
    title TEXT DEFAULT '',
    objective TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );

  -- 12. Agent Task Steps
  CREATE TABLE IF NOT EXISTS agent_task_steps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_index INTEGER DEFAULT 0,
    title TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    updated_at INTEGER
  );

  -- Indeks untuk pencarian cepat
  CREATE INDEX IF NOT EXISTS idx_chat_turns_session ON chat_turns(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_turns_timestamp ON chat_turns(timestamp);
  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_subagent_messages_subagent ON subagent_messages(subagent_id);
`)

// Auto-migration untuk kolom baru jika tabel sudah ada sebelumnya
try {
  const chatTurnsCols = sqlite.prepare(`PRAGMA table_info(chat_turns)`).all().map(c => c.name)
  if (!chatTurnsCols.includes('created_at')) {
    sqlite.exec(`ALTER TABLE chat_turns ADD COLUMN created_at INTEGER`)
  }
  if (!chatTurnsCols.includes('updated_at')) {
    sqlite.exec(`ALTER TABLE chat_turns ADD COLUMN updated_at INTEGER`)
  }
} catch (err) {
  console.warn('[DB Store] Error running migration on chat_turns:', err.message)
}

/**
 * Generic Table Helper untuk menyediakan API CRUD fleksibel
 */
class SqliteTable {
  constructor(tableName, idCol = 'id') {
    this.tableName = tableName
    this.idCol = idCol
  }

  _parseJsonFields(row) {
    if (!row) return null
    const res = { ...row }
    for (const key of Object.keys(res)) {
      if (key === 'vector' || key === 'data') {
        if (typeof res[key] === 'string') {
          try {
            res[key] = JSON.parse(res[key])
          } catch (_) {}
        }
      }
    }
    return res
  }

  _serializeJsonFields(obj) {
    const res = { ...obj }
    for (const key of Object.keys(res)) {
      if (key === 'vector' || key === 'data') {
        if (typeof res[key] === 'object' && res[key] !== null) {
          res[key] = JSON.stringify(res[key])
        }
      }
    }
    return res
  }

  getAll() {
    const rows = sqlite.prepare(`SELECT * FROM ${this.tableName} ORDER BY rowid ASC`).all()
    return rows.map((r) => this._parseJsonFields(r))
  }

  getById(id) {
    const row = sqlite.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.idCol} = ?`).get(String(id))
    return this._parseJsonFields(row)
  }

  insert(item) {
    const record = {
      id: item.id || item.pairId || item.userId || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: item.createdAt || item.timestamp || Date.now(),
      ...item
    }

    const serialized = this._serializeJsonFields(record)
    const keys = Object.keys(serialized)
    const placeholders = keys.map(() => '?').join(', ')
    const values = Object.values(serialized)

    // Mapping camelCase to snake_case jika diperlukan atau gunakan nama kolom asli
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (${keys.map(k => this._toSnake(k)).join(', ')})
      VALUES (${placeholders})
    `)

    stmt.run(...values)
    return record
  }

  insertBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return []
    const insertMany = sqlite.transaction((rows) => {
      const results = []
      for (const row of rows) {
        results.push(this.insert(row))
      }
      return results
    })
    return insertMany(items)
  }

  update(id, updates) {
    const existing = this.getById(id)
    if (!existing) return null

    const updated = { ...existing, ...updates, updatedAt: Date.now() }
    this.insert(updated)
    return updated
  }

  delete(id) {
    const info = sqlite.prepare(`DELETE FROM ${this.tableName} WHERE ${this.idCol} = ?`).run(String(id))
    return info.changes > 0
  }

  clear() {
    sqlite.prepare(`DELETE FROM ${this.tableName}`).run()
  }

  count() {
    const res = sqlite.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`).get()
    return res?.count || 0
  }

  _toSnake(str) {
    // Normalisasi properti umum ke skema SQLite
    const map = {
      sessionId: 'session_id',
      sessionTitle: 'session_title',
      userText: 'user_text',
      aiText: 'ai_text',
      combinedText: 'combined_text',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      docName: 'doc_name',
      chunkIndex: 'chunk_index',
      userId: 'user_id',
      sarcasmLevel: 'sarcasm_level',
      lastEvaluation: 'last_evaluation',
      evalCount: 'eval_count',
      turnCount: 'turn_count',
      parentSessionId: 'parent_session_id',
      subagentId: 'subagent_id',
      taskId: 'task_id',
      stepIndex: 'step_index'
    }
    return map[str] || str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }
}

/**
 * Export seluruh isi database SQLite ke objek JSON
 */
export function exportFullDatabase() {
  const tables = {
    config: dbStore.config.getAll(),
    memories: dbStore.memories.getAll(),
    sessions: dbStore.sessions.getAll(),
    chatTurns: dbStore.chatTurns.getAll(),
    chatArchives: dbStore.chatArchives.getAll(),
    documents: dbStore.documents.getAll(),
    relationships: dbStore.relationships.getAll(),
    subagents: dbStore.subagents.getAll(),
    subagentMessages: dbStore.subagentMessages.getAll(),
    learnedSkills: dbStore.learnedSkills.getAll(),
    agentTasks: dbStore.agentTasks.getAll(),
    agentTaskSteps: dbStore.agentTaskSteps.getAll()
  }

  return {
    app: 'MARK',
    version: '5.0.0',
    exportedAt: new Date().toISOString(),
    tables
  }
}

/**
 * Import/Restore dump JSON (baik format V4 maupun format V5) ke database SQLite
 */
export function restoreFullDatabase(dumpData, { overwrite = true } = {}) {
  if (!dumpData || typeof dumpData !== 'object') {
    throw new Error('Format data backup tidak valid.')
  }

  const rawTables = dumpData.tables || dumpData
  const results = {}

  // Map nama tabel dari Dexie V4 ke skema SQLite V5
  const tableMapping = {
    config: dbStore.config,
    memory: dbStore.memories,
    memories: dbStore.memories,
    sessions: dbStore.sessions,
    chatTurns: dbStore.chatTurns,
    chatArchive: dbStore.chatArchives,
    chatArchives: dbStore.chatArchives,
    documents: dbStore.documents,
    relationships: dbStore.relationships,
    subagents: dbStore.subagents,
    subagent_messages: dbStore.subagentMessages,
    subagentMessages: dbStore.subagentMessages,
    learnedSkills: dbStore.learnedSkills,
    agentTasks: dbStore.agentTasks,
    agentTaskSteps: dbStore.agentTaskSteps
  }

  const restoreTransaction = sqlite.transaction(() => {
    for (const [key, items] of Object.entries(rawTables)) {
      const targetStore = tableMapping[key]
      if (targetStore && Array.isArray(items)) {
        if (overwrite) {
          targetStore.clear()
        }
        for (const item of items) {
          targetStore.insert(item)
        }
        results[key] = items.length
      }
    }
  })

  restoreTransaction()
  return { success: true, imported: results }
}

export const dbStore = {
  config: new SqliteTable('config'),
  memories: new SqliteTable('memories'),
  sessions: new SqliteTable('sessions'),
  chatTurns: new SqliteTable('chat_turns'),
  chatArchives: new SqliteTable('chat_archives'),
  documents: new SqliteTable('documents'),
  relationships: new SqliteTable('relationships', 'user_id'),
  subagents: new SqliteTable('subagents'),
  subagentMessages: new SqliteTable('subagent_messages'),
  learnedSkills: new SqliteTable('learned_skills'),
  agentTasks: new SqliteTable('agent_tasks'),
  agentTaskSteps: new SqliteTable('agent_task_steps'),
  exportFullDatabase,
  restoreFullDatabase
}