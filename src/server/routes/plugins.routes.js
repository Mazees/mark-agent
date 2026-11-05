import { Router } from 'express'
import { wsHub } from '../ws-hub.js'
import {
  loadAllPlugins,
  savePluginDefinition,
  togglePluginState,
  deletePlugin
} from '../../main/plugins/plugin-loader.js'
import { executeRequestedTool } from './tool-approvals.routes.js'

export const pluginsRouter = Router()

pluginsRouter.get('/plugins', async (_req, res) => {
  try {
    const plugins = await loadAllPlugins()
    res.json({ success: true, data: plugins })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message })
  }
})

pluginsRouter.post('/plugins/reload', async (_req, res) => {
  try {
    const plugins = await loadAllPlugins()
    wsHub.broadcast('plugins:updated', { timestamp: Date.now() })
    res.json({ success: true, data: plugins })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message })
  }
})

pluginsRouter.post('/plugins/save', async (req, res) => {
  try {
    const manifest = await savePluginDefinition(req.body)
    wsHub.broadcast('plugins:updated', { name: manifest.name, timestamp: Date.now() })
    res.json({ success: true, data: manifest })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message })
  }
})

pluginsRouter.post('/plugins/toggle', async (req, res) => {
  const { name, isEnabled } = req.body || {}
  try {
    const success = await togglePluginState(name, Boolean(isEnabled))
    wsHub.broadcast('plugins:updated', { name, isEnabled, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message })
  }
})

pluginsRouter.delete('/plugins/:name', async (req, res) => {
  const { name } = req.params
  try {
    const success = await deletePlugin(name)
    wsHub.broadcast('plugins:updated', { name, timestamp: Date.now() })
    res.json({ success })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message })
  }
})

pluginsRouter.post('/plugins/execute', async (req, res) => {
  const { action, query, config = {} } = req.body || {}
  try {
    const controller = new AbortController()
    res.once('close', () => { if (!res.writableEnded) controller.abort() })
    const result = await executeRequestedTool(action, query, config, controller.signal)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code })
  }
})
