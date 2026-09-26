import { getAllConfig } from '../db.js'
import { jsonrepair } from 'jsonrepair'
import { resolveAbortSignal } from '../web-bridge.js'

/**
 * Frontend AI fetch wrapper.
 * @param {Array} messages - Array of chat messages
 * @param {boolean} [stream=false] - Streaming mode flag
 * @param {Object} [options={}] - tools, signal, isSmallTask, jsonSchema, configOverride, callbacks
 */
export const fetchAI = async (messages, stream = false, options = {}) => {
  let actualStream = stream
  let actualOptions = options

  if (typeof stream === 'object' && stream !== null) {
    actualOptions = stream
    actualStream = Boolean(actualOptions.stream)
  } else {
    actualStream = Boolean(stream)
  }

  const {
    tools = null,
    signal = null,
    isSmallTask = false,
    jsonSchema = null,
    configOverride = null,
    onToken = null,
    onReasoning = null,
    onMood = null,
    onMeta = null,
    onToolCall = null,
    sessionId = null
  } = actualOptions

  const currentConfig = await getAllConfig()
  const conf = { ...(currentConfig[0] || {}), ...(configOverride || {}) }
  const cleanSignal = resolveAbortSignal(signal)

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__LAST_AI__ = {
      messages,
      tools,
      options: actualOptions,
      stream: actualStream,
      timestamp: new Date().toISOString()
    }
    const msgCount = Array.isArray(messages) ? messages.length : 0
    console.groupCollapsed(
      `%c[MARK AI Request]%c ${actualStream ? 'Stream' : 'Fetch'} (${msgCount} msgs) › ketik __LAST_AI__ di console`,
      'color: #22c55e; font-weight: bold;',
      'color: inherit;'
    )
    console.log('Messages:', messages)
    if (tools) console.log('Tools:', tools)
    console.log('Options:', actualOptions)
    console.groupEnd()
  }

  // 1. Streaming Mode
  if (actualStream) {
    let unsubToken = null
    let unsubMood = null

    if (window.api?.onAiToken && (onToken || onReasoning)) {
      unsubToken = window.api.onAiToken((payload) => {
        if (!payload?.token) return
        if (payload.type === 'thought') {
          onReasoning?.(payload.token)
        } else {
          onToken?.(payload.token)
        }
      })
    }

    let unsubMeta = null
    if (window.api?.onAiMood && onMood) {
      unsubMood = window.api.onAiMood((payload) => {
        if (payload?.mood) onMood(payload.mood)
      })
    }

    if (window.api?.onAiMarkMeta && onMeta) {
      unsubMeta = window.api.onAiMarkMeta((payload) => {
        if (payload) onMeta(payload)
      })
    }

    try {
      const result = await window.api.fetchAI(
        { messages, tools, config: conf, isSmallTask, stream: true, sessionId },
        cleanSignal
      )
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__LAST_AI_RESULT__ = result
        console.log('[MARK AI Result]', result)
      }
      if (result?.toolCalls && onToolCall) {
        onToolCall(result.toolCalls)
      }
      return result
    } finally {
      unsubToken?.()
      unsubMood?.()
      unsubMeta?.()
    }
  }

  // 2. Non-Streaming Mode
  const result = await window.api.fetchAI(
    { messages, config: conf, isSmallTask, jsonSchema, stream: false, sessionId },
    cleanSignal
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__LAST_AI_RESULT__ = result
    console.log('[MARK AI Result]', result)
  }
  return result
}

/**
 * Utilitas pembersih dan parser JSON untuk respons model AI.
 */
export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    if (typeof rawResponse === 'object') {
      if (
        rawResponse.thought !== undefined ||
        rawResponse.action !== undefined ||
        rawResponse.answer !== undefined
      ) {
        return rawResponse
      }
      const val =
        rawResponse.content || rawResponse.reasoning || rawResponse.text || rawResponse.message
      if (typeof val === 'string' && val.trim()) rawResponse = val
      else return rawResponse
    }

    const text = String(rawResponse).trim()

    // 1. Coba JSON murni
    try {
      return JSON.parse(text)
    } catch (_) {}

    // 2. Bersihkan blok markdown ```json ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const candidate = (codeBlockMatch ? codeBlockMatch[1] : text).trim()

    try {
      return JSON.parse(candidate)
    } catch (_) {}

    // 3. Cari batas kurung terluar { ... }
    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const sub = candidate.substring(firstBrace, lastBrace + 1)
      try {
        return JSON.parse(sub)
      } catch (_) {
        try {
          return JSON.parse(jsonrepair(sub))
        } catch (_) {}
      }
    }

    // 4. Fallback jsonrepair
    return JSON.parse(jsonrepair(candidate))
  } catch (_) {
    return null
  }
}
