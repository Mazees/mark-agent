import { randomUUID } from 'node:crypto'

const requests = new Map()
const grants = new Map()
const key = ({ sessionId = 'default', runId }) =>
  String(sessionId) + ':' + String(runId || sessionId)
const expiresIn = 5 * 60 * 1000

export function isLocalComputerUseOrigin(value, port, development = false) {
  try {
    const origin = new URL(value)
    return (
      origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
      (Number(origin.port || 80) === port || (development && origin.port === '5173'))
    )
  } catch {
    return false
  }
}

function prune() {
  const now = Date.now()
  for (const map of [requests, grants])
    for (const [id, value] of map) if (value.expires <= now) map.delete(id)
}

export function requestComputerUsePermission(owner) {
  prune()
  const requestId = randomUUID()
  requests.set(requestId, { owner: key(owner), expires: Date.now() + expiresIn })
  return requestId
}

export function grantComputerUsePermission(owner) {
  prune()
  const token = randomUUID()
  grants.set(token, { owner: key(owner), expires: Date.now() + expiresIn })
  return token
}

export function decideComputerUsePermission(requestId, owner, approved) {
  prune()
  const request = requests.get(requestId)
  requests.delete(requestId)
  if (!request || request.owner !== key(owner))
    throw new Error('Permintaan izin sesi tidak berlaku atau sudah kedaluwarsa.')
  return approved === true ? grantComputerUsePermission(owner) : null
}

export function consumeComputerUsePermission(token, owner) {
  prune()
  const grant = grants.get(token)
  grants.delete(token)
  return Boolean(grant && grant.owner === key(owner))
}
