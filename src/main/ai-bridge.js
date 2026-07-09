import { jsonrepair } from 'jsonrepair'

const LM_STUDIO_OFFLINE_MESSAGE = 'LM Studio mati atau belum jalan. Nyalakan dulu di port 1234.'

const createLMStudioOfflineError = (cause) => {
  const error = new Error(LM_STUDIO_OFFLINE_MESSAGE)
  error.code = 'LM_STUDIO_OFFLINE'
  if (cause) error.cause = cause
  return error
}

const isLMStudioOfflineError = (error) => {
  return (
    error?.code === 'LM_STUDIO_OFFLINE' ||
    error?.name === 'TypeError' ||
    error?.message?.includes('Failed to fetch') ||
    error?.message?.includes('fetch') ||
    error?.message?.includes('ECONNREFUSED')
  )
}

let lastCloudFetchTime = 0
const CLOUD_DELAY_MS = 3000 // 3 seconds delay biar aman dari rate limit (Gemini/Groq/Custom)

let globalConfig = {}
export const activeAbortControllers = new Set()
export const abortAllFetches = () => {
  activeAbortControllers.forEach((controller) => {
    try {
      controller.abort(new Error('User Aborted'))
    } catch (e) {}
  })
}

export const setGlobalConfig = (config) => {
  globalConfig = config || {}
}

export const getGlobalConfig = () => globalConfig

export const fetchAI = async (
  messages,
  config,
  isSmallTask = false,
  jsonSchema = null,
  onStatus = null
) => {
  try {
    const conf = config || globalConfig

    let endpoint = 'http://localhost:1234/v1/chat/completions'
    let headers = {
      'Content-Type': 'application/json'
    }

    // Only use secondary model if primary provider is Groq
    const useSecondary =
      isSmallTask && conf.useSecondaryModel && conf.aiProvider === 'groq' && conf.groqApiKey

    let body = {
      temperature: Number(conf.temperature) || 0,
      messages: messages
    }

    if (useSecondary) {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.groqApiKey}`
      body.model = 'openai/gpt-oss-20b'
    } else if (conf.aiProvider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.groqApiKey}`
      body.model = conf.groqModel || 'openai/gpt-oss-20b'
    } else if (conf.aiProvider === 'cerebras') {
      endpoint = 'https://api.cerebras.ai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.cerebrasApiKey}`
      body.model = conf.cerebrasModel || 'llama3.1-8b'
      body.max_completion_tokens = 2048 // Fix for Cerebras TPM assuming 8k/128k tokens
    } else if (conf.aiProvider === 'custom') {
      endpoint = conf.customEndpoint || 'http://localhost:1234/v1/chat/completions'
      if (conf.customApiKey) {
        headers['Authorization'] = `Bearer ${conf.customApiKey}`
      }
      body.model = conf.customModel || 'default-model'
    } else {
      body.model = conf.model || 'google/gemma-3-4b'
    }

    // Set max_tokens to prevent truncation, tapi jangan terlalu gede buat API gratisan Groq/OpenRouter
    if (conf.aiProvider === 'groq') {
      body.max_tokens = 2048 // Diubah dari 8192 ke 2048 biar ga meledak TPM-nya Groq
    }

    const parentAbortController = new AbortController()
    activeAbortControllers.add(parentAbortController)

    const executeFetch = async (currentBody, isRetry = false, trafficRetryCount = 0) => {
      if (parentAbortController.signal.aborted) {
        throw new Error('AbortError')
      }
      // --- RATE LIMIT THROTLLING LOGIC (Berlaku buat SEMUA API cloud/berbayar/gratis biar gak jebol) ---
      if (!endpoint.includes('localhost') && !endpoint.includes('127.0.0.1')) {
        const now = Date.now()
        const timeSinceLastFetch = now - lastCloudFetchTime
        if (timeSinceLastFetch < CLOUD_DELAY_MS) {
          const delay = CLOUD_DELAY_MS - timeSinceLastFetch
          console.log(`[Rate Limit Guard] Waiting ${delay}ms before next Cloud request...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        lastCloudFetchTime = Date.now()
      }

      // --- TIMEOUT LOGIC ---
      const timeoutMs = 60000 // 60s timeout buat koneksi ngadat
      const abortController = new AbortController()
      activeAbortControllers.add(abortController)
      const timeoutId = setTimeout(
        () => abortController.abort(new Error('Request Timeout (Tidak ada respon dari server)')),
        timeoutMs
      )

      let response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(currentBody),
          signal: abortController.signal
        })
        clearTimeout(timeoutId)
      } catch (err) {
        clearTimeout(timeoutId)
        if (parentAbortController.signal.aborted) {
          throw new Error('AbortError')
        }
        if (
          abortController.signal.reason?.message ===
          'Request Timeout (Tidak ada respon dari server)'
        ) {
          throw new Error('Request Timeout: AI memakan waktu terlalu lama untuk membalas.')
        }
        if (err.name === 'AbortError' || (err.message && err.message.includes('Timeout'))) {
          throw new Error(
            `Koneksi Timeout: Server API (${endpoint}) nge-gantung lebih dari 60 detik.`
          )
        }
        throw err
      } finally {
        clearTimeout(timeoutId)
        parentAbortController.signal.removeEventListener(
          'abort',
          abortController.abort.bind(abortController)
        )
      }

      if (!response.ok) {
        const textData = await response.text()
        let errorData = null
        try {
          errorData = JSON.parse(textData)
        } catch (e) {}

        const errorMsg =
          errorData?.error?.message || errorData?.message || response.statusText || textData

        // Auto-retry fallback jika JSON Schema tidak di-support oleh model
        if (
          !isRetry &&
          currentBody.response_format?.type === 'json_schema' &&
          (String(errorMsg).toLowerCase().includes('schema') ||
            String(errorMsg).toLowerCase().includes('json') ||
            response.status === 400 ||
            response.status === 422)
        ) {
          console.log('[Auto-Retry] Model tidak support json_schema, fallback ke json_object...')

          let fallbackBody = { ...currentBody }
          fallbackBody.response_format = { type: 'json_object' }

          // Inject schema ke prompt
          let fallbackMessages = fallbackBody.messages.map((m) => ({ ...m }))
          const sysIdx = fallbackMessages.findIndex((m) => m.role === 'system')
          const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`

          if (sysIdx >= 0) {
            fallbackMessages[sysIdx].content += instruction
          } else {
            fallbackMessages.unshift({ role: 'system', content: instruction })
          }
          fallbackBody.messages = fallbackMessages

          return executeFetch(fallbackBody, true, trafficRetryCount) // Retry sekali dengan json_object
        }

        // Auto-retry fallback jika json_object gagal divalidasi (karena format markdown/extra teks)
        if (
          currentBody.response_format?.type === 'json_object' &&
          (String(errorMsg).toLowerCase().includes('validate json') ||
            String(errorMsg).toLowerCase().includes('failed to validate') ||
            String(errorMsg).toLowerCase().includes('json') ||
            response.status === 400 ||
            response.status === 422)
        ) {
          console.log(
            '[Auto-Retry] Model gagal menghasilkan JSON murni (strict JSON), fallback tanpa constraint response_format...'
          )

          let fallbackBody = { ...currentBody }
          delete fallbackBody.response_format

          // Jika awalnya tidak dari json_schema (isRetry === false), kita belum inject schema manual
          if (!isRetry && jsonSchema) {
            let fallbackMessages = fallbackBody.messages.map((m) => ({ ...m }))
            const sysIdx = fallbackMessages.findIndex((m) => m.role === 'system')
            const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`

            if (sysIdx >= 0) {
              fallbackMessages[sysIdx].content += instruction
            } else {
              fallbackMessages.unshift({ role: 'system', content: instruction })
            }
            fallbackBody.messages = fallbackMessages
          }

          return executeFetch(fallbackBody, true, trafficRetryCount) // Retry tanpa constraint format
        }

        const errorProvider =
          conf.aiProvider === 'groq'
            ? 'Groq API'
            : conf.aiProvider === 'cerebras'
              ? 'Cerebras API'
              : conf.aiProvider === 'custom'
                ? 'Custom API'
                : 'LM Studio'
        let finalErrorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)

        // Auto-retry fallback untuk High Traffic / Rate Limits (503, 429, 500)
        let isHighTraffic =
          response.status === 429 ||
          response.status >= 500 ||
          finalErrorMessage.toLowerCase().includes('high traffic') ||
          finalErrorMessage.toLowerCase().includes('rate limit') ||
          finalErrorMessage.toLowerCase().includes('tpm')

        // PENTING: Kalau errornya "Request too large", ini bukan masalah server sibuk yang bisa selesai dengan nunggu!
        // Ini berarti ukuran pesan (tokens) lebih besar dari batasan maksimal tier (misal tier gratis cuma 6000 TPM).
        // Nunggu sampai lebaran pun request ini nggak bakal lolos, jadi jangan dilooping!
        if (finalErrorMessage.toLowerCase().includes('request too large')) {
          isHighTraffic = false
        }

        if (isHighTraffic && trafficRetryCount < 5) {
          // Cek apakah server ngasih tau harus nunggu berapa detik (khusus Groq 429)
          let backoffDelay = (trafficRetryCount + 1) * 3000
          const timeMatch = finalErrorMessage.match(/Please try again in ([0-9.]+)s/)
          if (timeMatch) {
            // Kalau disuruh nunggu 14 detik, kita nunggu 14.5 detik biar aman
            backoffDelay = Math.ceil(parseFloat(timeMatch[1]) * 1000) + 500
          }

          let retryBody = { ...currentBody }

          // Kalau server ngasih instruksi nunggu (timeMatch ada), HARGAI instruksi server.
          // Jangan maksa nge-spam tiap 1 detik karena API gateway akan terus nge-blokir.
          if (endpoint.includes('groq.com')) {
            const backupModels = ['openai/gpt-oss-20b'] // Hanya gunakan model yang didukung!
            const nextModel = backupModels[trafficRetryCount % backupModels.length]
            retryBody.model = nextModel
            console.log(`[Model Swap] Mark ganti haluan instan ke ${nextModel}`)

            // Kalau nggak ada timeMatch (nggak disuruh nunggu spesifik), boleh jeda cepat
            if (!timeMatch) {
              backoffDelay = 2000
            }
          }

          if (onStatus)
            onStatus(`Server sibuk, mencoba ulang dalam ${Math.round(backoffDelay / 1000)}s...`)

          console.log(
            `[High Traffic Auto-Retry] Server sibuk (${response.status}). Menunggu ${backoffDelay}ms... (Percobaan ${trafficRetryCount + 1}/5)`
          )

          // Abortable sleep
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, backoffDelay)
            if (parentAbortController.signal.aborted) {
              clearTimeout(timer)
              reject(new Error('AbortError'))
            }
            parentAbortController.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('AbortError'))
            })
          })

          return executeFetch(retryBody, isRetry, trafficRetryCount + 1)
        }

        if (
          finalErrorMessage.includes('Rate limit reached') ||
          finalErrorMessage.includes('Too Many Requests') ||
          finalErrorMessage.includes('limit exceeded')
        ) {
          const timeMatch = finalErrorMessage.match(/Please try again in ([0-9.]+s)/)
          if (timeMatch) {
            finalErrorMessage = `Limit token Anda habis. Silakan coba lagi dalam ${timeMatch[1]}.`
          } else {
            finalErrorMessage = `Limit token ${errorProvider} Anda habis. Silakan tunggu beberapa saat.`
          }
        }

        const err = new Error(`Gagal memuat AI (${errorProvider}): ${finalErrorMessage}`)
        err.status = response.status
        throw err
      }

      return response.json()
    }

    if (jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'mark_schema',
          strict: true,
          schema: jsonSchema
        }
      }
    }

    let data
    try {
      data = await executeFetch(body)
    } finally {
      activeAbortControllers.delete(parentAbortController)
    }
    const message = data.choices[0].message

    let content = message.content || ''
    let reasoning = message.reasoning || null

    if (!reasoning && content.includes('<think>')) {
      const match = content.match(/<think>([\s\S]*?)<\/think>/)
      if (match) {
        reasoning = match[1].trim()
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      }
    }

    console.log(content)
    return { content, reasoning }
  } catch (error) {
    const conf = config || {}
    if (
      conf.aiProvider !== 'groq' &&
      conf.aiProvider !== 'cerebras' &&
      isLMStudioOfflineError(error)
    ) {
      throw createLMStudioOfflineError(error)
    }

    throw error
  }
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    // 1. Parse langsung tanpa modifikasi (paling aman)
    try {
      return JSON.parse(rawResponse)
    } catch (_) {}

    // 2. Gunakan jsonrepair untuk membereskan json berantakan dari LLM
    const repaired = jsonrepair(rawResponse)
    return JSON.parse(repaired)
  } catch (error) {
    console.error('Gagal Parse JSON menggunakan jsonrepair:', error)
    // Upaya terakhir: coba bersihkan BOM dan extract ulang manual
    try {
      const lastResort = String(rawResponse)
        .trim()
        .replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}
