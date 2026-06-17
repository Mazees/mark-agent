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
const CLOUD_DELAY_MS = 2500 // 2.5 seconds delay

let globalConfig = {}

export const setGlobalConfig = (config) => {
  globalConfig = config || {}
}

export const getGlobalConfig = () => globalConfig

export const fetchAI = async (messages, config, isSmallTask = false, jsonSchema = null) => {
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
      body.model = 'llama-3.1-8b-instant'
    } else if (conf.aiProvider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.groqApiKey}`
      body.model = conf.groqModel || 'llama-3.1-8b-instant'
    } else if (conf.aiProvider === 'cerebras') {
      endpoint = 'https://api.cerebras.ai/v1/chat/completions'
      headers['Authorization'] = `Bearer ${conf.cerebrasApiKey}`
      body.model = conf.cerebrasModel || 'llama3.1-8b'
      body.max_completion_tokens = 2048 // Fix for Cerebras TPM assuming 8k/128k tokens
    } else {
      body.model = conf.model || 'google/gemma-3-4b'
    }

    const executeFetch = async (currentBody, isRetry = false, trafficRetryCount = 0) => {
      // --- RATE LIMIT THROTLLING LOGIC (Khusus Cloud) ---
      if (endpoint.includes('groq.com') || endpoint.includes('cerebras.ai')) {
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
      const timeoutMs = endpoint.includes('localhost') ? 120000 : 45000; // 120s for local, 45s for cloud
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(new Error('Request Timeout')), timeoutMs);

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(currentBody),
          signal: abortController.signal
        })
      } catch (err) {
        if (abortController.signal.aborted && abortController.signal.reason?.message === 'Request Timeout') {
          throw new Error('Request Timeout: AI memakan waktu terlalu lama untuk membalas.')
        }
        throw err
      } finally {
        clearTimeout(timeoutId);
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
          console.log('[Auto-Retry] Model gagal menghasilkan JSON murni (strict JSON), fallback tanpa constraint response_format...')

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
              : 'LM Studio'
        let finalErrorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)

        // Auto-retry fallback untuk High Traffic / Rate Limits (503, 429, 500)
        const isHighTraffic = response.status === 429 || response.status >= 500 || finalErrorMessage.toLowerCase().includes('high traffic') || finalErrorMessage.toLowerCase().includes('rate limit');
        if (isHighTraffic && trafficRetryCount < 3 && (endpoint.includes('cerebras.ai') || endpoint.includes('groq.com'))) {
           const backoffDelay = (trafficRetryCount + 1) * 3000; // 3s, 6s, 9s
           console.log(`[High Traffic Auto-Retry] Server sibuk (${response.status}). Mencoba lagi dalam ${backoffDelay}ms... (Percobaan ${trafficRetryCount + 1}/3)`);
           await new Promise((resolve) => setTimeout(resolve, backoffDelay));
           return executeFetch(currentBody, isRetry, trafficRetryCount + 1);
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

    const data = await executeFetch(body)
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
      const lastResort = String(rawResponse).trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}
