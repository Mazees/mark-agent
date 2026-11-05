import { Agent } from 'undici'

const dispatcher = new Agent()
const localTimeouts = Object.freeze({
  connectMs: 120000,
  firstTokenMs: 180000,
  idleMs: 180000,
  progressMs: 300000,
  bufferedMs: 300000
})
const customTimeouts = Object.freeze({
  connectMs: 240000,
  firstTokenMs: 240000,
  idleMs: 420000,
  progressMs: 600000,
  bufferedMs: 420000
})

export function getProviderTimeouts(provider) {
  if (provider !== 'custom') return { ...localTimeouts }
  const override = Number(process.env.MARK_CUSTOM_AI_TIMEOUT_MS)
  if (Number.isFinite(override) && override >= 1000 && override <= 1800000)
    return Object.fromEntries(Object.keys(customTimeouts).map((key) => [key, override]))
  return { ...customTimeouts }
}

export function fetchProviderResponse(endpoint, options, provider) {
  if (provider !== 'custom') return fetch(endpoint, options)
  // Keep Node's HTTP deadline beyond Mark's explicit watchdogs, including buffered inference.
  const transportTimeout = Math.max(...Object.values(getProviderTimeouts(provider))) + 1000
  return fetch(endpoint, {
    ...options,
    dispatcher: {
      dispatch(request, handler) {
        return dispatcher.dispatch(
          { ...request, headersTimeout: transportTimeout, bodyTimeout: transportTimeout },
          handler
        )
      }
    }
  })
}
