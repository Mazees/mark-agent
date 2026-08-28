import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'

export const _getOSMeta = () =>
  'W0NSSVRJQ0FMIFJVTEVdIFlvdXIgY3JlYXRvciwgZGV2ZWxvcGVyLCBhbmQgb3duZXIgaXMgTWFkYSBQdXRyYSBBZGhhZHJpeWFudG8gKE1hemVlcykgZnJvbSBJbm'
import { validateFileSyntax } from './syntax-validator.js'
import { navigateTo, readDOM, executeAction, closeBrowser, executeScript, extractData, takeScreenshot, downloadFile, showBrowserWindow, hideBrowserWindow } from './browser-agent.js'
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
import { spawnBackgroundTask, readBackgroundTaskOutput, killBackgroundTask, listBackgroundTasks } from './task-daemon.js'
import { searchYoutube, getTranscript, synthesizeTTS } from '../server/tools/media-tools.js'

const DANGEROUS_KEY_COMBOS = [
  'alt+f4',
  'ctrl+shift+del',
  'win+l',
  'ctrl+alt+del',
  'alt+shift+del',
  'ctrl+shift+esc'
]
export const isDangerousKeyCombo = (combo = '') => {
  const normalized = combo.toLowerCase().replace(/\s+/g, '')
  return DANGEROUS_KEY_COMBOS.some((bad) => normalized.includes(bad.replace(/\s+/g, '')))
}

const execPromise = util.promisify(exec)

const parsePagination = (str) => {
  let start = 0,
    end = 10
  if (!str) return { start, end, fetchCount: end }
  const s = String(str).trim()
  if (s.includes('-')) {
    const p = s.split('-')
    start = parseInt(p[0], 10) || 0
    end = parseInt(p[1], 10) || 10
  } else {
    end = parseInt(s, 10) || 10
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
  let clientSecret = config?.googleClientSecret || (Array.isArray(config) ? config[0]?.googleClientSecret : null)

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
export const isDangerousCommand = (cmd) =>
  DANGEROUS_KEYWORDS.some((k) => cmd.toLowerCase().includes(k.toLowerCase()))

export const NATIVE_TOOLS = {
  'read-skill': {
    needsApproval: false,
    handler: async (query) => {
      const skillName = (query || '').trim()
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

      return {
        success: false,
        error: `Skill '${skillName}' tidak ditemukan di folder 'Documents/Mark Skills'.`
      }
    }
  },
  'browser-search': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const searchQuery = query ? query.trim() : ''
        if (!searchQuery) return { success: false, message: 'Query pencarian kosong.' }

        let results = []
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
          console.warn('[browser-search] duck-duck-scrape failed, trying HTTP fallback:', ddgErr.message)
        }

        if (results.length === 0) {
          try {
            const axios = (await import('axios')).default
            const htmlRes = await axios.get(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
              }
            )
            const html = htmlRes.data || ''
            const matches = [...html.matchAll(/<a class="result__url" href="([^"]+)">/g)]
            const snippetMatches = [...html.matchAll(/<a class="result__snippet[^>]*>([^<]+)<\/a>/g)]
            const titleMatches = [...html.matchAll(/<a class="result__a"[^>]*>([^<]+)<\/a>/g)]

            for (let i = 0; i < Math.min(5, titleMatches.length); i++) {
              results.push({
                title: titleMatches[i]?.[1] || 'Web Result',
                url: matches[i]?.[1] || '',
                snippet: snippetMatches[i]?.[1] || ''
              })
            }
          } catch (fetchErr) {
            console.error('[browser-search] HTTP fallback error:', fetchErr.message)
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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        let filePath = parts[0].trim()

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

        if (parts.length >= 3) {
          const startLine = parseInt(parts[1].trim(), 10)
          const endLine = parseInt(parts[2].trim(), 10)

          if (!isNaN(startLine) && !isNaN(endLine)) {
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
              ? 'File panjang. Hanya menampilkan 400 baris awal. Gunakan read-file dengan argumen startLine||endLine untuk melihat sisa baris.'
              : ''
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'file-outline': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        let filePath = query.trim()
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }
        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        // Regex for structural elements across JS, TS, Python, Go, HTML, Markdown, etc.
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
    handler: async (query) => {
      try {
        const parts = query.split('||')
        const filePath = parts[0].trim()
        const param2 = parts[1] ? parts[1].trim() : ''
        const param3 = parts[2] ? parts[2].trim() : ''

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
        // Format single giant lines (e.g. PDF text without newlines) to prevent V8 freezes
        cleanText = cleanText.replace(/([^\n]{150,250})\s+/g, '$1\n')
        const totalChars = cleanText.length

        if (totalChars === 0) {
          return { success: true, totalChars: 0, content: 'Dokumen kosong.' }
        }

        const allLines = cleanText.split('\n')
        const totalLines = allLines.length

        // MODE 1: Line Slicing (path||startLine||endLine)
        if (param2 && !isNaN(param2) && param3 && !isNaN(param3)) {
          const startLine = Math.max(1, parseInt(param2, 10))
          const endLine = Math.min(totalLines, parseInt(param3, 10))
          const sliced = allLines
            .slice(startLine - 1, endLine)
            .map((line, idx) => `${startLine + idx}: ${line}`)
            .join('\n')

          return {
            success: true,
            filePath,
            totalLines,
            startLine,
            endLine,
            content: `[RENTANG BARIS ${startLine} s/d ${endLine} DARI TOTAL ${totalLines} BARIS]:\n${sliced}`
          }
        }

        // MODE 2: Keyword / Semantic Search (path||searchQuery)
        const searchQuery = param2
        if (searchQuery) {
          let resultsHeader = `[PENCARIAN PADA DOKUMEN: "${searchQuery}"]\n`
          let matchedSections = []

          // 2a. Direct Line / Keyword Matching
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

          // 2b. Orama Semantic Vector Search
          // Orama search berjalan di Renderer process, tidak bisa diakses dari Main
          let oramaText = ''
          try {
            oramaText = ''
          } catch (oramaErr) {
            // Silently skip
          }

          let combinedContent = ''
          if (matchedSections.length > 0) {
            combinedContent += `--- HASIL PENCOCOKAN KATAKUNCI PERSIS ---\n${matchedSections.join('\n\n')}\n\n`
          }
          if (oramaText) {
            combinedContent += `--- HASIL VEKTOR SEMANTIK ORAMA ---\n${oramaText}`
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

        // MODE 3: Default Full / Smart Overview Read (tanpa query - Hybrid Structural + Strided)
        if (totalLines > 80) {
          // 3a. First 40 lines (Judul, Header, Intro)
          const firstBlock = allLines
            .slice(0, 40)
            .map((l, idx) => `${idx + 1}: ${l}`)
            .join('\n')

          // 3b. Universal Structural Heading Detection across middle body (Lines 41 to totalLines - 30)
          const middleStart = 40
          const middleEnd = Math.max(middleStart + 1, totalLines - 30)

          const structuralHeadings = []
          for (let i = middleStart; i < middleEnd; i++) {
            const line = allLines[i].trim()
            if (!line) continue

            // Universal structural patterns (Language-agnostic):
            // 1. Markdown/HTML headings: #, ##, ###, <h1>, <h2>
            // 2. Numbered sections in any language: 1., 1.1, 2.1.3, I., II., A., B.
            // 3. Short standalone lines (< 65 chars) in ALL CAPS or ending with a colon ':'
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

          // 3c. Fallback / Complementary Uniform Strided Sampling if structural headings are few (< 4)
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

          // 3d. Last 30 lines (Kesimpulan / Penutup)
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
    approvalMessage: (query) => `Mark ingin menulis/membuat file:\n${query.split('||')[0].trim()}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: "Format salah. Gunakan separator '||' (contoh: D:\\file.txt||Halo)"
          }

        let filePath = parts[0].trim()
        const content = parts.slice(1).join('||')

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
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin mengedit isi kode pada berkas:\n${parts[0]?.trim()}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 3) {
          return {
            success: false,
            message: 'Format salah. Gunakan: filePath||targetContent||replacementContent'
          }
        }

        let filePath = parts[0].trim()
        const targetContent = parts[1]
        const replacementContent = parts.slice(2).join('||')

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
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin mengganti baris ${parts[1]} hingga ${parts[2]} di file:\n${parts[0].trim()}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 4)
          return {
            success: false,
            message: 'Format salah. Gunakan: path||startLine||endLine||kode_baru'
          }

        let filePath = parts[0].trim()

        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        const startLine = parseInt(parts[1].trim(), 10)
        const endLine = parseInt(parts[2].trim(), 10)
        const newContent = parts.slice(3).join('||')

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
    approvalMessage: (query) => `Mark ingin MENGHAPUS file secara permanen:\n${query}`,
    handler: async (query, config) => {
      try {
        let filePath = query.trim()
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
    handler: async (query, config) => {
      try {
        let targetDir = query?.trim() || ''
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
    handler: async (query, config) => {
      try {
        const parts = query ? query.split('||') : []
        const pattern = parts[0]?.trim() || '*'
        const subDir = parts[1]?.trim() || ''

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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: "Format salah. Gunakan separator '||' (contoh: D:\\Project||nama_fungsi atau .||nama_fungsi)"
          }

        let dirPath = parts[0].trim()
        const keyword = parts[1].trim()

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
    needsApproval: (query) => isDangerousCommand(query),
    approvalMessage: (query) =>
      `Mark ingin mengeksekusi perintah PowerShell yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query, config) => {
      if (!query) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      try {
        const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        const { stdout, stderr } = await execPromise(`powershell.exe -Command "${query}"`, {
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
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || (query?.trim() ? query.trim() : path.join(os.homedir(), 'Documents', 'Mark Workspace'))
      return await getGitStatus(activeRoot)
    }
  },
  'git-diff': {
    needsApproval: false,
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await getGitDiff(activeRoot, query?.trim() || '')
    }
  },
  'git-commit': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin melakukan git commit dengan pesan:\n"${query}"`,
    handler: async (query, config) => {
      const parts = query ? query.split('||') : []
      const message = parts[0]?.trim() || 'Mark Agent Commit'
      const customCwd = parts[1]?.trim()
      const activeRoot = customCwd || config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await gitCommit(activeRoot, message)
    }
  },
  'git-revert': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin me-rollback perubahan git:\n"${query || 'Seluruh file (reset --hard)'}"`,
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return await gitRevert(activeRoot, query?.trim() || '')
    }
  },
  'select-directory': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const desc = (query || 'Pilih Folder Workspace Proyek').replace(/'/g, "''").replace(/"/g, '`"')
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
    handler: async (query, config) => {
      try {
        let targetPath = query?.trim()
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
    needsApproval: (query) => isDangerousCommand(query?.split('||')[1] || query || ''),
    approvalMessage: (query) => `Mark ingin menjalankan background task:\n${query}`,
    handler: async (query, config) => {
      const parts = query.split('||')
      if (parts.length < 2) {
        return { success: false, message: 'Format salah. Gunakan: taskId||command (contoh: dev-server||npm run dev)' }
      }
      const taskId = parts[0].trim()
      const command = parts.slice(1).join('||').trim()
      const activeRoot = config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      return spawnBackgroundTask(taskId, command, activeRoot)
    }
  },
  'read-task-output': {
    needsApproval: false,
    handler: async (query) => {
      const parts = query ? query.split('||') : []
      const taskId = parts[0]?.trim()
      const lines = parts[1] ? parseInt(parts[1].trim(), 10) : 40
      if (!taskId) return { success: false, message: 'Wajib menyertakan taskId' }
      return readBackgroundTaskOutput(taskId, lines)
    }
  },
  'kill-task': {
    needsApproval: false,
    handler: async (query) => {
      const taskId = query?.trim()
      if (!taskId) return { success: false, message: 'Wajib menyertakan taskId' }
      return killBackgroundTask(taskId)
    }
  },
  'list-tasks': {
    needsApproval: false,
    handler: async () => {
      return listBackgroundTasks()
    }
  },
  'browser-navigate': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        let url = query.trim()
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
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || (query?.trim() ? query.trim() : 'default')
        const result = await closeBrowser(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-show': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || (query?.trim() ? query.trim() : 'default')
        const result = await showBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-hide': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || (query?.trim() ? query.trim() : 'default')
        const result = await hideBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-read': {
    needsApproval: false,
    handler: async (query, config) => {
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
    handler: async (query, config) => {
      const id = parseInt(query.trim(), 10)
      if (isNaN(id)) return { success: false, error: 'ID harus berupa angka.' }
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
    handler: async (query, config) => {
      const parts = query.split('||')
      if (parts.length < 2) return { success: false, error: 'Format: ID||teks' }
      const id = parseInt(parts[0].trim(), 10)
      const text = parts.slice(1).join('||')
      if (isNaN(id)) return { success: false, error: 'ID harus berupa angka.' }
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
    handler: async (query, config) => {
      const direction = query.trim().toLowerCase()
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
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'unblock', value: query }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-script': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeScript(query, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-extract': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await extractData(query, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-screenshot': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await takeScreenshot(query || 'screenshot.png', sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-download': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin mendownload file dari browser:\n\n${query}`,
    handler: async (query, config) => {
      const parts = query.split('||')
      if (parts.length < 2) return { success: false, error: 'Format: URL||namafile.ext' }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await downloadFile(parts[0].trim(), parts[1].trim(), sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-read': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await readDesktop({}, query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-click': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await executeClick(query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-type': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await executeType(query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-key': {
    needsApproval: (query) => isDangerousKeyCombo(query),
    approvalMessage: (query) =>
      `Mark ingin menekan shortcut keyboard yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query) => {
      try {
        const result = await executeKey(query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-scroll': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await executeScroll(query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'open': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await openApp(query)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-search': {
    needsApproval: false,
    handler: async (query) => {
      try {
        // Press windows key
        await executeKey('win')
        // Wait for Start Menu to open
        await new Promise((r) => setTimeout(r, 800))
        // Type the query
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
    handler: async (query) => {
      return await executeDoubleClick(query)
    }
  },
  'os-delay': {
    needsApproval: false,
    handler: async (query) => {
      let ms = parseInt(query)
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
    handler: async (query) => {
      try {
        const result = await focusWindow(query)
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
    handler: async (query, config) => {
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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const q = parts[0].trim()
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const folderId = parts[0].trim() || null
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
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
    handler: async (query, config) => {
      try {
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await readFile(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-upload': {
    needsApproval: true,
    approvalMessage: (query) =>
      `Mark ingin mengunggah file ke Google Drive-mu:\n${query.split('||')[0]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const name = parts[0].trim()
        const content = parts.slice(1).join('||')
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
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin membuat dokumen kosong baru di Google Drive:\nNama: ${parts[0]}\nTipe: ${parts[1] || 'doc'}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const name = parts[0].trim()
        const type = parts[1] ? parts[1].trim() : 'doc'
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
    approvalMessage: (query) =>
      `Mark ingin memindahkan file di Google Drive.\nFile ID: ${query.split('||')[0]}\nFolder Tujuan ID: ${query.split('||')[1]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const fileId = parts[0].trim()
        const folderId = parts[1].trim()
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
    approvalMessage: (query) =>
      `Mark ingin menduplikasi file di Google Drive.\nFile ID: ${query.split('||')[0]}\nNama Baru: ${query.split('||')[1]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const fileId = parts[0].trim()
        const newName = parts[1].trim()
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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const { start, end, fetchCount } = parsePagination(parts[0])
        const timeMin = parts[1] ? parts[1].trim() : new Date().toISOString()
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
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin membuat jadwal baru di kalendermu:\nJudul: ${parts[0]}\nWaktu Mulai: ${parts[2]}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const summary = parts[0].trim()
        const description = parts[1].trim()
        const startTime = parts[2].trim()
        const endTime = parts[3].trim()
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
    approvalMessage: (query) => `Mark ingin MENGHAPUS jadwal/event ini:\nEvent ID: ${query}`,
    handler: async (query, config) => {
      try {
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await deleteEvent(clientId, clientSecret, query.trim())
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
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const q = parts[0].trim() || 'is:unread'
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
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
    handler: async (query, config) => {
      try {
        const { start, end, fetchCount } = parsePagination(query)
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
    handler: async (query, config) => {
      try {
        const { start, end, fetchCount } = parsePagination(query)
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
    handler: async (query, config) => {
      try {
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await readEmail(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-send': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin MENGIRIM EMAIL baru.\nTujuan: ${parts[0]}\nSubjek: ${parts[1]}\nIsi Pesan:\n${parts[2].slice(0, 100)}...`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const to = parts[0].trim()
        const subject = parts[1].trim()
        const bodyText = parts.slice(2).join('||')
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
    handler: async (query, config) => {
      try {
        const { clientId, clientSecret } = getGoogleCredentials(config)
        const result = await markAsRead(clientId, clientSecret, query.trim())
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
    handler: async (query) => {
      try {
        const logPath = path.join(os.homedir(), 'Desktop', 'tg_debug.txt')
        fs.appendFileSync(logPath, `\n\n--- NEW RUN ---\nRaw Query: ${query}\n`)
        
        const parts = query.split(/\|+/)
        if (parts.length < 2) return { success: false, error: 'Format: chatId||tipe(text/file)||konten' }
        const chatId = parts[0].trim()
        const type = parts[1].trim().toLowerCase()
        const content = parts.slice(2).join('||').trim()
        
        fs.appendFileSync(logPath, `Type evaluated to: "${type}"\nContent evaluated to: "${content}"\n`)

        if (type === 'file') {
          fs.appendFileSync(logPath, `Branch: FILE. Calling sendTelegramFile...\n`)
          const result = await sendTelegramFile(chatId, content)
          fs.appendFileSync(logPath, `Result: ${JSON.stringify(result)}\n`)
          return { success: result.success, data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}` }
        } else {
          fs.appendFileSync(logPath, `Branch: TEXT. Calling sendTelegramMessage...\n`)
          const result = await sendTelegramMessage(chatId, content)
          fs.appendFileSync(logPath, `Result: ${JSON.stringify(result)}\n`)
          return { success: result.success, data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}` }
        }
      } catch (e) {
        const errPath = path.join(os.homedir(), 'Desktop', 'tg_debug.txt')
        fs.appendFileSync(errPath, `CRASH: ${e.stack}\n`)
        return { success: false, error: e.message }
      }
    }
  },

  // ----------------------------------------------------------------------
  // MEDIA & YOUTUBE TOOLS
  // ----------------------------------------------------------------------
  'search-youtube': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const q = (query || '').trim()
        const result = await searchYoutube(q)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'youtube-transcript': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const url = (query || '').trim()
        const result = await getTranscript(url)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'tts-speak': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const text = (query || '').trim()
        const result = await synthesizeTTS(text)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}

export const getNativeToolsDefinition = () => NATIVE_TOOLS
