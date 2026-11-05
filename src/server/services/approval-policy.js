import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { validateComputerUseArgs, isComputerUseSessionOpen } from '../../shared/computer-use.js'

export const FILE_MUTATIONS = new Set([
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'apply-patch'
])
const FILE_READS = new Set([
  'read-file',
  'read-image',
  'read-document',
  'file-outline',
  'list-dir',
  'grep-search',
  'find-files'
])
const SHELL_TOOLS = new Set(['run-powershell', 'run-task'])
const REVIEW_ACTIONS = new Set(['tg-send', 'screenshot-to-tg', 'open'])
const sensitive =
  /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.git|\.ssh|\.aws|\.config|credentials(?:\.[^\\/]*)?|secrets?(?:\.[^\\/]*)?|id_rsa|id_ed25519)(?:$|[\\/])|\.(?:pem|key|pfx|p12)$/i

export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stableJson(value[key]))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export const digest = (value) => createHash('sha256').update(stableJson(value)).digest('hex')

export function canonicalTarget(value) {
  let current = path.resolve(value)
  const suffix = []
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) throw new Error('Lokasi target tidak dapat diperiksa.')
    suffix.unshift(path.basename(current))
    current = parent
  }
  const result = path.join(fs.realpathSync.native(current), ...suffix)
  return process.platform === 'win32' ? result.toLowerCase() : result
}
export function within(root, target) {
  const relative = path.relative(root, target)
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

export function describeAction(tool, args, root, nativeTool) {
  if (['computer_use', 'computer-use', 'pc-agent'].includes(tool)) validateComputerUseArgs(args)
  const raw = typeof args === 'string' ? args : ''
  const payload = args && typeof args === 'object' ? args : {}
  const command = SHELL_TOOLS.has(tool)
    ? String(payload.command ?? (tool === 'run-task' ? raw.split('||').slice(1).join('||') : raw))
    : ''
  let names = []
  if (FILE_MUTATIONS.has(tool) || FILE_READS.has(tool)) {
    if (tool === 'apply-patch') {
      if (typeof payload.patch !== 'string') throw new Error('Patch wajib berupa teks patch.')
      names = [...payload.patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) =>
        m[1].trim()
      )
      if (!names.length) throw new Error('Patch tidak memiliki target berkas.')
    } else {
      const value =
        payload.path ||
        payload.filePath ||
        payload.file_path ||
        payload.directory ||
        raw.split('||')[0]
      if (!value && !['list-dir', 'grep-search', 'find-files'].includes(tool))
        throw new Error('Path berkas wajib diisi.')
      names = [value || root]
    }
  } else if (SHELL_TOOLS.has(tool)) {
    if (
      /\b(?:set-content|add-content|out-file|remove-item|copy-item|move-item|new-item|writealltext|writefile|unlink|write_text)\b|>>?/i.test(
        command
      )
    ) {
      names = [
        ...command.matchAll(
          /["']((?:[a-z]:[\\/]|\.\.[\\/])[^"']+)["']|((?<![\w])[a-z]:[\\/][^\s;|"']+|\.\.[\\/][^\s;|"']+)/gi
        )
      ].map((match) => match[1] || match[2])
    }
  } else if (!nativeTool || nativeTool.needsApproval === true) {
    const findPaths = (value) => {
      if (!value || typeof value !== 'object') return
      for (const [key, entry] of Object.entries(value)) {
        if (
          /^(?:path|file_?path|directory|folder|cwd|output_?path|destination_?path|source_?path)$/i.test(
            key
          ) &&
          typeof entry === 'string' &&
          entry.trim() &&
          !/^[a-z]+:\/\//i.test(entry)
        )
          names.push(entry)
        else if (typeof entry === 'object') findPaths(entry)
      }
    }
    findPaths(payload)
  }
  const targets = names.map((name) =>
    canonicalTarget(path.resolve(root, String(name).replace(/^["']|["']$/g, '')))
  )
  const uploads = canonicalTarget(path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads'))
  const protectedTarget = targets.some(
    (target) => sensitive.test(target) && !(FILE_READS.has(tool) && within(uploads, target))
  )
  const outside = targets.some((target) => !within(root, target))
  const massive =
    (tool === 'apply-patch' && names.length > 20) ||
    (tool === 'delete-file' &&
      targets.some((target) => fs.existsSync(target) && fs.statSync(target).isDirectory()))
  const riskyNative =
    typeof nativeTool?.needsApproval === 'function'
      ? nativeTool.needsApproval(args)
      : nativeTool?.needsApproval
  const review =
    SHELL_TOOLS.has(tool) ||
    REVIEW_ACTIONS.has(tool) ||
    /^browser-(?:script|evaluate|execute)/.test(tool) ||
    !nativeTool ||
    Boolean(riskyNative)
  return {
    tool,
    targets,
    command,
    root,
    outside,
    protectedTarget,
    massive,
    fileMutation: FILE_MUTATIONS.has(tool),
    fileRead: FILE_READS.has(tool),
    externalMutation:
      outside && (!nativeTool || nativeTool.needsApproval === true || SHELL_TOOLS.has(tool)),
    forceHuman: isComputerUseSessionOpen(tool === 'pc-agent' ? 'computer_use' : tool, args),
    routine: !review || (FILE_MUTATIONS.has(tool) && !outside && !protectedTarget && !massive),
    scope: targets.length ? targets.join('\n') : command || tool,
    effect: FILE_MUTATIONS.has(tool)
      ? 'file-write'
      : SHELL_TOOLS.has(tool)
        ? 'shell'
        : review
          ? 'tool-action'
          : 'read'
  }
}

export function hardDenial(action, args) {
  const command = action.command
  if (
    command &&
    (/(?:^|[;&|\n{(])\s*(?:clear-disk|initialize-disk|format-volume|format-disk)\b/i.test(
      command
    ) ||
      /(?:^|[;&|\n{(])\s*format(?:\.com|\.exe)?\s+[a-z]:/i.test(command) ||
      /(?:^|[;&|\n{(])\s*(?:rm|del|rmdir|remove-item)\b[^\r\n]*(?:["']?[a-z]:[\\/]["']?(?=\s*(?:$|[;&|]|-\w))|\s["']?\/["']?(?=\s*(?:$|[;&|]|-\w)))/i.test(
        command
      ) ||
      /:\(\)\s*\{\s*:\|:&\s*;?\s*\}/.test(command) ||
      /\bdd\b[^\r\n]*\bof=\/dev\/(?:sd|nvme|hd)/i.test(command))
  )
    return 'Operasi penghapusan sistem atau disk tidak diizinkan.'
  if (action.fileMutation && action.targets.some((target) => target === path.parse(target).root))
    return 'Akar filesystem tidak boleh diubah melalui tool berkas.'
  if (
    action.fileMutation &&
    args?.recursive &&
    action.targets.some((target) => target === action.root)
  )
    return 'Penghapusan seluruh workspace tidak diizinkan.'
  return null
}

export function redactReview(value, secrets = []) {
  let redacted = false
  const visit = (item, key = '') => {
    if (
      /api.?key|password|secret|authorization|access.?token|refresh.?token|cookie|^(?:token|bearer)$/i.test(
        key
      )
    ) {
      redacted = true
      return '[RAHASIA]'
    }
    if (typeof item === 'string') {
      let text = item
      for (const secret of secrets)
        if (secret.length > 3 && text.includes(secret)) {
          text = text.split(secret).join('[RAHASIA]')
          redacted = true
        }
      const next = text
        .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[RAHASIA]@')
        .replace(
          /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{16,})\b/g,
          '[RAHASIA]'
        )
        .replace(
          /(Bearer\s+)[\w.-]+|((?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s;"']+/gi,
          (_, bearer, prefix) => (bearer || prefix) + '[RAHASIA]'
        )
      redacted ||= next !== text
      return next
    }
    if (Array.isArray(item)) return item.map((entry) => visit(entry))
    if (item && typeof item === 'object')
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, visit(v, k)]))
    return item
  }
  return { value: visit(value), redacted }
}
