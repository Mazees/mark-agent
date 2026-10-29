import { API_BASE, addWebListener, removeWebListener } from '../web-bridge.js'

export async function subagentRequest(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${API_BASE}/api/subagents${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const result = await response.json()
  if (!response.ok || !result.success)
    throw new Error(result.error || 'Layanan Minibot belum tersedia.')
  return result.data
}

export function onSubagentChange(callback) {
  const events = [
    'subagent:updated',
    'subagent:activity',
    'subagent:message',
    'core:ready',
    'db:restored'
  ]
  for (const event of events) addWebListener(event, callback)
  return () => {
    for (const event of events) removeWebListener(event, callback)
  }
}

export async function submitJob(agentId, goal, options = {}) {
  return subagentRequest(`/${encodeURIComponent(agentId)}/jobs`, {
    ...options,
    goal,
    requestId: options.requestId || crypto.randomUUID()
  })
}

export async function sendAgentMessage(agentId, message, options = {}) {
  return subagentRequest(`/${encodeURIComponent(agentId)}/messages`, {
    ...options,
    message,
    requestId: options.requestId || crypto.randomUUID()
  })
}
