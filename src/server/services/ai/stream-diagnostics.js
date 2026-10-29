import { randomUUID } from 'node:crypto'

const traces = new Map()
const MAX_TRACES = 32

export function beginStreamTrace({ requestId, sessionId, provider, model }) {
  const id = randomUUID()
  const trace = {
    id,
    requestId: typeof requestId === 'string' ? requestId.slice(0, 80) : null,
    sessionId: sessionId == null ? null : String(sessionId).slice(0, 80),
    provider,
    model: String(model).slice(0, 120),
    startedAt: Date.now(),
    phase: 'connecting',
    active: true,
    bytes: 0,
    events: 0,
    parseErrors: 0,
    lastDataAt: null,
    lastTokenAt: null,
    finishReason: null,
    usageReceived: false
  }
  while (traces.size >= MAX_TRACES) traces.delete(traces.keys().next().value)
  traces.set(id, trace)
  return trace
}

export function finishStreamTrace(trace, errorCode = null) {
  trace.active = false
  trace.endedAt = Date.now()
  trace.phase = errorCode ? 'failed' : 'completed'
  trace.errorCode = errorCode
}

export function getStreamDiagnostics() {
  const now = Date.now()
  return [...traces.values()].reverse().map((trace) => ({
    ...trace,
    elapsedMs: (trace.endedAt || now) - trace.startedAt,
    silenceMs: now - (trace.lastDataAt || trace.startedAt)
  }))
}
