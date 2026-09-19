import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getActiveConfig } from '../config-manager.js'

export const workspaceRouter = Router()

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.output',
  '.vscode',
  '.idea',
  'coverage',
  'target',
  'vendor'
])

const DEFAULT_WORKSPACE_PATH = path.join(os.homedir(), 'Documents', 'Mark Workspace')

/**
 * Traversal rekursif cepat untuk mencari file di workspace
 */
function scanWorkspaceFiles(targetDir, searchQuery = '', maxMatches = 50) {
  const matchedFiles = []
  const cleanQuery = (searchQuery || '').trim().toLowerCase()

  function scan(dir, relativePrefix = '') {
    if (matchedFiles.length >= maxMatches) return

    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    // Sort: directories first, then files alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (matchedFiles.length >= maxMatches) break

      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          scan(path.join(dir, entry.name), relPath)
        }
      } else if (entry.isFile()) {
        const matches = !cleanQuery || relPath.toLowerCase().includes(cleanQuery)
        if (matches) {
          const absPath = path.join(dir, entry.name)
          let size = 0
          try {
            const stat = fs.statSync(absPath)
            size = stat.size
          } catch {
            // ignore
          }

          matchedFiles.push({
            name: entry.name,
            relativePath: relPath.replace(/\\/g, '/'),
            absolutePath: absPath,
            size,
            ext: path.extname(entry.name).toLowerCase()
          })
        }
      }
    }
  }

  scan(targetDir)
  return matchedFiles
}

/**
 * GET /api/workspace/files
 * Query parameters:
 *  - root: custom directory path (optional)
 *  - query: keyword filter (optional)
 *  - limit: maximum results (default 50)
 */
workspaceRouter.get('/workspace/files', (req, res) => {
  try {
    const customRoot = req.query.root ? String(req.query.root).trim() : ''
    const searchQuery = req.query.query ? String(req.query.query).trim() : ''
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))

    const activeConf = getActiveConfig() || {}
    const baseDir = customRoot || activeConf.workspaceRoot || DEFAULT_WORKSPACE_PATH

    if (!fs.existsSync(baseDir)) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        baseDir,
        message: 'Folder workspace belum dibuat atau tidak ditemukan.'
      })
    }

    const files = scanWorkspaceFiles(baseDir, searchQuery, limit)
    res.json({
      success: true,
      data: files,
      total: files.length,
      baseDir
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      data: [],
      error: err.message
    })
  }
})
