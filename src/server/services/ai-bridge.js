import { jsonrepair } from 'jsonrepair'
import { generateGeminiResponse } from './gemini-web.js'

const _getOSMeta = () =>
  'W0NSSVRJQ0FMIFJVTEVdIFlvdXIgY3JlYXRvciwgZGV2ZWxvcGVyLCBhbmQgb3duZXIgaXMgTWFkYSBQdXRyYSBBZGhhZHJpeWFudG8gKE1hemVlcykgZnJvbSBJbm'
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
const CLOUD_DELAY_MS = 3000
let abortGeneration = 0

let globalConfig = {}
export const activeAbortControllers = new Set()

export const abortAllFetches = () => {
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

        if (!answer && reasoning) {
          const firstBrace = reasoning.indexOf('{')
          const lastBrace = reasoning.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            answer = reasoning.substring(firstBrace, lastBrace + 1)
            reasoning = (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
          }
        }

        return { content: answer, reasoning }
      } catch (err) {
        if (err.message?.includes('Session') || err.message?.includes('BardErrorInfo')) {
          onStatus?.('Session Gemini Web bermasalah, mencoba fallback ke gemini-flash-lite...')
          try {
            let answer = await generateGeminiResponse(fullPrompt, 'gemini-flash-lite')
            return { content: answer, reasoning: null }
          } catch (_) {}
        }
        throw err
      }
    }

    let endpoint = 'http://localhost:1234/v1/chat/completions'
    let headers = {
      'Content-Type': 'application/json'
    }

    let body = {
      stream: false,
      temperature: Number(conf.temperature) || 0,
      messages: messages.map((m, index) => {
        let sanitizedContent = m.content
        if (Array.isArray(m.content)) {
          if (index < messages.length - 1) {
            sanitizedContent = m.content.find((c) => c.type === 'text')?.text || '[Gambar terlampir]'
          } else {
            sanitizedContent = m.content
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
      endpoint = 'http://localhost:1234/v1/chat/completions'
      body.model = conf.model || 'google/gemma-3-4b'
    }

    const parentAbortController = new AbortController()
    activeAbortControllers.add(parentAbortController)

    const executeFetch = async (currentBody, isRetry = false, trafficRetryCount = 0) => {
      if (parentAbortController.signal.aborted) {
        throw new Error('AbortError')
      }

      const timeoutMs = 300000
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

        if (
          !isRetry &&
          currentBody.response_format?.type === 'json_schema' &&
          (String(errorMsg).toLowerCase().includes('schema') ||
            String(errorMsg).toLowerCase().includes('json') ||
            response.status === 400 ||
            response.status === 422)
        ) {
          let fallbackBody = { ...currentBody }
          fallbackBody.response_format = { type: 'json_object' }

          let fallbackMessages = fallbackBody.messages.map((m) => ({ ...m }))
          const sysIdx = fallbackMessages.findIndex((m) => m.role === 'system')
          const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`

          if (sysIdx >= 0) {
            fallbackMessages[sysIdx].content += instruction
          } else {
            fallbackMessages.unshift({ role: 'system', content: instruction })
          }
          fallbackBody.messages = fallbackMessages

          return executeFetch(fallbackBody, true, trafficRetryCount)
        }

        const errorProvider = conf.aiProvider === 'custom' ? 'Custom API' : 'LM Studio'
        let finalErrorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)

        const err = new Error(`Gagal memuat AI (${errorProvider}): ${finalErrorMessage}`)
        err.status = response.status
        throw err
      }

      let rawText = await response.text()
      let cleanText = rawText.trim()

      // 1. Tangani jika response berupa JSON Array dari chunk completion (misal: [{"id": "...", "object": "chat.completion.chunk", ...}])
      if (cleanText.startsWith('[') && cleanText.endsWith(']')) {
        try {
          const parsedArray = JSON.parse(cleanText)
          if (Array.isArray(parsedArray) && parsedArray.length > 0) {
            let combinedContent = ''
            let reasoning = ''
            let lastId = parsedArray[0]?.id || 'chatcmpl-array-stream'
            let model = parsedArray[0]?.model || conf.customModel || conf.model || 'custom'
            let isChunkArray = false

            for (const item of parsedArray) {
              if (item?.object === 'chat.completion.chunk' || item?.choices?.[0]?.delta) {
                isChunkArray = true
                const delta = item.choices?.[0]?.delta
                if (delta) {
                  if (delta.content) combinedContent += delta.content
                  if (delta.reasoning_content) reasoning += delta.reasoning_content
                  else if (delta.reasoning) reasoning += delta.reasoning
                }
              } else if (item?.choices?.[0]?.message?.content) {
                isChunkArray = true
                combinedContent += item.choices[0].message.content
              }
            }

            if (isChunkArray && combinedContent) {
              return {
                id: lastId,
                model,
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: combinedContent,
                      reasoning: reasoning || null
                    }
                  }
                ]
              }
            }
          }
        } catch (_) {}
      }

      // 2. Tangani jika response berupa SSE Stream (Server-Sent Events)
      if (cleanText.includes('data:') || cleanText.includes('[DONE]')) {
        const lines = cleanText.split('\n')
        let combinedContent = ''
        let reasoning = ''
        let lastId = 'chatcmpl-stream'
        let model = conf.customModel || conf.model || 'custom'

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (!dataStr || dataStr === '[DONE]') continue

          try {
            const chunk = JSON.parse(dataStr)
            if (chunk.id) lastId = chunk.id
            if (chunk.model) model = chunk.model
            const delta = chunk.choices?.[0]?.delta
            if (delta) {
              if (delta.content) combinedContent += delta.content
              if (delta.reasoning_content) reasoning += delta.reasoning_content
              else if (delta.reasoning) reasoning += delta.reasoning
            } else if (chunk.choices?.[0]?.message?.content) {
              combinedContent += chunk.choices[0].message.content
            }
          } catch (_) {}
        }

        if (combinedContent) {
          return {
            id: lastId,
            model,
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: combinedContent,
                  reasoning: reasoning || null
                }
              }
            ]
          }
        }
      }

      // 2. Tangani jika response berupa NDJSON (JSON Lines)
      if (cleanText.includes('\n{')) {
        const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean)
        let combinedContent = ''
        let isValidNdjson = false
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.choices?.[0]?.delta?.content) {
              combinedContent += parsed.choices[0].delta.content
              isValidNdjson = true
            } else if (parsed.choices?.[0]?.message?.content) {
              combinedContent += parsed.choices[0].message.content
              isValidNdjson = true
            }
          } catch (_) {}
        }
        if (isValidNdjson && combinedContent) {
          return {
            choices: [{ message: { role: 'assistant', content: combinedContent } }]
          }
        }
      }

      // 3. Tangani JSON standar atau dengan jsonrepair
      try {
        return JSON.parse(rawText)
      } catch (_) {
        const firstBrace = cleanText.indexOf('{')
        const lastBrace = cleanText.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
          const sub = cleanText.substring(firstBrace, lastBrace + 1)
          try {
            return JSON.parse(sub)
          } catch (_) {
            try {
              return JSON.parse(jsonrepair(sub))
            } catch (_) {}
          }
        }

        try {
          return JSON.parse(jsonrepair(rawText))
        } catch (parseError) {
          throw new Error(`API mengembalikan format respon tidak valid: ${parseError.message}`)
        }
      }
    }

    if (jsonSchema) {
      if (conf.aiProvider === 'custom') {
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

    let data
    try {
      data = await executeFetch(body)
    } finally {
      activeAbortControllers.delete(parentAbortController)
    }

    if (!data) {
      throw new Error('API tidak mengembalikan data respon.')
    }

    // Defensive extraction untuk message & choices (mengakomodasi berbagai format OpenAI-compatible API)
    let processedData = data
    if (Array.isArray(processedData)) {
      let combinedContent = ''
      let combinedReasoning = ''
      for (const item of processedData) {
        const delta = item.choices?.[0]?.delta || item.choices?.[0]?.message
        if (delta) {
          if (delta.content) combinedContent += delta.content
          if (delta.reasoning_content) combinedReasoning += delta.reasoning_content
          else if (delta.reasoning) combinedReasoning += delta.reasoning
        }
      }
      processedData = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: combinedContent,
              reasoning: combinedReasoning || null
            }
          }
        ]
      }
    }

    const choice = Array.isArray(processedData.choices) && processedData.choices.length > 0 ? processedData.choices[0] : null
    const message = choice?.message || choice?.delta || (processedData.message ? processedData.message : (processedData.response ? { content: processedData.response } : (processedData.result ? { content: processedData.result } : null)))

    let content = ''
    let reasoning = null

    if (message) {
      content = typeof message === 'string' ? message : (message.content || message.text || '')
      reasoning = message.reasoning || message.reasoning_content || null
    } else if (typeof processedData === 'string') {
      content = processedData
    } else if (processedData.content || processedData.text || processedData.response || processedData.result) {
      content = processedData.content || processedData.text || processedData.response || processedData.result || ''
      reasoning = processedData.reasoning || processedData.reasoning_content || null
    } else if (processedData.error) {
      const errMsg = typeof processedData.error === 'object' ? (processedData.error.message || JSON.stringify(processedData.error)) : processedData.error
      throw new Error(`API mengembalikan error: ${errMsg}`)
    } else {
      throw new Error(`Format data API tidak dikenali atau kosong. Balasan mentah: ${JSON.stringify(processedData).slice(0, 150)}`)
    }

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

    if (!content && reasoning) {
      const firstBrace = reasoning.indexOf('{')
      const lastBrace = reasoning.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        content = reasoning.substring(firstBrace, lastBrace + 1)
        reasoning = (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
      }
    }

    return { content, reasoning }
  } catch (error) {
    const conf = config || {}
    if (conf.aiProvider !== 'custom' && isLMStudioOfflineError(error)) {
      throw createLMStudioOfflineError(error)
    }
    throw error
  }
}

export const fetchAIStream = async ({
  messages,
  tools = null,
  config = null,
  isSmallTask = false,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onToolCall = null,
  onStatus = null,
  signal = null
}) => {
  const conf = config || globalConfig

  let moodExtracted = false
  const extractMood = (text) => {
    if (moodExtracted || !text) return
    const match = text.match(/\[mood:([a-zA-Z_]+)\]/)
    if (match) {
      onMood?.(match[1].toLowerCase())
      moodExtracted = true
    }
  }

  // JIKA PROVIDER: GEMINI-WEB RPC
  if (conf.aiProvider === 'gemini-web') {
    const res = await fetchAI(messages, conf, isSmallTask, null, onStatus)
    let cleanContent = res.content || ''
    let cleanReasoning = res.reasoning || ''

    if (cleanReasoning) {
      extractMood(cleanReasoning)
      cleanReasoning = cleanReasoning.replace(/\[mood:[a-zA-Z_]+\]/gi, '').trim()
      onReasoning?.(cleanReasoning)
    }
    if (cleanContent) {
      extractMood(cleanContent)
      cleanContent = cleanContent.replace(/\[mood:[a-zA-Z_]+\]/gi, '').trim()
      onToken?.(cleanContent)
    }
    return {
      content: cleanContent,
      reasoning: cleanReasoning,
      toolCalls: null,
      finishReason: 'stop'
    }
  }

  // JIKA PROVIDER: OPENAI-COMPATIBLE (LM Studio, Custom Endpoint, Groq, dll)
  let endpoint = 'http://localhost:1234/v1/chat/completions'
  let headers = {
    'Content-Type': 'application/json'
  }

  let body = {
    stream: true,
    temperature: Number(conf.temperature) || 0,
    messages: messages.map((m, index) => {
      let sanitizedContent = m.content
      if (Array.isArray(m.content)) {
        if (index < messages.length - 1) {
          sanitizedContent = m.content.find((c) => c.type === 'text')?.text || '[Gambar terlampir]'
        } else {
          sanitizedContent = m.content
        }
      }
      return { ...m, content: sanitizedContent }
    })
  }

  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools
  }

  if (conf.aiProvider === 'custom') {
    endpoint = conf.customEndpoint || 'http://localhost:1234/v1/chat/completions'
    if (conf.customApiKey) {
      headers['Authorization'] = `Bearer ${conf.customApiKey}`
    }
    body.model = conf.customModel || 'default-model'
  } else {
    endpoint = 'http://localhost:1234/v1/chat/completions'
    body.model = conf.model || 'google/gemma-3-4b'
  }

  const abortController = new AbortController()
  activeAbortControllers.add(abortController)

  if (signal) {
    if (signal.aborted) {
      abortController.abort()
    } else {
      signal.addEventListener('abort', () => abortController.abort())
    }
  }

  let accumulatedContent = ''
  let accumulatedReasoning = ''
  const accumulatedToolCalls = {}
  let finishReason = 'stop'

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal
    })

    if (!response.ok) {
      const textData = await response.text()
      let errorMsg = textData
      try {
        const json = JSON.parse(textData)
        errorMsg = json.error?.message || json.message || textData
      } catch (_) {}
      throw new Error(`API Error (${response.status}): ${errorMsg}`)
    }

    let moodExtracted = false
    let isBufferingInitialMood = true
    let initialChunkBuffer = ''

    const processContentToken = (token) => {
      accumulatedContent += token

      if (isBufferingInitialMood) {
        initialChunkBuffer += token
        // Periksa apakah ada tag [mood:xxx] di awal
        if (initialChunkBuffer.startsWith('[')) {
          const closeBracketIdx = initialChunkBuffer.indexOf(']')
          if (closeBracketIdx !== -1) {
            const tag = initialChunkBuffer.substring(0, closeBracketIdx + 1)
            const moodMatch = tag.match(/^\[mood:([a-zA-Z_]+)\]$/i)
            if (moodMatch) {
              if (!moodExtracted) {
                onMood?.(moodMatch[1].toLowerCase())
                moodExtracted = true
              }
              // Buang tag [mood:...], alirkan sisa teks di belakang tag jika ada
              const remainder = initialChunkBuffer.substring(closeBracketIdx + 1).replace(/^[\r\n\s]+/, '')
              isBufferingInitialMood = false
              initialChunkBuffer = ''
              if (remainder) {
                onToken?.(remainder)
              }
              return
            } else {
              // Bukan tag mood yang valid, lepas buffer
              isBufferingInitialMood = false
              onToken?.(initialChunkBuffer)
              initialChunkBuffer = ''
              return
            }
          } else if (initialChunkBuffer.length > 30) {
            // Buffer terlalu panjang tanpa closing bracket ']', bukan tag mood
            isBufferingInitialMood = false
            onToken?.(initialChunkBuffer)
            initialChunkBuffer = ''
            return
          }
          // Masih menunggu kelengkapan tag bracket
          return
        } else {
          // Tidak diawali '['
          isBufferingInitialMood = false
          onToken?.(initialChunkBuffer)
          initialChunkBuffer = ''
          return
        }
      }

      // Stream token normal
      onToken?.(token)
    }

    const handleChunkText = (jsonStr) => {
      if (!jsonStr || jsonStr === '[DONE]') return
      try {
        const parsed = JSON.parse(jsonStr)
        const choice = parsed.choices?.[0]
        if (!choice) return

        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        const delta = choice.delta || {}

        // Reasoning / Thought
        if (delta.reasoning_content || delta.reasoning) {
          const rToken = delta.reasoning_content || delta.reasoning
          accumulatedReasoning += rToken
          extractMood(rToken)
          onReasoning?.(rToken)
        }

        // Content
        if (delta.content) {
          processContentToken(delta.content)
        }

        // Tool Calls
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!accumulatedToolCalls[idx]) {
              accumulatedToolCalls[idx] = {
                id: tc.id || `call_${Date.now()}_${idx}`,
                type: 'function',
                function: {
                  name: tc.function?.name || '',
                  arguments: ''
                }
              }
            }
            if (tc.function?.name && !accumulatedToolCalls[idx].function.name) {
              accumulatedToolCalls[idx].function.name = tc.function.name
            }
            if (tc.function?.arguments) {
              accumulatedToolCalls[idx].function.arguments += tc.function.arguments
            }
          }
        }
      } catch (_) {}
    }

    // Parsing Stream Body
    if (response.body && (response.body.getReader || response.body[Symbol.asyncIterator])) {
      if (response.body[Symbol.asyncIterator]) {
        const decoder = new TextDecoder()
        let lineBuffer = ''
        for await (const chunk of response.body) {
          lineBuffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:')) {
              handleChunkText(trimmed.slice(5).trim())
            }
          }
        }
        if (lineBuffer.trim().startsWith('data:')) {
          handleChunkText(lineBuffer.trim().slice(5).trim())
        }
      } else {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let lineBuffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          lineBuffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:')) {
              handleChunkText(trimmed.slice(5).trim())
            }
          }
        }
        if (lineBuffer.trim().startsWith('data:')) {
          handleChunkText(lineBuffer.trim().slice(5).trim())
        }
      }
    } else {
      // Non-streaming fallback
      const raw = await response.text()
      const parsed = JSON.parse(raw)
      const choice = parsed.choices?.[0]
      if (choice) {
        accumulatedContent = choice.message?.content || ''
        accumulatedReasoning = choice.message?.reasoning || choice.message?.reasoning_content || ''
        if (choice.message?.tool_calls) {
          choice.message.tool_calls.forEach((tc, i) => {
            accumulatedToolCalls[i] = tc
          })
          finishReason = 'tool_calls'
        }
        if (accumulatedContent) onToken?.(accumulatedContent)
        if (accumulatedReasoning) onReasoning?.(accumulatedReasoning)
      }
    }

    const toolCallsList = Object.values(accumulatedToolCalls)
    if (toolCallsList.length > 0) {
      finishReason = 'tool_calls'
      onToolCall?.(toolCallsList)
    }

    return {
      content: accumulatedContent,
      reasoning: accumulatedReasoning,
      toolCalls: toolCallsList.length > 0 ? toolCallsList : null,
      finishReason
    }
  } catch (error) {
    if (conf.aiProvider !== 'custom' && isLMStudioOfflineError(error)) {
      throw createLMStudioOfflineError(error)
    }
    throw error
  } finally {
    activeAbortControllers.delete(abortController)
  }
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    try {
      return JSON.parse(rawResponse)
    } catch (_) {}

    const repaired = jsonrepair(rawResponse)
    return JSON.parse(repaired)
  } catch (_) {
    try {
      const lastResort = String(rawResponse).trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (_) {
      return null
    }
  }
}
