import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const liveJobs = new Set([
  'queued',
  'running',
  'waiting_peer',
  'waiting_review',
  'waiting_user',
  'interrupted'
])
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 409 })
}
const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function recoverTaskWorkflows(store) {
  return store.sqlite
    .prepare(
      "UPDATE agent_tasks SET status='paused', error='Proses terputus. Periksa hasil aksi terakhir sebelum melanjutkan.' WHERE plan_version IS NOT NULL AND status='running'"
    )
    .run().changes
}

export function createTaskWorkflow(
  store,
  { artifactBase = path.join(os.homedir(), 'Documents', 'Mark Tasks') } = {}
) {
  const snapshot = (id) => {
    const task = store.agentTasks.getById(id)
    return task
      ? {
          ...task,
          dependencies: jobs(id),
          steps: store.agentTaskSteps
            .getAll()
            .filter((s) => s.taskId === id)
            .sort((a, b) => a.stepIndex - b.stepIndex)
        }
      : null
  }
  const jobs = (id, stepId) =>
    store.subagentJobs
      .getAll()
      .map((row) => row.data || row)
      .filter((j) => j.taskId === id && (!stepId || j.stepId === stepId))
  const mutate = (id, input, operation, apply) =>
    store.sqlite.transaction(() => {
      const task = snapshot(id)
      if (!task) fail('Workflow tidak ditemukan.')
      if (!input.requestId) fail('requestId wajib disertakan.')
      if (String(input.sessionId) !== String(task.sessionId))
        fail('Sesi asal workflow tidak cocok.')
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ operation, ...input }))
        .digest('hex')
      const previous = (task.requestLog || {})[input.requestId]
      if (previous) {
        if (previous !== fingerprint) fail('requestId sudah dipakai untuk perubahan lain.')
        return snapshot(id)
      }
      if (Number(input.planVersion) !== task.planVersion)
        fail('Versi rencana sudah berubah. Baca ulang workflow.')
      apply(task)
      store.agentTasks.update(id, {
        requestLog: { ...task.requestLog, [input.requestId]: fingerprint }
      })
      return snapshot(id)
    })()
  const makeStep = (taskId, step, index) => {
    if (!text(step.title)) fail('Setiap langkah memerlukan judul.')
    return {
      id: `${taskId}-step-${randomUUID()}`,
      taskId,
      stepIndex: index,
      title: text(step.title),
      objective: text(step.objective),
      deliverable: text(step.deliverable),
      acceptanceCriteria: step.acceptanceCriteria || [],
      requiredArtifact: step.requiredArtifact ? 1 : 0,
      status: 'pending',
      attempts: 0
    }
  }
  return {
    snapshot,
    jobs,
    create(input) {
      return store.sqlite.transaction(() => {
        if (!input.requestId || input.sessionId == null)
          fail('requestId dan sesi asal wajib disertakan.')
        const existing = store.agentTasks
          .getAll()
          .find(
            (t) =>
              t.createRequestId === input.requestId &&
              String(t.sessionId) === String(input.sessionId)
          )
        if (existing) {
          const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
          if (existing.requestLog?.[input.requestId] !== fingerprint)
            fail('requestId sudah dipakai untuk rencana lain.')
          return snapshot(existing.id)
        }
        if (!Array.isArray(input.steps) || !input.steps.length)
          fail('Rencana memerlukan minimal satu langkah.')
        const id = input.id || `task-${randomUUID()}`
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail('ID workflow tidak valid.')
        if (snapshot(id)) fail('ID workflow sudah dipakai.')
        const steps = input.steps.map((s, i) => makeStep(id, s, i))
        steps[0] = { ...steps[0], status: 'running', startedAt: Date.now(), attempts: 1 }
        store.agentTasks.insert({
          id,
          title: text(input.title),
          objective: text(input.objective),
          contextSummary: text(input.contextSummary),
          mode: 'durable',
          status: 'running',
          sessionId: String(input.sessionId),
          planVersion: 1,
          createRequestId: input.requestId,
          requestLog: {
            [input.requestId]: createHash('sha256').update(JSON.stringify(input)).digest('hex')
          },
          planRevisions: [],
          activeStepId: steps[0].id,
          currentStepIndex: 0,
          constraints: input.constraints || {},
          maxRetries: input.maxRetries ?? 2,
          createdAt: Date.now()
        })
        store.agentTaskSteps.insertBatch(steps)
        return snapshot(id)
      })()
    },
    complete(id, input) {
      return mutate(id, input, 'complete', (task) => {
        if (task.status !== 'running') fail('Workflow harus berjalan sebelum langkah diselesaikan.')
        const step = task.steps.find((s) => s.id === task.activeStepId)
        if (!step || input.stepIndex !== step.stepIndex + 1 || step.status !== 'running')
          fail('Hanya langkah aktif yang boleh diselesaikan. Checklist tidak diubah.')
        if (jobs(id, step.id).some((j) => liveJobs.has(j.status)))
          fail('Hasil Minibot untuk langkah ini belum tersedia.')
        if (!text(input.summary) || !text(input.verificationProof))
          fail('Ringkasan hasil dan bukti pemeriksaan wajib diisi.')
        let artifactPath = text(input.artifactPath) || null
        let artifactRoot = task.artifactRoot
        if (text(input.artifactContent)) {
          artifactRoot ||= path.join(artifactBase, id)
          fs.mkdirSync(artifactRoot, { recursive: true })
          artifactPath = path.join(artifactRoot, `step-${step.stepIndex + 1}.md`)
          const temporary = `${artifactPath}.${randomUUID()}.tmp`
          try {
            fs.writeFileSync(temporary, input.artifactContent, 'utf8')
            if (fs.readFileSync(temporary, 'utf8') !== input.artifactContent)
              fail('Isi berkas tidak sesuai hasil penulisan.')
            fs.renameSync(temporary, artifactPath)
          } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
          }
        }
        if (step.requiredArtifact && !artifactPath) fail('Langkah ini memerlukan berkas hasil.')
        if (
          artifactPath &&
          (!fs.existsSync(artifactPath) ||
            !fs.statSync(artifactPath).isFile() ||
            fs.statSync(artifactPath).size === 0)
        )
          fail('Berkas hasil belum tersedia atau kosong.')
        store.agentTaskSteps.update(step.id, {
          status: 'completed',
          outputSummary: text(input.summary),
          verificationProof: text(input.verificationProof),
          artifactPath,
          completedAt: Date.now(),
          error: null
        })
        const next = task.steps.find((s) => s.id !== step.id && s.status !== 'completed')
        if (next)
          store.agentTaskSteps.update(next.id, {
            status: 'running',
            startedAt: Date.now(),
            attempts: (next.attempts || 0) + 1
          })
        store.agentTasks.update(id, {
          activeStepId: next?.id || null,
          currentStepIndex: next?.stepIndex ?? step.stepIndex,
          status: next ? 'running' : 'completed',
          completedAt: next ? null : Date.now(),
          artifactRoot,
          finalizationStatus: next ? null : 'pending'
        })
      })
    },
    revise(id, input) {
      return mutate(id, input, 'revise', (task) => {
        if (!['running', 'paused', 'waiting_minibots', 'waiting_user'].includes(task.status))
          fail('Rencana ini tidak dapat direvisi.')
        if (!text(input.explanation) || !Array.isArray(input.steps))
          fail('Alasan dan daftar langkah mendatang wajib diisi.')
        const future = task.steps.filter((s) => s.status === 'pending' && !s.startedAt)
        const preserved = task.steps.filter((s) => !future.includes(s))
        const seen = new Set()
        const replacement = input.steps.map((s, i) => {
          if (s.id && (!future.some((old) => old.id === s.id) || seen.has(s.id)))
            fail('Revisi hanya boleh memuat langkah mendatang, tanpa ID ganda.')
          if (s.id) seen.add(s.id)
          const next = makeStep(id, s, preserved.length + i)
          return s.id ? { ...next, id: s.id } : next
        })
        future.forEach((s) => store.agentTaskSteps.delete(s.id))
        store.agentTaskSteps.insertBatch(replacement)
        store.agentTasks.update(id, {
          planVersion: task.planVersion + 1,
          planRevisions: [
            ...(task.planRevisions || []),
            { at: Date.now(), explanation: text(input.explanation), version: task.planVersion + 1 }
          ]
        })
      })
    },
    control(id, input) {
      return mutate(id, input, 'control', (task) => {
        const action = input.action
        if (['cancelled', 'completed'].includes(task.status)) fail('Workflow sudah berakhir.')
        const step = task.steps.find((s) => s.id === task.activeStepId)
        let status
        if (action === 'cancel') status = 'cancelled'
        else if (action === 'pause') status = 'paused'
        else if (action === 'wait') status = 'waiting_minibots'
        else if (action === 'fail') status = 'failed'
        else if (action === 'help') status = 'waiting_user'
        else if (action === 'resume' || action === 'retry') {
          if (
            !['paused', 'failed', 'waiting_minibots', 'waiting_user', 'pending'].includes(
              task.status
            )
          )
            fail('Workflow tidak sedang dijeda.')
          if (jobs(id).some((j) => liveJobs.has(j.status))) fail('Minibot terkait masih bekerja.')
          if (!step) fail('Checkpoint aktif tidak ditemukan; riwayat lama tidak diubah otomatis.')
          status = 'running'
          store.agentTaskSteps.update(step.id, {
            status: 'running',
            attempts: (step.attempts || 0) + 1,
            error: null
          })
        } else fail('Kontrol workflow tidak dikenal.')
        if (status === 'failed' && step)
          store.agentTaskSteps.update(step.id, { status: 'failed', error: input.error || null })
        store.agentTasks.update(id, { status, error: input.error || null })
      })
    },
    finalize(id, input) {
      return mutate(id, input, 'finalize', (task) => {
        if (
          task.status !== 'completed' ||
          !task.steps.length ||
          task.steps.some((s) => s.status !== 'completed')
        )
          fail('Checklist belum selesai.')
        if (task.finalAnswer) return
        if (!text(input.answer)) fail('Jawaban penutup kosong.')
        const messageId = `task-final-${id}`
        store.agentTasks.update(id, {
          finalAnswer: text(input.answer),
          finalMessageId: messageId,
          finalizationStatus: 'completed'
        })
        const session = store.sessions.getById(task.sessionId)
        if (session) {
          const messages = Array.isArray(session.data) ? session.data : []
          if (!messages.some((m) => m.id === messageId))
            store.sessions.update(task.sessionId, {
              data: [
                ...messages,
                {
                  id: messageId,
                  taskId: id,
                  role: 'ai',
                  content: text(input.answer),
                  isTaskDone: true,
                  created_at: Date.now()
                }
              ]
            })
        }
      })
    }
  }
}
