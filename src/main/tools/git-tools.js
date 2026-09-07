import path from 'path'
import os from 'os'
import { getGitStatus, getGitDiff, gitCommit, gitRevert } from '../git-service.js'

export const gitTools = {
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
  }
}
