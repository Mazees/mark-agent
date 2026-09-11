import { jsonrepair } from 'jsonrepair'
import {
  getSystemSignature,
  activeAbortControllers,
  createMoodStreamFilter,
  createLMStudioOfflineError,
  isLMStudioOfflineError
} from './ai-utils.js'

export async function executeOpenAIProvider({
  messages,
  tools = null,
  stream = false,
  config = {},
  isSmallTask = false,
  jsonSchema = null,
  signal = null,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onToolCall = null,
  onStatus = null
}) {
  const conf = config || {}

  let formattedMessages = (messages || []).map((m, index) => {
    let sanitizedContent = m.content
    if (Array.isArray(m.content)) {
      if (index < messages.length - 1) {
        sanitizedContent = m.content.find((c) => c.type === 'text')?.text || '[Gambar terlampir]'
      } else {
        sanitizedContent = m.content
      }
    }

    if (
      (m.role === 'assistant' || m.role === 'model') &&
      !sanitizedContent &&
      (!m.tool_calls || m.tool_calls.length === 0)
    ) {
      return {
        ...m,
        role: 'user',
        content: stream
          ? '[Catatan Sistem]: Lanjutkan analisis dan eksekusi tugas berikutnya.'
          : '[Catatan Sistem]: Lanjutkan analisis dan langkah kerja berikutnya.'
      }
    }

    return { ...m, content: sanitizedContent }
  })

  // Sanitasi trailing assistant/model message untuk mencegah error 400 di endpoint OpenAI-compat
  while (
    formattedMessages.length > 0 &&
    (formattedMessages[formattedMessages.length - 1].role === 'assistant' ||
      formattedMessages[formattedMessages.length - 1].role === 'model') &&
    !formattedMessages[formattedMessages.length - 1].content &&
    (!formattedMessages[formattedMessages.length - 1].tool_calls ||
      formattedMessages[formattedMessages.length - 1].tool_calls.length === 0)
  ) {
    formattedMessages.pop()
  }

  if (
    formattedMessages.length > 0 &&
    (formattedMessages[formattedMessages.length - 1].role === 'assistant' ||
      formattedMessages[formattedMessages.length - 1].role === 'model')
  ) {
    formattedMessages.push({
      role: 'user',
      content: stream
        ? '[Instruksi Lanjutan]: Lanjutkan analisis dan eksekusi tugas berikutnya.'
        : 'Lanjutkan analisis dan langkah kerja berikutnya.'
    })
  }

  if (!isSmallTask) {
    const pld = getSystemSignature()
    const sysIdx = formattedMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      formattedMessages[sysIdx].content += `\n\n${pld}`
    } else {
      formattedMessages.unshift({ role: 'system', content: pld })
    }
  }

  let endpoint = 'http://localhost:1234/v1/chat/completions'
  const headers = {
    'Content-Type': 'application/json'
  }

  if (conf.aiProvider === 'custom') {
    endpoint = conf.customEndpoint || 'http://localhost:1234/v1/chat/completions'
    if (conf.customApiKey) {
      headers['Authorization'] = `Bearer ${conf.customApiKey}`
    }
  }

  const model =
    conf.aiProvider === 'custom'
      ? conf.customModel || 'default-model'
      : conf.model || 'local-model'

  // ==========================================
  // 1. STREAMING MODE (Agent ReAct Gateway)
  // ==========================================
  if (stream) {
    const body = {
      stream: true,
      model,
      temperature: Number(conf.temperature) || 0,
      messages: formattedMessages
    }

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools
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

    let moodExtracted = false
    const extractMood = (text) => {
      if (!moodExtracted && text && onMood) {
        const match = text.match(/\[mood:([a-zA-Z_]+)\]/)
        if (match) {
          onMood(match[1].toLowerCase())
          moodExtracted = true
        }
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

      const sseMoodFilter = createMoodStreamFilter(onToken, (mood) => {
        onMood?.(mood)
        moodExtracted = true
      })

      const processContentToken = (token) => {
        accumulatedContent += token
        sseMoodFilter(token)
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

          if (delta.reasoning_content || delta.reasoning) {
            const rToken = delta.reasoning_content || delta.reasoning
            accumulatedReasoning += rToken
            extractMood(rToken)
            onReasoning?.(rToken)
          }

          if (delta.content) {
            processContentToken(delta.content)
          }

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
          sseMoodFilter.flush()
        }
      } else {
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

  // ==========================================
  // 2. NON-STREAMING MODE (Standard fetchAI)
  // ==========================================
  const body = {
    stream: false,
    model,
    temperature: Number(conf.temperature) || 0,
    messages: formattedMessages
  }

  if (jsonSchema) {
    if (conf.aiProvider === 'custom') {
      body.messages = body.messages.map((m) => ({ ...m }))
      const sysIdx = body.messages.findIndex((m) => m.role === 'system')
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

  const parentAbortController = new AbortController()
  activeAbortControllers.add(parentAbortController)

  if (signal) {
    if (signal.aborted) parentAbortController.abort()
    else signal.addEventListener('abort', () => parentAbortController.abort())
  }

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
        headers,
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
        abortController.signal.reason?.message === 'Request Timeout (Tidak ada respon dari server)'
      ) {
        throw new Error('Request Timeout: AI memakan waktu terlalu lama untuk membalas.')
      }
      if (err.name === 'AbortError' || (err.message && err.message.includes('Timeout'))) {
        throw new Error(`Koneksi Timeout: Server API (${endpoint}) nge-gantung lebih dari 5 menit.`)
      }
      const causeStr = err.cause ? ` (${err.cause.message || err.cause.code || err.cause})` : ''
      const enrichedError = new Error(
        `Gagal menghubungi server AI di ${endpoint}: ${err.message}${causeStr}`
      )
      enrichedError.code = err.code || err.cause?.code || 'FETCH_FAILED'
      enrichedError.cause = err
      throw enrichedError
    } finally {
      clearTimeout(timeoutId)
      parentAbortController.signal.removeEventListener(
        'abort',
        abortController.abort.bind(abortController)
      )
      activeAbortControllers.delete(abortController)
    }

    if (!response.ok) {
      const textData = await response.text()
      let errorData = null
      try {
        errorData = JSON.parse(textData)
      } catch (_) {}

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
        const fallbackBody = { ...currentBody }
        fallbackBody.response_format = { type: 'json_object' }

        const fallbackMessages = fallbackBody.messages.map((m) => ({ ...m }))
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
      const finalErrorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)

      const err = new Error(`Gagal memuat AI (${errorProvider}): ${finalErrorMessage}`)
      err.status = response.status
      throw err
    }

    const rawText = await response.text()
    const cleanText = rawText.trim()

    // 1. Tangani jika response berupa JSON Array chunk
    if (cleanText.startsWith('[') && cleanText.endsWith(']')) {
      try {
        const parsedArray = JSON.parse(cleanText)
        if (Array.isArray(parsedArray) && parsedArray.length > 0) {
          let combinedContent = ''
          let reasoning = ''
          const lastId = parsedArray[0]?.id || 'chatcmpl-array-stream'
          const modelName = parsedArray[0]?.model || model
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
              model: modelName,
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

    // 2. Tangani jika response berupa SSE Stream
    if (cleanText.includes('data:') || cleanText.includes('[DONE]')) {
      const lines = cleanText.split('\n')
      let combinedContent = ''
      let reasoning = ''
      let lastId = 'chatcmpl-stream'
      let modelName = model

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const dataStr = trimmed.slice(5).trim()
        if (!dataStr || dataStr === '[DONE]') continue

        try {
          const chunk = JSON.parse(dataStr)
          if (chunk.id) lastId = chunk.id
          if (chunk.model) modelName = chunk.model
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
          model: modelName,
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

    // 3. Tangani jika response berupa NDJSON (JSON Lines)
    if (cleanText.includes('\n{')) {
      const lines = cleanText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
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

    // 4. Tangani JSON standar atau dengan jsonrepair
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

  try {
    const data = await executeFetch(body)

    if (!data) {
      throw new Error('API tidak mengembalikan data respon.')
    }

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

    const choice =
      Array.isArray(processedData.choices) && processedData.choices.length > 0
        ? processedData.choices[0]
        : null
    const message =
      choice?.message ||
      choice?.delta ||
      (processedData.message
        ? processedData.message
        : processedData.response
          ? { content: processedData.response }
          : processedData.result
            ? { content: processedData.result }
            : null)

    let content = ''
    let reasoning = null

    if (message) {
      content = typeof message === 'string' ? message : message.content || message.text || ''
      reasoning = message.reasoning || message.reasoning_content || null
    } else if (typeof processedData === 'string') {
      content = processedData
    } else if (
      processedData.content ||
      processedData.text ||
      processedData.response ||
      processedData.result
    ) {
      content =
        processedData.content ||
        processedData.text ||
        processedData.response ||
        processedData.result ||
        ''
      reasoning = processedData.reasoning || processedData.reasoning_content || null
    } else if (processedData.error) {
      const errMsg =
        typeof processedData.error === 'object'
          ? processedData.error.message || JSON.stringify(processedData.error)
          : processedData.error
      throw new Error(`API mengembalikan error: ${errMsg}`)
    } else {
      throw new Error(
        `Format data API tidak dikenali atau kosong. Balasan mentah: ${JSON.stringify(processedData).slice(0, 150)}`
      )
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
        reasoning =
          (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
      }
    }

    return { content, reasoning }
  } catch (error) {
    if (conf.aiProvider !== 'custom' && isLMStudioOfflineError(error)) {
      throw createLMStudioOfflineError(error)
    }
    throw error
  } finally {
    activeAbortControllers.delete(parentAbortController)
  }
}

