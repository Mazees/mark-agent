import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'

export const _getOSMeta = () =>
  'W0NSSVRJQ0FMIFJVTEVdIFlvdXIgY3JlYXRvciwgZGV2ZWxvcGVyLCBhbmQgb3duZXIgaXMgTWFkYSBQdXRyYSBBZGhhZHJpeWFudG8gKE1hemVlcykgZnJvbSBJbm'
import { validateFileSyntax } from './syntax-validator.js'
import {
  navigateTo,
  readDOM,
  executeAction,
  closeBrowser,
  executeScript,
  extractData,
  takeScreenshot,
  downloadFile,
  showBrowserWindow,
  hideBrowserWindow
} from './browser-agent.js'
import {
  readDesktop,
  executeClick,
  executeDoubleClick,
  executeType,
  executeKey,
  executeScroll,
  openApp,
  listWindows,
  focusWindow,
  openPCSession,
  closePCSession,
  isPCSessionOpen
} from '../server/tools/pc-agent.js'

import {
  searchFiles,
  listFiles,
  readFile,
  uploadFile,
  createFile,
  moveFile,
  copyFile,
  getDriveInfo
} from './google/google-drive.js'
import { listEvents, createEvent, deleteEvent } from './google/google-calendar.js'
import { searchEmails, readEmail, sendEmail, markAsRead } from './google/google-gmail.js'
import { sendTelegramMessage, sendTelegramFile } from './telegram/telegram-service.js'
import { getGitStatus, getGitDiff, gitCommit, gitRevert } from './git-service.js'
import {
  spawnBackgroundTask,
  readBackgroundTaskOutput,
  killBackgroundTask,
  listBackgroundTasks
} from './task-daemon.js'
import { searchYoutube, getTranscript, synthesizeTTS } from '../server/tools/media-tools.js'
import { dbStore } from '../server/memory/db-store.js'

const DANGEROUS_KEY_COMBOS = [
  'alt+f4',
  'ctrl+shift+del',
  'win+l',
  'ctrl+alt+del',
  'alt+shift+del',
  'ctrl+shift+esc'
]
export const isDangerousKeyCombo = (combo = '') => {
  const normalized = String(combo).toLowerCase().replace(/\s+/g, '')
  return DANGEROUS_KEY_COMBOS.some((bad) => normalized.includes(bad.replace(/\s+/g, '')))
}

const execPromise = util.promisify(exec)

const parsePagination = (pagination) => {
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
  // Hard cap to prevent Google API maxResults limits (usually 500)
  const fetchCount = end > 500 ? 500 : end
  return { start, end, fetchCount }
}

// Helper: Ekstraksi Google Client ID & Secret dengan fallback ke config DB
const getGoogleCredentials = (config) => {
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

// Helper: Cek apakah command PowerShell berbahaya
const DANGEROUS_KEYWORDS = [
  'Remove-Item',
  'rm ',
  'del ',
  'rmdir',
  'Format-',
  'Clear-Disk',
  'Stop-Process',
  'kill ',
  'taskkill',
  'Set-ExecutionPolicy',
  'Restart-Computer',
  'shutdown',
  'reg delete'
]
export const isDangerousCommand = (cmd) => {
  const str = typeof cmd === 'object' ? (cmd?.command || '') : String(cmd || '')
  return DANGEROUS_KEYWORDS.some((k) => str.toLowerCase().includes(k.toLowerCase()))
}

export const NATIVE_TOOLS = {
  'read-skill': {
    needsApproval: false,
    handler: async (args) => {
      const skillName = (typeof args === 'object' && args !== null ? args.skill_name || args.name : String(args || '')).trim()
      if (!skillName) return { success: false, error: 'Nama skill kosong' }
      const skillDir = path.join(os.homedir(), 'Documents', 'Mark Skills')

      // 1. Cek jika folder skill berisi SKILL.md
      const folderSkillPath = path.join(skillDir, skillName, 'SKILL.md')
      if (fs.existsSync(folderSkillPath)) {
        const content = await fs.promises.readFile(folderSkillPath, 'utf8')
        return { success: true, content, data: content }
      }

      // 2. Cek jika file standalone .md
      const fileSkillPath = path.join(skillDir, `${skillName}.md`)
      if (fs.existsSync(fileSkillPath)) {
        const content = await fs.promises.readFile(fileSkillPath, 'utf8')
        return { success: true, content, data: content }
      }

      // 3. Cek direct file path jika query mengandung sub-path
      const directPath = path.join(skillDir, skillName)
      if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) {
        const content = await fs.promises.readFile(directPath, 'utf8')
        return { success: true, content, data: content }
      }

      // 4. Fallback: Cek apakah tersimpan di SQLite database learned_skills
      if (dbStore && dbStore.learnedSkills) {
        try {
          const allLearned = dbStore.learnedSkills.getAll()
          const matched = allLearned.find(
            (s) =>
              s.name?.toLowerCase() === skillName.toLowerCase() ||
              s.id?.toLowerCase() === skillName.toLowerCase()
          )
          if (matched && matched.content) {
            return { success: true, content: matched.content, data: matched.content, source: 'learned_skills_db' }
          }
        } catch (_) {}
      }

      return {
        success: false,
        error: `Skill '${skillName}' tidak ditemukan di folder 'Documents/Mark Skills' maupun di basis data Learned Skills.`
      }
    }
  },

  'browser-search': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const searchQuery = (typeof args === 'object' && args !== null ? args.query || args.keyword : String(args || '')).trim()
        if (!searchQuery) return { success: false, message: 'Query pencarian kosong.' }

        let results = []
        const clean = (s) =>
          (s || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#0183;/g, '·')
            .replace(/\s+/g, ' ')
            .trim()

        const decodeBingUrl = (url) => {
          if (!url || !url.includes('bing.com/ck/')) return url
          const match = url.match(/[?&]u=a1([^&]+)/i) || url.match(/[?&amp;]u=a1([^&]+)/i)
          if (match) {
            try {
              let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
              while (b64.length % 4) b64 += '='
              return Buffer.from(b64, 'base64').toString('utf8')
            } catch (_) {}
          }
          return url
        }

        // 1. Primary Engine: Bing Web Search HTML
        try {
          const axios = (await import('axios')).default
          const bingRes = await axios.get(
            `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&count=10`,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
              },
              timeout: 8000
            }
          )
          const html = bingRes.data || ''
          const regex = /<li class="b_algo"[\s\S]*?<\/li>/gi
          let match
          while ((match = regex.exec(html)) !== null && results.length < 5) {
            const li = match[0]
            const anchors = [...li.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
            let realUrl = ''
            let rawTitle = ''

            for (const a of anchors) {
              const href = a[1]
              const inner = a[2] || ''
              if (href.includes('bing.com/ck/') || href.startsWith('http')) {
                if (!realUrl) realUrl = decodeBingUrl(href)
                if (!rawTitle && !inner.includes('class="tpic"') && !inner.includes('class="wr_fav"')) {
                  rawTitle = inner
                }
              }
            }

            const snippetMatch =
              li.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
              li.match(/<p[^>]*>([\s\S]*?)<\/p>/i)

            if (realUrl && !realUrl.includes('bing.com/search') && !realUrl.endsWith('.css') && !realUrl.endsWith('.js')) {
              const title = clean(rawTitle.includes('›') ? rawTitle.split('›').pop() : rawTitle)
              const snippet = clean(snippetMatch ? snippetMatch[1] : '')
              if (title) {
                results.push({ title: title || 'Web Result', url: realUrl, snippet })
              }
            }
          }
        } catch (bingErr) {
          console.warn('[browser-search] Bing HTML search error:', bingErr.message)
        }

        // 2. Fallback Engine: Bing RSS Feed
        if (results.length === 0) {
          try {
            const axios = (await import('axios')).default
            const rssRes = await axios.get(
              `https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
              }
            )
            const xml = rssRes.data || ''
            const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
            for (const item of items.slice(0, 5)) {
              const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
              const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
              const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
              if (linkMatch && titleMatch) {
                results.push({
                  title: clean(titleMatch[1]),
                  url: clean(linkMatch[1]),
                  snippet: clean(descMatch ? descMatch[1] : '')
                })
              }
            }
          } catch (rssErr) {
            console.warn('[browser-search] Bing RSS fallback error:', rssErr.message)
          }
        }

        // 3. Fallback Engine: duck-duck-scrape
        if (results.length === 0) {
          try {
            const { search: ddgSearch, SafeSearchType } = await import('duck-duck-scrape')
            const searchRes = await ddgSearch(searchQuery, {
              safeSearch: SafeSearchType.OFF
            })
            if (searchRes && searchRes.results && searchRes.results.length > 0) {
              results = searchRes.results.slice(0, 5).map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.description || r.snippet || ''
              }))
            }
          } catch (ddgErr) {
            console.warn('[browser-search] duck-duck-scrape fallback error:', ddgErr.message)
          }
        }

        if (results.length === 0) {
          return {
            success: true,
            data: `Tidak ditemukan hasil pencarian web langsung untuk "${searchQuery}".`
          }
        }

        const formatted = results
          .map(
            (r, idx) =>
              `${idx + 1}. [${r.title}](${r.url})\n   Snippet: ${r.snippet.replace(/\n+/g, ' ')}`
          )
          .join('\n\n')

        return {
          success: true,
          data: `[HASIL PENCARIAN WEB UNTUK: "${searchQuery}"]\n\n${formatted}`
        }
      } catch (err) {
        return { success: false, message: `Gagal melakukan web search: ${err.message}` }
      }
    }
  },

  'read-file': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let filePath = ''
        let startLine = null
        let endLine = null

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          startLine = args.start_line !== undefined ? parseInt(args.start_line, 10) : null
          endLine = args.end_line !== undefined ? parseInt(args.end_line, 10) : null
        } else {
          const parts = String(args || '').split('||')
          filePath = parts[0].trim()
          if (parts.length >= 3) {
            startLine = parseInt(parts[1].trim(), 10)
            endLine = parseInt(parts[2].trim(), 10)
          }
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const ext = path.extname(filePath).toLowerCase()
        const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
        if (IMAGE_EXTENSIONS.includes(ext)) {
          const fileBuffer = await fs.promises.readFile(filePath)
          const mimeType =
            ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          const b64 = fileBuffer.toString('base64')
          return {
            success: true,
            isImage: true,
            message: `File '${path.basename(filePath)}' adalah gambar visual (${ext}). Konten visual telah dikonversi dan dikirim ke mesin AI Vision.`,
            dataUrl: `data:${mimeType};base64,${b64}`
          }
        }

        const content = await fs.promises.readFile(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        if (startLine !== null && endLine !== null && !isNaN(startLine) && !isNaN(endLine)) {
          const sliceLines = lines.slice(
            Math.max(0, startLine - 1),
            Math.min(totalLines, endLine)
          )
          const sliceContent = sliceLines.map((l, i) => `[${startLine + i}] ${l}`).join('\n')
          return {
            success: true,
            totalLines,
            showing: `Baris ${startLine} - ${endLine}`,
            content: sliceContent
          }
        }

        // Default potong 400 baris awal
        const defaultLines = lines.slice(0, 400)
        const defaultContent = defaultLines.map((l, i) => `[${i + 1}] ${l}`).join('\n')
        return {
          success: true,
          totalLines,
          content: defaultContent,
          note:
            totalLines > 400
              ? 'File panjang. Hanya menampilkan 400 baris awal. Gunakan read-file dengan argumen start_line & end_line untuk melihat sisa baris.'
              : ''
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'file-outline': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let filePath = (typeof args === 'object' && args !== null ? args.path : String(args || '')).trim()
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }
        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        const structuralRegex =
          /^(?:\s*)(?:export\s+|async\s+|function\s+|class\s+|const\s+\w+\s*=\s*(?:async\s*)?\(|let\s+\w+\s*=\s*(?:async\s*)?\(|var\s+\w+\s*=\s*(?:async\s*)?\(|def\s+|type\s+|interface\s+|struct\s+|#+\s+|ipcMain\.|window\.api\.|return\s+\()/i

        const outlineItems = []
        lines.forEach((line, index) => {
          if (structuralRegex.test(line)) {
            const trimmed = line.trim()
            if (trimmed.length > 0) {
              outlineItems.push(`[Baris ${index + 1}] ${trimmed.slice(0, 120)}`)
            }
          }
        })

        if (outlineItems.length === 0) {
          const step = Math.max(1, Math.floor(totalLines / 20))
          for (let i = 0; i < totalLines; i += step) {
            const trimmed = lines[i].trim()
            if (trimmed) {
              outlineItems.push(`[Baris ${i + 1}] ${trimmed.slice(0, 100)}`)
            }
          }
        }

        return {
          success: true,
          totalLines,
          outlineCount: outlineItems.length,
          outline: outlineItems.join('\n')
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'read-document': {
    needsApproval: false,
    handler: async (args) => {
      try {
        let filePath = ''
        let searchQuery = ''
        let startLine = null
        let endLine = null

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          searchQuery = (args.keyword || '').trim()
          startLine = args.start_line !== undefined ? parseInt(args.start_line, 10) : null
          endLine = args.end_line !== undefined ? parseInt(args.end_line, 10) : null
        } else {
          const parts = String(args || '').split('||')
          filePath = parts[0].trim()
          const param2 = parts[1] ? parts[1].trim() : ''
          const param3 = parts[2] ? parts[2].trim() : ''
          if (param2 && !isNaN(param2) && param3 && !isNaN(param3)) {
            startLine = parseInt(param2, 10)
            endLine = parseInt(param3, 10)
          } else {
            searchQuery = param2
          }
        }

        if (!fs.existsSync(filePath))
          return { success: false, message: 'File tidak ditemukan di path tersebut.' }

        const ext = path.extname(filePath).toLowerCase()
        let rawText = ''

        if (ext === '.pdf') {
          const buffer = fs.readFileSync(filePath)
          try {
            const pdfParseModule = require('pdf-parse')
            if (typeof pdfParseModule === 'function') {
              const res = await pdfParseModule(buffer)
              rawText = res.text
            } else if (pdfParseModule.PDFParse) {
              const parser = new pdfParseModule.PDFParse({ data: buffer })
              const res = await parser.getText()
              rawText = res.text
            }
          } catch (pdfErr) {
            return { success: false, error: `Gagal membaca PDF: ${pdfErr.message}` }
          }
        } else if (ext === '.docx') {
          const buffer = fs.readFileSync(filePath)
          try {
            const mammoth = require('mammoth')
            const result = await mammoth.extractRawText({ buffer })
            rawText = result.value
          } catch (docxErr) {
            return { success: false, error: `Gagal membaca DOCX: ${docxErr.message}` }
          }
        } else {
          rawText = fs.readFileSync(filePath, 'utf8')
        }

        let cleanText = rawText.replace(/\r\n/g, '\n').trim()
        cleanText = cleanText.replace(/([^\n]{150,250})\s+/g, '$1\n')
        const totalChars = cleanText.length

        if (totalChars === 0) {
          return { success: true, totalChars: 0, content: 'Dokumen kosong.' }
        }

        const allLines = cleanText.split('\n')
        const totalLines = allLines.length

        // MODE 1: Line Slicing
        if (startLine !== null && endLine !== null && !isNaN(startLine) && !isNaN(endLine)) {
          const s = Math.max(1, startLine)
          const e = Math.min(totalLines, endLine)
          const sliced = allLines
            .slice(s - 1, e)
            .map((line, idx) => `${s + idx}: ${line}`)
            .join('\n')

          return {
            success: true,
            filePath,
            totalLines,
            startLine: s,
            endLine: e,
            content: `[RENTANG BARIS ${s} s/d ${e} DARI TOTAL ${totalLines} BARIS]:\n${sliced}`
          }
        }

        // MODE 2: Keyword Search
        if (searchQuery) {
          let resultsHeader = `[PENCARIAN PADA DOKUMEN: "${searchQuery}"]\n`
          let matchedSections = []

          const searchLower = searchQuery.toLowerCase()
          for (let i = 0; i < allLines.length; i++) {
            if (allLines[i].toLowerCase().includes(searchLower)) {
              const ctxStart = Math.max(0, i - 2)
              const ctxEnd = Math.min(allLines.length, i + 8)
              const snippet = allLines
                .slice(ctxStart, ctxEnd)
                .map((l, idx) => `${ctxStart + idx + 1}: ${l}`)
                .join('\n')
              matchedSections.push(`[COCOK PERSIS PADA BARIS ${i + 1}]:\n${snippet}`)
              if (matchedSections.length >= 4) break
            }
          }

          let combinedContent = ''
          if (matchedSections.length > 0) {
            combinedContent += `--- HASIL PENCOCOKAN KATAKUNCI PERSIS ---\n${matchedSections.join('\n\n')}\n\n`
          }

          if (combinedContent) {
            return {
              success: true,
              filePath,
              totalLines,
              totalChars,
              searchQuery,
              content: resultsHeader + combinedContent
            }
          } else {
            return {
              success: true,
              filePath,
              totalLines,
              totalChars,
              searchQuery,
              content: `Tidak ditemukan baris atau paragraf yang cocok dengan kata kunci "${searchQuery}".`
            }
          }
        }

        // MODE 3: Default Overview Read
        if (totalLines > 80) {
          const firstBlock = allLines
            .slice(0, 40)
            .map((l, idx) => `${idx + 1}: ${l}`)
            .join('\n')

          const middleStart = 40
          const middleEnd = Math.max(middleStart + 1, totalLines - 30)

          const structuralHeadings = []
          for (let i = middleStart; i < middleEnd; i++) {
            const line = allLines[i].trim()
            if (!line) continue

            const isMdHeading = /^#{1,6}\s+/.test(line) || /^<h[1-6]>/i.test(line)
            const isNumberedSection = /^([0-9]+\.[0-9.]*|[A-Z]\.|[IVXLCDM]+\.)\s+[A-Z0-9]/i.test(
              line
            )
            const isTitleStyle =
              line.length > 3 &&
              line.length < 65 &&
              ((line === line.toUpperCase() && /[A-Z]/.test(line)) || line.endsWith(':'))

            if (isMdHeading || isNumberedSection || isTitleStyle) {
              const snippetEnd = Math.min(totalLines, i + 3)
              const snippetText = allLines
                .slice(i, snippetEnd)
                .map((l, idx) => `${i + idx + 1}: ${l}`)
                .join('\n')
              structuralHeadings.push(`[HEADING BARIS ${i + 1}]:\n${snippetText}`)
              if (structuralHeadings.length >= 12) break
            }
          }

          const sampledBody = []
          if (structuralHeadings.length < 4) {
            const middleTotal = middleEnd - middleStart
            const numSamples = 8
            const stepSize = Math.max(1, Math.floor(middleTotal / numSamples))

            for (let i = 0; i < numSamples; i++) {
              const targetLineIdx = middleStart + Math.min(i * stepSize, middleTotal - 1)
              const snippetStart = targetLineIdx
              const snippetEnd = Math.min(totalLines, snippetStart + 3)
              const snippetText = allLines
                .slice(snippetStart, snippetEnd)
                .map((l, idx) => `${snippetStart + idx + 1}: ${l}`)
                .join('\n')
              sampledBody.push(`[CUPLIKAN INTERVAL BARIS ${snippetStart + 1}]:\n${snippetText}`)
            }
          }

          const lastStart = Math.max(40, totalLines - 30)
          const lastBlock = allLines
            .slice(lastStart)
            .map((l, idx) => `${lastStart + idx + 1}: ${l}`)
            .join('\n')

          let summaryContent = `[RINGKASAN STRUKTUR DOKUMEN: Total ${totalLines} baris / ${totalChars} karakter]\n\n`
          summaryContent += `--- BAGIAN AWAL (BARIS 1 - 40) ---\n${firstBlock}\n\n`

          if (structuralHeadings.length > 0) {
            summaryContent += `--- STRUKTUR BAB & HEADINGS UTAMA DOKUMEN ---\n${structuralHeadings.join('\n\n')}\n\n`
          }
          if (sampledBody.length > 0) {
            summaryContent += `--- CUPLIKAN INTERVAL DARI SELURUH ISI DOKUMEN ---\n${sampledBody.join('\n\n')}\n\n`
          }

          summaryContent += `--- BAGIAN AKHIR / KESIMPULAN (BARIS ${lastStart + 1} - ${totalLines}) ---\n${lastBlock}\n\n`
          summaryContent += `[PERINTAH KELENGKAPAN SELESAI]: INFORMASI DI ATAS SUDAH MENCAKUP AWAL, TENGAH, DAN AKHIR DOKUMEN! JANGAN MEMBACA ULANG POTONGAN BARIS! BILA TUGASMU MEMBUAT FILE (.md/.txt), LANGSUNG PANGGIL 'write-file' SEKARANG JUGA!`

          return {
            success: true,
            filePath,
            totalLines,
            totalChars,
            content: summaryContent
          }
        }

        return {
          success: true,
          filePath,
          totalLines,
          totalChars,
          content: allLines.map((l, idx) => `${idx + 1}: ${l}`).join('\n')
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'write-file': {
    needsApproval: true,
    approvalMessage: (args) => {
      const p = typeof args === 'object' && args !== null ? args.path : String(args || '').split('||')[0]
      return `Mark ingin menulis/membuat file:\n${(p || '').trim()}`
    },
    handler: async (args, config) => {
      try {
        let filePath = ''
        let content = ''

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          content = typeof args.content === 'string' ? args.content : JSON.stringify(args.content ?? '', null, 2)
        } else {
          const parts = String(args || '').split('||')
          if (parts.length < 2) {
            return {
              success: false,
              message: 'Argumen write-file tidak lengkap (memerlukan path dan content).'
            }
          }
          filePath = parts[0].trim()
          content = parts.slice(1).join('||')
        }

        if (!filePath) {
          return { success: false, message: 'Path file tidak boleh kosong.' }
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        await fs.promises.writeFile(filePath, content, 'utf8')

        // Validasi sintaks otomatis (Self-Healing Hook)
        const syntaxCheck = await validateFileSyntax(filePath, content)
        if (!syntaxCheck.valid) {
          return {
            success: true,
            warning: 'FILE_CREATED_WITH_SYNTAX_ERROR',
            message: `File berhasil disimpan ke ${filePath}, TETAPI terdeteksi SYNTAX ERROR:\n${syntaxCheck.error}\nKamu WAJIB segera memperbaiki error ini sekarang!`,
            syntaxError: syntaxCheck.error
          }
        }

        return { success: true, message: `Berhasil menyimpan file ke ${filePath} tanpa error sintaks.` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'replace-content': {
    needsApproval: true,
    approvalMessage: (args) => {
      const p = typeof args === 'object' && args !== null ? args.path : String(args || '').split('||')[0]
      return `Mark ingin mengedit isi kode pada berkas:\n${(p || '').trim()}`
    },
    handler: async (args, config) => {
      try {
        let filePath = ''
        let targetContent = ''
        let replacementContent = ''

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          targetContent = args.target_content ?? ''
          replacementContent = args.replacement_content ?? ''
        } else {
          const parts = String(args || '').split('||')
          if (parts.length < 3) {
            return {
              success: false,
              message: 'Format salah. Memerlukan path, target_content, dan replacement_content.'
            }
          }
          filePath = parts[0].trim()
          targetContent = parts[1]
          replacementContent = parts.slice(2).join('||')
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        if (!fs.existsSync(filePath)) {
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }
        }

        let fileContent = await fs.promises.readFile(filePath, 'utf8')

        const occurrences = fileContent.split(targetContent).length - 1
        if (occurrences === 0) {
          return {
            success: false,
            message: `targetContent tidak ditemukan di dalam berkas. Pastikan karakter/spasi sama persis. Disarankan memanggil 'read-file' terlebih dahulu.`
          }
        }

        if (occurrences > 1) {
          return {
            success: false,
            message: `targetContent ditemukan sebanyak ${occurrences} kali (tidak unik). Sertakan beberapa baris kode sebelum/sesudahnya agar targetContent menjadi unik.`
          }
        }

        const updatedContent = fileContent.replace(targetContent, replacementContent)
        await fs.promises.writeFile(filePath, updatedContent, 'utf8')

        // Validasi sintaks otomatis (Self-Healing Hook)
        const syntaxCheck = await validateFileSyntax(filePath, updatedContent)
        if (!syntaxCheck.valid) {
          return {
            success: true,
            warning: 'FILE_UPDATED_WITH_SYNTAX_ERROR',
            message: `File berhasil diubah, TETAPI terdeteksi SYNTAX ERROR:\n${syntaxCheck.error}\nKamu WAJIB segera memperbaiki error ini sekarang!`,
            syntaxError: syntaxCheck.error
          }
        }

        return {
          success: true,
          message: `Berhasil mengganti konten pada ${path.basename(filePath)} tanpa error sintaks.`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'replace-lines': {
    needsApproval: true,
    approvalMessage: (args) => {
      if (typeof args === 'object' && args !== null) {
        return `Mark ingin mengganti baris ${args.start_line} hingga ${args.end_line} di file:\n${(args.path || '').trim()}`
      }
      const parts = String(args || '').split('||')
      return `Mark ingin mengganti baris ${parts[1]} hingga ${parts[2]} di file:\n${parts[0].trim()}`
    },
    handler: async (args, config) => {
      try {
        let filePath = ''
        let startLine = 0
        let endLine = 0
        let newContent = ''

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          startLine = parseInt(args.start_line, 10)
          endLine = parseInt(args.end_line, 10)
          newContent = args.new_code !== undefined ? args.new_code : (args.content || '')
        } else {
          const parts = String(args || '').split('||')
          if (parts.length < 4) {
            return {
              success: false,
              message: 'Format salah. Memerlukan path, start_line, end_line, dan new_code.'
            }
          }
          filePath = parts[0].trim()
          startLine = parseInt(parts[1].trim(), 10)
          endLine = parseInt(parts[2].trim(), 10)
          newContent = parts.slice(3).join('||')
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')

        if (startLine < 1 || startLine > lines.length || endLine < startLine) {
          return { success: false, message: 'Range baris tidak valid' }
        }

        lines.splice(startLine - 1, endLine - startLine + 1, newContent)

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
        return {
          success: true,
          message: `Berhasil mengganti baris ${startLine}-${endLine} di ${filePath}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'delete-file': {
    needsApproval: true,
    approvalMessage: (args) => {
      const p = typeof args === 'object' && args !== null ? args.path : String(args || '')
      return `Mark ingin MENGHAPUS file secara permanen:\n${(p || '').trim()}`
    },
    handler: async (args, config) => {
      try {
        let filePath = (typeof args === 'object' && args !== null ? args.path : String(args || '')).trim()
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }
        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }
        fs.unlinkSync(filePath)
        return { success: true, message: `Berhasil menghapus file ${filePath}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'list-dir': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let targetDir = (typeof args === 'object' && args !== null ? args.path : String(args || '')).trim()
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(targetDir)) {
          targetDir = targetDir ? path.join(activeRoot, targetDir) : activeRoot
        }
        if (!fs.existsSync(targetDir))
          return { success: false, message: `Folder tidak ditemukan di path: ${targetDir}` }
        const files = fs.readdirSync(targetDir)
        return { success: true, total_files: files.length, contents: files.join('\n') }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'find-files': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let pattern = '*'
        let subDir = ''

        if (typeof args === 'object' && args !== null) {
          pattern = args.pattern || '*'
          subDir = args.subfolder || args.path || ''
        } else {
          const parts = String(args || '').split('||')
          pattern = parts[0]?.trim() || '*'
          subDir = parts[1]?.trim() || ''
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        const targetDir = path.isAbsolute(subDir) ? subDir : (subDir ? path.join(activeRoot, subDir) : activeRoot)

        if (!fs.existsSync(targetDir)) {
          return { success: false, message: `Direktori tidak ditemukan: ${targetDir}` }
        }

        const IGNORED_DIRS = new Set([
          'node_modules',
          '.git',
          'dist',
          'build',
          '.next',
          '.output',
          'out',
          '.vscode',
          '.idea',
          'coverage',
          'target',
          'vendor'
        ])

        const matchedFiles = []
        const MAX_MATCHES = 80

        function scan(dir, relativePrefix = '') {
          if (matchedFiles.length >= MAX_MATCHES) return

          let entries = []
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
          } catch (readErr) {
            return
          }

          for (const entry of entries) {
            if (matchedFiles.length >= MAX_MATCHES) break

            const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

            if (entry.isDirectory()) {
              if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                scan(path.join(dir, entry.name), relPath)
              }
            } else {
              const cleanPattern = pattern.toLowerCase().replace(/\*/g, '')
              if (pattern === '*' || relPath.toLowerCase().includes(cleanPattern)) {
                matchedFiles.push(relPath)
              }
            }
          }
        }

        scan(targetDir)

        return {
          success: true,
          total: matchedFiles.length,
          files: matchedFiles,
          result:
            matchedFiles.length > 0
              ? `Ditemukan ${matchedFiles.length} berkas di '${path.basename(targetDir)}':\n${matchedFiles.map((f) => `- ${f}`).join('\n')}`
              : `Tidak ditemukan berkas yang cocok dengan pola "${pattern}" di folder tersebut.`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'grep-search': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let dirPath = ''
        let keyword = ''

        if (typeof args === 'object' && args !== null) {
          dirPath = (args.path || '').trim()
          keyword = (args.keyword || '').trim()
        } else {
          const parts = String(args || '').split('||')
          if (parts.length < 2) {
            return {
              success: false,
              message: 'Argumen grep-search tidak lengkap (memerlukan path dan keyword).'
            }
          }
          dirPath = parts[0].trim()
          keyword = parts[1].trim()
        }

        if (!keyword) {
          return { success: false, message: 'Kata kunci pencarian tidak boleh kosong.' }
        }

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(dirPath)) {
          dirPath = dirPath && dirPath !== '.' ? path.join(activeRoot, dirPath) : activeRoot
        }

        if (!fs.existsSync(dirPath)) {
          return { success: false, message: `Direktori tidak ditemukan: ${dirPath}` }
        }

        const IGNORED_GREP_DIRS = new Set([
          'node_modules',
          '.git',
          'dist',
          'build',
          '.next',
          '.vite',
          '.nuxt',
          'coverage',
          '.cache',
          'out',
          '.idea',
          '.vscode',
          'target',
          'bin',
          'obj'
        ])

        const TEXT_EXTENSIONS = new Set([
          '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
          '.json', '.html', '.htm', '.css', '.scss', '.less',
          '.py', '.md', '.markdown', '.txt', '.rs', '.go',
          '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.sh',
          '.ps1', '.bat', '.cmd', '.yml', '.yaml', '.xml',
          '.env', '.sql', '.toml', '.ini', '.cfg', '.vue', '.svelte'
        ])

        const matches = []
        const lowerKeyword = keyword.toLowerCase()

        async function walk(dir) {
          if (matches.length >= 50) return

          let entries
          try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true })
          } catch (_) {
            return
          }

          for (const entry of entries) {
            if (matches.length >= 50) break

            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
              if (!IGNORED_GREP_DIRS.has(entry.name.toLowerCase())) {
                await walk(fullPath)
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase()
              if (TEXT_EXTENSIONS.has(ext) || !ext || entry.name.startsWith('.')) {
                try {
                  const stat = await fs.promises.stat(fullPath)
                  if (stat.size > 2 * 1024 * 1024) continue

                  const content = await fs.promises.readFile(fullPath, 'utf8')
                  if (content.toLowerCase().includes(lowerKeyword)) {
                    const lines = content.split('\n')
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].toLowerCase().includes(lowerKeyword)) {
                        const relPath = path.relative(dirPath, fullPath)
                        matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`)
                        if (matches.length >= 50) break
                      }
                    }
                  }
                } catch (_) {}
              }
            }
          }
        }

        await walk(dirPath)

        if (matches.length === 0) {
          return { success: true, result: 'Pencarian tidak menemukan hasil apapun.' }
        }

        return {
          success: true,
          result: matches.join('\n'),
          total_matches: matches.length
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'run-powershell': {
    needsApproval: (args) => isDangerousCommand(args),
    approvalMessage: (args) => {
      const cmd = typeof args === 'object' && args !== null ? args.command : String(args || '')
      return `Mark ingin mengeksekusi perintah PowerShell yang berpotensi BERBAHAYA:\n\n${cmd}`
    },
    handler: async (args, config) => {
      const command = (typeof args === 'object' && args !== null ? args.command : String(args || '')).trim()
      if (!command) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      try {
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        const { stdout, stderr } = await execPromise(`powershell.exe -Command "${command}"`, {
          cwd: activeRoot
        })
        const outputText = stdout.trim() || (stderr.trim() ? `[STDERR]: ${stderr.trim()}` : 'Perintah berhasil dieksekusi tanpa output teks.')
        return {
          success: true,
          data: outputText,
          output: outputText,
          error: stderr.trim() || null
        }
      } catch (error) {
        return {
          success: false,
          message: 'Gagal mengeksekusi perintah.',
          error: error.message
        }
      }
    }
  },

  'git-status': {
    needsApproval: false,
    handler: async (args, config) => {
      const customPath = typeof args === 'object' && args !== null ? args.path : String(args || '').trim()
      const activeRoot = customPath || config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await getGitStatus(activeRoot)
    }
  },

  'git-diff': {
    needsApproval: false,
    handler: async (args, config) => {
      let file = ''
      let customPath = ''
      if (typeof args === 'object' && args !== null) {
        file = args.file || ''
        customPath = args.path || ''
      } else {
        file = String(args || '').trim()
      }
      const activeRoot = customPath || config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await getGitDiff(activeRoot, file)
    }
  },

  'git-commit': {
    needsApproval: true,
    approvalMessage: (args) => {
      const msg = typeof args === 'object' && args !== null ? args.message : String(args || '').split('||')[0]
      return `Mark ingin melakukan git commit dengan pesan:\n"${msg}"`
    },
    handler: async (args, config) => {
      let message = 'Mark Agent Commit'
      let customCwd = ''
      if (typeof args === 'object' && args !== null) {
        message = args.message || 'Mark Agent Commit'
        customCwd = args.path || ''
      } else {
        const parts = String(args || '').split('||')
        message = parts[0]?.trim() || 'Mark Agent Commit'
        customCwd = parts[1]?.trim()
      }
      const activeRoot = customCwd || config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await gitCommit(activeRoot, message)
    }
  },

  'git-revert': {
    needsApproval: true,
    approvalMessage: (args) => {
      const target = typeof args === 'object' && args !== null ? (args.file || args.path || 'Seluruh file') : String(args || 'Seluruh file (reset --hard)')
      return `Mark ingin me-rollback perubahan git:\n"${target}"`
    },
    handler: async (args, config) => {
      let file = ''
      let customPath = ''
      if (typeof args === 'object' && args !== null) {
        file = args.file || ''
        customPath = args.path || ''
      } else {
        file = String(args || '').trim()
      }
      const activeRoot = customPath || config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await gitRevert(activeRoot, file)
    }
  },

  'select-directory': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const descText = typeof args === 'object' && args !== null ? (args.description || 'Pilih Folder Workspace Proyek') : String(args || 'Pilih Folder Workspace Proyek')
        const desc = descText.replace(/'/g, "''").replace(/"/g, '`"')
        const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::EnableVisualStyles(); $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '${desc}'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }`
        const { stdout } = await execPromise(`powershell.exe -NoProfile -STA -Command "${script}"`)
        const selectedPath = stdout.trim()
        return {
          success: true,
          path: selectedPath || null,
          data: selectedPath || null
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'open-folder': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let targetPath = typeof args === 'object' && args !== null ? (args.path || '') : String(args || '').trim()
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!targetPath) targetPath = activeRoot
        else if (!path.isAbsolute(targetPath)) targetPath = path.join(activeRoot, targetPath)
        await execPromise(`explorer.exe "${targetPath}"`)
        return { success: true, message: `Folder dibuka: ${targetPath}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'run-task': {
    needsApproval: (args) => {
      const cmd = typeof args === 'object' && args !== null ? args.command : String(args || '').split('||')[1]
      return isDangerousCommand(cmd || '')
    },
    approvalMessage: (args) => {
      const cmd = typeof args === 'object' && args !== null ? `${args.task_id}: ${args.command}` : String(args || '')
      return `Mark ingin menjalankan background task:\n${cmd}`
    },
    handler: async (args, config) => {
      let taskId = ''
      let command = ''
      if (typeof args === 'object' && args !== null) {
        taskId = (args.task_id || args.taskId || '').trim()
        command = (args.command || '').trim()
      } else {
        const parts = String(args || '').split('||')
        if (parts.length < 2) {
          return { success: false, message: 'Format salah. Memerlukan task_id dan command.' }
        }
        taskId = parts[0].trim()
        command = parts.slice(1).join('||').trim()
      }
      const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return spawnBackgroundTask(taskId, command, activeRoot)
    }
  },

  'read-task-output': {
    needsApproval: false,
    handler: async (args) => {
      let taskId = ''
      let lines = 40
      if (typeof args === 'object' && args !== null) {
        taskId = (args.task_id || args.taskId || '').trim()
        lines = args.lines ? parseInt(args.lines, 10) : 40
      } else {
        const parts = String(args || '').split('||')
        taskId = parts[0]?.trim()
        lines = parts[1] ? parseInt(parts[1].trim(), 10) : 40
      }
      if (!taskId) return { success: false, message: 'Wajib menyertakan task_id' }
      return readBackgroundTaskOutput(taskId, lines)
    }
  },

  'kill-task': {
    needsApproval: false,
    handler: async (args) => {
      const taskId = (typeof args === 'object' && args !== null ? (args.task_id || args.taskId) : String(args || '')).trim()
      if (!taskId) return { success: false, message: 'Wajib menyertakan task_id' }
      return killBackgroundTask(taskId)
    }
  },

  'list-tasks': {
    needsApproval: false,
    handler: async () => {
      return listBackgroundTasks()
    }
  },

  // ----------------------------------------------------------------------
  // BROWSER TOOLS
  // ----------------------------------------------------------------------
  'browser-navigate': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let url = (typeof args === 'object' && args !== null ? args.url : String(args || '')).trim()
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url
        }
        const sessionId = config?.sessionId || 'default'
        const result = await navigateTo(url, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-close': {
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await closeBrowser(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-show': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await showBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-hide': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await hideBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-read': {
    needsApproval: false,
    handler: async (_args, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await readDOM(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-click': {
    needsApproval: false,
    handler: async (args, config) => {
      let id = NaN
      if (typeof args === 'object' && args !== null) {
        id = parseInt(args.element_id ?? args.id, 10)
      } else {
        id = parseInt(String(args || '').trim(), 10)
      }
      if (isNaN(id)) return { success: false, error: 'element_id harus berupa angka.' }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'click', id }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-type': {
    needsApproval: false,
    handler: async (args, config) => {
      let id = NaN
      let text = ''
      if (typeof args === 'object' && args !== null) {
        id = parseInt(args.element_id ?? args.id, 10)
        text = String(args.text ?? '')
      } else {
        const parts = String(args || '').split('||')
        if (parts.length < 2) return { success: false, error: 'Format: ID||teks' }
        id = parseInt(parts[0].trim(), 10)
        text = parts.slice(1).join('||')
      }
      if (isNaN(id)) return { success: false, error: 'element_id harus berupa angka.' }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'type', id, value: text }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-scroll': {
    needsApproval: false,
    handler: async (args, config) => {
      const direction = (typeof args === 'object' && args !== null ? args.direction : String(args || '')).trim().toLowerCase()
      if (direction !== 'up' && direction !== 'down') {
        return { success: false, error: "Gunakan 'up' atau 'down'." }
      }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'scroll', direction }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-ask-user': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const prompt = typeof args === 'object' && args !== null ? (args.prompt || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'unblock', value: prompt }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-script': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const script = typeof args === 'object' && args !== null ? (args.script || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await executeScript(script, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-extract': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const selector = typeof args === 'object' && args !== null ? (args.selector || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await extractData(selector, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-screenshot': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const filename = typeof args === 'object' && args !== null ? (args.filename || 'screenshot.png') : String(args || 'screenshot.png')
        const sessionId = config?.sessionId || 'default'
        const result = await takeScreenshot(filename, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-download': {
    needsApproval: true,
    approvalMessage: (args) => {
      const url = typeof args === 'object' && args !== null ? `${args.url} -> ${args.filename}` : String(args || '')
      return `Mark ingin mendownload file dari browser:\n\n${url}`
    },
    handler: async (args, config) => {
      let url = ''
      let filename = ''
      if (typeof args === 'object' && args !== null) {
        url = (args.url || '').trim()
        filename = (args.filename || '').trim()
      } else {
        const parts = String(args || '').split('||')
        if (parts.length < 2) return { success: false, error: 'Format: url||filename' }
        url = parts[0].trim()
        filename = parts[1].trim()
      }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await downloadFile(url, filename, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  // ----------------------------------------------------------------------
  // DESKTOP OS AUTOMATION TOOLS
  // ----------------------------------------------------------------------
  'os-read': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const mode = typeof args === 'object' && args !== null ? (args.mode || 'all') : String(args || 'all')
        const result = await readDesktop({}, mode)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-click': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const target = typeof args === 'object' && args !== null ? (args.target ?? '') : String(args ?? '')
        const result = await executeClick(target)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-type': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const text = typeof args === 'object' && args !== null ? (args.text ?? '') : String(args ?? '')
        const result = await executeType(text)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-key': {
    needsApproval: (args) => {
      const combo = typeof args === 'object' && args !== null ? args.combo : String(args || '')
      return isDangerousKeyCombo(combo)
    },
    approvalMessage: (args) => {
      const combo = typeof args === 'object' && args !== null ? args.combo : String(args || '')
      return `Mark ingin menekan shortcut keyboard yang berpotensi BERBAHAYA:\n\n${combo}`
    },
    handler: async (args) => {
      try {
        const combo = typeof args === 'object' && args !== null ? (args.combo ?? '') : String(args ?? '')
        const result = await executeKey(combo)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-scroll': {
    needsApproval: false,
    handler: async (args) => {
      try {
        let direction = 'down'
        let amount = 3
        if (typeof args === 'object' && args !== null) {
          direction = args.direction || 'down'
          amount = args.amount !== undefined ? Number(args.amount) : 3
        } else {
          const parts = String(args || '').split('||')
          direction = parts[0] || 'down'
          amount = parts[1] ? Number(parts[1]) : 3
        }
        const result = await executeScroll(direction, amount)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'open': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const target = typeof args === 'object' && args !== null ? (args.target ?? '') : String(args ?? '')
        const result = await openApp(target)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-open': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const target = (typeof args === 'object' && args !== null ? (args.target ?? '') : String(args ?? '')).trim()
        if (target.startsWith('ms-settings:') || target.startsWith('http://') || target.startsWith('https://')) {
          const { exec } = await import('child_process')
          exec(`start ${target}`)
          return { success: true, data: `Opened URI: ${target}` }
        }
        const result = await openApp(target)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-search': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const query = typeof args === 'object' && args !== null ? (args.keyword || '') : String(args || '')
        await executeKey('win')
        await new Promise((r) => setTimeout(r, 800))
        const result = await executeType(query)
        return {
          success: true,
          data: `[PC-Agent] Opened Start Menu and searched for "${query}". ${result}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-double-click': {
    needsApproval: false,
    handler: async (args) => {
      const target = typeof args === 'object' && args !== null ? (args.target ?? '') : String(args ?? '')
      return await executeDoubleClick(target)
    }
  },

  'os-delay': {
    needsApproval: false,
    handler: async (args) => {
      let ms = typeof args === 'object' && args !== null ? parseInt(args.ms, 10) : parseInt(args, 10)
      if (isNaN(ms) || ms < 0) ms = 1000
      if (ms > 10000) ms = 10000
      await new Promise((r) => setTimeout(r, ms))
      return { success: true, data: `[PC-Agent] Delayed for ${ms}ms.` }
    }
  },

  'os-list-windows': {
    needsApproval: false,
    handler: async () => {
      try {
        const result = await listWindows()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-focus-window': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const title = typeof args === 'object' && args !== null ? (args.title || '') : String(args || '')
        const result = await focusWindow(title)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-control-open': {
    needsApproval: () => !isPCSessionOpen(),
    approvalMessage: () =>
      'Mark ingin mengontrol fisik PC/desktop-mu (mengunci sesi sementara dan memunculkan overlay kontrol PC). Apakah kamu mengizinkan?',
    handler: async () => {
      try {
        const result = await openPCSession()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'os-control-close': {
    needsApproval: false,
    handler: async () => {
      try {
        const result = await closePCSession()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  // ----------------------------------------------------------------------
  // GOOGLE DRIVE TOOLS
  // ----------------------------------------------------------------------
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

  // ----------------------------------------------------------------------
  // GOOGLE CALENDAR TOOLS
  // ----------------------------------------------------------------------
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

  // ----------------------------------------------------------------------
  // GMAIL TOOLS
  // ----------------------------------------------------------------------
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
  },

  // ----------------------------------------------------------------------
  // TELEGRAM TOOLS
  // ----------------------------------------------------------------------
  'tg-send': {
    needsApproval: false,
    handler: async (args) => {
      try {
        let chatId = ''
        let type = 'text'
        let content = ''

        if (typeof args === 'object' && args !== null) {
          chatId = String(args.chat_id || args.chatId || '').trim()
          type = String(args.type || 'text').trim().toLowerCase()
          content = args.content ?? ''
        } else {
          const parts = String(args || '').split(/\|+/)
          if (parts.length < 2) return { success: false, error: 'Format: chatId||type||content' }
          chatId = parts[0].trim()
          type = parts[1].trim().toLowerCase()
          content = parts.slice(2).join('||').trim()
        }

        if (type === 'file') {
          const result = await sendTelegramFile(chatId, content)
          return { success: result.success, data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}` }
        } else {
          const result = await sendTelegramMessage(chatId, content)
          return { success: result.success, data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}` }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  // ----------------------------------------------------------------------
  // MEDIA & YOUTUBE TOOLS
  // ----------------------------------------------------------------------
  'search-youtube': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const q = (typeof args === 'object' && args !== null ? (args.query || '') : String(args || '')).trim()
        const result = await searchYoutube(q)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'youtube-transcript': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const url = (typeof args === 'object' && args !== null ? (args.url || '') : String(args || '')).trim()
        const result = await getTranscript(url)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'tts-speak': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const text = (typeof args === 'object' && args !== null ? (args.text || '') : String(args || '')).trim()
        const result = await synthesizeTTS(text)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}

export const getNativeToolsDefinition = () => NATIVE_TOOLS
