import { webApi } from './web-bridge.js'

const states = new Map(),
  listeners = new Set(),
  observations = new Map()
let version = 0
export const browserStateVersion = () => version
export const browserSessionId = (id) =>
  /^1(?:\.0+)?$/.test(String(id)) ? 'main' : `workspace-${id}`
export const getBrowserState = (id) => states.get(id) || null
export const subscribeBrowserState = (callback) => {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
function update(state) {
  if (!state?.sessionId) return
  const previous = states.get(state.sessionId)
  states.set(state.sessionId, {
    ...previous,
    ...state,
    ownedByYou: state.ownedByYou ?? previous?.ownedByYou
  })
  version++
  for (const listener of listeners) listener()
}
webApi.onBrowserPanel('activity', (state) => {
  const { ownedByYou, ...activity } = state
  void ownedByYou
  update(activity)
})
webApi.onBrowserPanel('state', update)
export async function refreshBrowserStates() {
  for (const state of await webApi.getBrowserSessions()) update(state)
}
refreshBrowserStates().catch(() => {})
webApi.onBrowserReconnect(() => refreshBrowserStates().catch(() => {}))
export async function browserCommand(id, action, values) {
  const state = await webApi.browserPanelRequest(id, action, values)
  update(state)
  if (state.observation) observations.set(id, state.observation)
  return state
}
export function browserPaused(id) {
  void id
  return false
}
export function browserRevision(id) {
  return getBrowserState(id)?.revision || 0
}
export async function waitForBrowserAgent(id, signal, onPause = () => {}) {
  if (!browserPaused(id)) return
  onPause(true)
  try {
    await new Promise((resolve, reject) => {
      let off = () => {}
      const cleanup = () => {
        off()
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        reject(new Error('AbortError'))
      }
      off = subscribeBrowserState(() => {
        if (!browserPaused(id)) {
          cleanup()
          resolve()
        }
      })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      else if (!browserPaused(id)) {
        cleanup()
        resolve()
      }
    })
  } finally {
    onPause(false)
  }
}
export async function browserObservation(id, force = false) {
  if (force) await browserCommand(id, 'state')
  if (!getBrowserState(id)?.open || browserPaused(id)) return null
  if (force || !observations.has(id)) await browserCommand(id, 'observe')
  const observation = observations.get(id)
  observations.delete(id)
  return observation
}
export async function withBrowserRequest(id, signal, request) {
  const revision = browserRevision(id),
    controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const off = subscribeBrowserState(() => {
    if (browserPaused(id) || browserRevision(id) !== revision)
      controller.abort(new Error('BROWSER_REPLAN'))
  })
  try {
    if (browserPaused(id)) controller.abort(new Error('BROWSER_REPLAN'))
    const result = await request(controller.signal)
    if (browserPaused(id) || browserRevision(id) !== revision) throw new Error('BROWSER_REPLAN')
    return result
  } catch (error) {
    if (!signal?.aborted && (browserPaused(id) || browserRevision(id) !== revision)) {
      const paused = new Error('Browser berubah saat AI merencanakan aksi.')
      paused.code = 'BROWSER_REPLAN'
      throw paused
    }
    throw error
  } finally {
    off()
    signal?.removeEventListener('abort', abort)
  }
}
