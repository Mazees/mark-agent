import { createHash, randomUUID } from 'node:crypto'
const requests = new Map(),
  grants = new Map()
const signature = (tool, args, owner) => {
  const clean = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : args
  if (clean && typeof clean === 'object') delete clean.reason
  return createHash('sha256')
    .update(
      JSON.stringify([
        tool,
        clean,
        String(owner.sessionId || 'default'),
        String(owner.runId || owner.sessionId || 'default')
      ])
    )
    .digest('hex')
}
const prune = () => {
  const now = Date.now()
  for (const map of [requests, grants])
    for (const [key, item] of map) if (item.expires < now) map.delete(key)
}
export function requestMcpPermission(tool, args, owner) {
  prune()
  const id = randomUUID()
  requests.set(id, {
    signature: signature(tool, args, owner),
    owner:
      String(owner.sessionId || 'default') +
      ':' +
      String(owner.runId || owner.sessionId || 'default'),
    expires: Date.now() + 300000
  })
  return id
}
export function decideMcpPermission(id, owner, approved) {
  prune()
  const request = requests.get(id)
  requests.delete(id)
  if (
    !request ||
    request.owner !==
      String(owner.sessionId || 'default') +
        ':' +
        String(owner.runId || owner.sessionId || 'default')
  )
    throw new Error('Permintaan izin telah kedaluwarsa.')
  if (!approved) return null
  const token = randomUUID()
  grants.set(token, request)
  return token
}
export function consumeMcpPermission(token, tool, args, owner) {
  prune()
  const grant = grants.get(token)
  grants.delete(token)
  return Boolean(
    grant &&
    grant.owner ===
      String(owner.sessionId || 'default') +
        ':' +
        String(owner.runId || owner.sessionId || 'default') &&
    grant.signature === signature(tool, args, owner)
  )
}
