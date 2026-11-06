const transientCodes = new Set([
  'GEMINI_EMPTY',
  'GEMINI_RESPONSE_INCOMPLETE',
  'GEMINI_NETWORK',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN'
])

const explanations = {
  GEMINI_EMPTY: 'Gemini mengembalikan respons tanpa jawaban ringkasan.',
  GEMINI_RESPONSE_INCOMPLETE: 'Koneksi Gemini terputus sebelum seluruh respons diterima.',
  GEMINI_NETWORK: 'Koneksi ke Gemini gagal.',
  GEMINI_UPSTREAM: 'Google menolak request peringkasan.',
  GEMINI_RATE_LIMIT: 'Batas penggunaan Gemini tercapai.',
  GEMINI_AUTH: 'Sesi Google ditolak. Hubungkan ulang akun pada Pengaturan Gemini Web.',
  GEMINI_AUTH_REQUIRED:
    'Sesi Google perlu diperiksa. Selesaikan atau perbarui koneksi akun di Pengaturan.',
  GEMINI_MODEL_MISMATCH: 'Model yang dikembalikan Google tidak sesuai pilihan.',
  GEMINI_PROTOCOL: 'Format respons Gemini tidak valid atau telah berubah.',
  GEMINI_CONTEXT_LENGTH: 'Input bagian ringkasan melebihi anggaran byte Gemini Web.',
  GEMINI_HTTP: 'Gemini mengembalikan kegagalan HTTP.',
  AI_CONFIG_TIMEOUT: 'Konfigurasi AI lokal belum selesai dimuat.',
  COMPACTION_EMPTY: 'Provider tidak mengirim teks ringkasan yang valid.',
  COMPACTION_INCOMPLETE: 'Provider menghentikan ringkasan sebelum selesai.',
  ECONNRESET: 'Koneksi provider terputus.',
  ETIMEDOUT: 'Koneksi provider melewati batas waktu jaringan.',
  EAI_AGAIN: 'Alamat provider belum dapat dihubungi.'
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

export async function requestCompactionSummary({
  request,
  signal,
  onProgress,
  label = 'Merangkum konteks'
}) {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const startedAt = Date.now()
  let heartbeat,
    abort,
    attempt = 0,
    status = 'menunggu ringkasan...'
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
    onProgress?.({ stage: 'summarizing', text: `${label} — ${status}` })
    heartbeat = setInterval(() => {
      onProgress?.({
        stage: 'summarizing',
        text: `${label} — ${Math.floor((Date.now() - startedAt) / 1000)} detik, ${status}`
      })
    }, 5000)
    while (attempt < 3) {
      attempt++
      try {
        const response = await Promise.race([
          interrupted,
          Promise.resolve().then(() => {
            controller.signal.throwIfAborted()
            return request(controller.signal)
          })
        ])
        controller.signal.throwIfAborted()
        if (typeof response?.content !== 'string' || !response.content.trim() || response.error)
          throw Object.assign(new Error(explanations.COMPACTION_EMPTY), {
            code: 'COMPACTION_EMPTY'
          })
        if (response.finishReason && response.finishReason !== 'stop')
          throw Object.assign(new Error(explanations.COMPACTION_INCOMPLETE), {
            code: 'COMPACTION_INCOMPLETE'
          })
        return response.content.trim()
      } catch (cause) {
        controller.signal.throwIfAborted()
        const retryable = transientCodes.has(cause?.code) || cause?.retryable === true
        if (!retryable || attempt === 3) throw cause
        status = `gangguan sementara, mencoba ulang bagian ini (${attempt + 1}/3)...`
        onProgress?.({ stage: 'retrying', text: `${label} — ${status}` })
        await waitForRetry(2000 * attempt, controller.signal)
        status = `menunggu ringkasan, percobaan ${attempt + 1}/3...`
      }
    }
  } catch (cause) {
    if (signal?.aborted) throw signal.reason || cause
    const providerCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(cause?.code || '')
      ? cause.code
      : 'PROVIDER_ERROR'
    const detail = explanations[providerCode] || 'Request ringkasan gagal diproses oleh provider.'
    throw Object.assign(
      new Error(
        `${label} gagal [${providerCode}]: ${detail} Bagian yang sudah berhasil tetap tersimpan; riwayat percakapan tidak dihapus.`
      ),
      {
        code: 'CONTEXT_COMPACTION_FAILED',
        providerCode,
        attempts: attempt,
        cause
      }
    )
  } finally {
    clearInterval(heartbeat)
    signal?.removeEventListener('abort', abort)
  }
}
