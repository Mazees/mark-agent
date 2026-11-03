import {
  startTerminal,
  terminalOutput,
  stopTerminal,
  listTerminals
} from '../server/services/terminal-service.js'

export function spawnBackgroundTask(taskId, command, cwd, config = {}) {
  try {
    if (!taskId || !command) throw new Error('TaskId dan command wajib diisi.')
    const terminal = startTerminal({
      id: taskId,
      command,
      root: cwd || process.cwd(),
      sessionId: config.codingSessionId || config.sessionId || '1',
      codingRunId: config.codingRunId
    })
    return {
      success: true,
      ...terminal,
      taskId: terminal.id,
      message: 'Proses dimulai. Log tersedia melalui read-task-output dan panel Terminal.'
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
export function readBackgroundTaskOutput(taskId, lineCount = 40, sessionId) {
  try {
    return { success: true, taskId, ...terminalOutput(taskId, lineCount, sessionId) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
export function killBackgroundTask(taskId, sessionId) {
  try {
    return { success: true, taskId, ...stopTerminal(taskId, sessionId) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
export function listBackgroundTasks(sessionId) {
  return { success: true, tasks: listTerminals(sessionId) }
}
