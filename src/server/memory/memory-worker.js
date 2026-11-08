import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { createMemorySearch, vectorBuffer } from './memory-search-sql.js'

const db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true, timeout: 1000 })
const retrieval = createMemorySearch(db)
let extension = false
let model = 'idle'
let warming
const inFlight = new Map()
const status = () => ({ worker: 'ready', extension, model })
const report = () => parentPort.postMessage({ status: status() })

async function loadExtension() {
  if (extension) return
  try {
    const { load } = await import('sqlite-vec')
    load(db)
    extension = db.prepare('SELECT vec_version() AS version').get().version === 'v0.1.9'
  } catch {
    extension = false
  }
  report()
}
await loadExtension()

async function embed(text) {
  const key = text.trim().slice(0, 1000)
  if (!key) return null
  if (!inFlight.has(key)) {
    const task = import('./vector-engine.js')
      .then(({ generateVector }) => generateVector(key))
      .finally(() => inFlight.delete(key))
    inFlight.set(key, task)
  }
  return inFlight.get(key)
}

function prepare() {
  if (model === 'ready' || warming) return
  model = 'warming'
  report()
  warming = embed('Persiapan pencarian memori.')
    .then((vector) => {
      model = vectorBuffer(vector) ? 'ready' : 'failed'
    })
    .catch(() => {
      model = 'failed'
    })
    .finally(() => {
      warming = null
      report()
    })
}

parentPort.on('message', async ({ id, operation, input, cancellation }) => {
  if (operation === 'clear-cache') {
    retrieval.clearCache()
    return
  }
  const flag = new Int32Array(cancellation)
  const canceled = () => Atomics.load(flag, 0) === 1
  if (canceled()) return
  try {
    let result
    if (operation === 'prepare') {
      await loadExtension()
      prepare()
      result = status()
    } else if (operation === 'embed') {
      await warming
      if (canceled()) return
      result = model === 'ready' ? await embed(input.text) : null
    } else if (operation === 'clusters') {
      if (!extension) throw new Error('Pencarian vektor belum tersedia.')
      result = retrieval.clusters(input.threshold, canceled)
    } else if (operation === 'search') {
      const start = performance.now()
      const vector =
        extension && model === 'ready' && input.query
          ? vectorBuffer(await embed(input.query))
          : null
      if (canceled()) return
      if (input.semanticOnly && !vector) throw new Error('Pencarian vektor belum tersedia.')
      const embedded = performance.now()
      const hits = retrieval.search(input, vector, canceled)
      result = {
        hits,
        mode: vector ? 'hybrid' : 'keyword',
        timings: { embeddingMs: embedded - start, searchMs: performance.now() - embedded }
      }
    }
    if (!canceled()) parentPort.postMessage({ id, result })
  } catch (error) {
    if (!canceled()) parentPort.postMessage({ id, error: error.message })
  }
})

prepare()
