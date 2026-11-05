import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { codingStore, dbStore } from '../memory/db-store.js'
import { fileHash, rootKey, scopedPath, instructionsFor, workspaceFor } from './coding-workspace.js'
import { parsePatch, writeBytes } from '../../main/tools/file-patch.js'
import { validateFileSyntax } from '../../main/syntax-validator.js'
import { wsHub } from '../ws-hub.js'
import { isVerificationCommand } from '../../shared/agent/execution-quality.js'
import { isApprovedFileTarget } from './tool-file-scope.js'
import {
  captureWorkspace,
  checkpointChanges,
  checkpointBytes,
  migrateSnapshotRun,
  bytesOid,
  runCheckpointRef,
  withCheckpointLock
} from './coding-git.js'

const locks = new Map()
const activeCalls = new Map()
const capturing = new Map()
const finishing = new Map()
const migrating = new Map()
const mutations = new Set([
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'apply-patch'
])
for (const run of codingStore.list('run'))
  if (run.status === 'running')
    codingStore.put('run', run.id, {
      ...run,
      status: 'interrupted',
      finishedAt: Date.now(),
      ...(run.beforeOid && !run.afterOid
        ? {
            captureStatus: 'failed',
            captureError: 'Proses terputus sebelum checkpoint akhir tersedia.'
          }
        : {})
    })
const bytes = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null)
export function notifyCoding(run) {
  wsHub.broadcast('coding:updated', { sessionId: run.sessionId, runId: run.id })
}
export function ensureCodingRun(config) {
  const id = config.codingRunId
  const sessionId = String(config.codingSessionId || config.sessionId || '1')
  const root = config.workspaceRoot
  if (!id || !root) return null
  const previous = codingStore.get('run', id)
  if (previous) {
    if (previous.sessionId !== sessionId || rootKey(previous.root) !== rootKey(root))
      throw new Error('Identitas pekerjaan coding tidak cocok.')
    if (previous.status === 'waiting' && !previous.finishedAt)
      return codingStore.put('run', id, { ...previous, status: 'running' })
    if (
      !previous.finishedAt &&
      ((config.taskId && config.taskId !== previous.taskId) ||
        (config.stepId && config.stepId !== previous.stepId))
    )
      return codingStore.put('run', id, {
        ...previous,
        taskId: config.taskId || previous.taskId,
        stepId: config.stepId || previous.stepId
      })
    return previous
  }
  return codingStore.put('run', id, {
    sessionId,
    root,
    status: 'running',
    createdAt: Date.now(),
    taskId: config.taskId || null,
    parentRunId: config.parentCodingRunId || null,
    agentName: config.agentName || null,
    objective: String(config.codingObjective || '').slice(0, 4000),
    checkpointVersion: 1,
    captureStatus: 'not_started',
    captureScope: 'workspace-window',
    stepId: config.stepId || null,
    files: [],
    checks: [],
    calls: {},
    observed: {},
    guidance: []
  })
}
export async function migrateCodingRun(run) {
  if (!run || run.checkpointVersion || !run.files?.some((file) => Object.hasOwn(file, 'before')))
    return run
  if (migrating.has(run.id)) return migrating.get(run.id)
  const promise = (async () => {
    try {
      const migrated = await migrateSnapshotRun(run)
      return codingStore.put('run', run.id, migrated)
    } catch (error) {
      return codingStore.put('run', run.id, {
        ...run,
        captureStatus: 'failed',
        captureError: `Migrasi diff belum berhasil: ${error.message}`
      })
    }
  })().finally(() => migrating.delete(run.id))
  migrating.set(run.id, promise)
  return promise
}
export async function migrateStoredCodingRuns() {
  for (const run of codingStore.list('run')) {
    const migrated = await migrateCodingRun(run)
    if (migrated !== run) notifyCoding(migrated)
  }
}
export async function beginCodingRun(config, capture = true) {
  let run = ensureCodingRun(config)
  if (
    !run ||
    !capture ||
    run.finishedAt ||
    ['ready', 'completed', 'failed'].includes(run.captureStatus)
  )
    return run
  if (capturing.has(run.id)) return capturing.get(run.id)
  const promise = (async () => {
    try {
      const before = await captureWorkspace(run.root, runCheckpointRef(run.id, 'before'))
      run = codingStore.get('run', run.id)
      const saved = saveResult({
        ...run,
        beforeOid: before.oid,
        gitWorkspaceId: before.workspaceId,
        captureStatus: 'ready',
        captureError: null
      })
      codingStore.put('git-workspace', before.workspaceId, {
        sessionId: run.sessionId,
        root: run.root,
        gitWorkspaceId: before.workspaceId
      })
      return saved
    } catch (error) {
      return saveResult({
        ...codingStore.get('run', run.id),
        captureStatus: 'failed',
        captureError: `Diff tidak tersedia: ${error.message}`
      })
    }
  })().finally(() => capturing.delete(run.id))
  capturing.set(run.id, promise)
  return promise
}
export async function finishCodingRun(id, sessionId, status = 'completed') {
  let run = codingStore.get('run', id)
  if (!run || run.sessionId !== String(sessionId))
    throw new Error('Pekerjaan coding tidak ditemukan dalam sesi ini.')
  if (finishing.has(id)) return finishing.get(id)
  if (run.finishedAt) return migrateCodingRun(run)
  const promise = (async () => {
    if (capturing.has(id)) await capturing.get(id)
    const pendingCalls = [...activeCalls.entries()]
      .filter(([key]) => JSON.parse(key)[1] === id)
      .map(([, pending]) => pending)
    await Promise.allSettled(pendingCalls)
    run = codingStore.get('run', id)
    let changes = {}
    if (run.captureStatus === 'ready') {
      try {
        const after = await captureWorkspace(run.root, runCheckpointRef(id, 'after'))
        const files = await checkpointChanges(
          run.root,
          run.gitWorkspaceId,
          run.beforeOid,
          after.oid
        )
        changes = { afterOid: after.oid, files, captureStatus: 'completed', captureError: null }
      } catch (error) {
        changes = { captureStatus: 'failed', captureError: `Diff tidak tersedia: ${error.message}` }
      }
    }
    return saveResult({ ...codingStore.get('run', id), ...changes, status, finishedAt: Date.now() })
  })().finally(() => finishing.delete(id))
  finishing.set(id, promise)
  return promise
}
async function locked(files, action) {
  const releases = []
  try {
    for (const key of [...new Set(files.map(rootKey))].sort()) {
      const previous = locks.get(key) || Promise.resolve()
      let release
      const gate = new Promise((resolve) => (release = resolve))
      const tail = previous.catch(() => {}).then(() => gate)
      locks.set(key, tail)
      await previous.catch(() => {})
      releases.push(() => {
        release()
        if (locks.get(key) === tail) locks.delete(key)
      })
    }
    return await action()
  } finally {
    for (const release of releases.reverse()) release()
  }
}
function saveResult(run) {
  const saved = dbStore.sqlite.transaction(() => {
    const savedRun = codingStore.put('run', run.id, run)
    const memoryId = `${run.sessionId}:${rootKey(run.root)}`
    const memory = codingStore.get('memory', memoryId) || {}
    codingStore.put('memory', memoryId, {
      ...memory,
      sessionId: run.sessionId,
      root: run.root,
      activeObjective: (!run.parentRunId && run.objective) || memory.activeObjective || '',
      recentFiles: [
        ...new Set([...run.files.map((file) => file.relativePath), ...(memory.recentFiles || [])])
      ].slice(0, 40),
      checks: [
        ...(memory.checks || []).filter(
          (check) => !run.checks.some((current) => current.id === check.id)
        ),
        ...run.checks.map(({ id, command, kind, status, createdAt }) => ({
          id,
          command,
          kind,
          status,
          createdAt
        }))
      ].slice(-20)
    })
    return savedRun
  })()
  notifyCoding(saved)
  return saved
}
function fileArgs(args) {
  if (typeof args === 'object' && args) return args
  return {
    path: String(args || '')
      .split('||')[0]
      .trim()
  }
}
function recordObserved(run, changes) {
  for (const change of changes) {
    run.observed[change.path] = fileHash(change.after)
  }
}
function workspaceInstructions(root, files) {
  const inside = files.filter((file) => {
    try {
      scopedPath(root, file)
      return true
    } catch {
      return false
    }
  })
  return inside.length ? instructionsFor(root, inside) : []
}
export function wrapCodingTool(name, tool) {
  if (
    !mutations.has(name) &&
    !['read-file', 'run-powershell', 'run-task', 'read-task-output'].includes(name)
  )
    return tool
  const wrapped = {
    ...tool,
    handler: async (args, config = {}) => {
      const run = await beginCodingRun(config)
      if (!run) return tool.handler(args, config)
      const callId = config.toolCallId
      if (callId && run.calls[callId]) return run.calls[callId]
      if (run.finishedAt)
        throw new Error('Rekaman coding sudah ditutup; gunakan identitas turn yang baru.')
      const parsed = fileArgs(args)
      const resolveFile = (value) => {
        const file = path.resolve(run.root, value)
        return isApprovedFileTarget(config, name, args, run.root, file)
          ? file
          : scopedPath(run.root, value)
      }
      if (name === 'read-file') {
        let observedFile
        try {
          observedFile = resolveFile(parsed.path)
        } catch {
          return tool.handler(args, config)
        }
        const beforeRead = fileHash(bytes(observedFile))
        const result = await tool.handler(args, config)
        if (result.success) {
          let file
          try {
            file = resolveFile(parsed.path)
          } catch {
            return result
          }
          const afterRead = fileHash(bytes(file))
          if (beforeRead !== afterRead)
            return {
              success: false,
              code: 'FILE_CHANGED',
              error: 'Berkas berubah saat dibaca; baca ulang.'
            }
          const fresh = codingStore.get('run', run.id)
          fresh.observed[file] = afterRead
          const guidance = workspaceInstructions(run.root, [file])
          fresh.guidance = [...new Set([...fresh.guidance, ...guidance.map((item) => item.hash)])]
          result.projectInstructions = guidance
          saveResult(fresh)
        }
        return result
      }
      if (!mutations.has(name)) {
        const result = await tool.handler(args, config)
        const fresh = codingStore.get('run', run.id)
        const command = parsed.command || (typeof args === 'string' ? args : '')
        if (
          name === 'run-powershell' ||
          (name === 'read-task-output' && result.status && result.status !== 'running')
        ) {
          const commandText = command || result.command || ''
          const check = isVerificationCommand(commandText)
          if (check)
            fresh.checks.push({
              id: callId || randomUUID(),
              command: commandText,
              status:
                result.success && (result.status == null || result.status === 'completed')
                  ? 'passed'
                  : 'failed',
              exitCode: result.exitCode ?? null,
              output: result.output || result.data || result.error || '',
              createdAt: Date.now()
            })
        }
        if (callId && name !== 'read-task-output') fresh.calls[callId] = result
        saveResult(fresh)
        return result
      }
      const plans =
        name === 'apply-patch'
          ? parsePatch(parsed.patch, resolveFile)
          : [{ path: resolveFile(parsed.path) }]
      return locked(
        plans.map((p) => p.path),
        async () => {
          const fresh = codingStore.get('run', run.id)
          if (callId && fresh.calls[callId]) return fresh.calls[callId]
          const guidance = workspaceInstructions(
            run.root,
            plans.map((p) => p.path)
          )
          const unseen = guidance.filter((item) => !fresh.guidance.includes(item.hash))
          if (unseen.length) {
            fresh.guidance.push(...unseen.map((item) => item.hash))
            saveResult(fresh)
            return {
              success: false,
              code: 'PROJECT_INSTRUCTIONS_REQUIRED',
              error: 'Baca instruksi proyek berikut sebelum mengulang perubahan.',
              projectInstructions: unseen
            }
          }
          for (const plan of plans) {
            resolveFile(plan.path)
            if (
              config.ownedFiles?.length &&
              !config.ownedFiles.some(
                (file) => rootKey(path.resolve(run.root, file)) === rootKey(plan.path)
              )
            )
              return {
                success: false,
                code: 'FILE_OWNERSHIP',
                error: 'Berkas ini bukan tanggung jawab penugasan Minibot.'
              }
            const current = bytes(plan.path),
              hash = fileHash(current)
            if (
              current &&
              !(plan.path in fresh.observed) &&
              !(
                name === 'delete-file' &&
                isApprovedFileTarget(config, name, args, run.root, plan.path)
              )
            )
              return {
                success: false,
                code: 'FILE_READ_REQUIRED',
                error: `Baca berkas sebelum mengubah: ${plan.path}`
              }
            if (plan.path in fresh.observed && fresh.observed[plan.path] !== hash)
              return {
                success: false,
                code: 'FILE_CHANGED',
                error: `Berkas berubah sejak dibaca; baca ulang: ${plan.path}`
              }
            if (name === 'apply-patch' && fileHash(plan.before) !== hash)
              return {
                success: false,
                code: 'FILE_CHANGED',
                error: 'Patch kedaluwarsa; baca ulang target.'
              }
            plan.before = current
          }
          const applied = []
          try {
            let result
            if (name === 'apply-patch') {
              for (const plan of plans) {
                writeBytes(plan.path, plan.after)
                applied.push(plan)
              }
              result = { success: true, message: `Patch diterapkan pada ${plans.length} berkas.` }
              const checks = []
              for (const plan of plans)
                if (plan.after)
                  checks.push(await validateFileSyntax(plan.path, plan.after.toString('utf8')))
              result.validation = {
                status: checks.some((c) => !c.valid) ? 'failed' : 'not_checked',
                checks
              }
            } else {
              result = await tool.handler(args, config)
              plans[0].after = bytes(plans[0].path)
              if (fileHash(plans[0].after) !== fileHash(plans[0].before)) applied.push(plans[0])
              result.validation = {
                status: result.warning ? 'failed' : 'not_checked',
                error: result.syntaxError || null
              }
            }
            recordObserved(fresh, applied)
            if (result.validation?.status === 'failed')
              fresh.checks.push({
                id: callId || randomUUID(),
                kind: 'syntax',
                status: 'failed',
                output: result.syntaxError || JSON.stringify(result.validation),
                createdAt: Date.now()
              })
            if (callId) fresh.calls[callId] = result
            saveResult(fresh)
            return result
          } catch (error) {
            for (const change of applied.reverse()) {
              if (fileHash(bytes(change.path)) === fileHash(change.after))
                writeBytes(change.path, change.before)
            }
            throw error
          }
        }
      )
    }
  }
  const handler = wrapped.handler
  wrapped.handler = (args, config = {}) => {
    if (!config.codingRunId || !config.toolCallId) return handler(args, config)
    const key = JSON.stringify([
      config.codingSessionId,
      config.codingRunId,
      config.toolCallId,
      name
    ])
    if (activeCalls.has(key)) return activeCalls.get(key)
    const pending = handler(args, config).finally(() => activeCalls.delete(key))
    activeCalls.set(key, pending)
    return pending
  }
  return wrapped
}
export async function applyWorkspaceChanges(run, changes) {
  const config = { codingRunId: run.id, codingSessionId: run.sessionId, workspaceRoot: run.root }
  await beginCodingRun(config)
  try {
    await locked(
      changes.map((c) => c.path),
      async () => {
        for (const change of changes) scopedPath(run.root, change.path)
        for (const change of changes)
          if (fileHash(bytes(change.path)) !== fileHash(change.before))
            throw new Error(`Konflik pada ${change.path}`)
        const applied = []
        try {
          for (const change of changes) {
            writeBytes(change.path, change.after)
            applied.push(change)
          }
          const fresh = codingStore.get('run', run.id)
          recordObserved(fresh, changes)
          return saveResult(fresh)
        } catch (error) {
          for (const change of applied.reverse())
            if (fileHash(bytes(change.path)) === fileHash(change.after))
              writeBytes(change.path, change.before)
          throw error
        }
      }
    )
    return await finishCodingRun(run.id, run.sessionId)
  } catch (error) {
    await finishCodingRun(run.id, run.sessionId, 'failed')
    throw error
  }
}
export async function undoCoding(runId, sessionId, filePath) {
  const run = await migrateCodingRun(codingStore.get('run', runId))
  const { root } = workspaceFor(sessionId)
  if (!run || run.sessionId !== String(sessionId) || rootKey(run.root) !== rootKey(root))
    throw new Error('Pekerjaan tidak tersedia pada workspace aktif.')
  if (
    ['running', 'waiting'].includes(run.status) ||
    (!run.finishedAt && run.checkpointVersion && run.captureScope !== 'recorded-files')
  )
    throw new Error('Tunggu giliran coding selesai sebelum melakukan undo.')
  const changes = run.files.filter((file) => !file.undone && (!filePath || file.path === filePath))
  if (run.captureStatus !== 'completed' || !changes.length)
    throw new Error('Tidak ada checkpoint lengkap yang dapat dipulihkan.')
  return withCheckpointLock(`undo:${runId}`, () =>
    locked(
      changes.map((c) => c.path),
      async () => {
        const recovery = []
        for (const change of changes) {
          scopedPath(root, change.path)
          const current = bytes(change.path)
          if ((await bytesOid(run.gitWorkspaceId, current)) !== change.afterOid)
            throw new Error(
              `Konflik pada ${change.relativePath}; perubahan lanjutan dipertahankan.`
            )
          recovery.push({
            ...change,
            before: current,
            after: await checkpointBytes(run.gitWorkspaceId, change.beforeOid, change.beforeSize)
          })
        }
        const applied = []
        try {
          for (const change of recovery) {
            if (fileHash(bytes(change.path)) !== fileHash(change.before))
              throw new Error(`Konflik pada ${change.relativePath}.`)
            writeBytes(change.path, change.after)
            applied.push(change)
          }
          const fresh = codingStore.get('run', runId)
          for (const file of fresh.files)
            if (changes.some((change) => change.path === file.path)) file.undone = true
          return saveResult(fresh)
        } catch (error) {
          for (const change of applied.reverse())
            if (fileHash(bytes(change.path)) === fileHash(change.after))
              writeBytes(change.path, change.before)
          throw error
        }
      }
    )
  )
}
