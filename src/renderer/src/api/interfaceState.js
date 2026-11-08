import { isMainSession } from '@shared/workspaces.js'

const key = 'mark-interface'
const pendingPanels = new Map()
const panelKey = (id) => (isMainSession(id) ? '1' : String(id))

export function queueWorkspaceRequest(request) {
  pendingPanels.set(panelKey(request.sessionId), request)
}

export function takeWorkspaceRequest(sessionId) {
  const request = pendingPanels.get(panelKey(sessionId))
  pendingPanels.delete(panelKey(sessionId))
  return request
}

export function readInterfaceState() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function saveInterfaceState(patch) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...readInterfaceState(), ...patch }))
  } catch {
    // The current view continues to work when browser storage is unavailable.
  }
}

export function openSession(sessionId, values = {}) {
  window.dispatchEvent(
    new CustomEvent('mark:open-session', {
      detail: { ...values, sessionId: String(sessionId) }
    })
  )
}
