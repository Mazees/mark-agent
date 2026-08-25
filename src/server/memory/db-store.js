import path from 'path'
import os from 'os'
import fs from 'fs'

const DATA_DIR = path.join(os.homedir(), '.config', 'mark-agent', 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

class JsonTable {
  constructor(name) {
    this.name = name
    this.filePath = path.join(DATA_DIR, `${name}.json`)
    this.cache = null
  }

  _load() {
    if (this.cache !== null) return this.cache
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        this.cache = JSON.parse(raw)
      } else {
        this.cache = []
      }
    } catch (_) {
      this.cache = []
    }
    return this.cache
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache || [], null, 2), 'utf-8')
    } catch (_) {}
  }

  getAll() {
    return [...this._load()]
  }

  getById(id) {
    const list = this._load()
    return list.find((item) => String(item.id) === String(id) || String(item.pairId) === String(id)) || null
  }

  insert(item) {
    const list = this._load()
    const record = {
      id: item.id || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...item
    }
    list.push(record)
    this._save()
    return record
  }

  insertBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return []
    const list = this._load()
    const records = items.map((item) => ({
      id: item.id || `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...item
    }))
    list.push(...records)
    this._save()
    return records
  }

  update(id, updates) {
    const list = this._load()
    const idx = list.findIndex((item) => String(item.id) === String(id) || String(item.pairId) === String(id))
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: Date.now() }
      this._save()
      return list[idx]
    }
    return null
  }

  delete(id) {
    let list = this._load()
    const initialLen = list.length
    list = list.filter((item) => String(item.id) !== String(id) && String(item.pairId) !== String(id))
    this.cache = list
    this._save()
    return list.length < initialLen
  }

  count() {
    return this._load().length
  }
}

export const dbStore = {
  memories: new JsonTable('memories'),
  chatTurns: new JsonTable('chat_turns'),
  chatArchives: new JsonTable('chat_archives'),
  sessions: new JsonTable('sessions'),
  subagents: new JsonTable('subagents'),
  subagentMessages: new JsonTable('subagent_messages'),
  relationships: new JsonTable('relationships')
}
