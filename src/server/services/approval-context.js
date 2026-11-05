import { buildApprovalContext } from '../../shared/approval-context.js'
import { isApprovalUserMessage } from '../../shared/approval-context.js'

export function resolveApprovalContext({ sessionId, session, cfg, task, job }) {
  const saved = Array.isArray(session?.data) ? session.data : []
  const snapshot = cfg.approvalContext || job?.approvalContext
  if (snapshot?.sessionId != null && String(snapshot.sessionId) !== String(sessionId))
    throw new Error('Sesi konteks peninjauan tidak cocok.')
  if (task && String(task.sessionId) !== String(sessionId))
    throw new Error('Sesi workflow peninjauan tidak cocok.')
  if (job && String(job.parentSessionId || '1') !== String(sessionId))
    throw new Error('Sesi Minibot peninjauan tidak cocok.')
  const planIndex = task ? saved.findIndex((m) => m.isPlanSteps && m.taskId === task.id) : -1
  const taskRequest =
    planIndex >= 0
      ? saved.slice(0, planIndex).findLast(isApprovalUserMessage)
      : task
        ? saved.find((m) => isApprovalUserMessage(m) && m.content === task.contextSummary)
        : null
  const jobMessages = Array.isArray(cfg.approvalJobMessages) ? cfg.approvalJobMessages : []
  const userMessages = [...(job?.approvalUserMessages || []), ...jobMessages]
    .filter((m) => m.sender === 'user' && m.role === 'user')
    .map((m) => ({ ...m, origin: 'user', text: m.content }))
    .filter(
      (m, index, all) =>
        all.findIndex(
          (other) =>
            (other.id && other.id === m.id) ||
            (other.content === m.content && other.timestamp === m.timestamp)
        ) === index
    )
  const context = buildApprovalContext({
    sessionId,
    history: snapshot?.history || saved,
    currentRequest: snapshot?.currentRequest,
    interventions: [...(snapshot?.interventions || []), ...userMessages],
    steps: [
      ...(snapshot?.observations || []),
      ...jobMessages
        .filter((m) => m.role === 'tool')
        .map((m) => ({ tool: m.name, fullResult: m.content, status: 'observed' }))
    ],
    assignment: job?.goal || cfg.codingObjective || '',
    agentMessages: [
      ...jobMessages
        .filter((m) => m.role === 'user' && m.sender !== 'user')
        .map((m) => ({ ...m, source: m.sender || 'agent' })),
      ...(cfg.approvalInstructions
        ? [{ content: cfg.approvalInstructions, source: 'legacy-agent-context' }]
        : [])
    ],
    taskRequest
  })
  if (task && !taskRequest)
    context.incomplete.push(
      'Permintaan asli workflow belum ditemukan; objective/contextSummary workflow adalah keterangan agen, bukan izin pengguna.'
    )
  return context
}
