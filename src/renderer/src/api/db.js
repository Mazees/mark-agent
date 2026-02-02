import Dexie from 'dexie'

export const db = new Dexie('mark-db')

db.version(1).stores({
  memory: '++id,type, key, summary, fullMemory, confidence',
  sessions: '++id, title, lastUpdated',
  history: '++id, sessionId, role, content, timestamp'
})

async function insertData(data) {
  try {
    const id = await db.todos.add({
      type: data.type,
      key: data.key,
      summary: data.summary,
      memoryfull: data.memoryfull,
      confidence: data.confidence
    })
    setStatus(`Todo ${todo} with id ${id} added`)
    // ...
  } catch (error) {
    // ...
  }
}
async function editData(data) {
  try {
    const id = await db.todos.add({
      type: data.type,
      key: data.key,
      summary: data.summary,
      memoryfull: data.memoryfull,
      confidence: data.confidence
    })
    setStatus(`Todo ${todo} with id ${id} added`)
    // ...
  } catch (error) {
    // ...
  }
}
