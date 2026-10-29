import { Router } from 'express'
import { dbStore } from '../memory/db-store.js'
import { createTaskWorkflow, recoverTaskWorkflows } from '../services/task-workflow.js'
import { subagentRuntime } from '../services/subagents/service.js'
import { wsHub } from '../ws-hub.js'
import {
  spawnBackgroundTask,
  readBackgroundTaskOutput,
  killBackgroundTask,
  listBackgroundTasks
} from '../../main/task-daemon.js'

import path from 'path'
import os from 'os'
import fs from 'fs'

export const tasksRouter = Router()
export const taskWorkflow = createTaskWorkflow(dbStore)
// A restart preserves the active checkpoint; it never retries an uncertain action.
recoverTaskWorkflows(dbStore)
const workflowRoute = (operation) => async (req, res) => {
  try {
    const task = taskWorkflow[operation](req.params.id, req.body || {})
    if (task.status === 'cancelled') {
      for (const job of subagentRuntime.jobs().filter((j) => j.taskId === task.id))
        subagentRuntime.cancel(job.id)
    }
    wsHub.broadcast('task:updated', task)
    res.json({ success: true, data: task })
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message })
  }
}
tasksRouter.post('/tasks/workflow', (req, res) => {
  try {
    const task = taskWorkflow.create(req.body || {})
    wsHub.broadcast('task:updated', task)
    res.json({ success: true, data: task })
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message })
  }
})
tasksRouter.get('/tasks/:id/workflow', (req, res) =>
  res.json({ success: true, data: taskWorkflow.snapshot(req.params.id) })
)
for (const [suffix, operation] of Object.entries({
  complete: 'complete',
  plan: 'revise',
  control: 'control',
  finalize: 'finalize'
}))
  tasksRouter.post('/tasks/:id/' + suffix, workflowRoute(operation))

// Reading the suggested path does not create an artifact folder.
tasksRouter.get('/tasks/artifacts-dir', (_req, res) => {
  const artifactsDir = path.join(os.homedir(), 'Documents', 'Mark Tasks')
  res.json({ success: true, data: artifactsDir })
})

// Pastikan subfolder task dibuat di disk sebelum dibuka
tasksRouter.post('/tasks/ensure-dir', (req, res) => {
  const { dirPath } = req.body || {}
  try {
    const target = dirPath
      ? path.normalize(dirPath)
      : path.join(os.homedir(), 'Documents', 'Mark Tasks')
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true })
    }
    res.json({ success: true, data: target })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

const managedTask = (id) => dbStore.agentTasks.getById(id)?.planVersion != null
const rejectManaged = (req, res, next) => {
  const step = dbStore.agentTaskSteps.getById(req.params.id)
  const items = Array.isArray(req.body) ? req.body : [req.body || {}]
  const managed = req.path.includes('/steps')
    ? managedTask(step?.taskId) ||
      items.some((item) =>
        managedTask(item.taskId || item.task_id || dbStore.agentTaskSteps.getById(item.id)?.taskId)
      )
    : managedTask(req.params.id || req.body?.id) || req.body?.planVersion != null
  if (managed)
    return res
      .status(409)
      .json({ success: false, error: 'Gunakan operasi workflow transaksional.' })
  next()
}
for (const method of ['post', 'put', 'delete']) {
  tasksRouter[method]('/tasks/steps', rejectManaged)
  tasksRouter[method]('/tasks/steps/batch', rejectManaged)
  tasksRouter[method]('/tasks/steps/:id', rejectManaged)
}
tasksRouter.post('/tasks', rejectManaged)
tasksRouter.put('/tasks/:id', rejectManaged)

// Step Routes (Wajib didaftarkan sebelum wildcard /tasks/:id)
tasksRouter.get('/tasks/steps', (_req, res) => {
  res.json({ success: true, data: dbStore.agentTaskSteps.getAll() })
})

tasksRouter.post('/tasks/steps/batch', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body]
  const records = dbStore.agentTaskSteps.insertBatch(items)
  res.json({ success: true, data: records })
})

tasksRouter.get('/tasks/steps/:id', (req, res) => {
  const { id } = req.params
  const step = dbStore.agentTaskSteps.getById(id)
  res.json({ success: true, data: step })
})

tasksRouter.post('/tasks/steps', (req, res) => {
  try {
    const item = req.body || {}
    if (item.taskId && !item.task_id) item.task_id = item.taskId
    if (item.id) {
      const existing = dbStore.agentTaskSteps.getById(item.id)
      if (existing) {
        const record = dbStore.agentTaskSteps.update(item.id, item)
        return res.json({ success: true, data: record })
      }
    }
    const record = dbStore.agentTaskSteps.insert(item)
    res.json({ success: true, data: record })
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: err.message })
  }
})

tasksRouter.put('/tasks/steps/:id', (req, res) => {
  try {
    const { id } = req.params
    const item = req.body || {}
    if (item.taskId && !item.task_id) item.task_id = item.taskId
    const record = dbStore.agentTaskSteps.update(id, item)
    res.json({ success: true, data: record })
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: err.message })
  }
})

tasksRouter.delete('/tasks/steps/:id', (req, res) => {
  const { id } = req.params
  const success = dbStore.agentTaskSteps.delete(id)
  res.json({ success })
})

// Task Collection & ID Routes
tasksRouter.get('/tasks', (_req, res) => {
  res.json({ success: true, data: dbStore.agentTasks.getAll() })
})

tasksRouter.get('/tasks/:id/steps', (req, res) => {
  const { id } = req.params
  const allSteps = dbStore.agentTaskSteps.getAll()
  const taskSteps = allSteps.filter((s) => s.task_id === id || s.taskId === id)
  res.json({ success: true, data: taskSteps })
})

tasksRouter.get('/tasks/:id', (req, res) => {
  const { id } = req.params
  const task = dbStore.agentTasks.getById(id)
  res.json({ success: true, data: task })
})

tasksRouter.post('/tasks', (req, res) => {
  try {
    const item = req.body || {}
    if (item.id) {
      const existing = dbStore.agentTasks.getById(item.id)
      if (existing) {
        const record = dbStore.agentTasks.update(item.id, item)
        return res.json({ success: true, data: record })
      }
    }
    const record = dbStore.agentTasks.insert(item)
    res.json({ success: true, data: record })
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: err.message })
  }
})

tasksRouter.put('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params
    const record = dbStore.agentTasks.update(id, req.body)
    res.json({ success: true, data: record })
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: err.message })
  }
})
tasksRouter.delete('/tasks/:id', (req, res) => {
  const id = req.params.id
  for (const job of subagentRuntime.jobs().filter((j) => j.taskId === id))
    subagentRuntime.cancel(job.id)
  const success = dbStore.sqlite.transaction(() => {
    dbStore.sqlite.prepare('DELETE FROM agent_task_steps WHERE task_id=?').run(id)
    return dbStore.agentTasks.delete(id)
  })()
  res.json({ success })
})

// Background Task Daemon API
tasksRouter.post('/tasks/daemon/spawn', (req, res) => {
  const { taskId, command, cwd } = req.body || {}
  const result = spawnBackgroundTask(taskId, command, cwd)
  res.json(result)
})

tasksRouter.get('/tasks/daemon/:taskId/output', (req, res) => {
  const { taskId } = req.params
  const lineCount = parseInt(req.query.lines, 10) || 40
  const result = readBackgroundTaskOutput(taskId, lineCount)
  res.json(result)
})

tasksRouter.post('/tasks/daemon/:taskId/kill', (req, res) => {
  const { taskId } = req.params
  const result = killBackgroundTask(taskId)
  res.json(result)
})

tasksRouter.get('/tasks/daemon/list', (_req, res) => {
  const result = listBackgroundTasks()
  res.json(result)
})
