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
const successful = (step) => {
  const result = resultOf(step || {})
  return (
    step?.status === 'done' &&
    result.success !== false &&
    (result.exitCode == null || result.exitCode === 0)
  )
}
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
  return String(
    args.path ||
      args.filePath ||
      args.file_path ||
      (typeof query === 'string' && !query.trim().startsWith('{') ? query.split('||')[0] : '')
  )
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
      const result =
        typeof mutation.fullResult === 'string'
          ? mutation.fullResult
          : JSON.stringify(mutation.fullResult || {})
      if (
        result.includes('[Observasi halaman setelah aksi]') &&
        !result.includes('[DOM terbaru belum tersedia:')
      )
        continue
      if (later.some((step) => ['browser-read', 'browser-screenshot'].includes(step.tool))) continue
      return {
        key: `browser:${i}:${name}`,
        tool: name,
        instruction:
          'Periksa hasil pada halaman browser yang sama. Gunakan observasi DOM atau screenshot; jangan memeriksa berkas proyek untuk membuktikan klik.'
      }
    }
    if (fileMutations.has(name)) {
      const target = pathOf(mutation.query)
      const patch = String(argsOf(mutation.query).patch || '')
      const targets =
        name === 'apply-patch'
          ? [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) =>
              match[1].trim()
            )
          : [target]
      // Text and document edits need content checks, not an application build.
      if (
        !targets.some((file) =>
          /\.(?:[cm]?[jt]sx?|py|cs|java|go|rs|cpp|c|h|php|rb|vue|svelte|html|css|scss|json|ya?ml|toml)$/i.test(
            file
          )
        )
      )
        continue
      if (
        later.some((step) => {
          if (['read-file', 'grep-search'].includes(step.tool)) return false
          if (['run-powershell', 'run-task'].includes(step.tool)) {
            const args = argsOf(step.query)
            if (step.tool === 'run-task' && !completedCommand(step)) return false
            return isVerificationCommand(
              args.command || args.query || (typeof step.query === 'string' ? step.query : '')
            )
          }
          if (step.tool === 'read-task-output')
            return (
              completedCommand(step) && verificationTask(step, tools.slice(0, i + 1).concat(later))
            )
          if (name === 'delete-file' && step.tool === 'list-dir')
            return target && target.startsWith(pathOf(step.query) + '/')
          return false
        })
      )
        continue
      return {
        key: `file:${i}:${target || name}`,
        tool: name,
        instruction:
          'Jalankan pemeriksaan proyek yang relevan jika tersedia. Membaca ulang berkas hanya memeriksa isi, bukan membuktikan build atau fungsi aplikasi. Jelaskan bila pemeriksaan tidak berlaku atau belum dapat dijalankan.'
      }
    }
    if (name === 'computer_use') {
      if (mutation.preview || later.some((step) => step.tool === 'computer_use' && step.preview))
        continue
      return {
        key: `desktop:${i}`,
        tool: name,
        instruction:
          'Periksa observasi desktop dari sesi Computer Use yang sama. Jangan menjalankan build atau membaca berkas untuk memverifikasi tindakan desktop.'
      }
    }
  }
  return null
}
function resultOf(step) {
  const value = step.fullResult || step.resultSummary
  if (value && typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
function completedCommand(step) {
  const result = resultOf(step)
  const data = result.data || result
  return data.exitCode === 0 && !['running', 'queued'].includes(data.status)
}
function verificationTask(step, tools) {
  const data = resultOf(step).data || resultOf(step)
  if (data.command) return isVerificationCommand(data.command)
  const args = argsOf(step.query)
  const id = args.task_id || args.taskId || (typeof step.query === 'string' ? step.query : '')
  return (
    id &&
    tools.some((item) => {
      const query = argsOf(item.query)
      return (
        item.tool === 'run-task' &&
        (query.task_id || query.taskId) === id &&
        isVerificationCommand(query.command)
      )
    })
  )
}

export function createVerificationGate() {
  const requested = new Set()
  return (steps) => {
    const missing = pendingVerification(steps)
    if (!missing) return { missing: null, retry: false }
    const retry = !requested.has(missing.key)
    requested.add(missing.key)
    return { missing, retry }
  }
}

export function verificationStepsFromMessages(messages) {
  const calls = new Map(messages.flatMap((m) => m.tool_calls || []).map((call) => [call.id, call]))
  return messages
    .filter((m) => m.role === 'tool' && calls.has(m.tool_call_id))
    .map((m) => {
      const call = calls.get(m.tool_call_id)
      const result = resultOf({ fullResult: m.content })
      return {
        tool: m.name || call.function?.name,
        query: call.function?.arguments,
        fullResult: m.content,
        status: result.success === false || result.error ? 'error' : 'done',
        preview:
          m.action?.imageUrl || result.dataUrl || result.screenshot || result.data?.screenshot
      }
    })
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
