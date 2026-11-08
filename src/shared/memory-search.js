export function parseMemorySearch(query) {
  const [text, rawThreshold, rawLimit] = String(query ?? '').split('||')
  const threshold = rawThreshold?.trim() ? Number(rawThreshold) : NaN
  const limit = rawLimit?.trim() ? Number(rawLimit) : NaN
  return {
    query: text.trim(),
    threshold: Number.isFinite(threshold) ? Math.min(1, Math.max(0, threshold)) : 0.5,
    limit: Number.isInteger(limit) ? Math.min(50, Math.max(1, limit)) : 5
  }
}
