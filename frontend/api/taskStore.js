import { db } from './db'

export const TASK_STATUSES = ['pending', 'running', 'paused', 'waiting_user', 'failed', 'completed', 'cancelled']
export const STEP_STATUSES = ['pending', 'running', 'needs_revision', 'completed', 'failed', 'skipped']
const now = () => Date.now()

// Hash ringan dipakai untuk mendeteksi output identik tanpa menyimpan isi besar di Dexie.
export function getAgentTaskContentHash(value = '') {
  const text = String(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return prefix + '-' + (uuid || (now() + '-' + Math.random().toString(36).slice(2, 10)))
}

function assertTaskStatus(status) {
  if (!TASK_STATUSES.includes(status)) throw new Error('Invalid task status: ' + status)
}

function assertStepStatus(status) {
  if (!STEP_STATUSES.includes(status)) throw new Error('Invalid step status: ' + status)
}

// Validasi lokal menjaga checkpoint tetap deterministik tanpa menambah panggilan AI.
export function validateAgentTaskStepOutput(step = {}, output = '') {
  const text = typeof output === 'string' ? output.trim() : ''
  const hasContent = text.length >= (step.acceptanceCriteria?.length ? 80 : 20)
  return {
    isComplete: hasContent,
    score: hasContent ? 1 : 0,
    missingRequirements: hasContent ? [] : ['Output step terlalu pendek atau kosong.'],
    notes: hasContent
      ? 'Validasi dasar konten berhasil.'
      : 'Step perlu diulang karena deliverable belum memiliki isi yang cukup.'
  }
}

export async function createAgentTask(input = {}) {
  // Create task dan semua step dalam satu transaksi supaya outline tidak setengah jadi.
  const timestamp = now()
  const taskId = input.id || makeId('task')
  const steps = (input.steps || []).map((step, index) => ({
    id:
      step.id && step.id.startsWith(taskId + '-')
        ? step.id
        : taskId + '-' + (step.id || 'step-' + (index + 1)),
    taskId, index,
    title: step.title || 'Step ' + (index + 1),
    objective: step.objective || '',
    deliverable: step.deliverable || '',
    acceptanceCriteria: step.acceptanceCriteria || [],
    status: step.status || 'pending',
    inputSummary: step.inputSummary || '',
    outputSummary: step.outputSummary || '',
    artifactPath: step.artifactPath || null,
    validation: step.validation || null,
    contentHash: step.contentHash || null,
    attempts: 0, startedAt: null, completedAt: null,
    updatedAt: timestamp, error: null
  }))
  const task = {
    id: taskId,
    title: input.title || 'MARK Task',
    objective: input.objective || '',
    mode: input.mode || 'durable',
    status: input.status || (steps.length ? 'pending' : 'failed'),
    currentStepIndex: input.currentStepIndex ?? 0,
    activeStepId: input.activeStepId || steps[0]?.id || null,
    constraints: input.constraints || {},
    contextSummary: input.contextSummary || '',
    artifactRoot: input.artifactRoot || null,
    retryCount: input.retryCount || 0,
    maxRetries: input.maxRetries ?? 2,
    createdAt: timestamp, updatedAt: timestamp,
    completedAt: null,
    error: steps.length ? null : 'Task harus memiliki minimal satu step'
  }
  await db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    await db.agentTasks.add(task)
    if (steps.length) await db.agentTaskSteps.bulkAdd(steps)
  })
  return task
}

export async function getAgentTask(taskId) {
  return db.agentTasks.get(taskId)
}

export async function getAgentTaskWithSteps(taskId) {
  const [task, steps] = await Promise.all([
    db.agentTasks.get(taskId),
    db.agentTaskSteps.where('taskId').equals(taskId).sortBy('index')
  ])
  return task ? { ...task, steps } : null
}

export async function listAgentTasks({ status, limit = 50 } = {}) {
  const collection = status
    ? db.agentTasks.where('status').equals(status).reverse()
    : db.agentTasks.orderBy('updatedAt').reverse()
  return collection.limit(limit).toArray()
}

export async function updateAgentTask(taskId, changes = {}) {
  if (changes.status) assertTaskStatus(changes.status)
  await db.agentTasks.update(taskId, { ...changes, updatedAt: now() })
  return getAgentTask(taskId)
}

export async function updateAgentTaskStep(stepId, changes = {}) {
  if (changes.status) assertStepStatus(changes.status)
  await db.agentTaskSteps.update(stepId, { ...changes, updatedAt: now() })
  return db.agentTaskSteps.get(stepId)
}

export async function startAgentTask(taskId) {
  return updateAgentTask(taskId, { status: 'running', error: null })
}

// Resume hanya membuka kembali task paused dan mengaktifkan step pointer terakhir.
export async function resumeAgentTask(taskId) {
  const task = await getAgentTaskWithSteps(taskId)
  if (!task) throw new Error('Task tidak ditemukan')
  if (!['paused', 'pending'].includes(task.status)) {
    throw new Error('Task tidak bisa di-resume dari status ' + task.status)
  }
  if (!task.activeStepId) return updateAgentTask(taskId, { status: 'completed', error: null })
  return startAgentTaskStep(taskId, task.activeStepId)
}

// Retry manual mengulang step failed/needs_revision dengan batas yang sama seperti executor.
export async function retryAgentTaskStep(taskId, stepId) {
  const task = await getAgentTaskWithSteps(taskId)
  const step = task?.steps?.find((item) => item.id === stepId)
  if (!task || !step) throw new Error('Task step tidak ditemukan')
  if (!['failed', 'needs_revision'].includes(step.status)) {
    throw new Error('Step belum berada pada status retryable')
  }
  if ((step.attempts || 0) >= (task.maxRetries || 2) + 1) {
    throw new Error('Batas retry step sudah tercapai')
  }
  return startAgentTaskStep(taskId, stepId)
}

export async function startAgentTaskStep(taskId, stepId) {
  // Step aktif ditandai running saat executor mulai memproses step itu.
  const timestamp = now()
  return db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    const step = await db.agentTaskSteps.get(stepId)
    if (!step || step.taskId !== taskId) throw new Error('Task step tidak ditemukan')
    await db.agentTaskSteps.update(stepId, {
      status: 'running', attempts: (step.attempts || 0) + 1,
      startedAt: step.startedAt || timestamp, error: null, updatedAt: timestamp
    })
    await db.agentTasks.update(taskId, {
      status: 'running', activeStepId: stepId,
      currentStepIndex: step.index, updatedAt: timestamp
    })
    return db.agentTaskSteps.get(stepId)
  })
}

export async function checkpointAgentTaskStep(taskId, stepId, checkpoint = {}) {
  // Checkpoint ini menyimpan hasil step dan memajukan pointer ke step pending berikutnya.
  const timestamp = now()
  return db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    const step = await db.agentTaskSteps.get(stepId)
    const task = await db.agentTasks.get(taskId)
    if (!step || step.taskId !== taskId || !task) throw new Error('Task checkpoint tidak ditemukan')
    if (checkpoint.status) assertStepStatus(checkpoint.status)
    await db.agentTaskSteps.update(stepId, {
      ...checkpoint, updatedAt: timestamp,
      ...(checkpoint.status === 'completed' ? { completedAt: checkpoint.completedAt || timestamp } : {})
    })
    const taskChanges = { updatedAt: timestamp }
    if (checkpoint.status === 'completed') {
      const allSteps = await db.agentTaskSteps.where('taskId').equals(taskId).toArray()
      const next = allSteps
        .filter(item => item.id !== stepId && ['pending', 'needs_revision'].includes(item.status))
        .sort((a, b) => a.index - b.index)[0]
      taskChanges.activeStepId = next?.id || null
      taskChanges.currentStepIndex = next?.index ?? step.index
      if (!next) {
        taskChanges.status = 'completed'
        taskChanges.completedAt = timestamp
      }
    }
    await db.agentTasks.update(taskId, taskChanges)
    return getAgentTaskWithSteps(taskId)
  })
}

export async function transitionAgentTask(taskId, status, error = null) {
  assertTaskStatus(status)
  return updateAgentTask(taskId, {
    status, error, ...(status === 'completed' ? { completedAt: now() } : {})
  })
}

export async function pauseStaleAgentTasks(reason = 'app_restart') {
  // Saat app hidup lagi, task yang masih running diparkir dulu agar tidak dianggap selesai.
  const active = await db.agentTasks.where('status').anyOf(['running', 'waiting_user']).toArray()
  if (!active.length) return 0
  const timestamp = now()
  await db.transaction('rw', db.agentTasks, async () => {
    await Promise.all(active.map(task => db.agentTasks.update(task.id, {
      status: 'paused', error: reason, updatedAt: timestamp
    })))
  })
  return active.length
}

export async function cancelAgentTask(taskId) {
  return transitionAgentTask(taskId, 'cancelled', 'cancelled_by_user')
}

export async function deleteAgentTask(taskId) {
  await db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    await db.agentTaskSteps.where('taskId').equals(taskId).delete()
    await db.agentTasks.delete(taskId)
  })
}
