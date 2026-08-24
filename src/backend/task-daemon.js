import { spawn } from 'child_process'

const activeTasks = new Map()

/**
 * Menjalankan background terminal task secara non-blocking
 */
export function spawnBackgroundTask(taskId, command, cwd) {
  if (!taskId || !command) {
    return { success: false, message: 'TaskId dan command wajib diisi.' }
  }

  if (activeTasks.has(taskId)) {
    killBackgroundTask(taskId)
  }

  const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: cwd || process.cwd(),
    shell: true
  })

  const taskState = {
    id: taskId,
    command,
    pid: child.pid,
    outputBuffer: [],
    status: 'running',
    startedAt: Date.now(),
    process: child
  }

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    taskState.outputBuffer.push(...lines)
    if (taskState.outputBuffer.length > 300) {
      taskState.outputBuffer.splice(0, taskState.outputBuffer.length - 300)
    }
  })

  child.stderr.on('data', (data) => {
    taskState.outputBuffer.push(`[STDERR] ${data.toString()}`)
    if (taskState.outputBuffer.length > 300) {
      taskState.outputBuffer.splice(0, taskState.outputBuffer.length - 300)
    }
  })

  child.on('close', (code) => {
    taskState.status = code === 0 ? 'completed' : 'failed'
    taskState.exitCode = code
  })

  child.on('error', (err) => {
    taskState.status = 'error'
    taskState.error = err.message
  })

  activeTasks.set(taskId, taskState)
  return {
    success: true,
    taskId,
    pid: child.pid,
    message: `Background task '${taskId}' berhasil dijalankan (PID: ${child.pid}). Gunakan 'read-task-output' untuk melihat log atau 'kill-task' untuk menghentikan.`
  }
}

/**
 * Membaca output log terbaru dari background task
 */
export function readBackgroundTaskOutput(taskId, lineCount = 40) {
  const task = activeTasks.get(taskId)
  if (!task) return { success: false, message: `Task '${taskId}' tidak ditemukan.` }

  const lines = task.outputBuffer.slice(-1 * lineCount)
  return {
    success: true,
    taskId,
    status: task.status,
    pid: task.pid,
    output: lines.join('\n').trim() || '(Belum ada output teks dari proses ini)'
  }
}

/**
 * Menghentikan background task
 */
export function killBackgroundTask(taskId) {
  const task = activeTasks.get(taskId)
  if (!task) return { success: false, message: `Task '${taskId}' tidak ditemukan.` }

  try {
    task.process.kill('SIGTERM')
  } catch (e) {
    try {
      task.process.kill()
    } catch (_) {}
  }

  activeTasks.delete(taskId)
  return { success: true, message: `Task '${taskId}' (PID: ${task.pid}) berhasil dihentikan.` }
}

/**
 * Mendapatkan daftar seluruh background tasks yang aktif
 */
export function listBackgroundTasks() {
  const list = []
  for (const [id, t] of activeTasks.entries()) {
    list.push({
      taskId: id,
      command: t.command,
      pid: t.pid,
      status: t.status,
      startedAt: t.startedAt
    })
  }
  return { success: true, count: list.length, tasks: list }
}
