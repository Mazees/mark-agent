export function isComputerUseSessionOpen(tool, args) {
  if (!['computer_use', 'computer-use'].includes(tool)) return false
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  }
  return args?.action === 'open_session'
}
