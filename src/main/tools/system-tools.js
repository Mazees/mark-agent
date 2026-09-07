import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
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
} from '../../server/tools/pc-agent.js'

const execPromise = util.promisify(exec)

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

export const systemTools = {
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

        // Gunakan Base64 EncodedCommand (UTF-16LE) agar karakter khusus ($_, quotes, pipe, regex) 100% aman
        const encodedCmd = Buffer.from(command, 'utf16le').toString('base64')
        const { stdout, stderr } = await execPromise(
          `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`,
          {
            cwd: activeRoot,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer agar output besar tidak melempar MaxBuffer exceeded
            timeout: 60000 // 60 detik timeout
          }
        )
        const outputText = stdout.trim() || (stderr.trim() ? `[STDERR]: ${stderr.trim()}` : 'Perintah berhasil dieksekusi tanpa output teks.')
        return {
          success: true,
          data: outputText,
          output: outputText,
          error: stderr.trim() || null
        }
      } catch (error) {
        // Tangani jika error membawa stdout parsial
        const partialOutput = error.stdout ? error.stdout.trim() : ''
        const errorMsg = error.stderr ? error.stderr.trim() : error.message
        return {
          success: false,
          message: 'Gagal mengeksekusi perintah.',
          output: partialOutput || null,
          error: errorMsg
        }
      }
    }
  },

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
  }
}
