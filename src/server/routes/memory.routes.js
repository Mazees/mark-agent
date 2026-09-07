import { Router, raw } from 'express'
import { dbStore } from '../memory/db-store.js'
import { initOramaIndices } from '../memory/orama-store.js'
import { wsHub } from '../ws-hub.js'

export const memoryRouter = Router()

// 1. Memories
memoryRouter.get('/memories', (_req, res) => {
  res.json({ success: true, data: dbStore.memories.getAll() })
})

memoryRouter.post('/memories', (req, res) => {
  const item = req.body
  const record = dbStore.memories.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.delete('/memories/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.memories.delete(id)
  res.json({ success })
})

// 2. Chat Turns
memoryRouter.get('/turns', (_req, res) => {
  res.json({ success: true, data: dbStore.chatTurns.getAll() })
})

memoryRouter.post('/turns', (req, res) => {
  const item = req.body
  const record = dbStore.chatTurns.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.post('/turns/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.chatTurns.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

// 3. Sessions
memoryRouter.get('/sessions', (_req, res) => {
  res.json({ success: true, data: dbStore.sessions.getAll() })
})

memoryRouter.get('/sessions/:id', (req, res) => {
  const { id } = req.params
  const session = dbStore.sessions.getById(id)
  res.json({ success: true, data: session })
})

memoryRouter.post('/sessions', (req, res) => {
  const item = req.body
  const record = dbStore.sessions.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.post('/sessions/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.sessions.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

memoryRouter.delete('/sessions/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.sessions.delete(id)
  res.json({ success })
})

// 4. Chat Archives
memoryRouter.get('/archives', (_req, res) => {
  res.json({ success: true, data: dbStore.chatArchives.getAll() })
})

memoryRouter.post('/archives', (req, res) => {
  const item = req.body
  const record = dbStore.chatArchives.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.delete('/archives/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.chatArchives.delete(id)
  res.json({ success })
})

// 5. Documents (RAG) & Binary Parser
memoryRouter.get('/documents', (_req, res) => {
  res.json({ success: true, data: dbStore.documents.getAll() })
})

memoryRouter.post('/documents', (req, res) => {
  const item = req.body
  const record = dbStore.documents.insert(item)
  res.json({ success: true, data: record })
})

memoryRouter.post('/documents/batch', (req, res) => {
  const items = req.body || []
  const records = dbStore.documents.insertBatch(items)
  res.json({ success: true, count: records.length, data: records })
})

memoryRouter.delete('/documents/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.documents.delete(id)
  res.json({ success })
})

memoryRouter.post(
  '/documents/parse',
  raw({
    type: [
      'application/octet-stream',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    limit: '50mb'
  }),
  async (req, res) => {
    try {
      const isDocx = req.query.isDocx === 'true'
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Buffer dokumen kosong.' })
      }

      let extractedText = ''
      if (isDocx) {
        const mammothModule = await import('mammoth')
        const extractRaw = mammothModule.extractRawText || mammothModule.default?.extractRawText
        const result = await extractRaw({ buffer })
        extractedText = result.value || ''
      } else {
        const pdfModule = await import('pdf-parse')
        if (pdfModule.PDFParse) {
          const parser = new pdfModule.PDFParse({ data: buffer })
          const textRes = await parser.getText()
          extractedText = typeof textRes === 'string' ? textRes : textRes?.text || ''
        } else if (typeof pdfModule.default === 'function') {
          const pdfData = await pdfModule.default(buffer)
          extractedText = pdfData.text || ''
        }
      }

      if (!extractedText.trim()) {
        return res
          .status(422)
          .json({ success: false, error: 'Tidak ada teks yang dapat diekstraksi dari dokumen.' })
      }

      res.json({ success: true, text: extractedText })
    } catch (err) {
      console.error('[Document Parser Error]:', err)
      res.status(500).json({ success: false, error: `Gagal mem-parse dokumen: ${err.message}` })
    }
  }
)

// 6. Relationships 4D
memoryRouter.get('/relationships/:userId', (req, res) => {
  const { userId } = req.params
  const rel = dbStore.relationships.getById(userId)
  res.json({ success: true, data: rel })
})

memoryRouter.post('/relationships', (req, res) => {
  const item = req.body
  const record = dbStore.relationships.insert(item)
  res.json({ success: true, data: record })
})

// 7. Database Backup & Restore API
memoryRouter.get('/db/export', (_req, res) => {
  try {
    const dump = dbStore.exportFullDatabase()
    res.json({ success: true, data: dump })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/db/restore', async (req, res) => {
  const { dumpData, overwrite = true } = req.body || {}
  if (!dumpData) {
    return res.status(400).json({ success: false, error: 'dumpData tidak boleh kosong' })
  }
  try {
    const result = dbStore.restoreFullDatabase(dumpData, { overwrite })
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), imported: result.imported })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

memoryRouter.post('/db/reset-ai', async (_req, res) => {
  try {
    const result = dbStore.resetAllExceptConfig()
    initOramaIndices().catch(() => {})
    wsHub.broadcast('db:restored', { timestamp: Date.now(), reset: true })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 8. Vector Embedding API
memoryRouter.post('/vector', async (req, res) => {
  const { text } = req.body || {}
  try {
    const { generateVector } = await import('../memory/vector-engine.js')
    const vector = await generateVector(text)
    res.json({ success: true, vector })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
