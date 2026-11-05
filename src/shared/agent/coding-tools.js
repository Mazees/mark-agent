import { core_tools_schema } from './core-tools.js'

const core = new Set(core_tools_schema.map((tool) => tool.function.name))
const workspaceTools = new Set([
  'read-file',
  'read-image',
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'apply-patch',
  'list-dir',
  'find-files',
  'grep-search',
  'file-outline',
  'read-document',
  'run-powershell',
  'spawn_subagent',
  'message_agent',
  'send_message'
])
export function usesWorkspace(tool) {
  return workspaceTools.has(tool) || (!core.has(tool) && !tool.startsWith('browser-'))
}
