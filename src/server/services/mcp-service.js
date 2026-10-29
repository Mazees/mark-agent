import { mcpStore } from '../memory/db-store.js'
import { mcpVault } from './mcp-vault.js'
import { createMcpRuntime } from './mcp-runtime.js'
import { wsHub } from '../ws-hub.js'
export const mcpRuntime = createMcpRuntime({
  store: mcpStore,
  vault: mcpVault,
  onChange: (id, status) => {
    wsHub.broadcast('addon:mcp-status', { id, status })
    wsHub.broadcast('plugins:updated', { timestamp: Date.now() })
  }
})
export function mcpGroups() {
  const addons = mcpStore
    .list()
    .filter((addon) => addon.enabled && mcpRuntime.status(addon.id) === 'connected')
  const alias = (addon) =>
    addon.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || addon.id
  return Object.fromEntries(
    addons.map((addon) => [
      addon.id,
      {
        kind: 'mcp',
        displayName: addon.name,
        mention:
          addons.filter((other) => alias(other) === alias(addon)).length === 1
            ? alias(addon)
            : addon.id,
        description: addon.description,
        tools: mcpRuntime.available(addon.id).map(({ type, function: fn }) => ({
          type,
          function: { ...fn, description: `MCP ${addon.name}: ${fn.description}` }
        }))
      }
    ])
  )
}
export function findMcpTool(name) {
  for (const addon of mcpStore.list()) {
    const item = mcpRuntime.available(addon.id).find((tool) => tool.function.name === name)
    if (item) return { addon, item }
  }
  return null
}
export async function executeMcpTool(name, args, signal) {
  const match = findMcpTool(name)
  if (!match) return { success: false, error: 'Tool MCP tidak tersedia atau dinonaktifkan.' }
  try {
    const secret = await mcpVault.read(match.addon.id)
    if (!args?.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments))
      return { success: false, error: 'Argumen MCP harus berupa objek arguments.' }
    const result = await mcpRuntime.call(match.addon.id, match.item.originalName, args.arguments, {
      signal
    })
    const sensitive = [
      secret.token,
      ...Object.values(secret.env || {}),
      secret.oauth?.tokens?.access_token,
      secret.oauth?.tokens?.refresh_token,
      secret.oauth?.clientInformation?.client_secret
    ].filter((value) => typeof value === 'string' && value.length > 0)
    const redact = (value) =>
      typeof value === 'string'
        ? sensitive.reduce((text, part) => text.split(part).join('[RAHASIA]'), value)
        : Array.isArray(value)
          ? value.map(redact)
          : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
            : value
    const text = redact(
      (result.content || [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n')
    )
    const image = (result.content || []).find((item) => item.type === 'image')
    const unsupported = (result.content || []).some(
      (item) => !['text', 'image'].includes(item.type)
    )
    return {
      success: !result.isError,
      data: {
        text,
        structuredContent: redact(result.structuredContent),
        ...(unsupported ? { note: 'Sebagian jenis hasil MCP belum didukung.' } : {})
      },
      ...(image ? { dataUrl: `data:${image.mimeType};base64,${image.data}` } : {}),
      ...(result.isError ? { error: text || 'Tool MCP gagal.' } : {})
    }
  } catch {
    return {
      success: false,
      error:
        'Pemanggilan tool MCP gagal atau dibatalkan. Hasil aksi mungkin tidak diketahui; periksa keadaan sebelum mencoba lagi.'
    }
  }
}
