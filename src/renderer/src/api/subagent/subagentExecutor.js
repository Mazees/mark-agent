import { subagentStore } from './subagentStore.js'
import { subagentRequest, submitJob, sendAgentMessage } from './client.js'

export async function runSubagentTurn(id, message, senderType = 'mark', options = {}) {
  const jobs = await subagentStore.listJobs(id)
  const active = jobs.filter((j) =>
    ['running', 'queued', 'waiting_peer', 'waiting_review', 'waiting_user', 'interrupted'].includes(
      j.status
    )
  )
  if (active.length && !options.newJob) {
    if (!options.jobId && active.length !== 1)
      throw new Error('Pilih penugasan penerima terlebih dahulu.')
    const job = options.jobId ? active.find((j) => j.id === options.jobId) : active[0]
    if (!job) throw new Error('Penugasan aktif yang dipilih tidak ditemukan.')
    if (['interrupted', 'waiting_user'].includes(job.status)) {
      const data = await subagentRequest('/jobs/' + job.id + '/resume', {
        instruction: message,
        requestId: options.requestId || crypto.randomUUID()
      })
      return {
        success: true,
        jobId: data.id,
        reply: 'Instruksi tersimpan dan pekerjaan masuk antrean.'
      }
    }
    const data = await sendAgentMessage(id, message, {
      ...options,
      jobId: job.id,
      sender: senderType
    })
    return {
      success: true,
      jobId: job.id,
      messageId: data.id,
      reply: 'Pesan masuk kotak masuk pekerjaan aktif.'
    }
  }
  const job = await submitJob(id, message, { ...options, sender: senderType })
  return { success: true, jobId: job.id, reply: 'Penugasan tersimpan dan masuk antrean server.' }
}
export async function killSubagentExecution(id) {
  return subagentRequest('/' + encodeURIComponent(id) + '/cancel', {})
}
