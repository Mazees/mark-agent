export const MAX_WAIT_MS = 10000

export function boundedDelay(value, fallback = 300) {
  const delay = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_WAIT_MS)
    throw new Error(`Jeda harus berupa angka antara 0 dan ${MAX_WAIT_MS} ms.`)
  return Math.round(delay)
}

export function parseNativeResult(value) {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value
    if (!result || typeof result !== 'object' || !['success', 'alive'].includes(result.status))
      return {
        success: false,
        executionStatus: result?.executionStatus || 'failed',
        error: result?.message || 'Respons daemon tidak valid.',
        result
      }
    return { success: true, executionStatus: 'executed', verificationStatus: 'unverified', result }
  } catch {
    return {
      success: false,
      executionStatus: 'unknown',
      error: 'Respons daemon tidak dapat dibaca.'
    }
  }
}

export function screenGeometryMatches(a, b) {
  return (
    [
      'screen_x',
      'screen_y',
      'host_width',
      'host_height',
      'window_id',
      'process_id',
      'process_started_at'
    ].every((key) => String(a?.[key] ?? '') === String(b?.[key] ?? '')) &&
    JSON.stringify(a?.window_rect) === JSON.stringify(b?.window_rect)
  )
}

export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Computer Use dihentikan.'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Computer Use dihentikan.'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
