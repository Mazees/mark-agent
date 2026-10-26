import { subagentRequest } from './client.js'

export const subagentStore = {
  async createSubagent(input) {
    return subagentRequest('', input)
  },
  async getSubagent(id) {
    return subagentRequest('/' + encodeURIComponent(id))
  },
  async listSubagents(status = null) {
    const agents = await subagentRequest('')
    return status && status !== 'all' ? agents.filter((a) => a.status === status) : agents
  },
  async updateSubagent(id, input) {
    return subagentRequest('', { ...input, id })
  },
  async deleteSubagent(id) {
    return subagentRequest('/' + encodeURIComponent(id), undefined, 'DELETE')
  },
  async getMessages(id, jobId = null) {
    return subagentRequest(
      jobId
        ? '/jobs/' + encodeURIComponent(jobId) + '/messages'
        : '/' + encodeURIComponent(id) + '/messages'
    )
  },
  async clearMessages() {
    throw new Error(
      'Riwayat penugasan dipertahankan sebagai checkpoint. Hapus agen untuk menghapus seluruh riwayatnya.'
    )
  },
  async listJobs(id) {
    return subagentRequest('/' + encodeURIComponent(id) + '/jobs')
  }
}
