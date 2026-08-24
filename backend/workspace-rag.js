import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.json', '.html', '.css', '.scss', '.md',
  '.sql', '.rs', '.go', '.php', '.rb', '.c', '.cpp',
  '.h', '.hpp', '.cs', '.java', '.kt', '.swift',
  '.dart', '.vue', '.svelte', '.yaml', '.yml', '.sh', '.ps1'
])

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '.vite', '.mark', 'out', 'coverage', 'tmp', '.cache',
  'obj', 'bin', '__pycache__', '.turbo'
])

/**
 * Memastikan folder .mark/ ada dan mendaftarkannya ke .gitignore
 */
export function ensureMarkWorkspace(workspaceRoot) {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return null
  const markDir = path.join(workspaceRoot, '.mark')

  try {
    if (!fs.existsSync(markDir)) {
      fs.mkdirSync(markDir, { recursive: true })
    }

    // Auto-update .gitignore jika ada
    const gitignorePath = path.join(workspaceRoot, '.gitignore')
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
      if (!gitignoreContent.includes('.mark') && !gitignoreContent.includes('.mark/')) {
        const appended = gitignoreContent.endsWith('\n')
          ? `${gitignoreContent}.mark/\n`
          : `${gitignoreContent}\n.mark/\n`
        fs.writeFileSync(gitignorePath, appended, 'utf-8')
        console.log('[WorkspaceRAG] Auto-added .mark/ to .gitignore')
      }
    }

    // Pastikan working-memory.json ada
    const memoryPath = path.join(markDir, 'working-memory.json')
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, JSON.stringify({
        lastUpdated: Date.now(),
        activeObjective: null,
        recentFiles: [],
        notes: ''
      }, null, 2), 'utf-8')
    }

    return markDir
  } catch (err) {
    console.error('[WorkspaceRAG] ensureMarkWorkspace error:', err.message)
    return null
  }
}

/**
 * Membaca Working Memory aktif dari .mark/working-memory.json
 */
export function readWorkingMemory(workspaceRoot) {
  if (!workspaceRoot) return null
  try {
    const memoryPath = path.join(workspaceRoot, '.mark', 'working-memory.json')
    if (fs.existsSync(memoryPath)) {
      return JSON.parse(fs.readFileSync(memoryPath, 'utf-8'))
    }
  } catch (err) {
    console.error('[WorkspaceRAG] readWorkingMemory error:', err.message)
  }
  return null
}

/**
 * Menyimpan Working Memory ke .mark/working-memory.json
 */
export function saveWorkingMemory(workspaceRoot, memoryData) {
  if (!workspaceRoot || !memoryData) return false
  try {
    ensureMarkWorkspace(workspaceRoot)
    const memoryPath = path.join(workspaceRoot, '.mark', 'working-memory.json')
    const existing = readWorkingMemory(workspaceRoot) || {}
    const updated = {
      ...existing,
      ...memoryData,
      lastUpdated: Date.now()
    }
    fs.writeFileSync(memoryPath, JSON.stringify(updated, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('[WorkspaceRAG] saveWorkingMemory error:', err.message)
    return false
  }
}

/**
 * Menghitung hash MD5 untuk deteksi perubahan berkas
 */
function getFileHash(content) {
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * Memecah teks berkas menjadi chunk 600 karakter dengan 100 overlap
 */
function chunkFileContent(filePath, content, relativePath) {
  const chunks = []
  const chunkSize = 600
  const overlap = 100

  if (content.length <= chunkSize) {
    chunks.push({
      id: `${relativePath}#0`,
      filePath: relativePath,
      chunkIndex: 0,
      content: content.trim(),
      charCount: content.length
    })
    return chunks
  }

  let start = 0
  let index = 0
  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length)
    const chunkText = content.substring(start, end).trim()
    if (chunkText.length > 30) {
      chunks.push({
        id: `${relativePath}#${index}`,
        filePath: relativePath,
        chunkIndex: index,
        content: chunkText,
        charCount: chunkText.length
      })
      index++
    }
    start += chunkSize - overlap
  }

  return chunks
}

/**
 * Memindai dan mengindeks seluruh berkas kode proyek ke .mark/codebase-index.json secara inkremental
 */
export async function indexWorkspace(workspaceRoot) {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return { success: false, error: 'Workspace root tidak ditemukan.' }
  }

  const markDir = ensureMarkWorkspace(workspaceRoot)
  if (!markDir) return { success: false, error: 'Gagal menginisialisasi folder .mark' }

  const indexPath = path.join(markDir, 'codebase-index.json')
  let existingIndex = { files: {}, chunks: [], lastIndexed: 0 }

  if (fs.existsSync(indexPath)) {
    try {
      existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    } catch (_) {}
  }

  const newFilesMap = {}
  const allChunks = []
  let indexedCount = 0

  function scanDir(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (_) {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          scanDir(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (CODE_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath)
            if (stat.size > 1024 * 1024) continue // Abaikan file > 1MB

            const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/')
            const prevFileMeta = existingIndex.files?.[relPath]

            // Jika mtime sama dan hash sama, gunakan chunk yang sudah ada
            if (prevFileMeta && prevFileMeta.mtime === stat.mtimeMs) {
              newFilesMap[relPath] = prevFileMeta
              const existingFileChunks = existingIndex.chunks.filter((c) => c.filePath === relPath)
              allChunks.push(...existingFileChunks)
            } else {
              const content = fs.readFileSync(fullPath, 'utf-8')
              const hash = getFileHash(content)

              if (prevFileMeta && prevFileMeta.hash === hash) {
                newFilesMap[relPath] = { ...prevFileMeta, mtime: stat.mtimeMs }
                const existingFileChunks = existingIndex.chunks.filter((c) => c.filePath === relPath)
                allChunks.push(...existingFileChunks)
              } else {
                const chunks = chunkFileContent(fullPath, content, relPath)
                newFilesMap[relPath] = {
                  mtime: stat.mtimeMs,
                  hash,
                  size: stat.size,
                  chunkCount: chunks.length
                }
                allChunks.push(...chunks)
                indexedCount++
              }
            }
          } catch (_) {}
        }
      }
    }
  }

  scanDir(workspaceRoot)

  const updatedIndex = {
    workspaceRoot,
    lastIndexed: Date.now(),
    totalFiles: Object.keys(newFilesMap).length,
    totalChunks: allChunks.length,
    files: newFilesMap,
    chunks: allChunks
  }

  try {
    fs.writeFileSync(indexPath, JSON.stringify(updatedIndex, null, 2), 'utf-8')
    console.log(`[WorkspaceRAG] Indexed ${Object.keys(newFilesMap).length} files (${allChunks.length} chunks) in .mark/`)
    return {
      success: true,
      totalFiles: Object.keys(newFilesMap).length,
      totalChunks: allChunks.length,
      indexedCount
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Mencari potongan kode yang paling relevan dari .mark/codebase-index.json
 */
export function queryCodebase(workspaceRoot, queryText, topK = 4) {
  if (!workspaceRoot || !queryText) return []
  const indexPath = path.join(workspaceRoot, '.mark', 'codebase-index.json')

  if (!fs.existsSync(indexPath)) return []

  try {
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const chunks = indexData.chunks || []
    if (chunks.length === 0) return []

    // Tokenize query words
    const queryTokens = queryText
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_\-\.\/]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)

    if (queryTokens.length === 0) return []

    const scored = []

    for (const chunk of chunks) {
      const lowerContent = chunk.content.toLowerCase()
      const lowerPath = chunk.filePath.toLowerCase()
      let score = 0

      for (const token of queryTokens) {
        // Path match diberi bobot tinggi
        if (lowerPath.includes(token)) score += 5
        // Exact keyword match di content
        const occurrences = (lowerContent.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length
        score += occurrences * 2
        if (lowerContent.includes(token)) score += 1
      }

      if (score > 0) {
        scored.push({ ...chunk, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  } catch (err) {
    console.error('[WorkspaceRAG] queryCodebase error:', err.message)
    return []
  }
}
