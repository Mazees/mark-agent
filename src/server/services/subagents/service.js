import { skillService } from '../../../main/skills/skill-service.js'
import { skillSummary } from '../../../shared/skill-context.js'
import path from 'node:path'
import fs from 'node:fs'
import { dbStore } from '../../memory/db-store.js'
import { wsHub } from '../../ws-hub.js'
import { fetchAI } from '../ai-bridge.js'
import { getActiveConfig } from '../../config-manager.js'
import { NATIVE_TOOLS } from '../../../main/tools/index.js'
import { GROUP_TOOLS_SCHEMA, GROUP_TOOL_GROUP_NAMES } from '../../tools/group-tools.js'
import {
  getLoadedPlugins,
  loadAllPlugins,
  executePluginAction
} from '../../../main/plugins/plugin-loader.js'
import { buildPluginToolGroups } from '../../../shared/plugin-schema.js'
import { core_tools_schema } from '../../../shared/agent/core-tools.js'
import { SubagentRuntime } from './runtime.js'
import { createJobExecutor } from './executor.js'
import { DEFAULT_WORKSPACE_ROOT } from '../../workspace-policy.js'
import { hasStoredToolPermission } from './permissions.js'
import { canMarkReviewAction, createMarkReviewer } from './reviewer.js'
import { isComputerUseSessionOpen } from '../../../shared/computer-use.js'
import { grantComputerUsePermission } from '../../tools/computer-use-permissions.js'
import { closeComputerUseSession } from '../../tools/pc-agent.js'
import { mcpGroups, executeMcpTool } from '../mcp-service.js'

async function toolGroups() {
  let plugins = getLoadedPlugins()
  if (!plugins.length) plugins = await loadAllPlugins()
  return {
    ...GROUP_TOOLS_SCHEMA,
    ...mcpGroups(),
    ...buildPluginToolGroups(
      plugins,
      Object.values(GROUP_TOOLS_SCHEMA).flatMap((g) => g.tools.map((t) => t.function.name)),
      GROUP_TOOL_GROUP_NAMES
    )
  }
}

async function dispatch(name, args, ctx, call) {
  ctx.check()
  const currentTools = ctx.runtime.profile(ctx.job.agentId).allowedTools
  if (!currentTools.includes('*') && !currentTools.includes(name))
    throw new Error('Izin tool telah dicabut.')
  if (name === 'read-tools') {
    const group = (await toolGroups())[args.group_name]
    return group
      ? { success: true, data: group }
      : { success: false, error: 'Grup tool tidak ditemukan.' }
  }
  if (name === 'memory-search') {
    const { searchMemories, searchTurnPairs } = await import('../../memory/orama-store.js')
    const [query, rawThreshold, rawLimit] = String(args.query || '').split('||')
    const threshold = Number(rawThreshold) || 0.5
    const limit = Number(rawLimit) || 5
    const [memories, chatTurns] = await Promise.all([
      searchMemories(query, threshold, limit),
      searchTurnPairs(query, threshold, limit)
    ])
    return { success: true, data: { memories, chatTurns } }
  }
  if (name === 'read-skill') {
    const skill = await skillService.read(args.skill_id || args.skill_name, args.relative_path)
    const refs = ctx.runtime.job(ctx.job.id).skillRefs || []
    if (!skill.allowImplicitInvocation && !refs.some((ref) => ref.id === skill.id))
      return {
        success: false,
        error:
          'Skill ini hanya dapat diaktifkan melalui pemilihan eksplisit pengguna atau penugasan yang menyertakannya.'
      }
    if (!skill.isResource)
      ctx.update({ skillRefs: [...refs.filter((ref) => ref.id !== skill.id), skillSummary(skill)] })
    return { success: true, data: skill, skill }
  }
  if (name === 'read_task') {
    const job = ctx.runtime.job(ctx.job.id)
    if (!job.taskId || (args.taskId && args.taskId !== job.taskId))
      return { success: false, error: 'Tidak ada workflow terkait dengan penugasan ini.' }
    return {
      success: true,
      data: {
        ...dbStore.agentTasks.getById(job.taskId),
        steps: dbStore.agentTaskSteps.getAll().filter((s) => s.taskId === job.taskId)
      }
    }
  }
  if (name === 'camera-look') {
    const frames = ctx.runtime.job(ctx.job.id).clientFrames || {}
    if (!frames[call.id])
      return {
        wait: {
          status: 'waiting_user',
          clientRequest: { id: call.id, tool: name },
          error: 'Buka UI dan ambil gambar kamera untuk melanjutkan.'
        }
      }
    return { success: true, dataUrl: frames[call.id] }
  }
  if (name === 'analyze-screen') {
    name = 'computer_use'
    args = { action: 'screenshot' }
  }
  const tool = NATIVE_TOOLS[name]
  const isMcp = name.startsWith('mcp_')
  const needsApproval = isMcp || (typeof tool?.needsApproval === 'function' ? tool.needsApproval(args) : tool?.needsApproval)
  const job = ctx.runtime.job(ctx.job.id)
  const session = dbStore.sessions.getById(job.parentSessionId)
  const configRow = dbStore.config.getAll()[0] || {}
  const permissionConfig = { ...getActiveConfig(), ...(configRow.data || configRow) }
  const storedPermission = hasStoredToolPermission(
    name,
    args,
    job.workspaceRoot || DEFAULT_WORKSPACE_ROOT,
    session,
    permissionConfig
  )
  const approved =
    job.approvedToolId === call.id &&
    (job.markApprovedToolId !== call.id || canMarkReviewAction(job, call, DEFAULT_WORKSPACE_ROOT))
  const opensComputerUse = isComputerUseSessionOpen(name, args)
  if (needsApproval && (!approved || (isMcp && job.markApprovedToolId === call.id)) && (isMcp || opensComputerUse || !storedPermission))
    return {
      wait: {
        status: 'waiting_user',
        approval: call,
        error: tool?.approvalMessage?.(args) || `Persetujuan diperlukan untuk ${name}.`
      }
    }
  ctx.update({ approvedToolId: null, markApprovedToolId: null })
  const config = {
    ...getActiveConfig(),
    workspaceRoot: job.workspaceRoot || DEFAULT_WORKSPACE_ROOT,
    sessionId: ctx.runId,
    agentName: ctx.agent.name,
    signal: ctx.signal
  }
  if (opensComputerUse && approved && job.markApprovedToolId !== call.id)
    config.computerUseApprovalToken = grantComputerUsePermission({
      sessionId: ctx.runId,
      runId: ctx.runId
    })
  const run = async () => {
    ctx.check()
    ctx.pending(call)
    const result = isMcp ? await executeMcpTool(name, args, ctx.signal) : tool ? await tool.handler(args, config) : await executePluginAction(name, args)
    ctx.check()
    return result && typeof result === 'object' && 'success' in result
      ? result
      : { success: true, data: result }
  }
  let resource = null
  let fileResource = null
  if (name === 'computer_use' || name === 'pc-agent' || name === 'open') resource = 'desktop'
  else if (/^(?:plugin-chrome-use-|chrome-)/.test(name)) resource = 'chrome-bridge'
  else if (['write-file', 'replace-lines', 'delete-file'].includes(name)) {
    resource = `workspace:${path.resolve(config.workspaceRoot).toLowerCase()}`
    const target = path.resolve(
      config.workspaceRoot,
      args.path || args.file_path || args.filePath || ''
    )
    let canonical = target
    try {
      canonical = fs.realpathSync.native(target)
    } catch {
      /* New files have no real path yet. */
    }
    fileResource = `file:${canonical.toLowerCase()}`
  } else if (['run-powershell', 'git-commit', 'git-revert'].includes(name)) {
    resource = `workspace:${path.resolve(config.workspaceRoot).toLowerCase()}`
  }
  if (resource) {
    ctx.phase('waiting_resource', resource.startsWith('file:') ? name : resource)
    return ctx.lock(resource, async () => {
      ctx.phase('using_tool', name)
      return fileResource ? ctx.lock(fileResource, run) : run()
    })
  }
  return run()
}

const execute = createJobExecutor({
  fetch: fetchAI,
  dispatch,
  config: getActiveConfig,
  skills: skillService,
  schemas: async () => {
    const schemas = [
      ...core_tools_schema,
      ...Object.values(await toolGroups()).flatMap((g) => g.tools)
    ]
    return [...new Map(schemas.map((s) => [s.function.name, s])).values()]
  }
})

export const subagentRuntime = new SubagentRuntime({
  db: dbStore.sqlite,
  execute: async (ctx) => {
    try {
      return await execute(ctx)
    } finally {
      await closeComputerUseSession('Pekerjaan Minibot berakhir.', {
        runKey: ctx.runId + ':' + ctx.runId
      })
    }
  },
  review: createMarkReviewer({ fetch: fetchAI, config: getActiveConfig }),
  canReviewAction: (job, call) => canMarkReviewAction(job, call, DEFAULT_WORKSPACE_ROOT),
  emit: (event, payload) => wsHub.broadcast(event, payload),
  closeBrowser: async (sessionId) => {
    await NATIVE_TOOLS['browser-close']?.handler('', { sessionId })
  }
})
