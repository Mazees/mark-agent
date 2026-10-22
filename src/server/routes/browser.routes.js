import { Router } from 'express'
import {
  browserStates,
  browserPanelCommand,
  disconnectBrowserClient
} from '../../main/browser-panel-runtime.js'
import '../../main/browser-agent.js'
import { wsHub } from '../ws-hub.js'
import { dbStore } from '../memory/db-store.js'

const validSession = (id) => id === 'main' || (typeof id === 'string' && id.startsWith('workspace-') && !!dbStore.sessions.getById(id.slice(10)))

export const browserRouter = Router()
browserRouter.get('/browser/sessions', (_req, res) =>
  res.json({ success: true, data: browserStates().filter(state => validSession(state.sessionId)) })
)
wsHub.on('browser-panel:command', async (payload, client) => {
  if (!client.browserPanelAllowed)
    throw new Error('Kontrol browser hanya tersedia dari WebUI Mark.')
  if (!validSession(payload?.sessionId) && !['unsubscribe', 'job-stop'].includes(payload?.action)) throw new Error('Percakapan browser tidak ditemukan.')
  if (!client.browserPanelCleanup) {
    client.browserPanelCleanup = true
    client.once('close', () => disconnectBrowserClient(client).catch(() => {}))
    client.once('error', () => disconnectBrowserClient(client).catch(() => {}))
  }
  return browserPanelCommand(payload, client)
})
