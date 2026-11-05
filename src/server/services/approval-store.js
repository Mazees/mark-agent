import { randomUUID } from 'node:crypto'

export function createApprovalStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_grants (
      id TEXT PRIMARY KEY, session_id TEXT, tool TEXT NOT NULL, kind TEXT NOT NULL,
      target TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_approval_audit (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, job_id TEXT,
      action_hash TEXT NOT NULL, decision TEXT NOT NULL, source TEXT NOT NULL,
      reason TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `)
  return {
    grants(sessionId) {
      return db
        .prepare('SELECT * FROM tool_grants WHERE session_id IS NULL OR session_id=?')
        .all(String(sessionId))
    },
    allGrants() {
      return db.prepare('SELECT * FROM tool_grants').all()
    },
    getAudit(id) {
      return db.prepare('SELECT * FROM tool_approval_audit WHERE id=?').get(id)
    },
    grant({ sessionId = null, tool, kind, target }) {
      const existing = db
        .prepare(
          'SELECT * FROM tool_grants WHERE session_id IS ? AND tool=? AND kind=? AND target=?'
        )
        .get(sessionId, tool, kind, target)
      if (existing) return existing
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        tool,
        kind,
        target,
        created_at: Date.now()
      }
      db.prepare(
        'INSERT INTO tool_grants VALUES (@id,@session_id,@tool,@kind,@target,@created_at)'
      ).run(row)
      return row
    },
    remove(id) {
      db.prepare('DELETE FROM tool_grants WHERE id=?').run(id)
    },
    migrateFolder(id, folder, tools) {
      if (this.getAudit(id)) return
      db.transaction(() => {
        for (const tool of tools) this.grant({ tool, kind: 'folder', target: folder })
        this.audit({
          id,
          sessionId: '*',
          hash: id.slice(7),
          decision: 'migrated',
          source: 'rule',
          reason: 'Izin folder absolut dari versi sebelumnya dipertahankan.'
        })
      })()
    },
    audit(record) {
      db.prepare('INSERT INTO tool_approval_audit VALUES (?,?,?,?,?,?,?,?)').run(
        record.id,
        record.sessionId,
        record.jobId || null,
        record.hash,
        record.decision,
        record.source,
        record.reason,
        Date.now()
      )
    },
    export() {
      return {
        grants: this.allGrants(),
        audit: db.prepare('SELECT * FROM tool_approval_audit').all()
      }
    },
    restore(data, overwrite = true) {
      if (overwrite) db.exec('DELETE FROM tool_grants; DELETE FROM tool_approval_audit;')
      for (const row of data?.grants || []) {
        if (!['folder', 'action'].includes(row.kind) || !row.id || !row.tool || !row.target)
          continue
        db.prepare('INSERT OR REPLACE INTO tool_grants VALUES (?,?,?,?,?,?)').run(
          row.id,
          row.session_id || null,
          row.tool,
          row.kind,
          row.target,
          row.created_at || Date.now()
        )
      }
      for (const row of data?.audit || []) {
        db.prepare('INSERT OR REPLACE INTO tool_approval_audit VALUES (?,?,?,?,?,?,?,?)').run(
          row.id,
          row.session_id,
          row.job_id || null,
          row.action_hash,
          row.decision,
          row.source,
          row.reason,
          row.created_at
        )
      }
    }
  }
}
