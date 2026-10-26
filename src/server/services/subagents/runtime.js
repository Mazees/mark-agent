import {
  createRuntimeStore,
  createSubagentSchema,
  terminal,
  uid,
  runtimeTables
} from './storage.js'

const pending = (job) => !terminal.has(job.status)
const normalize = (name) =>
  String(name || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
export class SubagentRuntime {
  constructor({
    db,
    execute,
    review = null,
    canReviewAction = () => false,
    emit = () => {},
    closeBrowser = async () => {}
  }) {
    createSubagentSchema(db)
    this.db = db
    this.store = createRuntimeStore(db)
    this.execute = execute
    this.review = review
    this.canReviewAction = canReviewAction
    this.reviews = new Map()
    this.emit = emit
    this.closeBrowser = closeBrowser
    this.active = new Map()
    this.stopped = true
    this.locks = new Map()
  }

  start() {
    this.migrateLegacy()
    for (const job of this.jobs().filter(pending)) {
      this.saveJob({
        ...job,
        ...(['waiting_user', 'waiting_review'].includes(job.status)
          ? {}
          : { status: 'interrupted' }),
        phase: null,
        error: ['waiting_user', 'waiting_review'].includes(job.status)
          ? job.error
          : 'Proses sebelumnya terputus. Tinjau langkah terakhir sebelum melanjutkan.'
      })
    }
    for (const run of this.store
      .all('subagent_runs')
      .filter((r) => ['running', 'waiting'].includes(r.status))) {
      this.store.put('subagent_runs', { ...run, status: 'interrupted', endedAt: Date.now() })
    }
    this.stopped = false
    for (const report of this.reports().filter((r) => r.followupStatus === 'claimed'))
      this.store.put('subagent_reports', { ...report, followupStatus: 'interrupted' })
    this.timer = setInterval(() => this.pump(), 1000)
    this.timer.unref?.()
    this.flushReports()
  }

  migrateLegacy() {
    this.db.transaction(() => {
      for (const agent of this.db.prepare('SELECT * FROM subagents').all()) {
        const id = `legacy_${agent.id}`
        if (this.jobs().some((j) => j.agentId === agent.id)) continue
        const count = this.db
          .prepare(
            'SELECT COUNT(*) AS n FROM subagent_messages WHERE subagent_id=? AND job_id IS NULL'
          )
          .get(agent.id).n
        if (!count && !agent.goal) continue
        const job = {
          id,
          agentId: agent.id,
          goal: agent.goal || 'Riwayat lama',
          legacy: true,
          status:
            agent.status === 'killed'
              ? 'cancelled'
              : ['completed', 'failed'].includes(agent.status)
                ? agent.status
                : 'interrupted',
          parentSessionId: String(agent.parent_session_id || '1'),
          parentSessionTitle: agent.parent_session_title,
          allowedTools: JSON.parse(agent.allowed_tools || '["*"]'),
          result: agent.final_answer,
          turnCount: agent.turn_count,
          createdAt: agent.created_at,
          updatedAt: agent.updated_at,
          error:
            agent.status === 'running' ? 'Eksekusi lama tidak dapat dipulihkan otomatis.' : null
        }
        this.saveJob(job)
        this.db
          .prepare('UPDATE subagent_messages SET job_id=? WHERE subagent_id=? AND job_id IS NULL')
          .run(id, agent.id)
      }
    })()
  }

  jobs(agentId) {
    return this.store.all('subagent_jobs').filter((j) => !agentId || j.agentId === agentId)
  }
  job(id) {
    const job = this.store.get('subagent_jobs', id)
    if (!job) throw new Error('Penugasan tidak ditemukan.')
    return job
  }
  profiles() {
    return this.db
      .prepare('SELECT * FROM subagents ORDER BY created_at DESC')
      .all()
      .map((agent) => {
        const jobs = this.jobs(agent.id)
        const current =
          jobs.find((j) =>
            ['running', 'waiting_peer', 'waiting_user', 'waiting_review'].includes(j.status)
          ) ||
          jobs.find((j) => j.status === 'queued') ||
          jobs.at(-1)
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          allowedTools: JSON.parse(agent.allowed_tools || '["*"]'),
          createdAt: agent.created_at,
          updatedAt: current?.updatedAt || agent.updated_at,
          status: current?.status || 'idle',
          goal: current?.goal || '',
          finalAnswer: current?.result || null,
          turnCount: current?.turnCount || 0,
          parentSessionId: current?.parentSessionId,
          parentSessionTitle: current?.parentSessionTitle,
          activeJobId: current?.id || null,
          phase: current?.phase,
          activity: current?.activity,
          queueCount: jobs.filter((j) => j.status === 'queued').length
        }
      })
  }
  profile(id) {
    const profile = this.profiles().find((p) => p.id === id)
    if (!profile) throw new Error('Minibot tidak ditemukan.')
    return profile
  }
  createProfile(input) {
    if (this.stopped) throw new Error('Runtime Minibot sedang berhenti.')
    if (
      input.allowedTools &&
      (!Array.isArray(input.allowedTools) || input.allowedTools.some((t) => typeof t !== 'string'))
    ) {
      throw new Error('allowedTools harus berupa daftar nama tool.')
    }
    const name = String(input.name || 'Specialist-Agent').trim()
    if (!name) throw new Error('Nama Minibot wajib diisi.')
    const existing = this.profiles().find((p) => normalize(p.name) === normalize(name))
    if (existing && !input.forceNew) return { ...existing, isExisting: true }
    const id = uid('sub')
    this.db
      .prepare(
        `INSERT INTO subagents (id,name,role,allowed_tools,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        id,
        name,
        input.role || 'Spesialis tugas',
        JSON.stringify(input.allowedTools || ['*']),
        'idle',
        Date.now(),
        Date.now()
      )
    this.emit('subagent:updated', { agentId: id })
    return this.profile(id)
  }
  updateProfile(id, input) {
    const current = this.profile(id)
    if (this.stopped) throw new Error('Runtime Minibot sedang berhenti.')
    if (input.allowedTools && !Array.isArray(input.allowedTools))
      throw new Error('allowedTools harus berupa daftar.')
    if (
      input.name &&
      this.profiles().some((p) => p.id !== id && normalize(p.name) === normalize(input.name))
    ) {
      throw new Error('Nama Minibot sudah digunakan.')
    }
    this.db
      .prepare('UPDATE subagents SET name=?,role=?,allowed_tools=?,updated_at=? WHERE id=?')
      .run(
        input.name || current.name,
        input.role ?? current.role,
        JSON.stringify(input.allowedTools || current.allowedTools),
        Date.now(),
        id
      )
    return this.profile(id)
  }
  submit(agentId, input) {
    const agent = this.profile(agentId)
    if (this.stopped) throw new Error('Runtime Minibot sedang berhenti atau memulihkan database.')
    if (!String(input.goal || '').trim()) throw new Error('Tujuan pekerjaan wajib diisi.')
    if (!input.requestId) throw new Error('requestId wajib diisi.')
    const existing = this.jobs().find((j) => j.requestId === input.requestId)
    if (existing) {
      if (existing.agentId !== agentId || existing.goal !== input.goal)
        throw new Error('requestId sudah digunakan untuk penugasan lain.')
      return existing
    }
    if (input.taskId) {
      const task = this.db.prepare('SELECT * FROM agent_tasks WHERE id=?').get(input.taskId)
      if (
        !task ||
        task.status !== 'running' ||
        task.active_step_id !== input.stepId ||
        task.session_id !== String(input.parentSessionId)
      )
        throw new Error('Workflow atau langkah penugasan sudah tidak aktif.')
    }
    const sessionId = String(input.parentSessionId || '1')
    let session = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId)
    if (!session) {
      const columns = this.db
        .prepare('PRAGMA table_info(sessions)')
        .all()
        .map((c) => c.name)
      const fields = Object.entries({
        id: sessionId,
        title: input.parentSessionTitle || 'Main Thread',
        data: '[]',
        workspace_root: sessionId === '1' ? null : input.workspaceRoot || null,
        created_at: Date.now(),
        updated_at: Date.now(),
        timestamp: Date.now()
      }).filter(([key]) => columns.includes(key))
      this.db
        .prepare(
          `INSERT INTO sessions (${fields.map(([k]) => k).join(',')}) VALUES (${fields.map(() => '?').join(',')})`
        )
        .run(...fields.map(([, v]) => v))
      session = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId)
    }
    if (
      input.allowedTools &&
      (!Array.isArray(input.allowedTools) || input.allowedTools.some((t) => typeof t !== 'string'))
    ) {
      throw new Error('allowedTools harus berupa daftar nama tool.')
    }
    const job = this.db.transaction(() => {
      const job = this.saveJob({
        id: uid('job'),
        agentId,
        requestId: input.requestId,
        goal: input.goal,
        status: 'queued',
        phase: null,
        allowedTools: input.allowedTools || agent.allowedTools,
        parentSessionId: sessionId,
        parentSessionTitle: input.parentSessionTitle || session?.title || 'Main Thread',
        workspaceRoot: session?.workspace_root || input.workspaceRoot || null,
        taskId: input.taskId || null,
        stepId: input.stepId || null,
        contextSummary: input.contextSummary || '',
        createdAt: Date.now(),
        turnCount: 0,
        result: null,
        error: null,
        runId: null,
        waitingForJobId: null
      })
      this.store.addMessage(job, null, {
        sender: input.sender || 'mark',
        role: 'user',
        content: input.initialMessage || input.goal
      })
      return job
    })()
    this.schedule()
    return job
  }
  saveJob(job) {
    const saved = this.store.put('subagent_jobs', job)
    this.emit('subagent:updated', { agentId: saved.agentId, jobId: saved.id, status: saved.status })
    return saved
  }
  schedule() {
    if (!this.stopped) setImmediate(() => this.pump())
  }
  pump() {
    if (this.stopped) return
    try {
      for (const job of this.jobs()) {
        if (job.status === 'waiting_peer' && job.waitDeadline <= Date.now()) {
          this.requireLead(
            job.id,
            'Batas tunggu jawaban kolega habis. Tinjau atau beri instruksi lanjutan.'
          )
        }
      }
      const jobs = this.jobs()
      for (const job of jobs) {
        if (this.reviews.size) break
        if (job.status === 'waiting_review' && !this.active.has(job.agentId)) this.launchReview(job)
      }
      for (const job of jobs) {
        if (job.status !== 'queued' || this.active.has(job.agentId)) continue
        const reserved = jobs.some(
          (j) =>
            j.id !== job.id &&
            j.agentId === job.agentId &&
            ['running', 'waiting_peer', 'waiting_user', 'waiting_review'].includes(j.status)
        )
        if (!reserved) this.launch(job)
      }
      this.flushReports()
    } catch (error) {
      console.error('[Minibots scheduler]', error.message)
    }
  }

  launch(queued) {
    const controller = new AbortController()
    const runId = queued.runId || uid('run')
    const state = { jobId: queued.id, runId, controller }
    this.active.set(queued.agentId, state)
    const previousRun = this.store.get('subagent_runs', runId)
    this.store.put('subagent_runs', {
      ...previousRun,
      id: runId,
      jobId: queued.id,
      agentId: queued.agentId,
      status: 'running',
      createdAt: previousRun?.createdAt || Date.now()
    })
    const job = this.saveJob({
      ...queued,
      runId,
      status: 'running',
      phase: 'thinking',
      error: null
    })
    const check = () => {
      controller.signal.throwIfAborted()
      if (
        this.stopped ||
        this.active.get(job.agentId) !== state ||
        this.job(job.id).status !== 'running'
      ) {
        throw new Error('Eksekusi tidak lagi aktif.')
      }
    }
    const context = {
      job,
      agent: this.profile(job.agentId),
      runId,
      signal: controller.signal,
      runtime: this,
      check,
      messages: () => this.store.messages(job.id),
      append: (message) => {
        check()
        return this.store.addMessage(job, runId, message)
      },
      toolResult: (message) => {
        check()
        return this.db.transaction(() => {
          const saved = this.store.addMessage(job, runId, message)
          this.store.put('subagent_runs', {
            ...this.store.get('subagent_runs', runId),
            pendingTool: null
          })
          return saved
        })()
      },
      update: (changes) => {
        check()
        return this.saveJob({ ...this.job(job.id), ...changes })
      },
      phase: (phase, activity = null) => {
        check()
        this.saveJob({ ...this.job(job.id), phase, activity })
        this.emit('subagent:activity', {
          agentId: job.agentId,
          jobId: job.id,
          runId,
          phase,
          activity
        })
      },
      inbox: () => this.consumeInbox(job.id, runId),
      lock: (key, action) => this.withLock(key, controller.signal, action),
      pending: (action) => {
        check()
        this.store.put('subagent_runs', {
          ...this.store.get('subagent_runs', runId),
          pendingTool: action
        })
      }
    }
    state.promise = (async () => {
      try {
        const result = await this.execute(context)
        check()
        if (result.wait) {
          this.saveJob({ ...this.job(job.id), ...result.wait, phase: null })
          this.store.put('subagent_runs', {
            ...this.store.get('subagent_runs', runId),
            status: 'waiting'
          })
          if (result.wait.status === 'waiting_user')
            this.requireLead(
              job.id,
              result.wait.error || 'Pekerjaan membutuhkan keputusan pengguna.'
            )
        } else {
          this.finish(
            job.id,
            runId,
            'completed',
            result.answer || 'Pekerjaan selesai.',
            result.artifact
          )
        }
      } catch (error) {
        const current = this.store.get('subagent_jobs', job.id)
        if (current?.status === 'running' && !this.stopped) {
          this.store.addMessage(current, runId, {
            sender: 'system',
            role: 'system',
            content: `[ERROR EKSEKUSI]: ${error.message}`
          })
          this.finish(job.id, runId, 'failed', null, null, error.message)
        }
      } finally {
        const current = this.store.get('subagent_jobs', job.id)
        if (!current || terminal.has(current.status) || current.status === 'interrupted') {
          await this.closeBrowser(runId).catch(() => {})
        }
        if (this.active.get(job.agentId) === state) this.active.delete(job.agentId)
        this.schedule()
      }
    })()
  }

  finish(jobId, runId, status, result = null, artifact = null, error = null) {
    const current = this.job(jobId)
    if (terminal.has(current.status) || (current.runId && current.runId !== runId)) return current
    const job = this.db.transaction(() => {
      const finished = this.saveJob({
        ...current,
        status,
        result,
        artifact,
        error,
        phase: null,
        waitingForJobId: null,
        completedAt: Date.now()
      })
      const run = this.store.get('subagent_runs', runId)
      if (run)
        this.store.put('subagent_runs', {
          ...run,
          status,
          result,
          error,
          endedAt: Date.now(),
          pendingTool: status === 'completed' ? null : run.pendingTool
        })
      const reportId = `report_${runId}`
      if (!this.store.get('subagent_reports', reportId)) {
        this.store.put('subagent_reports', {
          id: reportId,
          agentId: finished.agentId,
          jobId,
          runId,
          status: 'pending',
          followupStatus: status === 'cancelled' ? 'ignored' : 'pending',
          createdAt: Date.now(),
          taskId: finished.taskId,
          stepId: finished.stepId,
          parentSessionId: finished.parentSessionId,
          parentSessionTitle: finished.parentSessionTitle,
          summary: result || error || 'Pekerjaan dihentikan.',
          artifact,
          outcome: status,
          subagentName: this.profile(finished.agentId).name
        })
      }
      return finished
    })()
    for (const message of this.store
      .all('subagent_inbox')
      .filter((m) => m.targetJobId === jobId && m.kind === 'question' && !m.answeredAt)) {
      if (status === 'completed') this.replyStored(message, result)
      else
        this.requireLead(
          message.senderJobId,
          `Kolega berhenti dengan status ${status}. Tinjau dependensi pekerjaan.`
        )
    }
    this.flushReports()
    return job
  }
  requireLead(jobId, reason) {
    const job = this.store.get('subagent_jobs', jobId)
    if (job && !terminal.has(job.status) && job.status !== 'interrupted') {
      if (job.status === 'waiting_review') return
      if (
        this.review &&
        !job.clientRequest &&
        (!job.approval || this.canReviewAction(job, job.approval)) &&
        (job.approval || (job.reviewRounds || 0) < 3)
      ) {
        this.saveJob({
          ...job,
          status: 'waiting_review',
          phase: null,
          error: reason,
          review: {
            id: uid('review'),
            status: 'pending',
            kind: job.approval ? 'action' : 'question',
            reason
          }
        })
        this.schedule()
        return
      }
      this.askUser(job, reason)
    }
  }
  askUser(job, reason) {
    const jobId = job.id
    this.saveJob({ ...job, status: 'waiting_user', phase: null, error: reason })
    this.emit('subagent:activity', {
      agentId: job.agentId,
      jobId,
      phase: 'waiting_user',
      activity: reason
    })
    const runId = job.runId || job.id
    const id = `attention_${runId}_${job.turnCount || 0}`
    if (!this.store.get('subagent_reports', id))
      this.store.put('subagent_reports', {
        id,
        agentId: job.agentId,
        jobId,
        runId,
        status: 'pending',
        createdAt: Date.now(),
        taskId: job.taskId,
        stepId: job.stepId,
        parentSessionId: job.parentSessionId,
        parentSessionTitle: job.parentSessionTitle,
        outcome: 'waiting_user',
        subagentName: this.profile(job.agentId).name,
        summary: reason
      })
    this.flushReports()
  }

  launchReview(job) {
    if (!this.review || this.reviews.has(job.id)) return
    const controller = new AbortController()
    const state = { controller }
    this.reviews.set(job.id, state)
    const current = this.saveJob({
      ...job,
      reviewRounds: (job.reviewRounds || 0) + (job.approval ? 0 : 1),
      review: { ...job.review, status: 'running' }
    })
    const stillCurrent = () =>
      !this.stopped &&
      !controller.signal.aborted &&
      this.store.get('subagent_jobs', job.id)?.status === 'waiting_review' &&
      this.store.get('subagent_jobs', job.id)?.review?.id === job.review?.id
    state.promise = (async () => {
      try {
        const result = await this.review({
          job: current,
          agent: this.profile(job.agentId),
          messages: this.store.messages(job.id),
          signal: controller.signal,
          mayApprove: !!job.approval && this.canReviewAction(job, job.approval),
          peers: this.jobs().filter(
            (p) =>
              p.id !== job.id &&
              p.parentSessionId === job.parentSessionId &&
              p.workspaceRoot === job.workspaceRoot
          )
        })
        if (!stillCurrent()) return
        if (!['continue', 'approve_action', 'needs_user'].includes(result?.decision))
          throw new Error('Keputusan Mark tidak valid.')
        if (result.decision === 'approve_action' && !this.canReviewAction(job, job.approval))
          throw new Error('Tindakan membutuhkan persetujuan pengguna.')
        const reviewed = this.saveJob({
          ...this.job(job.id),
          status: 'waiting_user',
          review: {
            ...current.review,
            status: 'completed',
            decision: result.decision,
            explanation: result.explanation
          }
        })
        if (result.decision === 'needs_user')
          this.askUser(reviewed, result.explanation || job.error)
        else {
          if (!result.instructions?.trim()) throw new Error('Arahan Mark kosong.')
          this.resume(job.id, {
            instruction: `[TINJAUAN MARK]: ${result.explanation || ''}\n${result.instructions}`,
            approved: result.decision === 'approve_action',
            reviewedByMark: result.decision === 'approve_action',
            requestId: current.review.id
          })
        }
      } catch (error) {
        if (
          !controller.signal.aborted &&
          (stillCurrent() ||
            (!this.stopped &&
              this.store.get('subagent_jobs', job.id)?.status === 'waiting_user' &&
              this.store.get('subagent_jobs', job.id)?.review?.id === job.review?.id))
        )
          this.askUser(
            { ...this.job(job.id), review: { ...current.review, status: 'failed' } },
            `${job.error}\nPeninjauan Mark belum berhasil: ${error.message}`
          )
      } finally {
        if (this.reviews.get(job.id) === state) this.reviews.delete(job.id)
        this.schedule()
      }
    })()
  }

  requestReview(jobId) {
    const job = this.job(jobId)
    if (
      this.stopped ||
      !this.review ||
      !['waiting_user', 'interrupted', 'failed'].includes(job.status)
    )
      throw new Error('Pekerjaan ini belum dapat ditinjau Mark.')
    if (job.clientRequest || (job.approval && !this.canReviewAction(job, job.approval)))
      throw new Error('Permintaan ini memerlukan tindakan pengguna.')
    const saved = this.saveJob({
      ...job,
      status: 'waiting_review',
      reviewRounds: 0,
      review: { id: uid('review'), status: 'pending', kind: 'question', reason: job.error }
    })
    this.schedule()
    return saved
  }

  attention(sessionId) {
    if (!sessionId) throw new Error('Sesi chat wajib diisi.')
    return this.jobs()
      .filter(
        (job) =>
          job.parentSessionId === String(sessionId) &&
          ['waiting_user', 'waiting_review', 'interrupted'].includes(job.status)
      )
      .map((job) => ({
        id: job.id,
        agentName: this.profile(job.agentId).name,
        goal: job.goal,
        status: job.status,
        question: job.error,
        approval: job.approval,
        clientRequest: job.clientRequest,
        reviewId: job.review?.id,
        canReview:
          !!this.review &&
          !job.clientRequest &&
          (!job.approval || this.canReviewAction(job, job.approval))
      }))
  }

  sendMessage(targetAgent, input, senderJobId = null) {
    if (this.stopped) throw new Error('Runtime Minibot sedang berhenti.')
    if (!input.requestId || !String(input.message || '').trim())
      throw new Error('requestId dan pesan wajib diisi.')
    const existing = this.store.all('subagent_inbox').find((m) => m.requestId === input.requestId)
    if (existing) {
      if (existing.content !== input.message || existing.senderJobId !== senderJobId) {
        throw new Error('requestId sudah digunakan untuk pesan lain.')
      }
      return existing
    }
    const profile = this.profiles().find(
      (p) => p.id === targetAgent || normalize(p.name) === normalize(targetAgent)
    )
    if (!profile) throw new Error('Minibot penerima tidak ditemukan.')
    const source = senderJobId ? this.job(senderJobId) : null
    const candidates = this.jobs(profile.id).filter(
      (j) =>
        (!source ||
          (j.parentSessionId === source.parentSessionId &&
            j.workspaceRoot === source.workspaceRoot)) &&
        (!input.parentSessionId || j.parentSessionId === String(input.parentSessionId))
    )
    let target
    if (input.jobId) target = candidates.find((j) => j.id === input.jobId)
    else {
      const active = candidates.filter((j) => pending(j))
      if (active.length > 1 || (!active.length && candidates.length > 1))
        throw new Error('Penerima memiliki beberapa penugasan. Sebutkan job_id.')
      target = active[0] || candidates[0]
    }
    if (!target) throw new Error('Penugasan penerima tidak ditemukan dalam sesi koordinasi ini.')
    if (source?.agentId === profile.id)
      throw new Error('Tidak dapat mengirim pesan ke Minibot sendiri.')
    const kind = input.kind || 'info'
    if (!['info', 'question', 'reply'].includes(kind)) throw new Error('Jenis pesan tidak valid.')
    if (terminal.has(target.status) && !(kind === 'question' && source)) {
      throw new Error('Pekerjaan sudah berakhir. Buat penugasan lanjutan melalui Mark.')
    }
    if (kind === 'question' && source) {
      let cursor = target
      const visited = new Set()
      while (cursor) {
        if (cursor.id === source.id || cursor.agentId === source.agentId)
          throw new Error('Permintaan ditolak karena membentuk siklus saling menunggu.')
        if (visited.has(cursor.id)) throw new Error('Dependensi penerima sudah membentuk siklus.')
        visited.add(cursor.id)
        const reserved = this.jobs(cursor.agentId).find((j) =>
          ['running', 'waiting_peer', 'waiting_user', 'waiting_review'].includes(j.status)
        )
        cursor = cursor.waitingForJobId
          ? this.store.get('subagent_jobs', cursor.waitingForJobId)
          : reserved && reserved.id !== cursor.id
            ? reserved
            : null
      }
    }
    let question = null
    if (kind === 'reply') {
      question = this.store.get('subagent_inbox', input.replyTo)
      if (
        !question ||
        question.targetJobId !== source?.id ||
        question.senderJobId !== target.id ||
        question.answeredAt
      ) {
        throw new Error('Balasan tidak cocok dengan pertanyaan yang masih terbuka.')
      }
    }
    const message = this.db.transaction(() => {
      const record = this.store.put('subagent_inbox', {
        id: uid('mail'),
        agentId: profile.id,
        jobId: target.id,
        targetJobId: target.id,
        senderJobId: source?.id || null,
        sender: source ? 'peer' : input.sender || 'mark',
        senderName: source ? this.profile(source.agentId).name : input.sender || 'Mark',
        requestId: input.requestId,
        kind,
        replyTo: input.replyTo || null,
        content: input.message,
        status: 'pending',
        createdAt: Date.now()
      })
      if (question) this.store.put('subagent_inbox', { ...question, answeredAt: Date.now() })
      if (source && kind === 'question')
        this.saveJob({
          ...this.job(source.id),
          waitingForJobId: target.id,
          waitDeadline: Date.now() + 120000
        })
      if (target.status === 'waiting_peer' && (kind === 'reply' || kind === 'question')) {
        this.saveJob({
          ...target,
          status: 'queued',
          ...(kind === 'reply' ? { waitingForJobId: null } : {})
        })
      }
      return record
    })()
    if (terminal.has(target.status) && kind === 'question' && source) {
      if (target.status === 'completed') this.replyStored(message, target.result)
      else
        this.requireLead(
          source.id,
          'Kolega tidak memiliki hasil. Buat penugasan lanjutan melalui Mark.'
        )
    }
    this.emit('subagent:message', { agentId: profile.id, jobId: target.id, messageId: message.id })
    this.schedule()
    return message
  }
  replyStored(question, result) {
    if (!question.senderJobId || !result) return
    const target = this.job(question.senderJobId)
    this.store.put('subagent_inbox', {
      id: `reply_${question.id}`,
      agentId: target.agentId,
      jobId: target.id,
      targetJobId: target.id,
      senderJobId: question.targetJobId,
      sender: 'peer',
      kind: 'reply',
      replyTo: question.id,
      content: result,
      status: 'pending',
      createdAt: Date.now()
    })
    this.store.put('subagent_inbox', { ...question, answeredAt: Date.now() })
    if (!terminal.has(target.status))
      this.saveJob({
        ...target,
        status: target.status === 'waiting_peer' ? 'queued' : target.status,
        waitingForJobId: null
      })
  }
  consumeInbox(jobId, runId) {
    return this.db.transaction(() => {
      const delivered = []
      const job = this.job(jobId)
      if (job.pendingInput) {
        this.store.addMessage(job, runId, {
          sender: 'mark',
          role: 'user',
          content: job.pendingInput
        })
        this.saveJob({ ...job, pendingInput: null })
        delivered.push({ kind: 'instruction', content: job.pendingInput })
      }
      for (const message of this.store
        .all('subagent_inbox')
        .filter((m) => m.targetJobId === jobId && m.status === 'pending')) {
        this.store.addMessage(this.job(jobId), runId, {
          sender: message.sender,
          role: 'user',
          content: `[PESAN ${message.kind}; ID=${message.id}; target_agent=${message.senderJobId ? this.store.get('subagent_jobs', message.senderJobId)?.agentId || 'agent-dihapus' : 'Mark'}; job_id=${message.senderJobId || ''}]: ${message.content}`
        })
        this.store.put('subagent_inbox', { ...message, status: 'delivered' })
        if (message.kind === 'reply')
          this.saveJob({ ...this.job(jobId), waitingForJobId: null, waitDeadline: null })
        delivered.push(message)
      }
      return delivered
    })()
  }

  cancel(jobId) {
    const job = this.job(jobId)
    if (terminal.has(job.status)) return job
    this.reviews.get(jobId)?.controller.abort()
    this.active.get(job.agentId)?.jobId === jobId && this.active.get(job.agentId).controller.abort()
    if (job.runId && !this.active.has(job.agentId)) this.closeBrowser(job.runId).catch(() => {})
    const result = this.finish(jobId, job.runId || `queued_${jobId}`, 'cancelled')
    return result
  }
  resume(
    jobId,
    {
      instruction = '',
      approved = false,
      retry = false,
      requestId,
      expectedApprovalId,
      reviewedByMark = false
    } = {}
  ) {
    if (this.stopped) throw new Error('Runtime Minibot sedang berhenti.')
    const job = this.job(jobId)
    if (job.taskId) {
      const task = this.db.prepare('SELECT status FROM agent_tasks WHERE id=?').get(job.taskId)
      if (!task || ['cancelled', 'completed'].includes(task.status))
        throw new Error('Workflow terkait sudah berakhir.')
    }
    if (requestId && job.lastResumeRequestId === requestId) return job
    if (expectedApprovalId && job.approval?.id !== expectedApprovalId)
      throw new Error('Permintaan persetujuan sudah berubah. Muat ulang daftar keputusan.')
    if (!['interrupted', 'waiting_user', 'failed', 'cancelled'].includes(job.status))
      throw new Error('Pekerjaan ini tidak dapat dilanjutkan.')
    if (['failed', 'cancelled'].includes(job.status) && !retry)
      throw new Error('Gunakan coba lagi untuk pekerjaan yang sudah berakhir.')
    const oldRun = job.runId ? this.store.get('subagent_runs', job.runId) : null
    if (
      oldRun?.pendingTool &&
      !job.approval &&
      !this.store.messages(jobId).some((m) => m.tool_call_id === oldRun.pendingTool.id)
    ) {
      this.store.addMessage(job, oldRun.id, {
        role: 'tool',
        sender: 'tool',
        tool_call_id: oldRun.pendingTool.id,
        name: oldRun.pendingTool.function?.name,
        content:
          '[TERPUTUS] Hasil aksi terakhir tidak diketahui. Jangan mengulangnya otomatis; periksa kondisi aktual terlebih dahulu.'
      })
    }
    if (job.approval && !approved && !instruction)
      throw new Error('Setujui atau tolak tindakan yang menunggu.')
    if (job.approval && !approved) {
      this.store.addMessage(job, oldRun?.id, {
        role: 'tool',
        sender: 'tool',
        tool_call_id: job.approval.id,
        name: job.approval.function?.name,
        content: '[DITOLAK] Tindakan tidak disetujui. Ikuti arahan terbaru dan cari cara lain.'
      })
    }
    const history = this.store.messages(jobId)
    const answered = new Set(history.filter((m) => m.role === 'tool').map((m) => m.tool_call_id))
    for (const call of history.flatMap((m) => m.tool_calls || [])) {
      if (
        answered.has(call.id) ||
        (approved && call.id === job.approval?.id) ||
        job.clientFrames?.[call.id]
      )
        continue
      this.store.addMessage(job, oldRun?.id, {
        role: 'tool',
        sender: 'tool',
        tool_call_id: call.id,
        name: call.function?.name,
        content:
          '[DILEWATI] Konteks berubah saat pekerjaan terhenti. Evaluasi instruksi terbaru sebelum merencanakan aksi ini lagi.'
      })
    }
    if (oldRun && !terminal.has(oldRun.status))
      this.store.put('subagent_runs', {
        ...oldRun,
        status: 'interrupted',
        endedAt: Date.now()
      })
    if (oldRun && !this.active.has(job.agentId)) this.closeBrowser(oldRun.id).catch(() => {})
    const resumed = this.saveJob({
      ...job,
      status: 'queued',
      phase: null,
      error: null,
      runId: null,
      waitingForJobId: null,
      waitDeadline: null,
      approvedToolId: approved ? job.approval?.id : null,
      markApprovedToolId: approved && reviewedByMark ? job.approval?.id : null,
      pendingInput: instruction || job.pendingInput || null,
      approval: null,
      clientRequest: null,
      lastResumeRequestId: requestId || null
    })
    this.schedule()
    return resumed
  }
  async withLock(key, signal, action) {
    const previous = this.locks.get(key) || Promise.resolve()
    let release
    const lock = new Promise((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => {}).then(() => lock)
    this.locks.set(key, tail)
    try {
      await previous.catch(() => {})
      signal.throwIfAborted()
      return await action()
    } finally {
      release()
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }

  reports(sessionId) {
    return this.store
      .all('subagent_reports')
      .filter((r) => !sessionId || r.parentSessionId === String(sessionId))
  }
  claimReport(id, { owner, sessionId } = {}) {
    if (this.stopped || typeof owner !== 'string' || !owner.trim() || !sessionId)
      throw new Error('Permintaan penanganan laporan tidak valid.')
    return this.db.transaction(() => {
      const report = this.store.get('subagent_reports', id)
      if (!report || report.parentSessionId !== String(sessionId))
        throw new Error('Laporan tidak ditemukan dalam sesi ini.')
      if (report.taskId) {
        const task = this.db.prepare('SELECT * FROM agent_tasks WHERE id=?').get(report.taskId)
        if (
          !task ||
          ['cancelled', 'completed'].includes(task.status) ||
          task.active_step_id !== report.stepId
        ) {
          this.store.put('subagent_reports', { ...report, followupStatus: 'ignored' })
          return null
        }
      }
      if (report.status !== 'delivered' || report.followupStatus !== 'pending') return null
      if (this.reports(sessionId).some((r) => r.followupStatus === 'claimed')) return null
      return this.store.put('subagent_reports', {
        ...report,
        followupStatus: 'claimed',
        followupOwner: owner,
        followupStartedAt: Date.now()
      })
    })()
  }
  settleReport(id, { owner, outcome } = {}) {
    if (this.stopped || !['handled', 'failed', 'pending'].includes(outcome))
      throw new Error('Hasil penanganan laporan tidak valid.')
    const report = this.store.get('subagent_reports', id)
    if (!report || report.followupStatus !== 'claimed' || report.followupOwner !== owner)
      throw new Error('Laporan sedang ditangani oleh proses lain atau sudah ditutup.')
    return this.store.put('subagent_reports', {
      ...report,
      followupStatus: outcome,
      followupEndedAt: Date.now(),
      followupOwner: null
    })
  }
  flushReports() {
    if (this.stopped) return
    for (const report of this.reports().filter((r) => r.status === 'pending')) {
      // Store delivery in the session before notifying clients; retries merge by ID.
      const session = this.db
        .prepare('SELECT data FROM sessions WHERE id=?')
        .get(report.parentSessionId)
      if (!session) continue
      let history
      try {
        history = JSON.parse(session.data || '[]')
      } catch {
        continue
      }
      if (!Array.isArray(history)) continue
      if (!history.some((m) => m.reportId === report.id)) history.push(this.reportMessage(report))
      this.db.transaction(() => {
        this.db
          .prepare('UPDATE sessions SET data=?,updated_at=? WHERE id=?')
          .run(JSON.stringify(history), Date.now(), report.parentSessionId)
        this.store.put('subagent_reports', { ...report, status: 'delivered' })
      })()
      this.emit('subagent:report', {
        ...report,
        reportId: report.id,
        subagentId: report.agentId,
        persisted: true,
        message: this.reportMessage(report),
        timestamp: report.createdAt
      })
    }
  }
  reportMessage(report) {
    return {
      id: report.id,
      reportId: report.id,
      role: 'ai',
      source: 'subagent',
      sender: `@${report.subagentName}`,
      content: `Laporan @${report.subagentName} (${report.outcome}):\n\n${report.summary}${report.artifact ? `\n\nArtefak: ${report.artifact}` : ''}`,
      created_at: report.createdAt,
      timestamp: new Date(report.createdAt).toLocaleString('id-ID'),
      isThinking: false
    }
  }
  mergeReports(sessionId, data) {
    let history = typeof data === 'string' ? JSON.parse(data) : data
    if (!Array.isArray(history)) return data
    for (const report of this.reports(sessionId)) {
      if (!history.some((m) => m.reportId === report.id || m.id === report.id))
        history = [...history, this.reportMessage(report)]
    }
    return history
  }
  async removeProfile(id) {
    for (const job of this.jobs(id).filter(pending)) this.cancel(job.id)
    const active = this.active.get(id)
    if (active) await active.promise
    await Promise.allSettled(this.jobs(id).map((j) => this.reviews.get(j.id)?.promise))
    this.db.transaction(() => {
      for (const table of runtimeTables)
        this.db.prepare(`DELETE FROM ${table} WHERE agent_id=?`).run(id)
      this.db.prepare('DELETE FROM subagent_messages WHERE subagent_id=?').run(id)
      this.db.prepare('DELETE FROM subagents WHERE id=?').run(id)
    })()
  }
  async stop() {
    this.stopped = true
    clearInterval(this.timer)
    for (const state of this.active.values()) state.controller.abort()
    for (const state of this.reviews.values()) state.controller.abort()
    for (const job of this.jobs().filter(pending))
      this.saveJob({ ...job, status: 'interrupted', phase: null })
    await Promise.allSettled([...this.active.values()].map((s) => s.promise))
    await Promise.allSettled([...this.reviews.values()].map((s) => s.promise))
    await Promise.allSettled(
      this.jobs()
        .filter((j) => j.runId && j.status === 'interrupted')
        .map((j) => this.closeBrowser(j.runId))
    )
  }
}
