import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
import { executeComputerUse } from '../../server/tools/pc-agent.js'
import { isComputerUseSessionOpen, validateComputerUseArgs } from '../../shared/computer-use.js'

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
  const str = typeof cmd === 'object' ? cmd?.command || '' : String(cmd || '')
  return DANGEROUS_KEYWORDS.some((k) => str.toLowerCase().includes(k.toLowerCase()))
}

export const systemTools = {
  'run-powershell': {
    needsApproval: (args) => isDangerousCommand(args),
    approvalMessage: (args) =>
      `Mark ingin menjalankan PowerShell:\n${typeof args === 'object' ? args.command : String(args)}`,
    handler: async (args, config) => {
      const command = String(typeof args === 'object' ? args.command : args || '').trim()
      if (!command) return { success: false, error: 'Perintah kosong.' }
      const { runCommand } = await import('../../server/services/terminal-service.js')
      return runCommand(command, {
        ...config,
        workspaceRoot:
          config?.workspaceRoot || path.join(os.homedir(), 'Documents', 'Mark Workspace')
      })
    }
  },

  open: {
    needsApproval: false,
    handler: async (args) => {
      try {
        const target =
          typeof args === 'object' && args !== null ? (args.target ?? '') : String(args ?? '')
        await execPromise(`start "" "${target}"`)
        return { success: true, data: `Opened: ${target}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  computer_use: {
    needsApproval: (args) => {
      try {
        args = validateComputerUseArgs(args)
      } catch {
        return false
      }
      if (isComputerUseSessionOpen('computer_use', args)) return true
      if (Array.isArray(args?.actions)) {
        return args.actions.some((a) => {
          const act = a?.action || ''
          const combo = a?.key || a?.combo || (Array.isArray(a?.keys) ? a.keys.join('+') : '')
          if (act === 'key' || act === 'hotkey' || act === 'key_down') {
            return isDangerousKeyCombo(combo)
          }
          return false
        })
      }
      const act = typeof args === 'object' && args !== null ? args.action : ''
      const combo =
        typeof args === 'object' && args !== null
          ? args.key || args.combo || (Array.isArray(args?.keys) ? args.keys.join('+') : '')
          : ''
      if (act === 'key' || act === 'hotkey' || act === 'key_down') {
        return isDangerousKeyCombo(combo)
      }
      return false
    },
    approvalMessage: (args) => {
      try {
        args = validateComputerUseArgs(args)
      } catch {
        return 'Parameter Computer Use tidak valid.'
      }
      if (isComputerUseSessionOpen('computer_use', args))
        return 'Izinkan Mark membuka sesi Computer Use? Mouse akan dikunci dan cursor Mark ditampilkan selama sesi aktif. Overlay tetap terlihat sampai Mark menutup sesi. Tekan Ctrl+Shift+R kapan saja untuk membatalkan dan melepaskan mouse.'
      let combo = ''
      if (Array.isArray(args?.actions)) {
        const found = args.actions.find((a) => {
          const act = a?.action || ''
          const c = a?.key || a?.combo || (Array.isArray(a?.keys) ? a.keys.join('+') : '')
          return (act === 'key' || act === 'hotkey' || act === 'key_down') && isDangerousKeyCombo(c)
        })
        combo = found
          ? found.key || found.combo || (Array.isArray(found.keys) ? found.keys.join('+') : '')
          : ''
      } else if (typeof args === 'object' && args !== null) {
        combo = args.key || args.combo || (Array.isArray(args?.keys) ? args.keys.join('+') : '')
      }
      return `Mark ingin menekan shortcut keyboard berpotensi bahaya via Computer Use:\n\n${combo}`
    },
    handler: async (args, config) => {
      try {
        args = validateComputerUseArgs(args)
        const payload = {
          sessionId: config?.sessionId || args?.sessionId || 'default',
          agentName: config?.agentName || args?.agentName || 'Mark Utama',
          ...(typeof args === 'object' && args !== null ? args : {})
        }
        const result = await executeComputerUse({
          ...payload,
          sessionId: config?.sessionId || 'default',
          runId: config?.computerUseRunId || config?.sessionId,
          signal: config?.signal,
          approvalToken: config?.computerUseApprovalToken
        })
        if (result?.image || result?.dataUrl) {
          const img = result.dataUrl || result.image
          const details = { observation: result.observation, ...result }
          delete details.image
          delete details.dataUrl
          return {
            ...result,
            success: result.success !== false,
            data: details,
            message: result.success === false ? result.error || result.message : result.message,
            dataUrl: img,
            image: img,
            cursor: result.cursor,
            cursor_host: result.cursor_host,
            viewport: result.viewport,
            host_resolution: result.host_resolution,
            action: result.action || 'screenshot',
            results: result.results || undefined
          }
        }
        if (result?.action === 'batch') {
          return {
            success: result.success !== false,
            ...result,
            data: result,
            message: result.error || result.message
          }
        }
        return {
          ...result,
          success: result.success !== false,
          data: result,
          message: result.error || result.message
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'computer-use': {
    needsApproval: (args) => systemTools['computer_use'].needsApproval(args),
    approvalMessage: (args) => systemTools['computer_use'].approvalMessage(args),
    handler: async (args, config) => systemTools['computer_use'].handler(args, config)
  },

  'computer-screenshot': {
    needsApproval: false,
    handler: (args, config) =>
      systemTools.computer_use.handler({ ...(args || {}), action: 'screenshot' }, config)
  }
}
