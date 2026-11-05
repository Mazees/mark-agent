export function createCodingStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS coding_records (
    kind TEXT NOT NULL, id TEXT NOT NULL, session_id TEXT NOT NULL,
    root TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS idx_coding_session ON coding_records(kind,session_id);`)
  const get = db.prepare('SELECT data FROM coding_records WHERE kind=? AND id=?')
  const put = db.prepare('INSERT OR REPLACE INTO coding_records VALUES (?,?,?,?,?,?)')
  return {
    get(kind, id) {
      const row = get.get(kind, String(id))
      return row ? JSON.parse(row.data) : null
    },
    put(kind, id, data) {
      const record = { ...data, id: String(id), updatedAt: Date.now() }
      put.run(
        kind,
        String(id),
        String(data.sessionId),
        data.root || '',
        JSON.stringify(record),
        record.updatedAt
      )
      return record
    },
    list(kind, sessionId) {
      const rows =
        sessionId == null
          ? db
              .prepare('SELECT data FROM coding_records WHERE kind=? ORDER BY updated_at DESC')
              .all(kind)
          : db
              .prepare(
                'SELECT data FROM coding_records WHERE kind=? AND session_id=? ORDER BY updated_at DESC'
              )
              .all(kind, String(sessionId))
      return rows.map((row) => JSON.parse(row.data))
    },
    export() {
      return db
        .prepare('SELECT * FROM coding_records')
        .all()
        .map((row) => ({ kind: row.kind, ...JSON.parse(row.data) }))
    },
    restore(records, overwrite) {
      db.transaction(() => {
        if (overwrite) db.prepare('DELETE FROM coding_records').run()
        for (const { kind, ...record } of records || []) {
          if (!['run', 'memory', 'worktree', 'terminal', 'git-workspace'].includes(kind)) continue
          if (['running', 'starting'].includes(record.status)) record.status = 'interrupted'
          if (kind === 'run' && record.beforeOid && !record.afterOid) {
            record.captureStatus = 'failed'
            record.captureError = 'Checkpoint akhir tidak tersedia setelah pemulihan database.'
            record.status = 'interrupted'
            record.finishedAt ||= Date.now()
          }
          if (kind === 'worktree') record.active = false
          this.put(kind, record.id, record)
        }
      })()
    }
  }
}
