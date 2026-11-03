const fileMutations = new Set([
  'write-file',
  'replace-content',
  'replace-lines',
  'edit-file',
  'append-file',
  'delete-file',
  'apply-patch'
])
const browserMutations = new Set([
  'browser-click',
  'browser-type',
  'browser-select',
  'browser-script'
])
const successful = (step) => step?.status === 'done'
const argsOf = (value) => {
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}
const pathOf = (query) => {
  const args = argsOf(query)
  return String(args.path || args.filePath || args.file_path || '')
    .replaceAll('\\', '/')
    .toLowerCase()
}
export function isVerificationCommand(command) {
  return /(?:^|[;\r\n]|&&|\|\|)\s*(?:&\s*)?(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)\b|node\s+(?:--check|-c)\b|(?:npx\s+)?(?:eslint|tsc|vitest|jest|pytest)\b)/i.test(
    String(command || '')
  )
}
export function pendingVerification(steps = []) {
  const tools = steps.filter((step) => step.tool)
  for (let i = tools.length - 1; i >= 0; i--) {
    const mutation = tools[i]
    if (!successful(mutation)) continue
    const name = mutation.tool
    const later = tools.slice(i + 1).filter(successful)
    if (browserMutations.has(name)) {
      const result = mutation.fullResult || ''
      if (
        result.includes('[Observasi halaman setelah aksi]') &&
        !result.includes('[DOM terbaru belum tersedia:')
      )
        continue
      if (later.some((step) => ['browser-read', 'browser-screenshot'].includes(step.tool))) continue
      return {
        tool: name,
        instruction:
          'Periksa hasil pada halaman browser yang sama. Gunakan observasi DOM atau screenshot; jangan memeriksa berkas proyek untuk membuktikan klik.'
      }
    }
    if (fileMutations.has(name)) {
      const target = pathOf(mutation.query)
      if (
        later.some((step) => {
          if (['read-file', 'grep-search'].includes(step.tool)) return false
          if (step.tool === 'run-powershell') {
            const args = argsOf(step.query)
            return isVerificationCommand(args.command || args.query || '')
          }
          if (name === 'delete-file' && step.tool === 'list-dir')
            return target && target.startsWith(pathOf(step.query) + '/')
          return false
        })
      )
        continue
      return {
        tool: name,
        instruction:
          'Jalankan pemeriksaan proyek yang relevan jika tersedia. Membaca ulang berkas hanya memeriksa isi, bukan membuktikan build atau fungsi aplikasi. Jelaskan bila pemeriksaan tidak berlaku atau belum dapat dijalankan.'
      }
    }
    if (name === 'computer_use') {
      if (mutation.preview || later.some((step) => step.tool === 'computer_use' && step.preview))
        continue
      return {
        tool: name,
        instruction:
          'Periksa observasi desktop dari sesi Computer Use yang sama. Jangan menjalankan build atau membaca berkas untuk memverifikasi tindakan desktop.'
      }
    }
  }
  return null
}
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => key !== 'reason')
        .map((key) => [key, ordered(value[key])])
    )
  return value
}
export function createProgressGuard() {
  const recent = []
  return (tool, args, result, succeeded) => {
    const key = JSON.stringify([tool, ordered(args), result, succeeded])
    recent.push(key)
    if (recent.length > 12) recent.shift()
    const repeats = recent.filter((item) => item === key).length
    return { stalled: repeats >= 4, warn: repeats === 2 }
  }
}
