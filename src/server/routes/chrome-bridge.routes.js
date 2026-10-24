import { Router } from 'express'
import { chromeBridge } from '../../main/addons/chrome-bridge/service.js'
import { loadAllPlugins } from '../../main/plugins/plugin-loader.js'
import { wsHub } from '../ws-hub.js'
import { spawn } from 'node:child_process'

export function createChromeBridgeRouter(
  service = chromeBridge,
  refreshPlugins = async () => {
    await loadAllPlugins()
    wsHub.broadcast('plugins:updated', { timestamp: Date.now() })
  }
) {
  const router = Router()
  router.post('/addons/chrome-bridge/open-folder', async (_req, res) => {
    const status = await service.getStatus()
    if (!status.installed)
      return res.status(409).json({ success: false, error: 'Pasang addon terlebih dahulu.' })
    const child = spawn('explorer.exe', [status.extensionDirectory], {
      windowsHide: true,
      stdio: 'ignore'
    })
    child.once('error', () =>
      res.status(500).json({ success: false, error: 'Folder ekstensi belum dapat dibuka.' })
    )
    child.once('spawn', () => {
      child.unref()
      res.json({ success: true, data: status })
    })
  })
  router.get('/addons/chrome-bridge/status', async (_req, res) => {
    try {
      res.json({ success: true, data: await service.getStatus() })
    } catch {
      res.status(500).json({ success: false, error: 'Status Chrome Bridge belum tersedia.' })
    }
  })
  for (const operation of ['install', 'uninstall', 'reconnect']) {
    router.post(`/addons/chrome-bridge/${operation}`, async (req, res) => {
      try {
        if (
          operation === 'install' &&
          req.body?.replaceExisting !== undefined &&
          typeof req.body.replaceExisting !== 'boolean'
        ) {
          return res
            .status(400)
            .json({ success: false, error: 'Konfirmasi penggantian tidak valid.' })
        }
        const data = await service[operation]({
          replaceExisting: req.body?.replaceExisting === true
        })
        if (operation !== 'reconnect') await refreshPlugins()
        res.json({ success: true, data })
      } catch (error) {
        res
          .status(error.status || 500)
          .json({ success: false, code: error.code, error: error.message })
      }
    })
  }
  return router
}

export const chromeBridgeRouter = createChromeBridgeRouter()
