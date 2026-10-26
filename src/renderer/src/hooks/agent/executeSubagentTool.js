import { subagentStore } from '../../api/subagent/subagentStore.js'
import { runSubagentTurn, killSubagentExecution } from '../../api/subagent/subagentExecutor.js'
import { sendAgentMessage } from '../../api/subagent/client.js'

export const SUBAGENT_TOOLS = [
  'spawn_subagent',
  'message_agent',
  'send_message',
  'list_subagents',
  'wait_subagents',
  'kill_subagent'
]
export async function executeSubagentTool(tool, rawArgs, context) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}
  const agents = await subagentStore.listSubagents()
  const query = args.target_agent || args.subagent_id || ''
  const target = agents.find(
    (a) =>
      a.id === query ||
      a.name.replace(/^@/, '').toLowerCase() === String(query).replace(/^@/, '').toLowerCase()
  )
  try {
    if (tool === 'spawn_subagent') {
      const agent = await subagentStore.createSubagent({
        name: args.name,
        role: args.role,
        allowedTools: Array.isArray(args.tools)
          ? args.tools
          : String(args.tools || '*')
              .split(',')
              .map((s) => s.trim())
      })
      const result = await runSubagentTurn(agent.id, args.goal || args.initial_message, 'mark', {
        newJob: true,
        taskId: context.taskId,
        stepId: context.stepId,
        initialMessage: args.initial_message,
        parentSessionId: context.sessionId,
        parentSessionTitle: context.sessionTitle,
        workspaceRoot: context.workspaceRoot,
        allowedTools: Array.isArray(args.tools)
          ? args.tools
          : String(args.tools || '*')
              .split(',')
              .map((s) => s.trim()),
        requestId: context.processId
          ? `${context.processId}:${agent.id}:${args.goal}`
          : crypto.randomUUID()
      })
      return {
        success: true,
        data: {
          agentId: agent.id,
          jobId: result.jobId,
          message: 'Penugasan masuk antrean server. Laporan akan tersimpan di sesi asal.'
        }
      }
    }
    if (tool === 'list_subagents')
      return {
        success: true,
        data: agents.filter(
          (a) =>
            (!args.status || args.status === 'all' || a.status === args.status) &&
            (!a.parentSessionId || a.parentSessionId === context.sessionId)
        )
      }
    if (tool === 'wait_subagents') {
      const requested = Array.isArray(args.targets)
        ? args.targets
        : String(args.targets || 'all')
            .split(',')
            .map((s) => s.trim())
      const ids = agents
        .filter((a) =>
          requested.includes('all')
            ? a.parentSessionId === context.sessionId
            : requested.includes(a.id)
        )
        .map((a) => a.id)
      const deadline = Date.now() + Math.min(60, Math.max(1, Number(args.timeout) || 40)) * 1000
      let latest = []
      do {
        context.signal?.throwIfAborted()
        latest = (await subagentStore.listSubagents()).filter((a) => ids.includes(a.id))
        if (
          !latest.some((a) =>
            ['running', 'queued', 'waiting_peer', 'waiting_review'].includes(a.status)
          )
        )
          break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } while (Date.now() < deadline)
      return { success: true, data: latest }
    }
    if (!target) throw new Error('Agent tujuan tidak ditemukan.')
    if (tool === 'kill_subagent')
      return { success: true, data: await killSubagentExecution(target.id) }
    if (tool === 'message_agent')
      return {
        success: true,
        data: await sendAgentMessage(target.id, args.message, {
          jobId: args.job_id,
          kind: args.kind || 'info',
          replyTo: args.reply_to,
          parentSessionId: context.sessionId
        })
      }
    if (target.parentSessionId && target.parentSessionId !== context.sessionId)
      throw new Error('Agent sedang berada dalam sesi koordinasi lain.')
    const result = await runSubagentTurn(target.id, args.message, 'mark', {
      taskId: context.taskId,
      stepId: context.stepId,
      parentSessionId: context.sessionId,
      parentSessionTitle: context.sessionTitle,
      workspaceRoot: context.workspaceRoot
    })
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
