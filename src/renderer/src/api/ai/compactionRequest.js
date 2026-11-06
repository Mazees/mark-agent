export async function requestCompactionSummary({ request, signal, onProgress, label }) {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const startedAt = Date.now()
  let heartbeat, abort
  try {
    const interrupted = new Promise((_, reject) => {
      abort = () => {
        const reason = signal.reason || new DOMException('Dibatalkan pengguna.', 'AbortError')
        controller.abort(reason)
        reject(reason)
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
    onProgress?.({ stage: 'summarizing', text: `${label} — menunggu ringkasan...` })
    heartbeat = setInterval(() => {
      onProgress?.({
        stage: 'summarizing',
        text: `${label} — ${Math.floor((Date.now() - startedAt) / 1000)} detik, menunggu ringkasan...`
      })
    }, 5000)
    const response = await Promise.race([
      interrupted,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return request(controller.signal)
      })
    ])
    signal?.throwIfAborted()
    if (typeof response?.content !== 'string' || !response.content.trim() || response.error)
      throw new Error('Model tidak menghasilkan ringkasan konteks yang valid.')
    if (response.finishReason && response.finishReason !== 'stop')
      throw new Error('Ringkasan terpotong atau belum selesai.')
    return response.content.trim()
  } catch (cause) {
    if (signal?.aborted) throw signal.reason || cause
    throw Object.assign(
      new Error(
        'Peringkasan konteks gagal. Riwayat percakapan tetap tersimpan; coba lanjutkan kembali.'
      ),
      { code: 'CONTEXT_COMPACTION_FAILED', cause }
    )
  } finally {
    clearInterval(heartbeat)
    signal?.removeEventListener('abort', abort)
  }
}
