import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { approvalStore, dbStore } from '../memory/db-store.js'
import { getActiveConfig } from '../config-manager.js'
import { workspaceFor } from './coding-workspace.js'
import { reviewToolAction } from './approval-reviewer.js'
import { withApprovedFileTargets } from './tool-file-scope.js'
import {
  canonicalTarget,
  within,
  describeAction,
  FILE_MUTATIONS,
  hardDenial,
  digest,
  redactReview
} from './approval-policy.js'
import { computerUseSessionStatus } from '../tools/pc-agent.js'
import { grantComputerUsePermission } from '../tools/computer-use-permissions.js'
import { wsHub } from '../ws-hub.js'

const TTL = 300000
const error = (message, code = 'APPROVAL_REQUIRED') =>
  Object.assign(new Error(message), { code, status: 403 })

async function resolveTool(name) {
  const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
  if (NATIVE_TOOLS[name]) return { native: NATIVE_TOOLS[name], identity: name, label: name }
  if (name.startsWith('mcp_')) {
    const { findMcpTool } = await import('./mcp-service.js')
    const match = findMcpTool(name)
    if (!match) throw error('Tool MCP tidak tersedia atau izinnya telah dicabut.', 'TOOL_REVOKED')
    return {
      description: match.item.function.description,
      identity: digest([match.addon, match.item]),
      label: `${match.addon.name} / ${match.item.originalName}`
    }
  }
  const { findRegisteredAction, loadAllPlugins, getLoadedPlugins } =
    await import('../../main/plugins/plugin-loader.js')
  if (!getLoadedPlugins().length) await loadAllPlugins()
  const match = findRegisteredAction(name)
  if (!match) throw error('Tool tidak tersedia atau dinonaktifkan.', 'TOOL_REVOKED')
  const plugin = getLoadedPlugins().find((p) => p.name === match.pluginName)
  return {
    identity: digest([plugin, match.actionName]),
    label: `${plugin?.displayName || match.pluginName} / ${match.actionName}`,
    description: plugin?.actions?.find((a) => a.name === match.actionName)?.description
  }
}

export function createToolApprovals({
  store,
  sessions,
  config,
  workspace,
  lookup,
  review,
  desktopStatus = () => ({}),
  grantDesktop = () => null,
  onChange = () => {}
}) {
  const requests = new Map()
  const cancelled = new Set()
  const denials = new Map()
  const waiters = new Map()
  const rejected = new Map()
  let generation = 0
  const ownerKey = (owner) => `${owner.sessionId}:${owner.jobId || ''}:${owner.runId}`
  const ownerOf = (cfg = {}) => ({
    sessionId: String(cfg.codingSessionId || cfg.sessionId || '1'),
    runId: String(cfg.approvalRunId || cfg.computerUseRunId || cfg.codingRunId || 'direct'),
    jobId: cfg.approvalJobId || null
  })

  async function context(tool, args, cfg) {
    const owner = ownerOf(cfg)
    const root = canonicalTarget(workspace(owner.sessionId))
    const session = sessions(owner.sessionId)
    const mode = session?.approvalMode || 'smart'
    const info = await lookup(tool)
    const action = describeAction(tool, args, root, info.native)
    for (const entry of config().alwaysAllowedPaths || []) {
      if (typeof entry !== 'string' || !path.isAbsolute(entry)) continue
      const migration = `legacy:${digest(entry)}`
      if (store.getAudit(migration)) continue
      try {
        if (!fs.statSync(entry).isDirectory()) continue
        const folder = canonicalTarget(entry)
        if (
          folder === path.parse(folder).root ||
          describeAction(
            'write-file',
            { path: path.join(folder, '.mark-permission-check') },
            root,
            { needsApproval: true }
          ).protectedTarget
        )
          continue
        store.migrateFolder(migration, folder, [...FILE_MUTATIONS])
      } catch {
        /* Entri yang tidak dapat dipastikan memerlukan konfirmasi baru. */
      }
    }
    const grants = store.grants(owner.sessionId)
    const relevantGrants = grants.filter(
      (grant) =>
        grant.tool === tool &&
        (grant.kind === 'action'
          ? grant.target === digest([tool, args])
          : action.targets.some((target) => within(grant.target, target)))
    )
    const version = digest([
      'automatic-decisions-v2',
      root,
      mode,
      relevantGrants,
      info.identity,
      action.protectedTarget,
      action.massive,
      action.outside
    ])
    const actionHash = digest([tool, args, owner, action.targets, root])
    return { owner, root, mode, info, action, grants, version, actionHash }
  }
  function publicRequest(req) {
    return {
      success: true,
      requestId: req.id,
      status: req.status,
      expiresAt: req.expires,
      needsApproval: req.status === 'pending',
      denied: ['denied', 'cancelled', 'expired'].includes(req.status),
      source: req.source,
      message: redactReview(req.message).value,
      reason: req.reason,
      requiresFreshApproval: req.action.forceHuman && req.mode !== 'smart',
      canRemember:
        req.mode !== 'smart' &&
        !req.action.forceHuman &&
        !req.action.protectedTarget &&
        !req.action.massive,
      scopeLabel:
        req.action.fileMutation && !req.action.protectedTarget && !req.action.massive
          ? `Tool ${req.tool} pada folder target berikut:\n${[...new Set(req.action.targets.map((t) => path.dirname(t)))].join('\n')}`
          : 'Tool dan argumen yang sama persis',
      pause: req.pause || false
    }
  }
  function audit(req) {
    store.audit({
      id: `${req.id}:${req.status}`,
      sessionId: req.owner.sessionId,
      jobId: req.owner.jobId,
      hash: req.actionHash,
      decision: req.status,
      source: req.source,
      reason: req.reason
    })
  }
  function settle(req, status, source, reason) {
    Object.assign(req, { status, source, reason })
    if (source === 'model' && status === 'denied') {
      const count = (denials.get(ownerKey(req.owner)) || 0) + 1
      denials.set(ownerKey(req.owner), count)
      req.pause = count >= 3
    } else if (status === 'allowed') denials.delete(ownerKey(req.owner))
    if (status === 'denied') rejected.set(req.actionHash, req.version)
    audit(req)
    if (status === 'allowed' || status === 'denied') {
      waiters.get(req.id)?.(publicRequest(req))
      onChange(publicRequest(req))
    }
    return publicRequest(req)
  }
  async function evaluate(tool, args, cfg = {}, { signal, onReview } = {}) {
    for (const [id, request] of requests)
      if (request.expires < Date.now()) {
        onChange({ requestId: id, status: 'expired' })
        requests.delete(id)
      }
    signal?.throwIfAborted()
    if (typeof tool !== 'string' || !tool) throw error('Nama tool tidak valid.')
    const ctx = await context(tool, args, cfg)
    if (cancelled.has(ownerKey(ctx.owner)))
      throw error('Pekerjaan sudah dibatalkan.', 'APPROVAL_CANCELLED')
    const id = String(cfg.approvalRequestId || cfg.toolCallId || randomUUID())
    const previous = requests.get(id)
    if (previous) {
      if (previous.actionHash !== ctx.actionHash || previous.version !== ctx.version)
        throw error(
          'Isi tindakan atau kebijakan telah berubah. Minta pemeriksaan baru.',
          'APPROVAL_STALE'
        )
      if (previous.expires < Date.now())
        throw error('Permintaan izin kedaluwarsa.', 'APPROVAL_EXPIRED')
      await previous.evaluation
      return publicRequest(previous)
    }
    if (
      store.getAudit(`${id}:allowed`) ||
      store.getAudit(`${id}:pending`) ||
      store.getAudit(`${id}:denied`)
    )
      throw error(
        'Permintaan lama tidak dapat dijalankan ulang setelah restart.',
        'APPROVAL_EXPIRED'
      )
    const req = {
      ...ctx,
      id,
      tool,
      args,
      actor: cfg.agentName || 'Mark',
      bridgeOwner: {
        codingSessionId: ctx.owner.sessionId,
        sessionId: cfg.sessionId,
        computerUseRunId: cfg.computerUseRunId,
        approvalRunId: cfg.approvalRunId,
        approvalJobId: cfg.approvalJobId
      },
      status: 'evaluating',
      expires: Date.now() + TTL,
      human: false,
      message: `${cfg.agentName || 'Mark'} meminta izin menjalankan ${ctx.info.label || tool}.\n${ctx.action.targets.length || ctx.action.command ? ctx.action.scope : ''}`
    }
    requests.set(id, req)
    req.generation = generation
    req.evaluation = (async () => {
      const blocked = hardDenial(req.action, args)
      if (blocked) return settle(req, 'denied', 'rule', blocked)
      if (rejected.get(req.actionHash) === req.version)
        return settle(
          req,
          'denied',
          'model',
          'Tindakan ini sudah ditolak. Jangan mengulangnya melalui variasi command atau tool.'
        )
      if (req.action.forceHuman) {
        const current = desktopStatus()
        if (
          current.status === 'active' &&
          current.sessionId === String(cfg.sessionId || req.owner.sessionId) &&
          current.runId === String(cfg.computerUseRunId || req.owner.runId)
        )
          return settle(req, 'allowed', 'rule', 'Sesi Computer Use ini sudah diizinkan.')
        req.message = `${cfg.agentName || 'Mark'} meminta membuka sesi Computer Use. Mouse akan dikunci selama sesi aktif. Tekan Ctrl+Shift+R untuk membatalkan.`
        if (req.mode === 'smart')
          return settle(
            req,
            'denied',
            'rule',
            'Sesi Computer Use baru memerlukan izin awal manusia. Mode pintar tidak membuka dialog manual; gunakan Tanya pengguna untuk mengizinkan sesi kendali desktop.'
          )
        return settle(req, 'pending', 'rule', 'Sesi Computer Use memerlukan persetujuan manusia.')
      }
      if (req.mode === 'full')
        return settle(req, 'allowed', 'rule', 'Akses penuh aktif pada sesi ini.')
      const actionGrant = req.grants.some(
        (g) => g.tool === tool && g.kind === 'action' && g.target === digest([tool, args])
      )
      const covered =
        req.action.targets.length > 0 &&
        req.action.targets.every((target) =>
          req.grants.some((g) => g.tool === tool && g.kind === 'folder' && within(g.target, target))
        )
      if (actionGrant || (covered && !req.action.protectedTarget && !req.action.massive))
        return settle(req, 'allowed', 'grant', 'Tindakan sesuai cakupan izin tersimpan.')
      const outsideMutation =
        (req.action.fileMutation && req.action.outside) || req.action.externalMutation
      if (outsideMutation && req.mode !== 'smart')
        return settle(req, 'pending', 'rule', 'Target berada di luar folder yang diizinkan.')
      if (
        outsideMutation ||
        !req.info.native ||
        !req.action.routine ||
        (req.action.fileMutation && req.mode === 'manual') ||
        req.action.protectedTarget
      ) {
        if (req.mode === 'manual')
          return settle(req, 'pending', 'rule', 'Mode Tanya pengguna aktif.')
      } else return settle(req, 'allowed', 'rule', 'Operasi biasa dalam cakupan workspace.')
      onReview?.()
      const active = config()
      const supporting = []
      if (req.action.command) {
        const manifest = path.join(req.root, 'package.json')
        if (fs.existsSync(manifest) && fs.statSync(manifest).size < 32768)
          supporting.push({ path: manifest, content: fs.readFileSync(manifest, 'utf8') })
        for (const match of req.action.command.matchAll(
          /(?:-File\s+|\b(?:node|python|python3|pwsh|powershell)\s+)(?:["']([^"']+)["']|([^\s;&|]+))/gi
        )) {
          const file = path.resolve(req.root, match[1] || match[2])
          if (
            within(req.root, canonicalTarget(file)) &&
            fs.existsSync(file) &&
            fs.statSync(file).isFile() &&
            fs.statSync(file).size < 32768
          )
            supporting.push({ path: file, content: fs.readFileSync(file, 'utf8') })
        }
      }
      const safe = redactReview(
        {
          request: cfg.approvalGoal || cfg.codingObjective || '',
          latestInstructions: cfg.approvalInstructions || '',
          reason: cfg.approvalReason || args?.reason || '',
          actor: cfg.agentName || 'Mark',
          tool,
          description: req.info.description || '',
          args,
          targets: req.action.targets,
          supporting
        },
        Object.entries(active)
          .filter(([k, v]) => /key|token|secret|password|cookie/i.test(k) && typeof v === 'string')
          .map(([, v]) => v)
      )
      if (safe.redacted || JSON.stringify(safe.value).length > 64000)
        return settle(
          req,
          'denied',
          'rule',
          'Tindakan dihentikan karena konteks terlalu besar atau mengandung rahasia yang tidak dapat ditinjau secara lengkap.'
        )
      const verdict = await review({
        data: safe.value,
        policy: {
          workspace: req.root,
          mode: req.mode,
          effect: req.action.effect,
          allowedFolders: req.grants.filter((g) => g.kind === 'folder').map((g) => g.target),
          outsideWorkspace: req.action.outside,
          sensitiveTarget: req.action.protectedTarget,
          massDeletionOrPatch: req.action.massive,
          outsideMutationRequiresHuman: false,
          explicitRequestAuthorizesExactTargetsOnly: true,
          uncertainDecision: 'DENY',
          manualApprovalAvailable: false
        },
        config: active,
        signal,
        scope: cfg.approvalJobId ? 'subagent' : 'lead'
      })
      signal?.throwIfAborted()
      if (req.invalidated || req.generation !== generation || cancelled.has(ownerKey(req.owner)))
        throw error('Pekerjaan sudah dibatalkan.', 'APPROVAL_CANCELLED')
      if (verdict === 'APPROVE')
        return settle(req, 'allowed', 'model', 'Tindakan diizinkan oleh peninjau otomatis.')
      if (verdict === 'DENY')
        return settle(
          req,
          'denied',
          'model',
          'Peninjau menolak tindakan ini. Jangan mengulangnya lewat variasi command atau tool.'
        )
      return settle(
        req,
        'denied',
        'model',
        'Peninjau belum dapat memastikan izin tindakan ini. Tindakan dihentikan tanpa meminta persetujuan manual.'
      )
    })().catch((cause) => {
      if (signal?.aborted || cause.code === 'APPROVAL_CANCELLED') {
        req.status = 'cancelled'
        throw cause
      }
      return settle(
        req,
        req.mode === 'smart' ? 'denied' : 'pending',
        'rule',
        req.mode === 'smart'
          ? 'Pemeriksaan otomatis gagal. Tindakan dihentikan tanpa meminta persetujuan manual.'
          : 'Pemeriksaan izin gagal. Persetujuan pengguna diperlukan.'
      )
    })
    return req.evaluation
  }
  async function decide(id, cfg, choice) {
    const req = requests.get(id)
    if (!req || req.expires < Date.now() || ownerKey(ownerOf(cfg)) !== ownerKey(req.owner))
      throw error('Permintaan izin tidak berlaku atau kedaluwarsa.')
    if (!['approve_once', 'approve_session', 'approve_always', 'reject'].includes(choice))
      throw error('Keputusan izin tidak valid.')
    if (req.status !== 'pending') {
      if (req.choice === choice) return publicRequest(req)
      throw error('Permintaan izin sudah diputuskan.')
    }
    if (req.deciding) {
      if (req.deciding.choice === choice) return req.deciding.promise
      throw error('Keputusan untuk tindakan ini sedang diproses.')
    }
    req.deciding = { choice }
    req.deciding.promise = decidePending(req, cfg, choice).catch((cause) => {
      req.deciding = null
      throw cause
    })
    return req.deciding.promise
  }
  async function decidePending(req, cfg, choice) {
    if (sessions(req.owner.sessionId)?.approvalMode === 'smart')
      throw error('Mode pintar tidak menerima keputusan izin manual.', 'APPROVAL_STALE')
    if (choice === 'reject') {
      req.choice = choice
      return settle(
        req,
        'denied',
        'user',
        'Pengguna menolak tindakan ini. Hentikan tindakan terkait dan tunggu instruksi baru.'
      )
    }
    const fresh = await context(req.tool, req.args, cfg)
    if (
      fresh.actionHash !== req.actionHash ||
      fresh.version !== req.version ||
      cancelled.has(ownerKey(req.owner))
    )
      throw error('Target tindakan atau kebijakan berubah. Periksa ulang.', 'APPROVAL_STALE')
    if (hardDenial(fresh.action, req.args))
      throw error('Tindakan ini tidak diizinkan.', 'APPROVAL_DENIED')
    req.version = fresh.version
    req.choice = choice
    req.human = true
    if (
      !req.action.forceHuman &&
      !req.action.protectedTarget &&
      !req.action.massive &&
      choice !== 'approve_once'
    ) {
      const sessionId = choice === 'approve_always' ? null : req.owner.sessionId
      if (req.action.fileMutation)
        for (const target of new Set(req.action.targets.map((t) => path.dirname(t))))
          store.grant({ sessionId, tool: req.tool, kind: 'folder', target })
      else
        store.grant({
          sessionId,
          tool: req.tool,
          kind: 'action',
          target: digest([req.tool, req.args])
        })
      req.version = (await context(req.tool, req.args, cfg)).version
    }
    return settle(req, 'allowed', 'user', 'Tindakan telah diizinkan pengguna.')
  }
  async function execute(tool, args, cfg, handler) {
    const evaluated = await evaluate(tool, args, cfg, { signal: cfg.signal })
    const req = requests.get(evaluated.requestId)
    if (req.status !== 'allowed')
      throw error(req.reason, req.status === 'denied' ? 'APPROVAL_DENIED' : 'APPROVAL_REQUIRED')
    if (req.execution) return req.execution
    req.execution = (async () => {
      const fresh = await context(tool, args, cfg)
      cfg.signal?.throwIfAborted()
      if (
        req.generation !== generation ||
        cancelled.has(ownerKey(req.owner)) ||
        fresh.version !== req.version ||
        fresh.actionHash !== req.actionHash
      )
        throw error('Izin dicabut atau target berubah.', 'APPROVAL_STALE')
      const finalConfig = { ...cfg, workspaceRoot: req.root }
      if (req.action.forceHuman && req.human)
        finalConfig.computerUseApprovalToken = grantDesktop({
          sessionId: String(cfg.sessionId || req.owner.sessionId),
          runId: cfg.computerUseRunId || req.owner.runId
        })
      if (req.action.fileMutation || req.action.fileRead)
        return withApprovedFileTargets(finalConfig, tool, args, fresh.action.targets, () =>
          handler(finalConfig)
        )
      return handler(finalConfig)
    })()
    return req.execution
  }
  function cancel(cfg) {
    const key = ownerKey(ownerOf(cfg))
    cancelled.add(key)
    for (const req of requests.values())
      if (ownerKey(req.owner) === key && !req.execution) {
        req.status = 'cancelled'
        waiters.get(req.id)?.({
          ...publicRequest(req),
          denied: true,
          reason: 'Pekerjaan dibatalkan.'
        })
        onChange(publicRequest(req))
      }
  }
  function modeChanged(sessionId) {
    for (const req of requests.values())
      if (
        req.owner.sessionId === String(sessionId) &&
        !req.execution &&
        ['pending', 'evaluating'].includes(req.status)
      ) {
        req.invalidated = true
        req.status = 'cancelled'
        req.reason = 'Mode perizinan berubah. Periksa tindakan kembali.'
        waiters.get(req.id)?.(publicRequest(req))
        onChange(publicRequest(req))
      }
  }
  function pendingJobs() {
    return [...requests.values()]
      .filter(
        (req) =>
          req.owner.jobId &&
          req.status === 'pending' &&
          req.expires > Date.now() &&
          sessions(req.owner.sessionId)?.approvalMode !== 'smart'
      )
      .map((req) => ({
        ...publicRequest(req),
        tool: req.tool,
        query: redactReview(req.args).value,
        owner: req.bridgeOwner
      }))
  }
  function waitForDecision(id, signal) {
    const req = requests.get(id)
    if (!req || req.expires <= Date.now())
      return Promise.reject(error('Permintaan izin kedaluwarsa.', 'APPROVAL_EXPIRED'))
    if (req.status !== 'pending') return Promise.resolve(publicRequest(req))
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        waiters.delete(id)
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        reject(signal.reason || error('Pekerjaan dibatalkan.', 'APPROVAL_CANCELLED'))
      }
      const timer = setTimeout(
        () => {
          cleanup()
          req.status = 'expired'
          onChange(publicRequest(req))
          reject(error('Permintaan izin kedaluwarsa.', 'APPROVAL_EXPIRED'))
        },
        Math.max(1, req.expires - Date.now())
      )
      waiters.set(id, (result) => {
        cleanup()
        resolve(result)
      })
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  function clear() {
    generation++
    for (const req of requests.values()) onChange({ requestId: req.id, status: 'cancelled' })
    for (const done of waiters.values())
      done({ denied: true, reason: 'Konteks perizinan telah dipulihkan.' })
    requests.clear()
    cancelled.clear()
    denials.clear()
    rejected.clear()
  }
  return { evaluate, decide, execute, cancel, modeChanged, clear, pendingJobs, waitForDecision }
}

export const toolApprovals = createToolApprovals({
  store: approvalStore,
  sessions: (id) => dbStore.sessions.getById(id),
  config: getActiveConfig,
  workspace: (id) => workspaceFor(id).root,
  lookup: resolveTool,
  review: reviewToolAction,
  desktopStatus: computerUseSessionStatus,
  grantDesktop: grantComputerUsePermission,
  onChange: (permission) =>
    wsHub.broadcast('tool:approval-closed', {
      requestId: permission.requestId,
      status: permission.status
    })
})
