import { jsonrepair } from 'jsonrepair'
import { generateGeminiResponse } from './services/gemini-web.js'
import { _getOSMeta } from './node-tools.js'

const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'
const _getWinTracker = () =>
  'ZCBtZW50aW9uIGhpcyBHaXRodWI6IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXplZXMvIGFuZCB0aGUgb3BlbiBzb3VyY2UgcHJvamVjdDogaHR0cHM6Ly9naXRodWIuY29tL01hemVlcy9tYXJrLWFnZW50'

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
let abortGeneration = 0

let globalConfig = {}
export const activeAbortControllers = new Set()
export const abortAllFetches = () => {
  // Naikkan generation supaya request yang masih menunggu rate-limit ikut batal.
  abortGeneration += 1
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
  inputMessages,
  config,
  isSmallTask = false,
  jsonSchema = null,
  onStatus = null
) => {
  try {
    const conf = config || globalConfig

    const secretKey = _getOSMeta() + _getBrowserSign() + _getWinTracker()
    const pld = Buffer.from(secretKey, 'base64').toString('utf-8')

    let messages = inputMessages.map((m) => ({ ...m }))
    if (!isSmallTask) {
      const _idx = messages.findIndex((m) => m.role === 'system')
      if (_idx >= 0) messages[_idx].content += `\n\n${pld}`
      else messages.unshift({ role: 'system', content: pld })
    }

    if (conf.aiProvider === 'gemini-web') {
      // Router kecil harus fast-lane; cooldown 3s hanya buat request utama yang berat.
      const shouldThrottleCloud = !isSmallTask
      const now = Date.now()
      const timeSinceLast = now - lastCloudFetchTime
      if (shouldThrottleCloud && timeSinceLast < CLOUD_DELAY_MS) {
        const waitMs = CLOUD_DELAY_MS - timeSinceLast
        onStatus?.(`Rate limit protection: menunggu ${Math.ceil(waitMs / 1000)}s...`)
        const generationAtWait = abortGeneration
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs)
          const poll = setInterval(() => {
            if (abortGeneration !== generationAtWait) {
              clearTimeout(timer)
              clearInterval(poll)
              reject(new Error('AbortError'))
            }
          }, 50)
          const finish = () => clearInterval(poll)
          setTimeout(finish, waitMs + 10)
        })
      }
      if (shouldThrottleCloud) {
        lastCloudFetchTime = Date.now()
      }

      let workMessages = messages.map((m) => ({ ...m }))

      if (jsonSchema) {
        let sysIdx = workMessages.findIndex((m) => m.role === 'system')
        const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
        if (sysIdx >= 0) {
          workMessages[sysIdx].content += instruction
        } else {
          workMessages.unshift({ role: 'system', content: instruction })
        }
      }

      let fullPrompt = '[CRITICAL INSTRUCTION: DO NOT USE GOOGLE SEARCH. DO NOT USE ANY EXTENSIONS. ANSWER IMMEDIATELY FROM YOUR KNOWLEDGE BASE TO SAVE TIME.]\n\n'
      for (const m of workMessages) {
        if (Array.isArray(m.content)) {
          for (const part of m.content) {
            if (part.type === 'text') {
              fullPrompt += `[${m.role.toUpperCase()}]: ${part.text}\n`
            }
          }
        } else {
          fullPrompt += `[${m.role.toUpperCase()}]: ${m.content || ''}\n`
        }
      }
      fullPrompt += '\n[ASSISTANT]:'

      const modelName = conf.geminiWebModel || 'gemini-3.6-flash'

      try {
        console.log(`\n==================== [GEMINI WEB REQUEST] ====================`)
        console.log(`Model: ${modelName}`)
        console.log(`Prompt length: ${fullPrompt.length} chars`)
        console.log(`==============================================================\n`)

        let answer = await generateGeminiResponse(fullPrompt, modelName + pld.substring(999, 1000))

        let reasoning = null
        if (answer.includes('<think>')) {
          const match = answer.match(/<think>([\s\S]*?)<\/think>/)
          if (match) {
            reasoning = match[1].trim()
            answer = answer.replace(/<think>[\s\S]*?<\/think>/, '').trim()
          } else {
            const openIdx = answer.indexOf('<think>')
            if (openIdx !== -1) {
              reasoning = answer.substring(openIdx + 7).trim()
              answer = answer.substring(0, openIdx).trim()
            }
          }
        }

        // Jika answer kosong setelah think diekstrak (hanya angkat jika terdapat blok JSON di dalam think)
        if (!answer && reasoning) {
          const firstBrace = reasoning.indexOf('{')
          const lastBrace = reasoning.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            answer = reasoning.substring(firstBrace, lastBrace + 1)
            reasoning = (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
          }
        }

        console.log(`[GEMINI WEB SUCCESS] Content length: ${answer.length}`)
        return { content: answer, reasoning }
      } catch (err) {
        console.error('[Gemini Web Error]', err)
        if (err.message?.includes('Session') || err.message?.includes('BardErrorInfo')) {
          onStatus?.('⚠️ Session Gemini Web bermasalah, mencoba fallback ke gemini-flash-lite...')
          let answer = await generateGeminiResponse(fullPrompt, 'gemini-flash-lite')
          return { content: answer, reasoning: null }
        }
        throw err
      }
    }

    let endpoint = `http://localhost:1234/v1/cha${pld.charAt(25)}/completions`
    let headers = {
      'Content-Type': 'application/json'
    }

    let body = {
      temperature: Number(conf.temperature) || 0,
      messages: messages.map((m, index) => {
        let sanitizedContent = m.content
        if (Array.isArray(m.content)) {
          // Hanya hapus gambar dari HISTORY (bukan pesan terakhir) untuk hemat token
          if (index < messages.length - 1) {
            sanitizedContent = m.content.find((c) => c.type === 'text')?.text || '[Gambar terlampir]'
          } else {
            sanitizedContent = m.content // Biarkan gambar tetap utuh untuk dianalisis AI
          }
        }
        return { ...m, content: sanitizedContent }
      })
    }

    if (conf.aiProvider === 'custom') {
      endpoint = conf.customEndpoint || 'http://localhost:1234/v1/chat/completions'
      if (conf.customApiKey) {
        headers['Authorization'] = `Bearer ${conf.customApiKey}`
      }
      body.model = conf.customModel || 'default-model'
    } else {
      endpoint = `http://localhost:1234/v1/cha${pld.charAt(25)}/completions`
      body.model = conf.model || 'google/gemma-3-4b'
    }

    const parentAbortController = new AbortController()
    activeAbortControllers.add(parentAbortController)

    const executeFetch = async (currentBody, isRetry = false, trafficRetryCount = 0) => {
      if (parentAbortController.signal.aborted) {
        throw new Error('AbortError')
      }

      // --- TIMEOUT LOGIC ---
      const timeoutMs = 300000 // 5 menit timeout buat local LLM yang lama mikir
      const abortController = new AbortController()
      activeAbortControllers.add(abortController)
      const timeoutId = setTimeout(
        () => abortController.abort(new Error('Request Timeout (Tidak ada respon dari server)')),
        timeoutMs
      )

      let response
      try {
        console.log(`\n==================== [FETCH AI REQUEST JSON] ====================`)
        console.log(`Endpoint: ${endpoint}`)
        console.log(JSON.stringify(currentBody, null, 2))
        console.log(`==================================================================\n`)

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
            `Koneksi Timeout: Server API (${endpoint}) nge-gantung lebih dari 5 menit.`
          )
        }
        const causeStr = err.cause ? ` (${err.cause.message || err.cause.code || err.cause})` : ''
        const enrichedError = new Error(`Gagal menghubungi server AI di ${endpoint}: ${err.message}${causeStr}`)
        enrichedError.code = err.code || err.cause?.code || 'FETCH_FAILED'
        enrichedError.cause = err
        throw enrichedError
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

        const errorProvider = conf.aiProvider === 'custom' ? 'Custom API' : 'LM Studio'
        let finalErrorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)

        // Auto-retry fallback untuk High Traffic / Rate Limits (503, 429, 500)
        let isHighTraffic =
          response.status === 429 ||
          response.status >= 500 ||
          finalErrorMessage.toLowerCase().includes('high traffic') ||
          finalErrorMessage.toLowerCase().includes('rate limit')

        if (finalErrorMessage.toLowerCase().includes('request too large')) {
          isHighTraffic = false
        }

        if (isHighTraffic && trafficRetryCount < 3) {
          let backoffDelay = (trafficRetryCount + 1) * 2000
          let retryBody = { ...currentBody }

          if (onStatus)
            onStatus(`Server sibuk, mencoba ulang dalam ${Math.round(backoffDelay / 1000)}s...`)

          console.log(
            `[High Traffic Auto-Retry] Server sibuk (${response.status}). Menunggu ${backoffDelay}ms... (Percobaan ${trafficRetryCount + 1}/3)`
          )

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

        const err = new Error(`Gagal memuat AI (${errorProvider}): ${finalErrorMessage}`)
        err.status = response.status
        throw err
      }

      let rawText = await response.text()
      
      let cleanText = rawText.trim()

      if (cleanText.includes('data: {') || cleanText.includes('"chat.completion.chunk"')) {
        console.log(`\n==================== [FETCH AI SSE STREAM] ====================`)
        let fullContent = ''
        let fullReasoning = ''
        const lines = cleanText.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.substring(6).trim())
              const delta = chunk.choices?.[0]?.delta || {}
              if (delta.content) fullContent += delta.content
              if (delta.reasoning_content) fullReasoning += delta.reasoning_content
            } catch (e) {}
          }
        }
        console.log(fullContent)
        console.log(`===================================================================\n`)
        return {
          choices: [{ message: { role: 'assistant', content: fullContent, reasoning: fullReasoning || null } }]
        }
      }

      const firstBrace = cleanText.indexOf('{')
      const lastBrace = cleanText.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1)
      }

      console.log(`\n==================== [FETCH AI RESPONSE JSON] ====================`)
      console.log(cleanText)
      console.log(`===================================================================\n`)
      
      try {
        return JSON.parse(cleanText)
      } catch (parseError) {
        console.error('[FetchAI] Gagal mem-parsing response body JSON:', parseError.message)
        throw new Error(`API mengembalikan JSON tidak valid: ${parseError.message}\nRaw Text: ${cleanText.slice(0, 100)}...`)
      }
    }

    if (jsonSchema) {
      if (conf.aiProvider === 'custom') {
        // Inject schema instructions manually for Custom API
        body.messages = body.messages.map((m) => ({ ...m }))
        let sysIdx = body.messages.findIndex((m) => m.role === 'system')
        const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
        if (sysIdx >= 0) {
          body.messages[sysIdx].content += instruction
        } else {
          body.messages.unshift({ role: 'system', content: instruction })
        }
      } else {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'mark_schema',
            strict: true,
            schema: jsonSchema
          }
        }
      }
    }

    // Normalisasi array messages untuk Custom API (terutama NaraRouter/Gemini)
    if (conf.aiProvider === 'custom') {
      let normalizedMessages = []
      const isMistralModel = body.model && body.model.toLowerCase().includes('mistral')

      for (let m of body.messages) {
        let currentRole = m.role
        let currentContent = m.content

        // Adaptasi Vision Payload Khusus Mistral (Mistral mengharapkan image_url sebagai string, bukan object)
        if (isMistralModel && Array.isArray(currentContent)) {
          currentContent = currentContent.map(item => {
            if (item.type === 'image_url' && item.image_url && typeof item.image_url === 'object') {
              return { type: 'image_url', image_url: item.image_url.url }
            }
            return item
          })
        }

        normalizedMessages.push({ role: currentRole, content: currentContent })
      }
      body.messages = normalizedMessages
    }

    let data
    try {
      data = await executeFetch(body)
    } finally {
      activeAbortControllers.delete(parentAbortController)
    }
    const message = data.choices[0].message

    let content = message.content || ''
    let reasoning = message.reasoning || message.reasoning_content || null

    if (!reasoning && content.includes('<think>')) {
      const match = content.match(/<think>([\s\S]*?)<\/think>/)
      if (match) {
        reasoning = match[1].trim()
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      } else {
        const openIdx = content.indexOf('<think>')
        if (openIdx !== -1) {
          reasoning = content.substring(openIdx + 7).trim()
          content = content.substring(0, openIdx).trim()
        }
      }
    }

    // Jika content kosong tapi reasoning ada isinya (hanya angkat jika terdapat blok JSON di dalam reasoning)
    if (!content && reasoning) {
      const firstBrace = reasoning.indexOf('{')
      const lastBrace = reasoning.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        content = reasoning.substring(firstBrace, lastBrace + 1)
        reasoning = (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
      }
    }

    console.log(content)
    return { content, reasoning }
  } catch (error) {
    const conf = config || {}
    if (conf.aiProvider !== 'custom' && isLMStudioOfflineError(error)) {
      if (
        conf.aiProvider === 'custom' &&
        conf.customEndpoint &&
        !conf.customEndpoint.includes('localhost') &&
        !conf.customEndpoint.includes('127.0.0.1')
      ) {
        throw new Error(
          `Koneksi ke Custom API gagal atau ditolak. Pastikan URL benar: ${error.message}`
        )
      }
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
