import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
import { fileURLToPath } from 'url'
import { validateFileSyntax } from '../syntax-validator.js'
import { dbStore } from '../../server/memory/db-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const execPromise = util.promisify(exec)

export const fileTools = {
  'read-skill': {
    needsApproval: false,
    handler: async (args) => {
      const skillName = (
        typeof args === 'object' && args !== null
          ? args.skill_name || args.name
          : String(args || '')
      ).trim()
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
            return {
              success: true,
              content: matched.content,
              data: matched.content,
              source: 'learned_skills_db'
            }
          }
        } catch (_) {}
      }

      return {
        success: false,
        error: `Skill '${skillName}' tidak ditemukan di folder 'Documents/Mark Skills' maupun di basis data Learned Skills.`
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

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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
          const sliceLines = lines.slice(Math.max(0, startLine - 1), Math.min(totalLines, endLine))
          const sliceContent = sliceLines.map((l, i) => `[${startLine + i}] ${l}`).join('\n')
          return {
            success: true,
            totalLines,
            showing: `Baris ${startLine} - ${Math.min(totalLines, endLine)} (dari total ${totalLines} baris)`,
            content: sliceContent
          }
        }

        // Jika file <= 800 baris, sajikan 100% UTUH tanpa potongan buatan
        if (totalLines <= 800) {
          const fullContent = lines.map((l, i) => `[${i + 1}] ${l}`).join('\n')
          return {
            success: true,
            totalLines,
            showing: `Baris 1 - ${totalLines} (Lengkap 100%)`,
            content: fullContent
          }
        }

        // Jika file > 800 baris, sajikan 800 baris awal (standar Antigravity)
        const defaultLines = lines.slice(0, 800)
        const defaultContent = defaultLines.map((l, i) => `[${i + 1}] ${l}`).join('\n')
        return {
          success: true,
          totalLines,
          showing: `Baris 1 - 800 (dari total ${totalLines} baris)`,
          content: defaultContent,
          note: `File panjang (${totalLines} baris). Menampilkan 800 baris awal. Gunakan read-file dengan argumen start_line & end_line, atau gunakan grep-search untuk mencari fungsi/variabel tertentu secara presisi.`
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
        let filePath = (
          typeof args === 'object' && args !== null ? args.path : String(args || '')
        ).trim()
        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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
            const pdfParseModule = await import('pdf-parse')
            const pdfFn = pdfParseModule.default || pdfParseModule
            if (typeof pdfFn === 'function') {
              const res = await pdfFn(buffer)
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
            const mammoth = await import('mammoth')
            const result = await (mammoth.default || mammoth).extractRawText({ buffer })
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
      const p =
        typeof args === 'object' && args !== null ? args.path : String(args || '').split('||')[0]
      return `Mark ingin menulis/membuat file:\n${(p || '').trim()}`
    },
    handler: async (args, config) => {
      try {
        let filePath = ''
        let content = ''

        if (typeof args === 'object' && args !== null) {
          filePath = (args.path || '').trim()
          content =
            typeof args.content === 'string'
              ? args.content
              : JSON.stringify(args.content ?? '', null, 2)
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

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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

        return {
          success: true,
          message: `Berhasil menyimpan file ke ${filePath} tanpa error sintaks.`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'replace-content': {
    needsApproval: true,
    approvalMessage: (args) => {
      const p =
        typeof args === 'object' && args !== null ? args.path : String(args || '').split('||')[0]
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

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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
          newContent = args.new_code !== undefined ? args.new_code : args.content || ''
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

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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
        let filePath = (
          typeof args === 'object' && args !== null ? args.path : String(args || '')
        ).trim()
        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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
        let targetDir = (
          typeof args === 'object' && args !== null ? args.path : String(args || '')
        ).trim()
        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
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

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        const targetDir = path.isAbsolute(subDir)
          ? subDir
          : subDir
            ? path.join(activeRoot, subDir)
            : activeRoot

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
        let targetPath = ''
        let keyword = ''

        if (typeof args === 'object' && args !== null) {
          targetPath = (args.path || args.file || args.filepath || args.target || '').trim()
          keyword = (args.keyword || args.query || args.pattern || '').trim()
        } else {
          const rawStr = String(args || '').trim()
          if (rawStr.includes('||')) {
            const parts = rawStr.split('||')
            targetPath = parts[0].trim()
            keyword = parts.slice(1).join('||').trim()
          } else {
            // Jika hanya 1 string argumen tanpa pemisah, anggap sebagai keyword
            keyword = rawStr
          }
        }

        if (!keyword) {
          return { success: false, message: 'Kata kunci pencarian tidak boleh kosong.' }
        }

        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!targetPath) {
          targetPath = activeRoot
        } else if (!path.isAbsolute(targetPath)) {
          targetPath = path.join(activeRoot, targetPath)
        }

        if (!fs.existsSync(targetPath)) {
          return { success: false, message: `Path tidak ditemukan: ${targetPath}` }
        }

        const stat = await fs.promises.stat(targetPath)
        const matches = []
        const lowerKeyword = keyword.toLowerCase()

        // SKENARIO 1: Pencarian pada SATU BERKAS SPESIFIK
        if (stat.isFile()) {
          const content = await fs.promises.readFile(targetPath, 'utf8')
          const lines = content.split('\n')
          const fileName = path.basename(targetPath)

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerKeyword)) {
              matches.push(`${fileName}:${i + 1}: ${lines[i].trim()}`)
              if (matches.length >= 60) break
            }
          }

          if (matches.length === 0) {
            return {
              success: true,
              total_matches: 0,
              result: `Tidak ditemukan baris yang cocok dengan "${keyword}" di dalam berkas ${fileName}.`
            }
          }

          return {
            success: true,
            total_matches: matches.length,
            result: `Ditemukan ${matches.length} kecocokan di ${fileName}:\n${matches.join('\n')}`
          }
        }

        // SKENARIO 2: Pencarian rekursif pada DIREKTORI
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
          '.js',
          '.jsx',
          '.ts',
          '.tsx',
          '.mjs',
          '.cjs',
          '.json',
          '.html',
          '.htm',
          '.css',
          '.scss',
          '.less',
          '.py',
          '.md',
          '.markdown',
          '.txt',
          '.rs',
          '.go',
          '.java',
          '.c',
          '.cpp',
          '.h',
          '.hpp',
          '.cs',
          '.sh',
          '.ps1',
          '.bat',
          '.cmd',
          '.yml',
          '.yaml',
          '.xml',
          '.env',
          '.sql',
          '.toml',
          '.ini',
          '.cfg',
          '.vue',
          '.svelte'
        ])

        async function walk(dir) {
          if (matches.length >= 60) return

          let entries
          try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true })
          } catch (_) {
            return
          }

          for (const entry of entries) {
            if (matches.length >= 60) break

            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
              if (!IGNORED_GREP_DIRS.has(entry.name.toLowerCase())) {
                await walk(fullPath)
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase()
              if (TEXT_EXTENSIONS.has(ext) || !ext || entry.name.startsWith('.')) {
                try {
                  const fileStat = await fs.promises.stat(fullPath)
                  if (fileStat.size > 2 * 1024 * 1024) continue

                  const content = await fs.promises.readFile(fullPath, 'utf8')
                  if (content.toLowerCase().includes(lowerKeyword)) {
                    const lines = content.split('\n')
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].toLowerCase().includes(lowerKeyword)) {
                        const relPath = path.relative(targetPath, fullPath)
                        matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`)
                        if (matches.length >= 60) break
                      }
                    }
                  }
                } catch (_) {}
              }
            }
          }
        }

        await walk(targetPath)

        if (matches.length === 0) {
          return {
            success: true,
            total_matches: 0,
            result: `Pencarian "${keyword}" tidak menemukan hasil di ${path.basename(targetPath)}.`
          }
        }

        return {
          success: true,
          total_matches: matches.length,
          result: `Ditemukan ${matches.length} kecocokan di ${path.basename(targetPath)}:\n${matches.join('\n')}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'select-directory': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const descText =
          typeof args === 'object' && args !== null
            ? args.description || 'Pilih Folder Workspace Proyek'
            : String(args || 'Pilih Folder Workspace Proyek')
        const safeDesc = descText.replace(/['`"\\]/g, ' ')

        const scriptPath = path.resolve(__dirname, '../pc-agent-scripts/pick-folder.ps1')
        let selectedPath = ''

        if (fs.existsSync(scriptPath)) {
          const { stdout } = await execPromise(
            `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "${scriptPath}" -Title "${safeDesc}"`
          )
          selectedPath = stdout.trim()
        } else {
          // Fallback via inline script jika file tidak ditemukan
          const inlinePs = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '${safeDesc}'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }`
          const enc = Buffer.from(inlinePs, 'utf16le').toString('base64')
          const { stdout } = await execPromise(
            `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -EncodedCommand ${enc}`
          )
          selectedPath = stdout.trim()
        }

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
        let targetPath =
          typeof args === 'object' && args !== null ? args.path || '' : String(args || '').trim()
        const activeRoot =
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
        if (!targetPath) targetPath = activeRoot
        else if (!path.isAbsolute(targetPath)) targetPath = path.join(activeRoot, targetPath)
        targetPath = path.normalize(targetPath)
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true })
        }
        await execPromise(`explorer.exe "${targetPath}"`)
        return { success: true, message: `Folder dibuka: ${targetPath}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
