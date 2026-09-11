import { Router } from 'express'
import { dbStore } from '../memory/db-store.js'
import {
  spawnBackgroundTask,
  readBackgroundTaskOutput,
  killBackgroundTask,
  listBackgroundTasks
} from '../../main/task-daemon.js'

import path from 'path'
import os from 'os'

export const tasksRouter = Router()

// Artifacts directory helper
tasksRouter.get('/tasks/artifacts-dir', (_req, res) => {
  const artifactsDir = path.join(os.homedir(), 'Documents', 'Mark Tasks')
  res.json({ success: true, data: artifactsDir })
})

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
  const item = req.body
  const record = dbStore.agentTaskSteps.insert(item)
  res.json({ success: true, data: record })
})

tasksRouter.put('/tasks/steps/:id', (req, res) => {
  const { id } = req.params
  const record = dbStore.agentTaskSteps.update(id, req.body)
  res.json({ success: true, data: record })
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
  const item = req.body
  const record = dbStore.agentTasks.insert(item)
  res.json({ success: true, data: record })
})

tasksRouter.delete('/tasks/:id', (req, res) => {
  const { id } = req.params
  const allSteps = dbStore.agentTaskSteps.getAll()
  for (const step of allSteps) {
    if (step.task_id === id || step.taskId === id) {
      dbStore.agentTaskSteps.delete(step.id)
    }
  }
  const success = dbStore.agentTasks.delete(id)
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
