import { db } from '../db'

export const subagentStore = {
  /**
   * Membuat entitas Sub-Agent baru di database SQLite
   */
  async createSubagent({
    name = 'Specialist-Agent',
    role = 'Technical Specialist',
    goal = 'Selesaikan misi yang ditugaskan',
    allowedTools = ['*'],
    parentSessionId = '1',
    parentSessionTitle = 'Main Thread'
  }) {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const subagent = {
      id,
      name,
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
    if (!id) return null
    return await db.subagents.get(id)
  },

  /**
   * Mengambil daftar seluruh Sub-Agent
   */
  async listSubagents(filterStatus = null) {
    let collection = db.subagents.orderBy('createdAt').reverse()
    if (filterStatus && filterStatus !== 'all') {
      return await collection.filter((s) => s.status === filterStatus).toArray()
    }
    return await collection.toArray()
  },

  /**
   * Mengupdate field/status Sub-Agent
   */
  async updateSubagent(id, updates) {
    if (!id) return
    await db.subagents.update(id, { ...updates, updatedAt: Date.now() })
  },

  /**
   * Menghapus Sub-Agent beserta riwayat chat-nya
   */
  async deleteSubagent(id) {
    if (!id) return
    try {
      const { killSubagentExecution } = await import('./subagentExecutor')
      killSubagentExecution(id)
    } catch (_) {}
    await db.subagents.delete(id)
  },

  /**
   * Menambahkan pesan ke riwayat percakapan AI-to-AI Sub-Agent
   */
  async addMessage(subagentId, { sender, role, content, thought = null, action = null, tool_calls = null, tool_call_id = null, name = null }) {
    if (!subagentId) return null
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
    if (!subagentId) return []
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
