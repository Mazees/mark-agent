import { randomUUID } from 'node:crypto'
import { execFile, fork } from 'node:child_process'
import { codingStore } from '../memory/db-store.js'
import { wsHub } from '../ws-hub.js'
import { gitEnvironment } from '../../main/git-runtime.js'

const processes = new Map()
const LIMIT = 256000
for (const record of codingStore.list('terminal'))
  if (['running', 'starting'].includes(record.status))
    codingStore.put('terminal', record.id, { ...record, status: 'interrupted' })
export const terminalInfo = (terminal) => ({
  id: terminal.id,
  sessionId: terminal.sessionId,
  root: terminal.root,
  command: terminal.command,
  status: terminal.status,
  pid: terminal.pid,
  exitCode: terminal.exitCode ?? null,
  sequence: terminal.sequence,
  urls: [...terminal.urls],
  createdAt: terminal.createdAt,
  interactive: terminal.interactive
})
function publish(terminal, event, payload) {
  for (const client of terminal.clients) {
    if (event === 'output' && client.bufferedAmount > 256000) continue
    wsHub.send(client, `terminal:${event}`, { terminalId: terminal.id, ...payload })
  }
}
function candidates(terminal, text) {
  const clean = text.replace(new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g'), '')
  const previous = terminal.urls.size
  for (const match of clean.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    try {
      const url = new URL(match[0].replace(/[),.;]+$/, ''))
      if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname)) {
        if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1'
        terminal.urls.add(url.href)
      }
    } catch {
      /* Partial output may end inside a URL. */
    }
  }
  return terminal.urls.size !== previous
}
export function startTerminal({
  id = randomUUID(),
  sessionId = '1',
  root,
  command = '',
  interactive = false,
  codingRunId = null
}) {
  const previous = processes.get(id)
  if (previous) {
    if (
      previous.root !== root ||
      previous.command !== command ||
      previous.sessionId !== String(sessionId)
    )
      throw new Error('ID proses sudah digunakan oleh pekerjaan lain.')
    return terminalInfo(previous)
  }
  if (codingStore.get('terminal', id))
    throw new Error(
      'ID proses sudah tercatat pada sesi sebelumnya. Periksa checkpoint; proses tidak dijalankan ulang otomatis.'
    )
  if (process.platform !== 'win32')
    throw new Error('Terminal interaktif versi ini memerlukan Windows ConPTY.')
  const child = fork(new URL('./terminal-host.js', import.meta.url), [], {
    execArgv: [],
    env: gitEnvironment({}, root),
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  })
  let finished
  const terminal = {
    id,
    sessionId: String(sessionId),
    root,
    command,
    interactive,
    codingRunId,
    pid: null,
    child,
    status: 'starting',
    sequence: 0,
    chunks: [],
    size: 0,
    urls: new Set(),
    clients: new Set(),
    createdAt: Date.now(),
    completion: new Promise((resolve) => (finished = resolve))
  }
  processes.set(id, terminal)
  codingStore.put('terminal', id, terminalInfo(terminal))
  const append = (data) => {
    data = String(data).slice(-LIMIT)
    const chunk = { sequence: ++terminal.sequence, data }
    terminal.chunks.push(chunk)
    terminal.size += data.length
    while (terminal.size > LIMIT && terminal.chunks.length > 1)
      terminal.size -= terminal.chunks.shift().data.length
    terminal.urlTail = (terminal.urlTail || '') + data
    const lineEnd = terminal.urlTail.lastIndexOf('\n')
    if (lineEnd >= 0) {
      if (candidates(terminal, terminal.urlTail.slice(0, lineEnd + 1)))
        wsHub.broadcast('coding:updated', { sessionId: terminal.sessionId, runId: codingRunId })
      terminal.urlTail = terminal.urlTail.slice(lineEnd + 1)
    }
    terminal.urlTail = terminal.urlTail.slice(-4096)
    publish(terminal, 'output', chunk)
  }
  const finish = (exitCode, error) => {
    if (terminal.finished) return
    terminal.finished = true
    clearTimeout(terminal.startTimeout)
    terminal.exitCode = exitCode
    if (error) append(`\r\n[Terminal gagal: ${error}]\r\n`)
    if (['running', 'starting'].includes(terminal.status))
      terminal.status = exitCode === 0 ? 'completed' : 'failed'
    codingStore.put('terminal', id, terminalInfo(terminal))
    publish(terminal, 'exit', terminalInfo(terminal))
    finished(terminalInfo(terminal))
    wsHub.broadcast('coding:updated', { sessionId: terminal.sessionId, runId: codingRunId })
  }
  child.on('message', (message) => {
    if (message.type === 'ready') {
      clearTimeout(terminal.startTimeout)
      terminal.pid = message.pid
      if (terminal.status === 'starting') terminal.status = 'running'
      codingStore.put('terminal', id, terminalInfo(terminal))
      publish(terminal, 'state', terminalInfo(terminal))
      wsHub.broadcast('coding:updated', { sessionId: terminal.sessionId, runId: codingRunId })
    } else if (message.type === 'data') append(message.data)
    else if (message.type === 'exit') finish(message.exitCode, message.error)
  })
  child.stderr.on('data', (data) => append(data.toString()))
  child.once('error', (error) => finish(1, error.message))
  child.once('exit', (code) => finish(code ?? 1))
  terminal.startTimeout = setTimeout(() => {
    stopTerminal(id)
    finish(1, 'Host PTY tidak siap dalam 10 detik.')
  }, 10000)
  child.send({ type: 'start', root, command, interactive })
  wsHub.broadcast('coding:updated', { sessionId: terminal.sessionId, runId: codingRunId })
  return terminalInfo(terminal)
}
export function getTerminal(id, sessionId) {
  const terminal = processes.get(String(id))
  if (!terminal || (sessionId != null && terminal.sessionId !== String(sessionId)))
    throw new Error('Terminal tidak tersedia pada percakapan ini.')
  return terminal
}
export function listTerminals(sessionId) {
  const saved = codingStore.list('terminal', sessionId)
  return saved.map((record) =>
    processes.has(record.id) ? terminalInfo(processes.get(record.id)) : record
  )
}
export function terminalOutput(id, lines = 40, sessionId) {
  const terminal = getTerminal(id, sessionId)
  return {
    ...terminalInfo(terminal),
    output: terminal.chunks
      .map((c) => c.data)
      .join('')
      .split('\n')
      .slice(-Math.max(1, Math.min(500, lines)))
      .join('\n')
  }
}
export function stopTerminal(id, sessionId) {
  const terminal = getTerminal(id, sessionId)
  if (!['running', 'starting'].includes(terminal.status)) return terminalInfo(terminal)
  terminal.status = 'stopped'
  execFile(
    'taskkill',
    ['/PID', String(terminal.child.pid), '/T', '/F'],
    { windowsHide: true },
    () => {}
  )
  return terminalInfo(terminal)
}
export async function runCommand(command, config = {}) {
  const id = config.toolCallId || randomUUID()
  startTerminal({
    id,
    sessionId: config.codingSessionId || config.sessionId || '1',
    root: config.workspaceRoot,
    command,
    codingRunId: config.codingRunId
  })
  const terminal = getTerminal(id)
  const abort = () => stopTerminal(id)
  if (config.signal?.aborted) abort()
  else config.signal?.addEventListener('abort', abort, { once: true })
  let timer
  try {
    const result = await Promise.race([
      terminal.completion,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          stopTerminal(id)
          reject(
            new Error(
              'Perintah melewati 60 detik dan dihentikan. Untuk proses panjang gunakan run-task.'
            )
          )
        }, 60000)
      })
    ])
    const output = terminalOutput(id, 500).output
    return {
      success: result.status === 'completed',
      data: output,
      output,
      exitCode: result.exitCode,
      terminalId: id,
      error:
        result.status === 'completed' ? null : `Proses berakhir dengan status ${result.status}.`
    }
  } finally {
    clearTimeout(timer)
    config.signal?.removeEventListener('abort', abort)
  }
}
export function terminalSocket(payload, client) {
  const { terminalId, sessionId, action } = payload || {}
  if (typeof sessionId !== 'string' || !sessionId)
    throw new Error('Sesi asal terminal wajib disertakan.')
  if (action === 'subscribe' && !processes.has(terminalId)) {
    const saved = codingStore.get('terminal', terminalId)
    if (!saved || saved.sessionId !== sessionId)
      throw new Error('Terminal tidak ditemukan pada percakapan ini.')
    return { ...saved, chunks: [], truncated: true }
  }
  const terminal = getTerminal(terminalId, sessionId)
  if (action === 'subscribe') {
    terminal.clients.add(client)
    const after = Number(payload.afterSequence) || 0
    return {
      ...terminalInfo(terminal),
      chunks: terminal.chunks.filter((c) => c.sequence > after),
      truncated: after > 0 && (terminal.chunks[0]?.sequence || 0) > after + 1
    }
  }
  if (action === 'unsubscribe') {
    terminal.clients.delete(client)
    return { success: true }
  }
  if (!terminal.clients.has(client)) throw new Error('Hubungkan terminal sebelum mengirim input.')
  if (terminal.status !== 'running' && !(terminal.status === 'starting' && action === 'resize'))
    throw new Error('Proses terminal belum siap atau telah berhenti.')
  if (action === 'input')
    terminal.child.send({ type: 'input', data: String(payload.data || '').slice(0, 20000) })
  else if (action === 'resize')
    terminal.child.send({
      type: 'resize',
      cols: Math.round(Math.max(20, Math.min(300, Number(payload.cols) || 100))),
      rows: Math.round(Math.max(5, Math.min(100, Number(payload.rows) || 28)))
    })
  else throw new Error('Perintah terminal tidak dikenal.')
  return { success: true }
}
export function disconnectTerminals(client) {
  for (const terminal of processes.values()) terminal.clients.delete(client)
}
export async function shutdownTerminals() {
  const running = [...processes.values()].filter((p) => !p.finished)
  for (const terminal of running) stopTerminal(terminal.id)
  await Promise.allSettled(running.map((p) => p.completion))
}
