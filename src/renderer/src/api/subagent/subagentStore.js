import { db } from '../db'

// Set untuk melacak ID sub-agent yang sedang/telah dihapus guna mencegah race condition pada update async
const deletedSubagentIds = new Set()

export const subagentStore = {
  /**
   * Cek apakah subagent ID sedang atau telah dihapus
   */
  isDeleted(id) {
    return deletedSubagentIds.has(id)
  },

  /**
   * Membuat entitas Sub-Agent baru di database SQLite (Unique Name Aware)
   * Jika sudah ada subagent dengan nama yang sama (case-insensitive):
   * - Jika statusnya 'running', kembalikan instance yang sedang berjalan (tidak membuat duplikat).
   * - Jika statusnya 'idle', 'completed', 'killed', atau 'failed', aktifkan kembali dengan goal baru.
   */
  async createSubagent({
    name = 'Specialist-Agent',
    role = 'Technical Specialist',
    goal = 'Selesaikan misi yang ditugaskan',
    allowedTools = ['*'],
    parentSessionId = '1',
    parentSessionTitle = 'Main Thread',
    forceNew = false
  }) {
    const trimmedName = (name || 'Specialist-Agent').trim()
    const normalizedName = trimmedName.replace(/^@/, '')

    // Cek keberadaan subagent dengan nama yang sama agar entitas selalu unik
    if (!forceNew) {
      const existingAgents = await this.listSubagents('all')
      const existing = existingAgents.find(
        (s) =>
          s.name.toLowerCase().trim() === trimmedName.toLowerCase() ||
          s.name.toLowerCase().replace(/^@/, '').trim() === normalizedName.toLowerCase()
      )

      if (existing) {
        // Jika sudah ada dan sedang berjalan, jangan spawn baru, pakai yang ada
        if (existing.status === 'running') {
          return { ...existing, isExisting: true, wasRunning: true }
        }

        // Jika sudah ada tapi sedang idle / stop, perbarui info dan hidupkan kembali
        const updates = {
          role: role || existing.role || 'Technical Specialist',
          goal: goal || existing.goal,
          allowedTools: allowedTools && allowedTools.length > 0 ? allowedTools : existing.allowedTools,
          status: 'running',
          parentSessionId: String(parentSessionId || existing.parentSessionId || '1'),
          parentSessionTitle:
            parentSessionTitle ||
            existing.parentSessionTitle ||
            (String(parentSessionId) === '1' ? 'Main Thread' : `Sesi #${parentSessionId}`),
          updatedAt: Date.now()
        }
        await this.updateSubagent(existing.id, updates)
        return { ...existing, ...updates, isExisting: true, wasRunning: false }
      }
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    deletedSubagentIds.delete(id)
    const subagent = {
      id,
      name: trimmedName,
      role,
      goal,
      allowedTools,
      status: 'running',
      parentSessionId: String(parentSessionId || '1'),
      parentSessionTitle: parentSessionTitle || (String(parentSessionId) === '1' ? 'Main Thread' : `Sesi #${parentSessionId}`),
      turnCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finalAnswer: null
    }
    await db.subagents.put(subagent)
    return subagent
  },

  /**
   * Mengambil metadata Sub-Agent berdasarkan ID
   */
  async getSubagent(id) {
    if (!id || deletedSubagentIds.has(id)) return null
    return await db.subagents.get(id)
  },

  /**
   * Mengambil daftar seluruh Sub-Agent
   */
  async listSubagents(filterStatus = null) {
    let collection = db.subagents.orderBy('createdAt').reverse()
    let list = []
    if (filterStatus && filterStatus !== 'all') {
      list = await collection.filter((s) => s.status === filterStatus).toArray()
    } else {
      list = await collection.toArray()
    }
    return (list || []).filter((s) => s && s.id && !deletedSubagentIds.has(s.id))
  },

  /**
   * Mengupdate field/status Sub-Agent
   */
  async updateSubagent(id, updates) {
    if (!id || deletedSubagentIds.has(id)) return
    const existing = await db.subagents.get(id)
    if (!existing || deletedSubagentIds.has(id)) return
    await db.subagents.update(id, { ...updates, updatedAt: Date.now() })
  },

  /**
   * Menghapus Sub-Agent beserta riwayat chat-nya
   */
  async deleteSubagent(id) {
    if (!id) return
    deletedSubagentIds.add(id)
    try {
      const { killSubagentExecution } = await import('./subagentExecutor')
      killSubagentExecution(id, true)
    } catch (_) {}
    try {
      await db.subagents.delete(id)
    } catch (err) {
      console.error('[subagentStore] Error deleting subagent from DB:', err)
    }
    try {
      await db.subagent_messages.where('subagentId').equals(id).delete()
    } catch (_) {}
  },

  /**
   * Menambahkan pesan ke riwayat percakapan AI-to-AI Sub-Agent
   */
  async addMessage(subagentId, { sender, role, content, thought = null, action = null, tool_calls = null, tool_call_id = null, name = null }) {
    if (!subagentId || deletedSubagentIds.has(subagentId)) return null
    const msg = {
      subagentId,
      sender, // 'mark' | 'subagent' | 'user' | 'system' | 'tool'
      role, // 'user' | 'assistant' | 'system' | 'tool'
      content: typeof content === 'string' ? content : (content ? JSON.stringify(content) : ''),
      thought: thought || null,
      action: action || null,
      tool_calls: tool_calls || null,
      tool_call_id: tool_call_id || null,
      name: name || null,
      timestamp: Date.now()
    }
    const id = await db.subagent_messages.add(msg)
    return { ...msg, id }
  },

  /**
   * Mengambil semua pesan Sub-Agent secara kronologis
   */
  async getMessages(subagentId) {
    if (!subagentId || deletedSubagentIds.has(subagentId)) return []
    return await db.subagent_messages.where('subagentId').equals(subagentId).sortBy('timestamp')
  },

  /**
   * Membersihkan pesan dari satu Sub-Agent
   */
  async clearMessages(subagentId) {
    if (!subagentId) return
    await db.subagent_messages.where('subagentId').equals(subagentId).delete()
  }
}
