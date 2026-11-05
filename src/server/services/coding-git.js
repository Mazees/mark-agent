import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { runGit, runGitSync } from '../../main/git-runtime.js'

const queues = new Map()
const omitted = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'target',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.venv',
  'venv'
])
const textLimit = 2 * 1024 * 1024
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
export const checkpointRoot = () =>
  process.env.MARK_CODING_GIT_DIR || path.join(os.homedir(), '.config', 'mark-agent', 'coding-git')
export const workspaceKey = (root) => sha256(path.resolve(root).replaceAll('\\', '/').toLowerCase())
const repoPath = (key) => {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Identitas repository checkpoint tidak valid.')
  return path.join(checkpointRoot(), key)
}
const prefix = (repo, root) => [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.safecrlf=false',
  '-c',
  `core.hooksPath=${path.join(repo, 'disabled-hooks')}`,
  '-c',
  'core.fsmonitor=false',
  '--git-dir',
  repo,
  ...(root ? ['--work-tree', root] : [])
]
const command = (repo, args, options = {}) =>
  runGit([...prefix(repo, options.root), ...args], { ...options, root: undefined, internal: true })
const syncCommand = (repo, args, options = {}) =>
  runGitSync([...prefix(repo), ...args], { ...options, internal: true })
export async function withCheckpointLock(key, action) {
  const previous = queues.get(key) || Promise.resolve()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => {}).then(() => gate)
  queues.set(key, tail)
  await previous.catch(() => {})
  try {
    return await action()
  } finally {
    release()
    if (queues.get(key) === tail) queues.delete(key)
  }
}
async function ensureRepository(key) {
  const repo = repoPath(key)
  if (!fs.existsSync(path.join(repo, 'HEAD'))) {
    fs.mkdirSync(repo, { recursive: true })
    await runGit(
      ['init', '--bare', '--object-format=sha1', '--initial-branch=mark-checkpoints', repo],
      { internal: true }
    )
  }
  return repo
}
export const runCheckpointRef = (id, phase) => `refs/mark/runs/${sha256(String(id))}/${phase}`
function relativeFile(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.split('/').some((p) => !p || p === '..' || p === '.') ||
    path.isAbsolute(value) ||
    /^[a-z]:/i.test(value)
  )
    throw new Error('Path berkas checkpoint tidak valid.')
  return value
}
async function eligibleFiles(repo, root) {
  const files = []
  const internalRoot = path.resolve(checkpointRoot()).toLowerCase()
  const walk = (dir, relative = '') => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (omitted.has(entry.name) || entry.isSymbolicLink()) continue
      if (path.resolve(dir, entry.name).toLowerCase() === internalRoot) continue
      const name = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), name)
      else if (entry.isFile()) files.push(name)
    }
  }
  walk(root)
  if (!files.length) return files
  let tracked = new Set()
  try {
    tracked = new Set(
      (await runGit(['ls-files', '--cached', '-z', '--', '.'], { cwd: root })).stdout
        .split('\0')
        .filter(Boolean)
    )
  } catch (error) {
    if (error.code !== 128 || !String(error.stderr).includes('not a git repository')) throw error
  }
  let ignored = ''
  try {
    ignored = (
      await command(repo, ['check-ignore', '--no-index', '-z', '--stdin'], {
        root,
        input: files.join('\0') + '\0'
      })
    ).stdout
  } catch (error) {
    if (error.code !== 1) throw error
  }
  const excluded = new Set(ignored.split('\0').filter(Boolean))
  return files.filter((file) => tracked.has(file) || !excluded.has(file)).sort()
}
async function commitTree(repo, entries, ref, label) {
  const index = path.join(repo, `index-${randomUUID()}`)
  const env = { GIT_INDEX_FILE: index }
  try {
    await command(repo, ['read-tree', '--empty'], { env })
    if (entries.length)
      await command(repo, ['update-index', '-z', '--index-info'], {
        env,
        input: entries
          .map((e) => `${e.mode || '100644'} ${e.oid}\t${relativeFile(e.path)}\0`)
          .join('')
      })
    const tree = (await command(repo, ['write-tree'], { env })).stdout.trim()
    const oid = (await command(repo, ['commit-tree', tree, '-m', label])).stdout.trim()
    await command(repo, ['update-ref', ref, oid])
    return oid
  } finally {
    for (const file of [index, `${index}.lock`]) if (fs.existsSync(file)) fs.unlinkSync(file)
  }
}
export async function captureWorkspace(root, ref) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error('Folder workspace tidak tersedia untuk checkpoint.')
  const key = workspaceKey(root)
  return withCheckpointLock(key, async () => {
    const repo = await ensureRepository(key)
    const files = await eligibleFiles(repo, root)
    const ids = files.length
      ? (
          await command(repo, ['hash-object', '-w', '--no-filters', '--stdin-paths'], {
            input:
              files
                .map((file) => JSON.stringify(path.join(root, file).replaceAll('\\', '/')))
                .join('\n') + '\n',
            timeout: 120000
          })
        ).stdout
          .trim()
          .split(/\r?\n/)
      : []
    if (ids.length !== files.length || ids.some((id) => !/^[a-f0-9]{40}$/.test(id)))
      throw new Error('Checkpoint berkas tidak lengkap.')
    const oid = await commitTree(
      repo,
      files.map((file, i) => ({ path: file, oid: ids[i] })),
      ref,
      'Mark workspace checkpoint'
    )
    return { workspaceId: key, oid }
  })
}
export async function checkpointChanges(root, key, beforeOid, afterOid) {
  const repo = repoPath(key)
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '-z']
  const [raw, stats] = await Promise.all([
    command(repo, [...args, '--raw', '--abbrev=40', beforeOid, afterOid, '--']),
    command(repo, [...args, '--numstat', beforeOid, afterOid, '--'])
  ])
  const numbers = new Map(
    stats.stdout
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const match = /^([^\t]+)\t([^\t]+)\t([\s\S]+)$/.exec(line)
        if (!match) throw new Error('Statistik diff tidak valid.')
        return [
          match[3],
          {
            binary: match[1] === '-',
            additions: match[1] === '-' ? 0 : Number(match[1]),
            deletions: match[2] === '-' ? 0 : Number(match[2])
          }
        ]
      })
  )
  const chunks = raw.stdout.split('\0').filter(Boolean)
  const files = []
  for (let i = 0; i < chunks.length; i += 2) {
    const match = /^:(\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([A-Z])$/.exec(chunks[i])
    if (!match || !chunks[i + 1]) throw new Error('Daftar diff tidak valid.')
    const relativePath = relativeFile(chunks[i + 1])
    files.push({
      path: path.join(root, relativePath),
      relativePath,
      beforeOid: /^0+$/.test(match[3]) ? null : match[3],
      afterOid: /^0+$/.test(match[4]) ? null : match[4],
      beforeMode: match[1],
      afterMode: match[2],
      status: match[5],
      added: match[5] === 'A',
      deleted: match[5] === 'D',
      ...numbers.get(relativePath),
      undoAvailable: true,
      undone: false
    })
  }
  const ids = [...new Set(files.flatMap((f) => [f.beforeOid, f.afterOid]).filter(Boolean))]
  const sizes = new Map()
  if (ids.length) {
    const rows = (
      await command(repo, ['cat-file', '--batch-check'], { input: ids.join('\n') + '\n' })
    ).stdout
      .trim()
      .split(/\r?\n/)
    for (const row of rows) {
      const [id, type, size] = row.split(' ')
      if (type !== 'blob') throw new Error('Objek checkpoint tidak tersedia.')
      sizes.set(id, Number(size))
    }
  }
  return files.map((f) => ({
    ...f,
    beforeSize: sizes.get(f.beforeOid) || 0,
    afterSize: sizes.get(f.afterOid) || 0
  }))
}
export async function checkpointBytes(key, oid, size = 0) {
  if (!oid) return null
  if (!/^[a-f0-9]{40}$/.test(oid)) throw new Error('Objek checkpoint tidak valid.')
  return (
    await command(repoPath(key), ['cat-file', 'blob', oid], {
      encoding: 'buffer',
      maxBuffer: Math.max(size + 1024, 32 * 1024 * 1024)
    })
  ).stdout
}
export async function checkpointDiff(key, file) {
  if (file.binary)
    return {
      ...file,
      before: '',
      after: '',
      notice: 'Berkas biner. Perbandingan teks tidak tersedia.'
    }
  if (Math.max(file.beforeSize || 0, file.afterSize || 0) > textLimit)
    return {
      ...file,
      before: '',
      after: '',
      tooLarge: true,
      notice: 'Isi berkas melebihi batas tampilan diff 2 MiB.'
    }
  const [before, after] = await Promise.all([
    checkpointBytes(key, file.beforeOid, file.beforeSize),
    checkpointBytes(key, file.afterOid, file.afterSize)
  ])
  if (before?.includes(0) || after?.includes(0))
    return {
      ...file,
      binary: true,
      before: '',
      after: '',
      notice: 'Berkas biner. Perbandingan teks tidak tersedia.'
    }
  return { ...file, before: before?.toString('utf8') || '', after: after?.toString('utf8') || '' }
}
export async function bytesOid(key, bytes) {
  if (bytes == null) return null
  return (
    await command(repoPath(key), ['hash-object', '--no-filters', '--stdin'], { input: bytes })
  ).stdout.trim()
}
export async function migrateSnapshotRun(run) {
  if (run.checkpointVersion || !run.files?.some((file) => Object.hasOwn(file, 'before'))) return run
  const key = workspaceKey(run.root)
  return withCheckpointLock(key, async () => {
    const repo = await ensureRepository(key)
    for (const file of run.files) {
      for (const side of ['before', 'after']) {
        const value = file[side]
        if (
          value !== null &&
          (typeof value !== 'string' || Buffer.from(value, 'base64').toString('base64') !== value)
        )
          throw new Error(
            'Snapshot lama tidak lengkap atau berisi Base64 yang tidak valid; data asal dipertahankan.'
          )
      }
    }
    const trees = {}
    for (const side of ['before', 'after']) {
      const entries = []
      for (const file of run.files) {
        const name = relativeFile(
          (file.relativePath || path.relative(run.root, file.path)).replaceAll('\\', '/')
        )
        if (file[side] == null) continue
        const bytes = Buffer.from(file[side], 'base64')
        const oid = (
          await command(repo, ['hash-object', '-w', '--no-filters', '--stdin'], { input: bytes })
        ).stdout.trim()
        const expected = createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex')
        if (oid !== expected) throw new Error('Migrasi checkpoint gagal memverifikasi isi berkas.')
        entries.push({ path: name, oid })
      }
      trees[side] = await commitTree(
        repo,
        entries,
        runCheckpointRef(run.id, side),
        'Mark imported file checkpoint'
      )
    }
    const files = await checkpointChanges(run.root, key, trees.before, trees.after)
    return {
      ...run,
      checkpointVersion: 1,
      gitWorkspaceId: key,
      beforeOid: trees.before,
      afterOid: trees.after,
      captureStatus: 'completed',
      captureScope: 'recorded-files',
      files: files.map((file) => ({
        ...file,
        undone: run.files.find((old) => old.path === file.path)?.undone || false
      }))
    }
  })
}
export function exportCheckpointArchives(records) {
  const keys = [...new Set(records.map((r) => r.gitWorkspaceId).filter(Boolean))]
  return {
    version: 1,
    repositories: keys.map((key) => {
      const repo = repoPath(key)
      const file = path.join(repo, `backup-${randomUUID()}.bundle`)
      try {
        syncCommand(repo, ['bundle', 'create', file, '--all'], { timeout: 120000 })
        const bytes = fs.readFileSync(file)
        return { workspaceId: key, sha256: sha256(bytes), bundle: bytes.toString('base64') }
      } finally {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      }
    })
  }
}
export function restoreCheckpointArchives(archive) {
  if (!archive) return
  if (archive.version !== 1 || !Array.isArray(archive.repositories))
    throw new Error('Format arsip checkpoint tidak didukung.')
  const verified = archive.repositories.map((entry) => {
    repoPath(entry.workspaceId)
    const bytes = Buffer.from(entry.bundle || '', 'base64')
    if (sha256(bytes) !== entry.sha256) throw new Error('Checksum arsip checkpoint tidak cocok.')
    return { ...entry, bytes }
  })
  for (const entry of verified) {
    const repo = repoPath(entry.workspaceId)
    if (!fs.existsSync(path.join(repo, 'HEAD'))) {
      fs.mkdirSync(repo, { recursive: true })
      runGitSync(
        ['init', '--bare', '--object-format=sha1', '--initial-branch=mark-checkpoints', repo],
        { internal: true }
      )
    }
    const file = path.join(repo, `restore-${randomUUID()}.bundle`)
    try {
      fs.writeFileSync(file, entry.bytes)
      syncCommand(repo, ['bundle', 'verify', file])
      syncCommand(
        repo,
        [
          '-c',
          'protocol.file.allow=always',
          'fetch',
          '--no-tags',
          '--no-write-fetch-head',
          file,
          '+refs/mark/*:refs/mark/*'
        ],
        { timeout: 120000 }
      )
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  }
}
