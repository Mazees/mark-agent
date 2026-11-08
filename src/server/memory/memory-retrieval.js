import { Worker } from 'node:worker_threads'
import { sqlite, dbStore } from './db-store.js'
import { vectorBuffer } from './memory-search-sql.js'
import { parseMemorySearch } from '../../shared/memory-search.js'

const allowedSources = ['memories', 'archives', 'chatTurns']
const memoryTypes = ['profile', 'preference', 'notes', 'learn']
const pending = new Map()
const indexing = new Map()
const readCore = sqlite.prepare(`
  SELECT id, type, summary, memory, confidence, created_at AS createdAt, updated_at AS updatedAt
  FROM memories WHERE type IN ('profile', 'preference') ORDER BY rowid
`)
let worker
let state = { worker: 'idle', extension: false, model: 'idle' }
let nextId = 0
let writeGeneration = 0
let writing = false

export const memoryStatus = () => ({ ...state })

function ensureWorker() {
  if (worker) return worker
  const instance = new Worker(new URL('./memory-worker.js', import.meta.url), {
    workerData: { dbPath: sqlite.name },
    execArgv: []
  })
  worker = instance
  state = { worker: 'starting', extension: false, model: 'warming' }
  instance.unref()
  const fail = () => {
    if (worker !== instance) return
    worker = null
    state = { worker: 'failed', extension: false, model: 'failed' }
    for (const job of pending.values()) job.reject(new Error('Worker memori berhenti.'))
  }
  instance.on('message', ({ id, result, error, status }) => {
    if (worker !== instance) return
    if (status) state = status
    const job = pending.get(id)
    if (job) {
      if (error) job.reject(new Error(error))
      else job.resolve(result)
    }
  })
  instance.on('error', fail)
  instance.on('exit', fail)
  return instance
}

function requestWorker(operation, input = {}, { signal, timeoutMs = 8000 } = {}) {
  signal?.throwIfAborted()
  if (pending.size >= 32) throw new Error('Pencarian memori sedang sibuk.')
  const instance = ensureWorker()
  const id = ++nextId
  const cancellation = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  return new Promise((resolve, reject) => {
    const finish = (callback, value, cancel = false) => {
      if (cancel) Atomics.store(new Int32Array(cancellation), 0, 1)
      pending.delete(id)
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (!pending.size) instance.unref()
      callback(value)
    }
    const abort = () => finish(reject, signal.reason, true)
    const timer = setTimeout(
      () => finish(reject, new Error('Pencarian memori melewati batas waktu.'), true),
      timeoutMs
    )
    instance.ref()
    pending.set(id, {
      resolve: (value) => finish(resolve, value),
      reject: (error) => finish(reject, error, true)
    })
    signal?.addEventListener('abort', abort, { once: true })
    try {
      instance.postMessage({ id, operation, input, cancellation })
    } catch (error) {
      finish(reject, error, true)
    }
  })
}

let preparing
export async function prepareMemory() {
  if (state.model === 'ready' && state.extension) return memoryStatus()
  if (!preparing) {
    preparing = requestWorker('prepare').finally(() => {
      preparing = null
    })
  }
  await preparing
  return memoryStatus()
}

export async function stopMemoryWorker() {
  const current = worker
  worker = null
  state = { worker: 'idle', extension: false, model: 'idle' }
  invalidateMemoryWork()
  if (current) await current.terminate()
}

export function invalidateMemoryWork() {
  writeGeneration++
  indexing.clear()
  for (const job of pending.values()) job.reject(new Error('Data memori telah berubah.'))
  worker?.postMessage({ operation: 'clear-cache' })
}

function normalizeSearch(options) {
  const query = typeof options.query === 'string' ? options.query.trim().slice(0, 1000) : ''
  const sources = options.sources ?? allowedSources
  if (!Array.isArray(sources) || sources.some((source) => !allowedSources.includes(source)))
    throw new TypeError('Sumber pencarian memori tidak valid.')
  const types = options.types
  if (types != null && (!Array.isArray(types) || types.some((type) => !memoryTypes.includes(type))))
    throw new TypeError('Jenis memori tidak valid.')
  const { limit, threshold } = parseMemorySearch(
    `||${options.threshold ?? ''}||${options.limit ?? ''}`
  )
  const sessionId = options.sessionId == null ? null : String(options.sessionId)
  return {
    query,
    sources: [...new Set(sources)],
    types: types && [...new Set(types)],
    limit,
    threshold,
    sessionId,
    semanticOnly: options.semanticOnly === true
  }
}

export function searchMemory(options = {}, signal) {
  return requestWorker('search', normalizeSearch(options), { signal })
}

export function searchToolMemory(rawQuery, signal) {
  return searchMemory(
    {
      ...parseMemorySearch(rawQuery),
      sources: ['memories', 'chatTurns'],
      types: ['notes', 'learn']
    },
    signal
  )
}

export async function memoryContext(query, signal, lexicalQuery = query) {
  signal?.throwIfAborted()
  const started = performance.now()
  const memories = readCore.all()
  const coreMs = performance.now() - started
  if (typeof query !== 'string' || !query.trim())
    return { memories, archives: [], turnPairs: [], mode: 'core', timings: { coreMs } }
  try {
    const { hits, mode, timings } = await requestWorker(
      'search',
      {
        ...normalizeSearch({ query, sources: ['archives', 'chatTurns'], limit: 3 }),
        lexicalQuery: typeof lexicalQuery === 'string' ? lexicalQuery.trim().slice(0, 1000) : undefined,
        thresholds: { archives: 0.25, chatTurns: 0.3 }
      },
      { signal, timeoutMs: 8000 }
    )
    return {
      memories,
      archives: hits.archives,
      turnPairs: hits.chatTurns,
      mode,
      timings: { coreMs, ...timings }
    }
  } catch (error) {
    if (signal?.aborted) throw error
    return { memories, archives: [], turnPairs: [], mode: 'unavailable', timings: { coreMs } }
  }
}

export function memoryClusters(threshold, signal) {
  return requestWorker(
    'clusters',
    {
      threshold: Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.6
    },
    { signal, timeoutMs: 30000 }
  )
}

export function generateMemoryVector(text, signal) {
  if (typeof text !== 'string' || !text.trim()) return Promise.resolve(null)
  return requestWorker('embed', { text: text.trim().slice(0, 1000) }, { signal })
}

const stores = {
  memories: { store: dbStore.memories, table: 'memories', column: 'memory', key: 'memory' },
  archives: {
    store: dbStore.chatArchives,
    table: 'chat_archives',
    column: 'summary',
    key: 'summary'
  },
  chatTurns: {
    store: dbStore.chatTurns,
    table: 'chat_turns',
    column: 'combined_text',
    key: 'combinedText'
  }
}

async function writePendingEmbeddings() {
  if (writing) return
  writing = true
  while (indexing.size) {
    const [slot, job] = indexing.entries().next().value
    const { source, id, text, generation } = job
    const { table, column } = stores[source]
    try {
      const vector = await requestWorker(
        'embed',
        { text: text.trim().slice(0, 1000) },
        { timeoutMs: 30000 }
      )
      if (generation !== writeGeneration || indexing.get(slot) !== job || !vectorBuffer(vector))
        continue
      sqlite
        .prepare(
          `
        UPDATE ${table} SET vector = ?
        WHERE id = ? AND ${column} = ? AND vector IS NULL
      `
        )
        .run(JSON.stringify(vector), id, text)
    } catch {
      // The row remains available to keyword search if embedding is unavailable.
    } finally {
      if (indexing.get(slot) === job) indexing.delete(slot)
    }
  }
  writing = false
}

function queueEmbedding(source, record) {
  const text = record[stores[source].key]
  if (typeof text !== 'string' || !text.trim() || vectorBuffer(record.vector)) return
  const id = String(record.id)
  const slot = `${source}:${id}`
  if (indexing.get(slot)?.text === text) return
  indexing.set(slot, { source, id, text, generation: writeGeneration })
  void writePendingEmbeddings()
}

function saveSource(source, item) {
  const { store, key, column } = stores[source]
  const id = item.id ?? item.pairId
  const previous = id == null ? null : store.getById(id)
  let text = item[key] ?? item[column] ?? previous?.[key]
  if (source === 'chatTurns') {
    const userText = item.userText ?? item.user_text
    const aiText = item.aiText ?? item.ai_text
    const componentsChanged =
      (userText != null && userText !== previous?.userText) ||
      (aiText != null && aiText !== previous?.aiText)
    if (item[key] == null && item[column] == null && componentsChanged)
      text = `[User]: ${userText ?? previous?.userText ?? ''}\n[Mark]: ${aiText ?? previous?.aiText ?? ''}`
  }
  const supplied = item.vector
  const vector =
    previous && text !== previous[key]
      ? null
      : vectorBuffer(supplied)
        ? supplied
        : vectorBuffer(previous?.vector)
          ? previous.vector
          : null
  return store.insert({ ...previous, ...item, [key]: text, vector })
}

export function saveSearchSource(source, item) {
  const row = saveSource(source, item)
  queueEmbedding(source, row)
  return row
}

export function saveSearchTurns(items) {
  const rows = sqlite.transaction(() => items.map((item) => saveSource('chatTurns', item)))()
  for (const row of rows) queueEmbedding('chatTurns', row)
  return rows
}
