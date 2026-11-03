import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { codingStore, dbStore } from '../memory/db-store.js'
import {
  projectContext,
  workspaceFor,
  scopedPath,
  git,
  fileHash,
  saveProjectMemory
} from '../services/coding-workspace.js'
import {
  undoCoding,
  commitSnapshotChanges,
  ensureCodingRun,
  notifyCoding
} from '../services/coding-execution.js'
import {
  startTerminal,
  listTerminals,
  stopTerminal,
  terminalSocket,
  disconnectTerminals
} from '../services/terminal-service.js'
import { wsHub } from '../ws-hub.js'

export const codingRouter = Router()
const route = (handler) => async (req, res) => {
  try {
    const origin = req.get('origin')
    if (
      origin &&
      new URL(origin).host !== req.get('host') &&
      !(process.argv.includes('--dev') && new URL(origin).hostname === 'localhost')
    )
      return res
        .status(403)
        .json({ success: false, error: 'Gunakan antarmuka Mark untuk mengelola workspace.' })
    res.json({ success: true, data: await handler(req) })
  } catch (error) {
    res.status(409).json({ success: false, error: error.message })
  }
}
const idOf = (req) => String(req.body?.sessionId || req.query.sessionId || '1')
function assertWorkspaceIdle(sessionId) {
  if (
    codingStore.list('run', sessionId).some((run) => run.status === 'running') ||
    dbStore.subagentJobs
      .getAll()
      .some(
        (job) =>
          String(job.parentSessionId) === String(sessionId) &&
          ['running', 'queued', 'waiting_user', 'waiting_peer', 'waiting_review'].includes(
            job.status
          )
      )
  )
    throw new Error('Tunggu pekerjaan Mark dan Minibot selesai sebelum mengganti workspace.')
  if (listTerminals(sessionId).some((t) => ['running', 'starting'].includes(t.status)))
    throw new Error('Hentikan terminal sesi sebelum mengganti workspace.')
}
const summary = (run) => ({
  ...run,
  calls: undefined,
  observed: undefined,
  guidance: undefined,
  childRuns: codingStore
    .list('run', run.sessionId)
    .filter((child) => child.parentRunId === run.id)
    .map((child) => ({
      id: child.id,
      agentName: child.agentName,
      files: child.files.length,
      passed: child.checks.filter((check) => check.status === 'passed').length,
      failed: child.checks.filter((check) => check.status === 'failed').length
    })),
  files: run.files.map(({ before, after, ...file }) => ({
    ...file,
    added: before === null,
    deleted: after === null
  }))
})
codingRouter.post(
  '/workspace/context',
  route((req) => projectContext(idOf(req), req.body.paths || []))
)
codingRouter.patch(
  '/workspace/memory',
  route((req) => saveProjectMemory(idOf(req), req.body.memory || {}))
)
codingRouter.get(
  '/coding/runs',
  route((req) => {
    const { root } = workspaceFor(idOf(req))
    return codingStore
      .list('run', idOf(req))
      .filter((run) => run.root === root)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(summary)
  })
)
codingRouter.get(
  '/coding/runs/:id',
  route((req) => {
    const run = codingStore.get('run', req.params.id)
    if (!run || run.sessionId !== idOf(req)) throw new Error('Pekerjaan coding tidak ditemukan.')
    return summary(run)
  })
)
codingRouter.get(
  '/coding/runs/:id/diff',
  route((req) => {
    const run = codingStore.get('run', req.params.id)
    if (!run || run.sessionId !== idOf(req)) throw new Error('Pekerjaan coding tidak ditemukan.')
    const file = run.files.find((file) => file.path === req.query.path)
    if (!file) throw new Error('Snapshot berkas tidak ditemukan.')
    return {
      ...file,
      before: file.before == null ? '' : Buffer.from(file.before, 'base64').toString('utf8'),
      after: file.after == null ? '' : Buffer.from(file.after, 'base64').toString('utf8')
    }
  })
)
codingRouter.post(
  '/coding/runs/:id/undo',
  route((req) => undoCoding(req.params.id, idOf(req), req.body.path).then(summary))
)
codingRouter.post(
  '/coding/runs/:id/finish',
  route((req) => {
    const run = codingStore.get('run', req.params.id)
    const children = codingStore
      .list('run', idOf(req))
      .filter((child) => child.parentRunId === req.params.id)
    const current =
      run ||
      (children.length
        ? ensureCodingRun({
            codingRunId: req.params.id,
            codingSessionId: idOf(req),
            workspaceRoot: workspaceFor(idOf(req)).root
          })
        : null)
    if (!current || current.sessionId !== idOf(req)) return null
    const status = ['completed', 'interrupted', 'failed'].includes(req.body.status)
      ? req.body.status
      : 'completed'
    const saved = codingStore.put('run', current.id, { ...current, status })
    notifyCoding(saved)
    return summary(saved)
  })
)
codingRouter.get(
  '/coding/workspace-diff',
  route(async (req) => {
    const { root } = workspaceFor(idOf(req))
    try {
      if (req.query.path) {
        const file = scopedPath(root, req.query.path),
          relative = path.relative(root, file).replaceAll('\\', '/')
        let before = ''
        try {
          before = (
            await git('git', ['show', `HEAD:${relative}`], {
              cwd: root,
              encoding: 'utf8',
              maxBuffer: 10000000
            })
          ).stdout
        } catch {
          /* New files have no HEAD version. */
        }
        return {
          path: file,
          before,
          after: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
        }
      }
      const { stdout } = await git(
        'git',
        ['status', '--porcelain=v1', '--untracked-files=all', '-z'],
        {
          cwd: root,
          encoding: 'utf8'
        }
      )
      const entries = stdout.split('\0').filter(Boolean),
        files = []
      for (let i = 0; i < entries.length; i++) {
        const status = entries[i].slice(0, 2),
          relativePath = entries[i].slice(3)
        files.push({
          path: scopedPath(root, relativePath),
          relativePath,
          status,
          external: true,
          undoAvailable: false
        })
        if (/[RC]/.test(status)) i++
      }
      return { git: true, files }
    } catch (error) {
      return { git: false, files: [], notice: error.message }
    }
  })
)
codingRouter.get(
  '/terminals',
  route((req) => listTerminals(idOf(req)))
)
codingRouter.post(
  '/terminals',
  route((req) => {
    const workspace = workspaceFor(idOf(req))
    if (req.body.onlyIfEmpty === true) {
      const existing = listTerminals(workspace.sessionId)
      if (existing.length) return existing[0]
    }
    return startTerminal({
      sessionId: workspace.sessionId,
      root: workspace.root,
      interactive: true
    })
  })
)
codingRouter.post(
  '/terminals/:id/stop',
  route((req) => stopTerminal(req.params.id, idOf(req)))
)
codingRouter.post(
  '/terminals/:id/preview',
  route(async (req) => {
    const terminal = listTerminals(idOf(req)).find((t) => t.id === req.params.id)
    if (!terminal || terminal.status !== 'running' || !terminal.urls.includes(req.body.url))
      throw new Error('Alamat bukan keluaran proses aktif ini.')
    const url = new URL(req.body.url)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Preview hanya menerima alamat lokal dari proses.')
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' })
    await response.body?.cancel()
    return { url: url.href, status: response.status, ready: response.status < 500 }
  })
)
codingRouter.post(
  '/coding/worktree',
  route(async (req) => {
    const workspace = workspaceFor(idOf(req))
    if (workspace.worktree?.active) throw new Error('Percakapan sudah menggunakan worktree.')
    assertWorkspaceIdle(workspace.sessionId)
    if (listTerminals(workspace.sessionId).some((t) => t.status === 'running'))
      throw new Error('Hentikan terminal sesi sebelum mengganti workspace.')
    const base = (await git('git', ['rev-parse', 'HEAD'], { cwd: workspace.root })).stdout.trim()
    const target = path.join(
      process.env.MARK_WORKTREE_ROOT ||
        path.join(os.homedir(), '.config', 'mark-agent', 'worktrees'),
      randomUUID()
    )
    fs.mkdirSync(path.dirname(target), { recursive: true })
    await git('git', ['worktree', 'add', '--detach', target, base], { cwd: workspace.root })
    return codingStore.put('worktree', workspace.sessionId, {
      sessionId: workspace.sessionId,
      root: target,
      sourceRoot: workspace.root,
      base,
      active: true
    })
  })
)
codingRouter.post(
  '/coding/worktree/return',
  route(async (req) => {
    const workspace = workspaceFor(idOf(req)),
      worktree = workspace.worktree
    if (!worktree?.active) throw new Error('Worktree tidak aktif.')
    assertWorkspaceIdle(workspace.sessionId)
    if (listTerminals(workspace.sessionId).some((t) => t.status === 'running'))
      throw new Error('Hentikan terminal sesi sebelum membawa perubahan kembali.')
    const output = await git('git', ['diff', '--no-renames', '--name-only', '-z', worktree.base], {
      cwd: worktree.root
    })
    const untracked = await git('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: worktree.root
    })
    const changes = []
    for (const file of new Set((output.stdout + untracked.stdout).split('\0').filter(Boolean))) {
      const target = scopedPath(worktree.sourceRoot, file),
        origin = scopedPath(worktree.root, file)
      let baseline = null
      try {
        baseline = (
          await git('git', ['show', `${worktree.base}:${file.replaceAll('\\', '/')}`], {
            cwd: worktree.root,
            encoding: 'buffer',
            maxBuffer: 20000000
          })
        ).stdout
      } catch {
        /* Added files have no baseline. */
      }
      const current = fs.existsSync(target) ? fs.readFileSync(target) : null
      if (fileHash(current) !== fileHash(baseline))
        throw new Error(`Konflik di folder asal: ${file}. Perubahan lokal dipertahankan.`)
      changes.push({
        path: target,
        before: current,
        after: fs.existsSync(origin) ? fs.readFileSync(origin) : null
      })
    }
    const run = {
      id: `handoff-${randomUUID()}`,
      sessionId: workspace.sessionId,
      root: worktree.sourceRoot,
      status: 'completed',
      files: [],
      checks: [],
      calls: {},
      observed: {},
      guidance: [],
      createdAt: Date.now()
    }
    if (changes.length) await commitSnapshotChanges(run, changes)
    codingStore.put('worktree', workspace.sessionId, { ...worktree, active: false })
    return { sourceRoot: worktree.sourceRoot, files: changes.length, worktreeKept: true }
  })
)
wsHub.on('terminal:command', (payload, client) => {
  if (!client.browserPanelAllowed) throw new Error('Terminal hanya tersedia melalui WebUI Mark.')
  workspaceFor(payload?.sessionId)
  if (!client.terminalCleanup) {
    client.terminalCleanup = true
    client.once('close', () => disconnectTerminals(client))
  }
  return terminalSocket(payload, client)
})
