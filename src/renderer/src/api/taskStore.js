import { API_BASE } from './web-bridge'

export const TASK_STATUSES = [
  'pending',
  'running',
  'paused',
  'waiting_user',
  'waiting_minibots',
  'failed',
  'completed',
  'cancelled'
]
export const STEP_STATUSES = [
  'pending',
  'running',
  'needs_revision',
  'completed',
  'failed',
  'skipped'
]
export const taskRequestId = () => globalThis.crypto.randomUUID()
export async function taskRequest(route, body) {
  const response = await fetch(
    API_BASE + '/api/tasks' + route,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
  )
  const result = await response.json()
  if (!response.ok || !result.success)
    throw new Error(result.error || 'Workflow tidak dapat diperbarui.')
  return result.data
}
export const getAgentTaskWithSteps = (id) => taskRequest('/' + encodeURIComponent(id) + '/workflow')
export const getAgentTask = getAgentTaskWithSteps
export const createAgentTask = (input) =>
  taskRequest('/workflow', { ...input, requestId: input.requestId || taskRequestId() })
export const workflowMutation = (task, operation, input = {}) =>
  taskRequest('/' + encodeURIComponent(task.id) + '/' + operation, {
    sessionId: task.sessionId,
    planVersion: task.planVersion,
    ...input,
    requestId: input.requestId || taskRequestId()
  })
export const reviseAgentTask = (task, input) => workflowMutation(task, 'plan', input)
export const finalizeAgentTask = (task, answer) => workflowMutation(task, 'finalize', { answer })
export async function listAgentTasks({ status, limit = 50 } = {}) {
  const tasks = await taskRequest('')
  return tasks
    .filter((t) => !status || t.status === status)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}
export async function transitionAgentTask(taskId, status, error = null) {
  const task = await getAgentTask(taskId)
  const action = {
    cancelled: 'cancel',
    paused: 'pause',
    running: 'resume',
    failed: 'fail',
    waiting_user: 'help',
    waiting_minibots: 'wait'
  }[status]
  if (!action) throw new Error('Status hanya dapat diubah melalui transisi workflow.')
  return workflowMutation(task, 'control', { action, error })
}
export const resumeAgentTask = (id) => transitionAgentTask(id, 'running')
export const retryAgentTaskStep = async (id, stepId) => {
  const task = await getAgentTask(id)
  if (task.activeStepId !== stepId) throw new Error('Hanya langkah aktif dapat dicoba kembali.')
  return workflowMutation(task, 'control', { action: 'retry' })
}
export const cancelAgentTask = (id) => transitionAgentTask(id, 'cancelled', 'Dihentikan pengguna.')
export const startAgentTask = resumeAgentTask
export async function startAgentTaskStep(id, stepId) {
  const task = await getAgentTask(id)
  if (task.activeStepId !== stepId || task.status !== 'running')
    throw new Error('Langkah ini tidak aktif.')
  return task.steps.find((s) => s.id === stepId)
}
export async function checkpointAgentTaskStep(id, stepId, checkpoint = {}) {
  const task = await getAgentTask(id)
  const step = task.steps.find((s) => s.id === stepId)
  return workflowMutation(task, 'complete', {
    ...checkpoint,
    stepIndex: step?.stepIndex + 1,
    summary: checkpoint.outputSummary,
    verificationProof: checkpoint.verificationProof
  })
}
export async function updateAgentTask(id, changes = {}) {
  if (changes.status) return transitionAgentTask(id, changes.status, changes.error)
  throw new Error('Gunakan operasi workflow untuk mengubah tugas.')
}
export async function updateAgentTaskStep() {
  throw new Error('Gunakan operasi penyelesaian atau revisi rencana.')
}
export async function pauseStaleAgentTasks() {
  return 0
} // Restart recovery belongs to the server.
export async function deleteAgentTask(id) {
  const response = await fetch(API_BASE + '/api/tasks/' + encodeURIComponent(id), {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Workflow tidak dapat dihapus.')
}
export function getAgentTaskContentHash(value = '') {
  let hash = 2166136261
  for (const c of String(value)) {
    hash ^= c.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}
export function validateAgentTaskStepOutput(_step = {}, output = {}) {
  void _step
  const isComplete = !!(
    typeof output === 'object' &&
    output.summary?.trim() &&
    output.verificationProof?.trim()
  )
  return {
    isComplete,
    missingRequirements: isComplete ? [] : ['Ringkasan hasil dan bukti pemeriksaan wajib diisi.']
  }
}
