import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { codingStore } from '../memory/db-store.js'
import { workspaceFor, scopedPath, fileHash, rootKey } from './coding-workspace.js'
import { locked } from './coding-execution.js'
import { writeBytes } from '../../main/tools/file-patch.js'
import { wsHub } from '../ws-hub.js'

const LIMIT = 2 * 1024 * 1024
const omitted = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  '.venv',
  'coverage'
])
export const documentExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.odt',
  '.odp'
])
const recordId = (sessionId, root, file = '') =>
  createHash('sha256')
    .update(JSON.stringify([String(sessionId), rootKey(root), file]))
    .digest('hex')
export function workspaceFile(sessionId, value) {
  if (typeof value !== 'string' || !value || value.includes('\0'))
    throw new Error('Path berkas wajib diisi.')
  const workspace = workspaceFor(sessionId)
  return { ...workspace, file: scopedPath(workspace.root, value) }
}
export function workspaceTree(sessionId, directory = '.', query = '') {
  const { root } = workspaceFor(sessionId)
  const dir = scopedPath(root, directory)
  const result = []
  const search = String(query).trim().toLowerCase()
  const walk = (folder, depth) => {
    for (const entry of fs
      .readdirSync(folder, { withFileTypes: true })
      .sort(
        (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)
      )) {
      if (result.length >= 200) break
      if (entry.isSymbolicLink() || omitted.has(entry.name)) continue
      const file = scopedPath(root, path.join(folder, entry.name))
      const relative = path.relative(root, file).replaceAll('\\', '/')
      if (!search || (!entry.isDirectory() && relative.toLowerCase().includes(search)))
        result.push({
          path: relative,
          name: entry.name,
          directory: entry.isDirectory(),
          document: documentExtensions.has(path.extname(file).toLowerCase())
        })
      if (search && entry.isDirectory() && depth < 30) walk(file, depth + 1)
    }
  }
  walk(dir, 0)
  return { root, entries: result, limited: result.length >= 200 }
}
function decode(bytes) {
  let encoding = 'utf-8',
    bom = ''
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'
    bom = 'fffe'
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be'
    bom = 'feff'
  } else if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) bom = 'efbbbf'
  if (encoding === 'utf-8' && bytes.includes(0))
    throw new Error('Berkas biner tidak dapat disunting sebagai teks.')
  const content = new TextDecoder(encoding, { fatal: true }).decode(bytes)
  const newline = content.includes('\r\n') ? '\r\n' : content.includes('\r') ? '\r' : '\n'
  return { content, encoding, bom, newline }
}
function encode(content, metadata) {
  const text = String(content).replace(/\r\n|\r|\n/g, metadata.newline)
  const bytes = Buffer.from(text, metadata.encoding === 'utf-8' ? 'utf8' : 'utf16le')
  if (metadata.encoding === 'utf-16be') bytes.swap16()
  return Buffer.concat([Buffer.from(metadata.bom, 'hex'), bytes])
}
export function readWorkspaceFile(sessionId, value) {
  const { root, file } = workspaceFile(sessionId, value)
  const size = fs.statSync(file).size
  if (size > LIMIT)
    throw new Error('Berkas melebihi batas editor 2 MiB. Buka melalui aplikasi yang sesuai.')
  const bytes = fs.readFileSync(file)
  let metadata
  try {
    metadata = decode(bytes)
  } catch (error) {
    throw new Error(
      error.message.includes('biner') ? error.message : 'Encoding berkas tidak didukung editor.'
    )
  }
  const relativePath = path.relative(root, file).replaceAll('\\', '/')
  const draft = codingStore.get('editor-draft', recordId(sessionId, root, relativePath))
  return { root, path: relativePath, hash: fileHash(bytes), ...metadata, draft: draft || null }
}
export async function saveWorkspaceFile(sessionId, input) {
  const { root, file } = workspaceFile(sessionId, input.path)
  if (rootKey(input.root || '') !== rootKey(root))
    throw new Error('Workspace berubah. Draf dipertahankan; buka ulang editor.')
  if (typeof input.content !== 'string' || Buffer.byteLength(input.content) > LIMIT)
    throw new Error('Isi editor melebihi batas 2 MiB.')
  return locked([file], async () => {
    scopedPath(root, file)
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null
    if (input.expectedHash !== fileHash(bytes))
      throw new Error(
        'Berkas berubah di disk. Draf dipertahankan; muat ulang berkas sebelum menyimpan.'
      )
    const metadata = bytes ? decode(bytes) : { encoding: 'utf-8', bom: '', newline: '\n' }
    const next = encode(input.content, metadata)
    try {
      writeBytes(file, next)
    } catch (error) {
      if (fs.existsSync(file) && fileHash(fs.readFileSync(file)) === fileHash(next))
        writeBytes(file, bytes)
      throw error
    }
    const relativePath = path.relative(root, file).replaceAll('\\', '/')
    codingStore.put('editor-draft', recordId(sessionId, root, relativePath), {
      sessionId: String(sessionId),
      root,
      path: relativePath,
      content: null
    })
    wsHub.broadcast('workspace:file-changed', { sessionId: String(sessionId), path: relativePath })
    return { root, path: relativePath, hash: fileHash(next), ...metadata }
  })
}
export function saveEditorDraft(sessionId, input) {
  const { root, file } = workspaceFile(sessionId, input.path)
  if (rootKey(input.root || '') !== rootKey(root))
    throw new Error('Workspace berubah. Draf tidak ditulis ke workspace lain.')
  if (
    input.content !== null &&
    (typeof input.content !== 'string' || Buffer.byteLength(input.content) > LIMIT)
  )
    throw new Error('Draf editor tidak valid atau terlalu besar.')
  const relativePath = path.relative(root, file).replaceAll('\\', '/')
  return codingStore.put('editor-draft', recordId(sessionId, root, relativePath), {
    sessionId: String(sessionId),
    root,
    path: relativePath,
    content: input.content,
    baseHash: input.baseHash
  })
}
export function panelState(sessionId, input) {
  const { root } = workspaceFor(sessionId)
  const id = recordId(sessionId, root)
  if (!input)
    return codingStore.get('workspace-panel', id) || { root, tabs: [], activeId: 'browser' }
  if (rootKey(input.root || '') !== rootKey(root))
    throw new Error('Workspace berubah. Buka ulang panel.')
  if (!Array.isArray(input.tabs) || input.tabs.length > 100)
    throw new Error('Daftar tab tidak valid.')
  const tabs = input.tabs.map((tab) => {
    if (
      !['editor', 'diff', 'document', 'terminal'].includes(tab.type) ||
      typeof tab.id !== 'string' ||
      tab.id.length > 1000
    )
      throw new Error('Tab tidak valid.')
    const clean = { id: tab.id, type: tab.type }
    if (tab.type === 'terminal') {
      const terminal = codingStore.get('terminal', tab.terminalId)
      if (
        typeof tab.terminalId !== 'string' ||
        !tab.terminalId ||
        tab.terminalId.length > 200 ||
        (terminal &&
          (terminal.sessionId !== String(sessionId) ||
            !terminal.interactive ||
            rootKey(terminal.root) !== rootKey(root)))
      )
        throw new Error('Terminal manual tidak tersedia pada workspace sesi ini.')
      clean.terminalId = tab.terminalId
    } else {
      const file = scopedPath(root, tab.path)
      clean.path = path.relative(root, file).replaceAll('\\', '/')
      if (tab.type === 'diff') {
        const run = codingStore.get('run', tab.runId)
        if (
          !run ||
          run.sessionId !== String(sessionId) ||
          rootKey(run.root) !== rootKey(root) ||
          !run.files.some((entry) => rootKey(entry.path) === rootKey(file))
        )
          throw new Error('Rekaman diff tidak tersedia pada sesi ini.')
        clean.runId = run.id
      }
    }
    return clean
  })
  if (new Set(tabs.map((tab) => tab.id)).size !== tabs.length)
    throw new Error('Tab ganda tidak diizinkan.')
  return codingStore.put('workspace-panel', id, {
    sessionId: String(sessionId),
    root,
    tabs,
    activeId: tabs.some((tab) => tab.id === input.activeId) ? input.activeId : 'browser'
  })
}
