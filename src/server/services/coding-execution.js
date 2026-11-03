import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { codingStore, dbStore } from '../memory/db-store.js'
import { fileHash, rootKey, scopedPath, instructionsFor, workspaceFor } from './coding-workspace.js'
import { parsePatch, writeBytes } from '../../main/tools/file-patch.js'
import { validateFileSyntax } from '../../main/syntax-validator.js'
import { wsHub } from '../ws-hub.js'
import { isVerificationCommand } from '../../shared/agent/execution-quality.js'

const locks = new Map()
const activeCalls = new Map()
const mutations = new Set([
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'apply-patch'
])
for (const run of codingStore.list('run'))
  if (run.status === 'running') codingStore.put('run', run.id, { ...run, status: 'interrupted' })
const bytes = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null)
const encode = (value) => (value == null ? null : value.toString('base64'))
export const decodeSnapshot = (value) => (value == null ? null : Buffer.from(value, 'base64'))
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
    if (['waiting', 'interrupted'].includes(previous.status))
      return codingStore.put('run', id, { ...previous, status: 'running' })
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
    stepId: config.stepId || null,
    files: [],
    checks: [],
    calls: {},
    observed: {},
    guidance: []
  })
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
function recordFiles(run, changes) {
  for (const change of changes) {
    const existing = run.files.find((file) => file.path === change.path)
    const before = existing ? existing.before : encode(change.before)
    const beforeHash = existing ? existing.beforeHash : fileHash(change.before)
    const item = {
      path: change.path,
      relativePath: path.relative(run.root, change.path),
      before,
      beforeHash,
      after: encode(change.after),
      afterHash: fileHash(change.after),
      undoAvailable: true,
      undone: false
    }
    if (existing) Object.assign(existing, item)
    else run.files.push(item)
    run.observed[change.path] = item.afterHash
  }
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
      const run = ensureCodingRun(config)
      if (!run) return tool.handler(args, config)
      const callId = config.toolCallId
      if (callId && run.calls[callId]) return run.calls[callId]
      const parsed = fileArgs(args)
      if (name === 'read-file') {
        let observedFile
        try {
          observedFile = scopedPath(run.root, parsed.path)
        } catch {
          return tool.handler(args, config)
        }
        const beforeRead = fileHash(bytes(observedFile))
        const result = await tool.handler(args, config)
        if (result.success) {
          let file
          try {
            file = scopedPath(run.root, parsed.path)
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
          const guidance = instructionsFor(run.root, [file])
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
          ? parsePatch(parsed.patch, (file) => scopedPath(run.root, file))
          : [{ path: scopedPath(run.root, parsed.path) }]
      return locked(
        plans.map((p) => p.path),
        async () => {
          const fresh = codingStore.get('run', run.id)
          if (callId && fresh.calls[callId]) return fresh.calls[callId]
          const guidance = instructionsFor(
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
            scopedPath(run.root, plan.path)
            if (
              config.ownedFiles?.length &&
              !config.ownedFiles.some((file) => scopedPath(run.root, file) === plan.path)
            )
              return {
                success: false,
                code: 'FILE_OWNERSHIP',
                error: 'Berkas ini bukan tanggung jawab penugasan Minibot.'
              }
            const current = bytes(plan.path),
              hash = fileHash(current)
            if (current && !(plan.path in fresh.observed))
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
            recordFiles(fresh, applied)
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
export async function commitSnapshotChanges(run, changes) {
  return locked(
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
        recordFiles(run, changes)
        return saveResult(run)
      } catch (error) {
        for (const change of applied.reverse())
          if (fileHash(bytes(change.path)) === fileHash(change.after))
            writeBytes(change.path, change.before)
        throw error
      }
    }
  )
}
export async function undoCoding(runId, sessionId, filePath) {
  const run = codingStore.get('run', runId)
  const { root } = workspaceFor(sessionId)
  if (!run || run.sessionId !== String(sessionId) || rootKey(run.root) !== rootKey(root))
    throw new Error('Pekerjaan tidak tersedia pada workspace aktif.')
  if (['running', 'waiting'].includes(run.status))
    throw new Error('Tunggu giliran coding selesai sebelum melakukan undo.')
  const changes = run.files.filter((file) => !file.undone && (!filePath || file.path === filePath))
  if (!changes.length) throw new Error('Tidak ada snapshot yang dapat dipulihkan.')
  return locked(
    changes.map((c) => c.path),
    async () => {
      for (const change of changes) {
        scopedPath(root, change.path)
        if (fileHash(bytes(change.path)) !== change.afterHash)
          throw new Error(`Konflik pada ${change.relativePath}; perubahan lanjutan dipertahankan.`)
      }
      const applied = []
      try {
        for (const change of changes) {
          writeBytes(change.path, decodeSnapshot(change.before))
          applied.push(change)
        }
        for (const change of changes) change.undone = true
        return saveResult(run)
      } catch (error) {
        for (const change of applied.reverse())
          writeBytes(change.path, decodeSnapshot(change.after))
        throw error
      }
    }
  )
}
