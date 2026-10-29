import { Router } from 'express'
import { mcpStore } from '../memory/db-store.js'
import { mcpVault } from '../services/mcp-vault.js'
import { mcpRuntime } from '../services/mcp-service.js'
import { mcpToolName } from '../services/mcp-runtime.js'
import { wsHub } from '../ws-hub.js'
import { isLocalComputerUseOrigin } from '../tools/computer-use-permissions.js'
export const mcpRouter = Router()
mcpRouter.use('/plugins/mcp', (req, res, next) => {
  if (
    req.method === 'GET' ||
    isLocalComputerUseOrigin(
      req.get('origin'),
      req.socket.localPort,
      process.argv.includes('--dev')
    )
  )
    return next()
  return res
    .status(403)
    .json({ success: false, error: 'Pengelolaan MCP hanya tersedia dari Mark lokal.' })
})
const describe = (entry, includeAuth = false) => ({
  ...entry,
  status: mcpRuntime.status(entry.id),
  tools: mcpRuntime.tools(entry.id),
  authorizationUrl: includeAuth ? mcpRuntime.authorizationUrl(entry.id) : null
})
const updated = (id) => {
  wsHub.broadcast('addon:mcp-status', { id, status: mcpRuntime.status(id) })
  wsHub.broadcast('plugins:updated', { timestamp: Date.now() })
}
const fail = (res, error) => res.status(400).json({ success: false, error: error.message })
function validateSecrets(value, entry) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['token', 'env'].includes(key))
  )
    throw new Error('Kredensial MCP tidak valid.')
  if (value.token !== undefined && typeof value.token !== 'string')
    throw new Error('Token MCP harus berupa teks.')
  if (
    value.env !== undefined &&
    (!value.env ||
      typeof value.env !== 'object' ||
      Array.isArray(value.env) ||
      Object.entries(value.env).some(
        ([key, item]) => !entry.envKeys.includes(key) || typeof item !== 'string'
      ))
  )
    throw new Error('Environment MCP harus berisi nilai teks untuk nama yang dipilih.')
}
mcpRouter.get('/plugins/mcp', (_req, res) =>
  res.json({ success: true, data: mcpStore.list().map((entry) => describe(entry)) })
)
mcpRouter.get('/plugins/mcp/tool-labels', (_req, res) => {
  const labels = Object.fromEntries(
    mcpStore
      .list()
      .flatMap((addon) =>
        (addon.knownTools || []).map((name) => [mcpToolName(addon.id, name), name])
      )
  )
  res.json({ success: true, data: labels })
})
mcpRouter.get('/plugins/mcp/:id', (req, res) => {
  const item = mcpStore.get(req.params.id)
  if (!item) return res.status(404).json({ success: false, error: 'MCP tidak ditemukan.' })
  const sameOrigin =
    req.get('sec-fetch-site') === 'same-origin' ||
    isLocalComputerUseOrigin(
      req.get('origin'),
      req.socket.localPort,
      process.argv.includes('--dev')
    )
  res.json({ success: true, data: describe(item, sameOrigin) })
})
mcpRouter.post('/plugins/mcp', async (req, res) => {
  try {
    const item = mcpStore.save(req.body)
    try {
      if (req.body.secrets) {
        validateSecrets(req.body.secrets, item)
        await mcpVault.write(item.id, req.body.secrets)
      }
    } catch (e) {
      mcpStore.remove(item.id)
      throw e
    }
    updated(item.id)
    res.json({ success: true, data: describe(item) })
  } catch (e) {
    fail(res, e)
  }
})
mcpRouter.patch('/plugins/mcp/:id', async (req, res) => {
  try {
    const old = mcpStore.get(req.params.id)
    if (!old) throw new Error('MCP tidak ditemukan.')
    await mcpRuntime.disconnect(old.id)
    const item = mcpStore.save({ ...old, ...req.body }, old.id)
    const identityChanged = old.type !== item.type || old.url !== item.url || old.auth !== item.auth
    const envChanged = JSON.stringify(old.envKeys) !== JSON.stringify(item.envKeys)
    try {
      if (req.body.secrets) validateSecrets(req.body.secrets, item)
      if (req.body.secrets || identityChanged || envChanged) {
        const previous = await mcpVault.read(old.id)
        if (identityChanged) {
          delete previous.token
          delete previous.oauth
        }
        const next = { ...previous, ...(req.body.secrets || {}) }
        if (req.body.secrets?.env) next.env = { ...(previous.env || {}), ...req.body.secrets.env }
        if (next.env)
          next.env = Object.fromEntries(
            Object.entries(next.env).filter(([key]) => item.envKeys.includes(key))
          )
        await mcpVault.write(old.id, next)
      }
    } catch (error) {
      mcpStore.replaceAll([old], false)
      throw error
    }
    updated(item.id)
    res.json({ success: true, data: describe(item) })
  } catch (e) {
    fail(res, e)
  }
})
mcpRouter.delete('/plugins/mcp/:id', async (req, res) => {
  try {
    await mcpRuntime.disconnect(req.params.id)
    await mcpVault.remove(req.params.id)
    mcpStore.remove(req.params.id)
    updated(req.params.id)
    res.json({ success: true })
  } catch (e) {
    fail(res, e)
  }
})
mcpRouter.post('/plugins/mcp/:id/connect', async (req, res) => {
  try {
    if (req.body?.trusted !== true) throw new Error('Konfirmasi kepercayaan diperlukan.')
    await mcpRuntime.connect(req.params.id)
    res.json({ success: true, data: describe(mcpStore.get(req.params.id), true) })
  } catch {
    const item = mcpStore.get(req.params.id)
    res.status(item && mcpRuntime.status(item.id) === 'needs-login' ? 200 : 400).json({
      success: false,
      error:
        item && mcpRuntime.status(item.id) === 'needs-login'
          ? 'Login OAuth diperlukan.'
          : 'Koneksi MCP gagal. Periksa konfigurasi server.',
      data: item ? describe(item, true) : null
    })
  }
})
mcpRouter.post('/plugins/mcp/:id/disconnect', async (req, res) => {
  try {
    await mcpRuntime.disconnect(req.params.id)
    res.json({ success: true })
  } catch (e) {
    fail(res, e)
  }
})
mcpRouter.post('/plugins/mcp/:id/enabled', async (req, res) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') throw new Error('Status MCP tidak valid.')
    if (!req.body.enabled) await mcpRuntime.disconnect(req.params.id)
    const item = mcpStore.setEnabled(req.params.id, req.body.enabled)
    updated(item.id)
    res.json({ success: true, data: describe(item) })
  } catch (e) {
    fail(res, e)
  }
})
mcpRouter.post('/plugins/mcp/:id/tools', (req, res) => {
  try {
    const available = new Set(mcpRuntime.tools(req.params.id).map((t) => t.name))
    if (
      !Array.isArray(req.body?.enabledTools) ||
      req.body.enabledTools.some((t) => !available.has(t))
    )
      throw new Error('Tool tidak ditemukan di server.')
    const item = mcpStore.setTools(req.params.id, req.body.enabledTools)
    updated(item.id)
    res.json({ success: true, data: describe(item) })
  } catch (e) {
    fail(res, e)
  }
})
