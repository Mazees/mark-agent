import { API_BASE } from './web-bridge'
export async function mcpRequest(path = '', options = {}) {
  const response = await fetch(`${API_BASE}/api/plugins/mcp${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...(options.body && typeof options.body !== 'string'
      ? { body: JSON.stringify(options.body) }
      : {})
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Permintaan MCP gagal.')
  return result
}
