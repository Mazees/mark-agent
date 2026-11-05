import { Router } from 'express'
import { codingStore } from '../memory/db-store.js'
import {
  projectContext,
  workspaceFor,
  scopedPath,
  rootKey,
  saveProjectMemory
} from '../services/coding-workspace.js'
import {
  undoCoding,
  reviewCoding,
  beginCodingRun,
  finishCodingRun,
  migrateCodingRun
} from '../services/coding-execution.js'
import { checkpointDiff } from '../services/coding-git.js'
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
    const target = scopedPath(run.root, req.query.path)
    const file = run.files.find((file) => rootKey(file.path) === rootKey(target))
    if (!file) throw new Error('Berkas tidak ditemukan pada diff giliran ini.')
    return checkpointDiff(run.gitWorkspaceId, file)
  })
)
codingRouter.post(
  '/coding/runs/:id/undo',
  route((req) => undoCoding(req.params.id, idOf(req), req.body.path).then(summary))
)
codingRouter.post(
  '/coding/runs/:id/review',
  route((req) => reviewCoding(req.params.id, idOf(req), req.body).then(summary))
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
  '/terminals',
  route((req) => listTerminals(idOf(req)))
)
codingRouter.post(
  '/terminals',
  route((req) => {
    const workspace = workspaceFor(idOf(req))
    if (req.body.onlyIfEmpty === true) {
      const existing = listTerminals(workspace.sessionId).filter(
        (terminal) => terminal.interactive && ['running', 'starting'].includes(terminal.status)
      )
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
wsHub.on('terminal:command', (payload, client) => {
  if (!client.browserPanelAllowed) throw new Error('Terminal hanya tersedia melalui WebUI Mark.')
  workspaceFor(payload?.sessionId)
  if (!client.terminalCleanup) {
    client.terminalCleanup = true
    client.once('close', () => disconnectTerminals(client))
  }
  return terminalSocket(payload, client)
})
