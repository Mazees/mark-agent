import { randomUUID } from 'node:crypto'
import { dbStore } from '../../server/memory/db-store.js'

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')

export const learnTools = {
  learn: {
    description: 'Menyimpan atau memperbarui learned skill MARK secara lokal.',
    needsApproval: false,
    handler: async ({ name, description, content, method }) => {
      const cleanName = cleanText(name)
      const cleanDescription = cleanText(description)
      const cleanContent = cleanText(content)
      const cleanMethod = cleanText(method)

      if (!cleanName || !cleanDescription || !cleanContent) {
        return { success: false, error: 'name, description, dan content wajib diisi.' }
      }
      if (cleanName.length > 120 || cleanDescription.length > 500 || cleanContent.length > 30000) {
        return {
          success: false,
          error: 'Batas panjang terlampaui: name 120, description 500, content 30000 karakter.'
        }
      }
      if (cleanMethod !== 'insert' && cleanMethod !== 'update') {
        return { success: false, error: 'method harus bernilai insert atau update.' }
      }

      const existing = dbStore.learnedSkills
        .getAll()
        .find((skill) => cleanText(skill.name).toLowerCase() === cleanName.toLowerCase())

      if (cleanMethod === 'insert' && existing) {
        return {
          success: false,
          error: `Learned skill "${existing.name}" sudah ada. Gunakan method "update" untuk memperbaruinya.`
        }
      }
      if (cleanMethod === 'update' && !existing) {
        return {
          success: false,
          error: `Learned skill "${cleanName}" tidak ditemukan. Gunakan method "insert" untuk membuatnya.`
        }
      }

      const now = Date.now()
      const record = {
        ...(existing || {}),
        id: existing?.id || `skill_${randomUUID()}`,
        name: existing?.name || cleanName,
        description: cleanDescription,
        content: cleanContent,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }

      dbStore.learnedSkills.insert(record)
      return {
        success: true,
        method: cleanMethod,
        data: record,
        message: `Learned skill "${record.name}" berhasil ${cleanMethod === 'insert' ? 'disimpan' : 'diperbarui'}.`
      }
    }
  }
}
