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
  applyWorkspaceChanges,
  beginCodingRun,
  finishCodingRun,
  migrateCodingRun
} from '../services/coding-execution.js'
import {
  checkpointDiff,
  workspaceChanges,
  captureWorkspace,
  checkpointChanges,
  checkpointBytes,
  checkpointFileBytes,
  runCheckpointRef
} from '../services/coding-git.js'
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
  files: run.files.map(({ before, after, ...file }) => ({
    ...file,
    added: file.added ?? before === null,
    deleted: file.deleted ?? after === null
  }))
})
codingRouter.post(
  '/coding/runs/begin',
  route(async (req) => {
    const workspace = workspaceFor(idOf(req))
    if (typeof req.body.runId !== 'string' || !req.body.runId || req.body.runId.length > 200)
      throw new Error('ID pekerjaan coding wajib disertakan.')
    const run = await beginCodingRun(
      {
        codingRunId: req.body.runId,
        codingSessionId: workspace.sessionId,
        workspaceRoot: workspace.root,
        codingObjective: req.body.objective,
        taskId: req.body.taskId,
        stepId: req.body.stepId
      },
      req.body.capture !== false
    )
    return summary(run)
  })
)
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
  route(async (req) => {
    const run = codingStore.get('run', req.params.id)
    if (!run || run.sessionId !== idOf(req)) throw new Error('Pekerjaan coding tidak ditemukan.')
    return summary(await migrateCodingRun(run))
  })
)
codingRouter.get(
  '/coding/runs/:id/diff',
  route(async (req) => {
    let run = codingStore.get('run', req.params.id)
    if (!run || run.sessionId !== idOf(req)) throw new Error('Pekerjaan coding tidak ditemukan.')
    run = await migrateCodingRun(run)
    if (run.captureStatus !== 'completed')
      throw new Error(run.captureError || 'Diff belum tersedia untuk giliran ini.')
    const file = run.files.find((file) => file.path === req.query.path)
    if (!file) throw new Error('Berkas tidak ditemukan pada diff giliran ini.')
    return checkpointDiff(run.gitWorkspaceId, file)
  })
)
codingRouter.post(
  '/coding/runs/:id/undo',
  route((req) => undoCoding(req.params.id, idOf(req), req.body.path).then(summary))
)
codingRouter.post(
  '/coding/runs/:id/finish',
  route(async (req) => {
    const status = ['completed', 'interrupted', 'failed'].includes(req.body.status)
      ? req.body.status
      : 'completed'
    return summary(await finishCodingRun(req.params.id, idOf(req), status))
  })
)
codingRouter.get(
  '/coding/workspace-diff',
  route(async (req) => {
    const { root } = workspaceFor(idOf(req))
    try {
      const diff = await workspaceChanges(
        root,
        req.query.path ? scopedPath(root, req.query.path) : null
      )
      if (diff.gitWorkspaceId)
        codingStore.put('git-workspace', diff.gitWorkspaceId, {
          sessionId: idOf(req),
          root,
          gitWorkspaceId: diff.gitWorkspaceId
        })
      return diff
    } catch (error) {
      return { available: false, files: [], notice: error.message }
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
    const base = (await git(['rev-parse', 'HEAD'], { cwd: workspace.root })).stdout.trim()
    const target = path.join(
      process.env.MARK_WORKTREE_ROOT ||
        path.join(os.homedir(), '.config', 'mark-agent', 'worktrees'),
      randomUUID()
    )
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const sourceBaseline = await captureWorkspace(
      workspace.root,
      runCheckpointRef(target, 'source')
    )
    await git(['worktree', 'add', '--detach', target, base], { cwd: workspace.root })
    const worktree = codingStore.put('worktree', workspace.sessionId, {
      sessionId: workspace.sessionId,
      root: target,
      sourceRoot: workspace.root,
      base,
      sourceBaselineOid: sourceBaseline.oid,
      sourceGitWorkspaceId: sourceBaseline.workspaceId,
      active: true
    })
    codingStore.put('git-workspace', sourceBaseline.workspaceId, {
      sessionId: workspace.sessionId,
      root: workspace.root,
      gitWorkspaceId: sourceBaseline.workspaceId
    })
    try {
      const initial = await captureWorkspace(target, runCheckpointRef(target, 'initial'))
      codingStore.put('git-workspace', initial.workspaceId, {
        sessionId: workspace.sessionId,
        root: target,
        gitWorkspaceId: initial.workspaceId
      })
      return codingStore.put('worktree', workspace.sessionId, {
        ...worktree,
        initialOid: initial.oid,
        gitWorkspaceId: initial.workspaceId
      })
    } catch (error) {
      codingStore.put('worktree', workspace.sessionId, {
        ...worktree,
        checkpointError: error.message
      })
      throw new Error(
        `Worktree dibuat di ${target}, tetapi checkpoint awal gagal: ${error.message}. Folder dipertahankan.`
      )
    }
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
    if (!worktree.initialOid || !worktree.sourceBaselineOid)
      throw new Error(
        'Worktree ini tidak mempunyai checkpoint awal lengkap. Folder dipertahankan; tinjau dan bawa hasil secara manual.'
      )
    const currentTree = await captureWorkspace(
      worktree.root,
      runCheckpointRef(worktree.root, 'handoff')
    )
    const changedFiles = await checkpointChanges(
      worktree.root,
      worktree.gitWorkspaceId,
      worktree.initialOid,
      currentTree.oid
    )
    const changes = []
    for (const changed of changedFiles) {
      const file = changed.relativePath
      const target = scopedPath(worktree.sourceRoot, file),
        origin = scopedPath(worktree.root, file)
      const baseline = await checkpointBytes(
        worktree.gitWorkspaceId,
        changed.beforeOid,
        changed.beforeSize
      )
      const sourceBaseline = await checkpointFileBytes(
        worktree.sourceGitWorkspaceId,
        worktree.sourceBaselineOid,
        file
      )
      const current = fs.existsSync(target) ? fs.readFileSync(target) : null
      if (
        fileHash(current) !== fileHash(sourceBaseline) ||
        fileHash(sourceBaseline) !== fileHash(baseline)
      )
        throw new Error(`Konflik di folder asal: ${file}. Perubahan lokal dipertahankan.`)
      const after = await checkpointBytes(
        worktree.gitWorkspaceId,
        changed.afterOid,
        changed.afterSize
      )
      if (fileHash(fs.existsSync(origin) ? fs.readFileSync(origin) : null) !== fileHash(after))
        throw new Error(
          `Worktree berubah saat ditinjau: ${file}. Baca ulang sebelum membawa hasil.`
        )
      changes.push({
        path: target,
        before: current,
        after
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
    if (changes.length) await applyWorkspaceChanges(run, changes)
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
