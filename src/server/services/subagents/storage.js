import { randomUUID } from 'node:crypto'

export const runtimeTables = [
  'subagent_jobs',
  'subagent_runs',
  'subagent_inbox',
  'subagent_reports'
]
export const terminal = new Set(['completed', 'failed', 'cancelled'])
export const uid = (prefix) => `${prefix}_${randomUUID()}`

export function createSubagentSchema(db) {
  for (const table of runtimeTables) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY, agent_id TEXT, job_id TEXT, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS idx_${table}_job ON ${table}(job_id);
       CREATE INDEX IF NOT EXISTS idx_${table}_agent ON ${table}(agent_id, status);`)
  }
  const columns = db.prepare('PRAGMA table_info(subagent_messages)').all()
  for (const name of ['job_id', 'run_id']) {
    if (!columns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE subagent_messages ADD COLUMN ${name} TEXT`)
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_subagent_messages_job ON subagent_messages(job_id)')
}

export function createRuntimeStore(db) {
  const assert = (table) => {
    if (!runtimeTables.includes(table)) throw new Error('Tabel runtime tidak valid.')
  }
  return {
    all(table) {
      assert(table)
      return db
        .prepare(`SELECT data FROM ${table} ORDER BY created_at, rowid`)
        .all()
        .map((row) => JSON.parse(row.data))
    },
    get(table, id) {
      assert(table)
      const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id)
      return row ? JSON.parse(row.data) : null
    },
    put(table, value) {
      assert(table)
      const record = { ...value, updatedAt: Date.now() }
      db.prepare(
        `INSERT INTO ${table} (id, agent_id, job_id, status, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        agent_id=excluded.agent_id, job_id=excluded.job_id, status=excluded.status,
        updated_at=excluded.updated_at, data=excluded.data`
      ).run(
        record.id,
        record.agentId || null,
        record.jobId || record.id,
        record.status,
        record.createdAt || Date.now(),
        record.updatedAt,
        JSON.stringify(record)
      )
      return record
    },
    messages(jobId) {
      return db
        .prepare('SELECT * FROM subagent_messages WHERE job_id = ? ORDER BY rowid')
        .all(jobId)
        .map((row) => {
          for (const key of ['content', 'tool_calls', 'action']) {
            try {
              row[key] = JSON.parse(row[key])
            } catch {
              /* Plain text is supported. */
            }
          }
          return { ...row, subagentId: row.subagent_id, jobId: row.job_id, runId: row.run_id }
        })
    },
    addMessage(job, runId, message) {
      const record = { id: uid('msg'), timestamp: Date.now(), ...message }
      const encode = (value) =>
        value == null ? null : typeof value === 'string' ? value : JSON.stringify(value)
      db.prepare(
        `INSERT INTO subagent_messages
        (id, subagent_id, job_id, run_id, sender, role, content, thought, action, tool_calls, tool_call_id, name, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        record.id,
        job.agentId,
        job.id,
        runId,
        record.sender || 'subagent',
        record.role || 'assistant',
        encode(record.content) || '',
        encode(record.thought),
        encode(record.action),
        encode(record.tool_calls),
        record.tool_call_id || null,
        record.name || null,
        record.timestamp
      )
      return record
    }
  }
}
