import { Router } from 'express'

export function createSubagentRouter(runtime, dbStore) {
  const subagentsRouter = Router()
  const route = (handler) => async (req, res) => {
    try {
      res.json({ success: true, data: await handler(req) })
    } catch (error) {
      res.status(400).json({ success: false, error: error.message })
    }
  }
  subagentsRouter.get(
    '/subagents/attention',
    route((req) => runtime.attention(req.query.sessionId))
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/review',
    route((req) => runtime.requestReview(req.params.id))
  )
  subagentsRouter.get(
    '/subagents/reports',
    route((req) => runtime.reports(req.query.sessionId))
  )
  subagentsRouter.post(
    '/subagents/reports/:id/claim',
    route((req) => runtime.claimReport(req.params.id, req.body))
  )
  subagentsRouter.post(
    '/subagents/reports/:id/settle',
    route((req) => runtime.settleReport(req.params.id, req.body))
  )
  subagentsRouter.get(
    '/subagents/jobs',
    route((req) => runtime.jobs(req.query.agentId))
  )
  subagentsRouter.get(
    '/subagents/jobs/:id',
    route((req) => ({
      ...runtime.job(req.params.id),
      runs: runtime.store.all('subagent_runs').filter((r) => r.jobId === req.params.id)
    }))
  )
  subagentsRouter.get(
    '/subagents/jobs/:id/messages',
    route((req) => runtime.store.messages(runtime.job(req.params.id).id))
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/cancel',
    route((req) => runtime.cancel(req.params.id))
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/resume',
    route((req) => runtime.resume(req.params.id, req.body))
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/retry',
    route((req) => runtime.resume(req.params.id, { ...req.body, retry: true }))
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/decision',
    route((req) => {
      const job = runtime.job(req.params.id)
      if (!job.approval || req.body.expectedApprovalId !== job.approval.id)
        throw new Error('Permintaan persetujuan sudah berubah. Muat ulang daftar keputusan.')
      return runtime.resume(req.params.id, {
        ...req.body,
        instruction: req.body.approved
          ? req.body.instruction
          : req.body.instruction || 'Tindakan ditolak pengguna.'
      })
    })
  )
  subagentsRouter.post(
    '/subagents/jobs/:id/frame',
    route((req) => {
      const job = runtime.job(req.params.id)
      if (job.status !== 'waiting_user' || job.clientRequest?.tool !== 'camera-look')
        throw new Error('Tidak ada permintaan kamera yang menunggu.')
      if (req.body.expectedRequestId !== job.clientRequest.id)
        throw new Error('Permintaan kamera sudah berubah. Muat ulang daftar keputusan.')
      if (
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.dataUrl || '') ||
        req.body.dataUrl.length > 15000000
      )
        throw new Error('Data gambar tidak valid.')
      runtime.saveJob({
        ...job,
        clientFrames: { ...job.clientFrames, [job.clientRequest.id]: req.body.dataUrl },
        clientRequest: null
      })
      return runtime.resume(job.id, { instruction: 'Gambar kamera sudah tersedia.' })
    })
  )
  subagentsRouter.get(
    '/subagents/messages',
    route(() => dbStore.subagentMessages.getAll())
  )
  subagentsRouter.post(
    '/subagents/messages',
    route(() => {
      throw new Error('Gunakan kotak masuk penugasan untuk mengirim pesan.')
    })
  )
  subagentsRouter.get(
    '/subagents',
    route(() => runtime.profiles())
  )
  subagentsRouter.post(
    '/subagents',
    route((req) =>
      req.body.id ? runtime.updateProfile(req.body.id, req.body) : runtime.createProfile(req.body)
    )
  )
  subagentsRouter.get(
    '/subagents/:id/jobs',
    route((req) => runtime.jobs(req.params.id))
  )
  subagentsRouter.post(
    '/subagents/:id/jobs',
    route((req) => runtime.submit(req.params.id, req.body))
  )
  subagentsRouter.post(
    '/subagents/:id/messages',
    route((req) => runtime.sendMessage(req.params.id, req.body))
  )
  subagentsRouter.post(
    '/subagents/:id/cancel',
    route((req) =>
      runtime
        .jobs(req.params.id)
        .filter((j) => !['completed', 'failed', 'cancelled'].includes(j.status))
        .map((j) => runtime.cancel(j.id))
    )
  )
  subagentsRouter.get(
    '/subagents/:id/messages',
    route((req) => runtime.jobs(req.params.id).flatMap((j) => runtime.store.messages(j.id)))
  )
  subagentsRouter.get(
    '/subagents/:id',
    route((req) => runtime.profile(req.params.id))
  )
  subagentsRouter.delete(
    '/subagents/:id',
    route(async (req) => {
      await runtime.removeProfile(req.params.id)
      return true
    })
  )

  return subagentsRouter
}
