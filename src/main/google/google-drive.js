import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'
import { getAuthClient } from './google-service.js'

/**
 * Helper to initialize the Drive API.
 */
export async function getDriveApi(clientId, clientSecret) {
  const auth = await getAuthClient(clientId, clientSecret)
  if (!auth) throw new Error('Not connected to Google Workspace.')
  return google.drive({ version: 'v3', auth })
}

/**
 * gdrive-search: Searches files by name or mimeType.
 */
export async function searchFiles(clientId, clientSecret, query, maxResults = 10) {
  const drive = await getDriveApi(clientId, clientSecret)
  // Build a simple query, or use the raw query if advanced
  // Let's assume the query is a simple string for name matching
  // Or the agent can pass standard Google Drive 'q' syntax.
  const q = query.includes(':') ? query : `name contains '${query}' and trashed = false`

  const res = await drive.files.list({
    q,
    pageSize: maxResults,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)'
  })
  return res.data.files
}

/**
 * gdrive-list: List recent files or files in a folder.
 */
export async function listFiles(clientId, clientSecret, folderId = null, maxResults = 10) {
  const drive = await getDriveApi(clientId, clientSecret)
  const q = folderId ? `'${folderId}' in parents and trashed = false` : `trashed = false`
  const res = await drive.files.list({
    q,
    pageSize: maxResults,
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)'
  })
  return res.data.files
}

/**
 * gdrive-read: Read text content from a Google Doc, Sheet, or raw text file.
 */
export async function readFile(clientId, clientSecret, fileId) {
  const drive = await getDriveApi(clientId, clientSecret)

  // First get file metadata to know its mimeType
  const fileMeta = await drive.files.get({ fileId, fields: 'name, mimeType' })
  const mimeType = fileMeta.data.mimeType

  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs -> export as text
      const res = await drive.files.export({
        fileId,
        mimeType: 'text/plain'
      })
      return res.data
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets -> export as CSV
      const res = await drive.files.export({
        fileId,
        mimeType: 'text/csv'
      })
      return res.data
    } else {
      // Standard files (txt, etc) -> download directly
      const res = await drive.files.get(
        {
          fileId,
          alt: 'media'
        },
        { responseType: 'text' }
      )
      return res.data
    }
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`)
  }
}

/**
 * gdrive-upload: Upload local file to Google Drive.
 */
export async function uploadFile(clientId, clientSecret, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Berkas tidak ditemukan: ${filePath}`)
  }
  const drive = await getDriveApi(clientId, clientSecret)
  const name = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska'
  }
  const mimeType = mimeMap[ext] || 'application/octet-stream'

  const res = await drive.files.create({
    requestBody: { name, mimeType },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id, name, mimeType, webViewLink, size'
  })
  return res.data
}

/**
 * gdrive-create: Create an empty Google Doc or Sheet.
 */
export async function createFile(clientId, clientSecret, name, type = 'doc') {
  const drive = await getDriveApi(clientId, clientSecret)
  const mimeMap = {
    doc: 'application/vnd.google-apps.document',
    sheet: 'application/vnd.google-apps.spreadsheet',
    folder: 'application/vnd.google-apps.folder'
  }
  const mimeType = mimeMap[type] || mimeMap['doc']

  const res = await drive.files.create({
    requestBody: { name, mimeType },
    fields: 'id, name, webViewLink'
  })
  return res.data
}

/**
 * gdrive-move: Move a file to a specific folder.
 */
export async function moveFile(clientId, clientSecret, fileId, folderId) {
  const drive = await getDriveApi(clientId, clientSecret)

  // Get current parents
  const file = await drive.files.get({ fileId, fields: 'parents' })
  const previousParents = file.data.parents ? file.data.parents.join(',') : ''

  // Move
  const res = await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: 'id, parents'
  })
  return res.data
}

/**
 * gdrive-copy: Copy a file.
 */
export async function copyFile(clientId, clientSecret, fileId, newName) {
  const drive = await getDriveApi(clientId, clientSecret)
  const res = await drive.files.copy({
    fileId,
    requestBody: { name: newName },
    fields: 'id, name, webViewLink'
  })
  return res.data
}

/**
 * gdrive-info: Get Google Drive storage info.
 */
export async function getDriveInfo(clientId, clientSecret) {
  const drive = await getDriveApi(clientId, clientSecret)
  const res = await drive.about.get({
    fields: 'storageQuota, user'
  })

  const quota = res.data.storageQuota
  const user = res.data.user

  if (!quota) return { error: 'Storage quota not available.' }

  const limit = parseInt(quota.limit, 10) || 0
  const usage = parseInt(quota.usage, 10) || 0
  const usageInDrive = parseInt(quota.usageInDrive, 10) || 0
  const usageInDriveTrash = parseInt(quota.usageInDriveTrash, 10) || 0

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return {
    user: user.emailAddress,
    totalStorage: formatBytes(limit),
    usedStorage: formatBytes(usage),
    freeStorage: formatBytes(limit - usage),
    usagePercentage: limit > 0 ? ((usage / limit) * 100).toFixed(1) + '%' : 'N/A',
    driveUsage: formatBytes(usageInDrive),
    trashUsage: formatBytes(usageInDriveTrash)
  }
}

/**
 * gdrive-share: Share file or change file permission (e.g. public anyone reader, or specific email).
 */
export async function shareFile(
  clientId,
  clientSecret,
  fileId,
  role = 'reader',
  type = 'anyone',
  emailAddress = null
) {
  const drive = await getDriveApi(clientId, clientSecret)
  const permission = {
    role,
    type
  }
  if (emailAddress && (type === 'user' || type === 'group')) {
    permission.emailAddress = emailAddress
  }

  const permRes = await drive.permissions.create({
    fileId,
    requestBody: permission,
    fields: 'id, type, role, emailAddress'
  })

  const fileRes = await drive.files.get({
    fileId,
    fields: 'id, name, webViewLink'
  })

  return {
    permission: permRes.data,
    name: fileRes.data.name,
    webViewLink: fileRes.data.webViewLink
  }
}
