import fs from 'node:fs'
import path from 'node:path'
import { runGit } from '../../main/git-runtime.js'
import { createHash } from 'node:crypto'
import { dbStore, codingStore } from '../memory/db-store.js'
import { DEFAULT_WORKSPACE_ROOT } from '../workspace-policy.js'

export const git = runGit
export const fileHash = (bytes) =>
  bytes == null ? null : createHash('sha256').update(bytes).digest('hex')
export const rootKey = (root) => path.resolve(root).replaceAll('\\', '/').toLowerCase()
export function workspaceFor(sessionId = '1') {
  const id = String(sessionId)
  let session = dbStore.sessions.getById(id)
  if (id !== '1' && !session) throw new Error('Percakapan workspace tidak ditemukan.')
  const worktree = codingStore.get('worktree', id)
  if (worktree?.active) {
    dbStore.sqlite.transaction(() => {
      session = dbStore.sessions.insert({ ...session, id, workspaceRoot: worktree.root })
      codingStore.put('worktree', id, { ...worktree, active: false, retired: true })
    })()
  }
  const localRoot = session?.workspaceRoot || DEFAULT_WORKSPACE_ROOT
  return {
    sessionId: id,
    root: localRoot,
    sourceRoot: localRoot
  }
}
export function scopedPath(root, value = '.') {
  const target = path.resolve(root, value)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Berkas berada di luar workspace aktif.')
  let ancestor = target
  while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor))
    ancestor = path.dirname(ancestor)
  const realRoot = fs.realpathSync(root)
  const real = fs.realpathSync(ancestor)
  const realRelative = path.relative(realRoot, real)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative))
    throw new Error('Symlink berada di luar workspace aktif.')
  return target
}
export function instructionsFor(root, files = []) {
  const dirs = new Set([path.resolve(root)])
  for (const value of files) {
    const target = scopedPath(root, value)
    let dir =
      fs.existsSync(target) && fs.statSync(target).isDirectory() ? target : path.dirname(target)
    while (path.relative(root, dir) !== '') {
      dirs.add(dir)
      dir = path.dirname(dir)
    }
  }
  return [...dirs]
    .sort((a, b) => a.length - b.length)
    .flatMap((dir) => {
      const file = ['AGENTS.override.md', 'AGENTS.md']
        .map((name) => path.join(dir, name))
        .find(fs.existsSync)
      if (!file) return []
      const content = fs.readFileSync(scopedPath(root, file), 'utf8')
      return [{ path: file, scope: dir, hash: fileHash(content), content }]
    })
}
export async function projectContext(sessionId, paths = []) {
  const workspace = workspaceFor(sessionId)
  const { root } = workspace
  const exists = fs.existsSync(root) && fs.statSync(root).isDirectory()
  const entries = exists
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter((x) => !['node_modules', '.git', 'out', 'dist', 'build', '.env'].includes(x.name))
    : []
  const readJson = (name) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
    } catch {
      return null
    }
  }
  const manifest = readJson('package.json')
  const packageManager = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'bun.lock',
    'package-lock.json'
  ].find((name) => fs.existsSync(path.join(root, name)))
  let branch = null
  try {
    branch = (
      await git(['branch', '--show-current'], { cwd: root, windowsHide: true })
    ).stdout.trim()
  } catch {
    /* Non-Git projects are supported. */
  }
  return {
    ...workspace,
    exists,
    name: manifest?.name || path.basename(root),
    branch,
    structure: entries.slice(0, 80).map((e) => e.name + (e.isDirectory() ? '/' : '')),
    manifests: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].filter((name) =>
      fs.existsSync(path.join(root, name))
    ),
    scripts: manifest?.scripts || {},
    packageManager: manifest?.packageManager || packageManager || null,
    instructions: exists ? instructionsFor(root, paths) : [],
    memory: codingStore.get('memory', `${sessionId}:${rootKey(root)}`)
  }
}
export function saveProjectMemory(sessionId, data) {
  const { root } = workspaceFor(sessionId)
  const previous = codingStore.get('memory', `${sessionId}:${rootKey(root)}`) || {}
  return codingStore.put('memory', `${sessionId}:${rootKey(root)}`, {
    ...previous,
    sessionId: String(sessionId),
    root,
    notes: String(data.notes ?? previous.notes ?? ''),
    activeObjective: String(data.activeObjective ?? previous.activeObjective ?? ''),
    recentFiles: Array.isArray(data.recentFiles) ? data.recentFiles : previous.recentFiles || [],
    decisions: Array.isArray(data.decisions) ? data.decisions : previous.decisions || [],
    checks: Array.isArray(data.checks) ? data.checks : previous.checks || []
  })
}
