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
    updated_at INTEGER
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
    reasoning TEXT,
    new_relational_memory TEXT,
    last_evaluation INTEGER,
    eval_count INTEGER DEFAULT 0,
    last_chat_index INTEGER DEFAULT 0
  );

  -- 8. Sub-Agents
  CREATE TABLE IF NOT EXISTS subagents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    allowed_tools TEXT,
    status TEXT DEFAULT 'running',
    turn_count INTEGER DEFAULT 0,
    parent_session_id TEXT DEFAULT '1',
    parent_session_title TEXT DEFAULT '',
    final_answer TEXT,
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
    thought TEXT,
    action TEXT,
    tool_calls TEXT,
    tool_call_id TEXT,
    name TEXT,
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
    current_step_index INTEGER DEFAULT 0,
    active_step_id TEXT,
    constraints TEXT,
    context_summary TEXT,
    artifact_root TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    completed_at INTEGER,
    error TEXT
  );

  -- 12. Agent Task Steps
  CREATE TABLE IF NOT EXISTS agent_task_steps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_index INTEGER DEFAULT 0,
    title TEXT DEFAULT '',
    objective TEXT DEFAULT '',
    deliverable TEXT DEFAULT '',
    acceptance_criteria TEXT,
    status TEXT DEFAULT 'pending',
    input_summary TEXT,
    output_summary TEXT,
    artifact_path TEXT,
    validation TEXT,
    content_hash TEXT,
    attempts INTEGER DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER,
    error TEXT
  );

  -- Indeks untuk pencarian cepat
  CREATE INDEX IF NOT EXISTS idx_chat_turns_session ON chat_turns(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_turns_timestamp ON chat_turns(timestamp);
  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_subagent_messages_subagent ON subagent_messages(subagent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task ON agent_task_steps(task_id);
`)

// Helper migrasi kolom otomatis jika tabel SQLite sudah ada dari versi sebelumnya
function ensureTableColumns(tableName, requiredColumns) {
  try {
    const existingCols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name)
    for (const [colName, colType] of Object.entries(requiredColumns)) {
      if (!existingCols.includes(colName)) {
        sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`)
      }
    }
  } catch (err) {
    console.warn(`[DB Store] Auto-migration error on ${tableName}:`, err.message)
  }
}

ensureTableColumns('chat_turns', {
  created_at: 'INTEGER',
  updated_at: 'INTEGER'
})

ensureTableColumns('relationships', {
  reasoning: 'TEXT',
  new_relational_memory: 'TEXT',
  last_chat_index: 'INTEGER DEFAULT 0'
})

ensureTableColumns('subagents', {
  allowed_tools: 'TEXT',
  final_answer: 'TEXT',
  parent_session_id: "TEXT DEFAULT '1'",
  parent_session_title: 'TEXT'
})

ensureTableColumns('subagent_messages', {
  thought: 'TEXT',
  action: 'TEXT',
  tool_calls: 'TEXT',
  tool_call_id: 'TEXT',
  name: 'TEXT'
})

ensureTableColumns('agent_tasks', {
  current_step_index: 'INTEGER DEFAULT 0',
  active_step_id: 'TEXT',
  constraints: 'TEXT',
  context_summary: 'TEXT',
  artifact_root: 'TEXT',
  retry_count: 'INTEGER DEFAULT 0',
  max_retries: 'INTEGER DEFAULT 2',
  completed_at: 'INTEGER',
  error: 'TEXT'
})

ensureTableColumns('agent_task_steps', {
  objective: 'TEXT',
  deliverable: 'TEXT',
  acceptance_criteria: 'TEXT',
  input_summary: 'TEXT',
  output_summary: 'TEXT',
  artifact_path: 'TEXT',
  validation: 'TEXT',
  content_hash: 'TEXT',
  attempts: 'INTEGER DEFAULT 0',
  started_at: 'INTEGER',
  completed_at: 'INTEGER',
  error: 'TEXT'
})

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

    // Normalisasi otomatis snake_case ke camelCase untuk konsistensi di frontend
    for (const key of Object.keys(row)) {
      if (key.includes('_')) {
        const camelKey = this._toCamel(key)
        if (res[camelKey] === undefined) {
          res[camelKey] = row[key]
        }
      }
    }

    for (const key of Object.keys(res)) {
      if (typeof res[key] === 'string') {
        const str = res[key].trim()
        if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
          try {
            res[key] = JSON.parse(str)
          } catch (_) {}
        }
      }
    }
    return res
  }

  _serializeJsonFields(obj) {
    const res = { ...obj }
    for (const key of Object.keys(res)) {
      if (typeof res[key] === 'object' && res[key] !== null) {
        res[key] = JSON.stringify(res[key])
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
    const raw = { ...item }
    // Normalisasi alias primary key lama dari Dexie (pairId -> id)
    let id = raw.id !== undefined && raw.id !== null ? raw.id : (raw.pairId || raw.userId || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
    if (id === 1 || id === 1.0 || id === '1' || id === '1.0' || id === '1.00') {
      id = '1'
    }
    delete raw.id
    delete raw.pairId // Hapus key lama agar tidak mencoba insert ke kolom yang tidak ada

    if (raw.sessionId === 1 || raw.sessionId === 1.0 || raw.sessionId === '1' || raw.sessionId === '1.0' || raw.sessionId === '1.00') {
      raw.sessionId = '1'
    }

    // Penanganan khusus untuk tabel config jika item berupa objek key-value langsung (bukan { id, data })
    if (this.tableName === 'config' && raw.data === undefined) {
      raw.data = { ...raw }
    }

    const record = {
      id: String(id),
      createdAt: raw.createdAt || raw.timestamp || Date.now(),
      updatedAt: raw.updatedAt || Date.now(),
      ...raw
    }

    const serialized = this._serializeJsonFields(record)
    // Filter hanya field yang ada di skema kolom tabel
    const tableCols = sqlite.prepare(`PRAGMA table_info(${this.tableName})`).all().map(c => c.name)
    const validEntries = Object.entries(serialized)
      .map(([k, v]) => [this._toSnake(k), v])
      .filter(([colName]) => tableCols.includes(colName))

    const keys = validEntries.map(([k]) => k)
    const placeholders = keys.map(() => '?').join(', ')
    const values = validEntries.map(([, v]) => v)

    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (${keys.join(', ')})
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

  _toCamel(str) {
    return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase())
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
      lastChatIndex: 'last_chat_index',
      turnCount: 'turn_count',
      parentSessionId: 'parent_session_id',
      subagentId: 'subagent_id',
      toolCalls: 'tool_calls',
      toolCallId: 'tool_call_id',
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
    chat_turns: dbStore.chatTurns,
    chatArchive: dbStore.chatArchives,
    chatArchives: dbStore.chatArchives,
    chat_archives: dbStore.chatArchives,
    documents: dbStore.documents,
    relationships: dbStore.relationships,
    subagents: dbStore.subagents,
    subagent_messages: dbStore.subagentMessages,
    subagentMessages: dbStore.subagentMessages,
    learnedSkills: dbStore.learnedSkills,
    learned_skills: dbStore.learnedSkills,
    agentTasks: dbStore.agentTasks,
    agent_tasks: dbStore.agentTasks,
    agentTaskSteps: dbStore.agentTaskSteps,
    agent_task_steps: dbStore.agentTaskSteps
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

    // Jika dump memuat config, sinkronisasikan juga ke config.json server
    const restoredConfig = rawTables.config
    if (Array.isArray(restoredConfig) && restoredConfig.length > 0) {
      try {
        const confObj = restoredConfig[0]
        const finalConf = confObj.data ? (typeof confObj.data === 'string' ? JSON.parse(confObj.data) : confObj.data) : confObj
        const cfgPath = path.join(CONFIG_DIR, 'config.json')
        fs.writeFileSync(cfgPath, JSON.stringify(finalConf, null, 2), 'utf-8')
      } catch (_) {}
    }
  })

  restoreTransaction()
  return { success: true, imported: results }
}

/**
 * Reset seluruh data memori dan riwayat AI (semua tabel kecuali tabel 'config')
 */
export function resetAllExceptConfig() {
  const resetTransaction = sqlite.transaction(() => {
    // 1. Bersihkan tabel memori & percakapan
    dbStore.memories.clear()
    dbStore.sessions.clear()
    dbStore.chatTurns.clear()
    dbStore.chatArchives.clear()
    dbStore.documents.clear()
    dbStore.subagents.clear()
    dbStore.subagentMessages.clear()
    dbStore.learnedSkills.clear()
    dbStore.agentTasks.clear()
    dbStore.agentTaskSteps.clear()

    // 2. Reset hubungan / sifat relasional ke nilai default awal
    dbStore.relationships.clear()
    dbStore.relationships.insert({
      user_id: 'owner',
      warmth: 0.5,
      sarcasm_level: 0.5,
      trust: 0.5,
      energy: 0.5,
      obedience: 0.8,
      reasoning: 'Karakter dan memori AI direset ke pengaturan awal.',
      new_relational_memory: '',
      last_evaluation: null,
      eval_count: 0,
      last_chat_index: 0
    })

    // 3. Buat sesi awal default
    dbStore.sessions.insert({
      id: '1',
      title: 'Main Thread',
      data: JSON.stringify([]),
      timestamp: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now()
    })
  })

  resetTransaction()
  return { success: true, message: 'Seluruh data AI berhasil direset ke kondisi awal (konfigurasi dipertahankan).' }
}

export const dbStore = {
  sqlite,
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
  restoreFullDatabase,
  resetAllExceptConfig
}