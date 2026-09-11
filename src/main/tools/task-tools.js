import path from 'path'
import os from 'os'
import {
  spawnBackgroundTask,
  readBackgroundTaskOutput,
  killBackgroundTask,
  listBackgroundTasks
} from '../task-daemon.js'
import { isDangerousCommand } from './system-tools.js'

export const taskTools = {
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
  }
}
