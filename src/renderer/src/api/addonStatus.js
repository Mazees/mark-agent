import { ADDONS } from './addonRegistry'
import { webApi } from './web-bridge'
import { mcpRequest } from './mcp'

const readConnectionStatus = async (provider) => {
  if (provider === 'chrome-bridge') return (await webApi.chromeBridgeRequest()).status
  if (provider === 'google') {
    const result = await webApi.googleStatus()
    if (!result?.success) throw new Error(result?.error || 'Status koneksi tidak tersedia.')
    return result.isConnected ? 'connected' : 'disconnected'
  }

  if (provider === 'telegram') {
    const result = await webApi.tgGetStatus()
    if (!result?.success || !result.status) {
      throw new Error(result?.error || 'Status koneksi tidak tersedia.')
    }
    return ['connected', 'connecting'].includes(result.status) ? result.status : 'disconnected'
  }

  return 'unavailable'
}

export const addonStatusLabels = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  checking: 'Memeriksa koneksi',
  connected: 'Terhubung',
  connecting: 'Menghubungkan',
  disconnected: 'Belum terhubung',
  'needs-login': 'Perlu login',
  error: 'Gagal',
  'not-installed': 'Belum dipasang',
  'waiting-extension': 'Menunggu ekstensi',
  'select-tab': 'Pilih tab',
  paused: 'Dijeda'
}

export const getAddonStatuses = async () => {
  const entries = await Promise.all(
    ADDONS.map(async (addon) => {
      try {
        return [addon.id, await readConnectionStatus(addon.statusProvider)]
      } catch {
        return [addon.id, 'error']
      }
    })
  )
  return Object.fromEntries(entries)
}

export const formatAddonStatusesForPrompt = async () => {
  const [statuses, custom] = await Promise.all([
    getAddonStatuses(),
    mcpRequest()
      .then((result) => result.data || [])
      .catch(() => [])
  ])
  return [
    ...ADDONS.map((addon) => ({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      capabilities: addon.capabilities,
      detailRoute: `/addons/${addon.id}`,
      status: statuses[addon.id] || 'unavailable'
    })),
    ...custom.map((addon) => ({
      id: addon.id,
      name: `MCP ${addon.name}`,
      description: addon.description,
      capabilities: (addon.tools || [])
        .filter((tool) => tool.enabled)
        .map((tool) => tool.title || tool.name),
      detailRoute: `/plugins/mcp/${addon.id}`,
      status: addon.enabled ? addon.status : 'inactive'
    }))
  ]
}
