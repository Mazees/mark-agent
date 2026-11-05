import { Router } from 'express'
import { toolApprovals } from '../services/tool-approvals.js'
import { approvalStore, dbStore } from '../memory/db-store.js'
import { getActiveConfig } from '../config-manager.js'
import { validApprovalMode } from '../../shared/approval-modes.js'
import { isLocalComputerUseOrigin } from '../tools/computer-use-permissions.js'
import { wsHub } from '../ws-hub.js'

export const toolApprovalsRouter = Router()
const fail = (res, cause) =>
  res.status(cause.status || 400).json({
    success: false,
    denied: true,
    code: cause.code || 'APPROVAL_ERROR',
    ...(cause.approval
      ? { approval: cause.approval, reason: cause.approval.reason, verdict: cause.approval.verdict }
      : {}),
    error: cause.message
  })
function localDecision(req, res, next) {
  if (
    !isLocalComputerUseOrigin(
      req.get('origin'),
      req.socket.localPort,
      process.argv.includes('--dev')
    )
  )
    return res
      .status(403)
      .json({ success: false, error: 'Keputusan izin hanya dapat diberikan melalui Mark lokal.' })
  next()
}
function abortOnClose(res) {
  const controller = new AbortController()
  res.once('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  return controller.signal
}

toolApprovalsRouter.post('/tools/needs-approval', async (req, res) => {
  const { tool, query, config = {} } = req.body || {}
  try {
    const result = await toolApprovals.evaluate(tool, query, config, {
      signal: abortOnClose(res),
      onReview: () =>
        wsHub.broadcast('tools:reviewing', {
          sessionId: config.codingSessionId || config.sessionId || '1',
          requestId: config.approvalRequestId || config.toolCallId,
          tool,
          activity: 'Meninjau izin tindakan…'
        })
    })
    res.json(result)
  } catch (cause) {
    fail(res, cause)
  }
})
toolApprovalsRouter.post('/tools/approval/decide', localDecision, async (req, res) => {
  try {
    const { requestId, config, choice } = req.body || {}
    res.json(await toolApprovals.decide(requestId, config || {}, choice))
  } catch (cause) {
    fail(res, cause)
  }
})

toolApprovalsRouter.post('/tools/approval/context', localDecision, (req, res) => {
  try {
    res.json(toolApprovals.updateContext(req.body?.config || {}))
  } catch (cause) {
    fail(res, cause)
  }
})
toolApprovalsRouter.get('/tools/approval/pending', (_req, res) =>
  res.json({ success: true, data: toolApprovals.pendingJobs() })
)
toolApprovalsRouter.post('/tools/approval/cancel', async (req, res) => {
  toolApprovals.cancel(req.body?.config || {})
  res.json({ success: true })
})
toolApprovalsRouter.get('/tools/approval/grants', (_req, res) =>
  res.json({ success: true, data: approvalStore.allGrants() })
)
toolApprovalsRouter.delete('/tools/approval/grants/:id', localDecision, (req, res) => {
  approvalStore.remove(req.params.id)
  res.json({ success: true })
})
toolApprovalsRouter.get('/sessions/:id/approval-mode', (req, res) =>
  res.json({
    success: true,
    mode: dbStore.sessions.getById(req.params.id)?.approvalMode || 'smart'
  })
)
toolApprovalsRouter.post('/sessions/:id/approval-mode', localDecision, (req, res) => {
  try {
    if (!validApprovalMode(req.body?.mode)) throw new Error('Mode perizinan tidak valid.')
    const old = dbStore.sessions.getById(req.params.id)
    if (old) dbStore.sessions.update(req.params.id, { approvalMode: req.body.mode })
    else
      dbStore.sessions.insert({
        id: req.params.id,
        title: 'Percakapan baru',
        data: [],
        approvalMode: req.body.mode
      })
    if (old?.approvalMode !== req.body.mode) toolApprovals.modeChanged(req.params.id)
    wsHub.broadcast('session-approval-mode-updated', {
      sessionId: req.params.id,
      mode: req.body.mode
    })
    res.json({ success: true, mode: req.body.mode })
  } catch (cause) {
    fail(res, cause)
  }
})

export async function executeRequestedTool(tool, query, config = {}, signal) {
  return toolApprovals.execute(
    tool,
    query,
    { ...getActiveConfig(), ...config, signal },
    async (finalConfig) => {
      if (tool.startsWith('mcp_')) {
        const { executeMcpTool } = await import('../services/mcp-service.js')
        return executeMcpTool(tool, query, signal)
      }
      const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
      if (NATIVE_TOOLS[tool]) return NATIVE_TOOLS[tool].handler(query, finalConfig)
      const { executePluginAction } = await import('../../main/plugins/plugin-loader.js')
      return executePluginAction(tool, query)
    }
  )
}
toolApprovalsRouter.post('/tools/execute', async (req, res) => {
  try {
    const { tool, query, config = {} } = req.body || {}
    const result = await executeRequestedTool(tool, query, config, abortOnClose(res))
    res.json(
      result && typeof result === 'object' && 'success' in result
        ? result
        : { success: true, data: result }
    )
  } catch (cause) {
    fail(res, cause)
  }
})
