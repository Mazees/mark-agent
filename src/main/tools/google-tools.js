import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  searchFiles,
  listFiles,
  readFile,
  uploadFile,
  createFile,
  moveFile,
  copyFile,
  getDriveInfo
} from '../google/google-drive.js'
import { listEvents, createEvent, deleteEvent } from '../google/google-calendar.js'
import { searchEmails, readEmail, sendEmail, markAsRead } from '../google/google-gmail.js'

export const parsePagination = (pagination) => {
  let start = 0,
    end = 10
  if (!pagination) return { start, end, fetchCount: end }
  if (typeof pagination === 'object') {
    start = parseInt(pagination.start, 10) || 0
    end = parseInt(pagination.end, 10) || 10
  } else {
    const s = String(pagination).trim()
    if (s.includes('-')) {
      const p = s.split('-')
      start = parseInt(p[0], 10) || 0
      end = parseInt(p[1], 10) || 10
    } else {
      end = parseInt(s, 10) || 10
    }
  }
  if (start < 0) start = 0
  if (end <= start) end = start + 10
  const fetchCount = end > 500 ? 500 : end
  return { start, end, fetchCount }
}

export const getGoogleCredentials = (config) => {
  let clientId = config?.googleClientId || (Array.isArray(config) ? config[0]?.googleClientId : null)
  let clientSecret =
    config?.googleClientSecret || (Array.isArray(config) ? config[0]?.googleClientSecret : null)

  if (!clientId || !clientSecret) {
    try {
      const configPath = path.join(os.homedir(), '.config', 'mark-agent', 'config.json')
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8')
        const parsed = JSON.parse(raw)
        clientId = clientId || parsed?.googleClientId
        clientSecret = clientSecret || parsed?.googleClientSecret
      }
    } catch (_) {}
  }

  return { clientId, clientSecret }
}

export const googleTools = {
  // Google Drive
  'gdrive-info': {
    needsApproval: false,
    handler: async (_args, config) => {
      try {
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await getDriveInfo(clientId, clientSecret)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-search': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let q = ''
        let pagination = null
        if (typeof args === 'object' && args !== null) {
          q = (args.query || '').trim()
          pagination = args.pagination
        } else {
          const parts = String(args || '').split('||')
          q = parts[0].trim()
          pagination = parts[1]
        }
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await searchFiles(clientId, clientSecret, q, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-list': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let folderId = null
        let pagination = null
        if (typeof args === 'object' && args !== null) {
          folderId = (args.folder_id || args.folderId || '').trim() || null
          pagination = args.pagination
        } else {
          const parts = String(args || '').split('||')
          folderId = parts[0].trim() || null
          pagination = parts[1]
        }
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await listFiles(clientId, clientSecret, folderId, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-read': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const fileId = (typeof args === 'object' && args !== null ? (args.file_id || args.fileId) : String(args || '')).trim()
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await readFile(clientId, clientSecret, fileId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-upload': {
    needsApproval: true,
    approvalMessage: (args) => {
      const name = typeof args === 'object' && args !== null ? args.name : String(args || '').split('||')[0]
      return `Mark ingin mengunggah file ke Google Drive-mu:\n${name}`
    },
    handler: async (args, config) => {
      try {
        let name = ''
        let content = ''
        if (typeof args === 'object' && args !== null) {
          name = (args.name || '').trim()
          content = args.content || ''
        } else {
          const parts = String(args || '').split('||')
          name = parts[0].trim()
          content = parts.slice(1).join('||')
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await uploadFile(clientId, clientSecret, name, content)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-create': {
    needsApproval: true,
    approvalMessage: (args) => {
      let name = ''
      let type = 'doc'
      if (typeof args === 'object' && args !== null) {
        name = args.name
        type = args.type || 'doc'
      } else {
        const parts = String(args || '').split('||')
        name = parts[0]
        type = parts[1] || 'doc'
      }
      return `Mark ingin membuat dokumen kosong baru di Google Drive:\nNama: ${name}\nTipe: ${type}`
    },
    handler: async (args, config) => {
      try {
        let name = ''
        let type = 'doc'
        if (typeof args === 'object' && args !== null) {
          name = (args.name || '').trim()
          type = (args.type || 'doc').trim()
        } else {
          const parts = String(args || '').split('||')
          name = parts[0].trim()
          type = parts[1] ? parts[1].trim() : 'doc'
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await createFile(clientId, clientSecret, name, type)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-move': {
    needsApproval: true,
    approvalMessage: (args) => {
      let fileId = ''
      let folderId = ''
      if (typeof args === 'object' && args !== null) {
        fileId = args.file_id || args.fileId
        folderId = args.folder_id || args.folderId
      } else {
        const parts = String(args || '').split('||')
        fileId = parts[0]
        folderId = parts[1]
      }
      return `Mark ingin memindahkan file di Google Drive.\nFile ID: ${fileId}\nFolder Tujuan ID: ${folderId}`
    },
    handler: async (args, config) => {
      try {
        let fileId = ''
        let folderId = ''
        if (typeof args === 'object' && args !== null) {
          fileId = (args.file_id || args.fileId || '').trim()
          folderId = (args.folder_id || args.folderId || '').trim()
        } else {
          const parts = String(args || '').split('||')
          fileId = parts[0].trim()
          folderId = parts[1].trim()
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await moveFile(clientId, clientSecret, fileId, folderId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gdrive-copy': {
    needsApproval: true,
    approvalMessage: (args) => {
      let fileId = ''
      let newName = ''
      if (typeof args === 'object' && args !== null) {
        fileId = args.file_id || args.fileId
        newName = args.new_name || args.newName
      } else {
        const parts = String(args || '').split('||')
        fileId = parts[0]
        newName = parts[1]
      }
      return `Mark ingin menduplikasi file di Google Drive.\nFile ID: ${fileId}\nNama Baru: ${newName}`
    },
    handler: async (args, config) => {
      try {
        let fileId = ''
        let newName = ''
        if (typeof args === 'object' && args !== null) {
          fileId = (args.file_id || args.fileId || '').trim()
          newName = (args.new_name || args.newName || '').trim()
        } else {
          const parts = String(args || '').split('||')
          fileId = parts[0].trim()
          newName = parts[1].trim()
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await copyFile(clientId, clientSecret, fileId, newName)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  // Google Calendar
  'gcalendar-list': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let pagination = null
        let timeMin = new Date().toISOString()
        if (typeof args === 'object' && args !== null) {
          pagination = args.pagination
          timeMin = args.time_min || args.timeMin || new Date().toISOString()
        } else {
          const parts = String(args || '').split('||')
          pagination = parts[0]
          timeMin = parts[1] ? parts[1].trim() : new Date().toISOString()
        }
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await listEvents(clientId, clientSecret, fetchCount, timeMin)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gcalendar-create': {
    needsApproval: true,
    approvalMessage: (args) => {
      let summary = ''
      let startTime = ''
      if (typeof args === 'object' && args !== null) {
        summary = args.summary
        startTime = args.start_time || args.startTime
      } else {
        const parts = String(args || '').split('||')
        summary = parts[0]
        startTime = parts[2]
      }
      return `Mark ingin membuat jadwal baru di kalendermu:\nJudul: ${summary}\nWaktu Mulai: ${startTime}`
    },
    handler: async (args, config) => {
      try {
        let summary = ''
        let description = ''
        let startTime = ''
        let endTime = ''
        if (typeof args === 'object' && args !== null) {
          summary = (args.summary || '').trim()
          description = (args.description || '').trim()
          startTime = (args.start_time || args.startTime || '').trim()
          endTime = (args.end_time || args.endTime || '').trim()
        } else {
          const parts = String(args || '').split('||')
          summary = parts[0].trim()
          description = parts[1].trim()
          startTime = parts[2].trim()
          endTime = parts[3].trim()
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await createEvent(
          clientId,
          clientSecret,
          summary,
          description,
          startTime,
          endTime
        )
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gcalendar-delete': {
    needsApproval: true,
    approvalMessage: (args) => {
      const id = typeof args === 'object' && args !== null ? (args.event_id || args.eventId) : String(args || '')
      return `Mark ingin MENGHAPUS jadwal/event ini:\nEvent ID: ${id}`
    },
    handler: async (args, config) => {
      try {
        const eventId = (typeof args === 'object' && args !== null ? (args.event_id || args.eventId) : String(args || '')).trim()
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await deleteEvent(clientId, clientSecret, eventId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  // Gmail
  'gmail-search': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let q = 'is:unread'
        let pagination = null
        if (typeof args === 'object' && args !== null) {
          q = (args.query || 'is:unread').trim()
          pagination = args.pagination
        } else {
          const parts = String(args || '').split('||')
          q = parts[0].trim() || 'is:unread'
          pagination = parts[1] || ''
        }
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await searchEmails(clientId, clientSecret, q, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gmail-list': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const pagination = typeof args === 'object' && args !== null ? args.pagination : args
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await searchEmails(clientId, clientSecret, 'is:unread', fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'new-gmail-list': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const pagination = typeof args === 'object' && args !== null ? args.pagination : args
        const { start, end, fetchCount } = parsePagination(pagination)
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const rawResult = await searchEmails(clientId, clientSecret, 'is:unread', fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gmail-read': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const messageId = (typeof args === 'object' && args !== null ? (args.message_id || args.messageId || args.id) : String(args || '')).trim()
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await readEmail(clientId, clientSecret, messageId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gmail-send': {
    needsApproval: true,
    approvalMessage: (args) => {
      let to = ''
      let subject = ''
      let body = ''
      if (typeof args === 'object' && args !== null) {
        to = args.to
        subject = args.subject
        body = args.body || ''
      } else {
        const parts = String(args || '').split('||')
        to = parts[0]
        subject = parts[1]
        body = parts[2] || ''
      }
      return `Mark ingin MENGIRIM EMAIL baru.\nTujuan: ${to}\nSubjek: ${subject}\nIsi Pesan:\n${body.slice(0, 100)}...`
    },
    handler: async (args, config) => {
      try {
        let to = ''
        let subject = ''
        let bodyText = ''
        if (typeof args === 'object' && args !== null) {
          to = (args.to || '').trim()
          subject = (args.subject || '').trim()
          bodyText = args.body || ''
        } else {
          const parts = String(args || '').split('||')
          to = parts[0].trim()
          subject = parts[1].trim()
          bodyText = parts.slice(2).join('||')
        }
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await sendEmail(clientId, clientSecret, to, subject, bodyText)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'gmail-mark-read': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const messageId = (typeof args === 'object' && args !== null ? (args.message_id || args.messageId || args.id) : String(args || '')).trim()
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await markAsRead(clientId, clientSecret, messageId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
