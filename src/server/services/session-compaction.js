import { randomUUID } from 'node:crypto'
import { countTokens } from 'gpt-tokenizer'
import { dbStore } from '../memory/db-store.js'
import { contextMessageId, contextMessageHash } from '../../shared/compaction-state.js'

const fail = (message) => {
  throw Object.assign(new Error(message), { status: 409 })
}
export function compactionOperation(sessionId, operation, input = {}) {
  const id = String(sessionId)
  return dbStore.sqlite.transaction(() => {
    const row = dbStore.sessionCompact.getById(id) || { sessionId: id, revision: 0 }
    if (operation === 'read') return row
    const session = dbStore.sessions.getById(id)
    if (!session) fail('Percakapan compacting tidak ditemukan.')
    const revision = Number(row.revision || 0)
    if (input.revision !== revision)
      fail('Checkpoint compacting berubah. Muat ulang sebelum melanjutkan.')
    const save = (changes) =>
      dbStore.sessionCompact.update(id, changes) ||
      dbStore.sessionCompact.insert({ sessionId: id, ...changes })
    if (operation === 'begin') {
      if (!input.key || !Number.isInteger(input.parts) || input.parts < 1)
        fail('Rencana compacting tidak valid.')
      const pending =
        row.pending?.key === input.key
          ? row.pending
          : {
              id: randomUUID(),
              key: input.key,
              parts: input.parts,
              next: 0,
              summary: row.summaryBlock || '',
              proofs: input.proofs || {}
            }
      return save({ pending, revision: revision + 1 })
    }
    const pending = row.pending
    if (!pending || pending.id !== input.jobId) fail('Pekerjaan compacting sudah berubah.')
    if (operation === 'discard') return save({ pending: null, revision: revision + 1 })
    if (operation === 'part') {
      if (
        input.index !== pending.next ||
        typeof input.summary !== 'string' ||
        !input.summary.trim() ||
        countTokens(input.summary) > 8192
      )
        fail('Bagian ringkasan tidak lengkap, terlalu panjang, atau urutannya berubah.')
      return save({
        pending: { ...pending, next: pending.next + 1, summary: input.summary },
        revision: revision + 1
      })
    }
    if (operation !== 'commit' || pending.next !== pending.parts) fail('Ringkasan belum selesai.')
    if (
      !Number.isFinite(input.beforeTokens) ||
      !Number.isFinite(input.afterTokens) ||
      !Number.isFinite(input.targetTokens) ||
      input.afterTokens < 0 ||
      input.targetTokens <= 0 ||
      !input.checkpoint?.messages ||
      !input.checkpoint?.tools ||
      input.afterTokens >= input.beforeTokens ||
      input.afterTokens >= input.targetTokens
    )
      fail('Compacting belum mengurangi konteks ke anggaran yang aman.')
    const messages = Array.isArray(session.data) ? session.data : []
    for (const [key, hash] of Object.entries(pending.proofs || {})) {
      const message = messages.find((m, i) => contextMessageId(m, i) === key)
      if (!message || contextMessageHash(message) !== hash)
        fail('Riwayat yang dirangkum berubah. Ringkasan belum diterapkan.')
    }
    return save({
      summaryBlock: pending.summary,
      lastCompactedMessageId: null,
      lastCompactedAt: Date.now(),
      totalTokens: input.afterTokens,
      checkpoint: input.checkpoint,
      pending: null,
      revision: revision + 1
    })
  })()
}
