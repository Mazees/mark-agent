import path from 'node:path'

export function hasStoredToolPermission(tool, args, workspaceRoot, session, config = {}) {
  if (session?.is_auto_mode === 1 || session?.isAutoMode === true) return true
  const allowed = Array.isArray(config.alwaysAllowedPaths) ? config.alwaysAllowedPaths : []
  if (tool === 'run-powershell') {
    const command = typeof args === 'string' ? args : args.command || args.cmd || ''
    return allowed.some(
      (value) => String(value).toLowerCase() === `cmd:${command.trim().toLowerCase()}`
    )
  }
  const target =
    typeof args === 'string'
      ? args.split('||')[0]
      : args.path || args.filePath || args.cwd || args.target
  if (!target) return false
  const resolved = path.resolve(workspaceRoot, target.replace(/^["']|["']$/g, '')).toLowerCase()
  return allowed.some((entry) => {
    if (!entry || entry.startsWith('cmd:')) return false
    const root = path.resolve(workspaceRoot, entry).toLowerCase()
    const relative = path.relative(root, resolved)
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    )
  })
}
