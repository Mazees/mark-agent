import { generateVector } from './vectorMemory'
import { bulkInsertDocuments, deleteDocumentByName, getAllDocuments } from './db'
import { insertDocumentChunksToOrama, deleteDocumentFromOrama } from './oramaStore'

function splitTextIntoChunks(text, chunkSize = 500, overlap = 50) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}

export async function ingestDocument(file, onProgress) {
  // 0. Validasi ukuran (Max 50MB)
  const MAX_SIZE = 50 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    throw new Error('Ukuran file terlalu besar. Maksimal 50MB.')
  }

  // 0.5. Handling duplikat
  const existingDocs = await getAllDocuments()
  const isDuplicate = existingDocs.some(d => d.docName === file.name)
  
  if (isDuplicate) {
    // Hapus dokumen lama dulu
    await deleteDocumentByName(file.name)
    await deleteDocumentFromOrama(file.name)
  }

  // 1. Ekstrak teks
  let rawText = ''
  
  if (file.name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer()
    rawText = await window.api.parseDocument(buf, false)
  } else if (file.name.endsWith('.docx')) {
    const buf = await file.arrayBuffer()
    rawText = await window.api.parseDocument(buf, true)
  } else {
    rawText = await file.text()
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('Dokumen kosong atau tidak terbaca.')
  }

  // 2. Chunking
  const chunks = splitTextIntoChunks(rawText, 500, 50)

  // 3. Embed + Simpan (Dexie & Orama)
  const dexieRecords = []

  for (let i = 0; i < chunks.length; i++) {
    const vector = await generateVector(chunks[i])
    if (!vector) continue

    const record = {
      docName: file.name,
      chunkIndex: i,
      content: chunks[i],
      timestamp: Date.now(),
      vector
    }
    dexieRecords.push(record)
    
    if (onProgress) {
      onProgress(Math.round(((i + 1) / chunks.length) * 100))
    }
  }

  if (dexieRecords.length === 0) {
    throw new Error('Gagal mengekstrak vektor dari dokumen.')
  }

  // Bulk insert ke Dexie
  const ids = await bulkInsertDocuments(dexieRecords)

  // Bulk insert ke Orama (dengan dexieId)
  const oramaData = dexieRecords.map((r, i) => ({ ...r, dexieId: ids[i] }))
  await insertDocumentChunksToOrama(oramaData)

  return { fileName: file.name, totalChunks: chunks.length, totalCharacters: rawText.length }
}
