import { getAllConfig } from '../db'
import { jsonrepair } from 'jsonrepair'

/**
 * Frontend AI fetch wrapper.
 * @param {Array} messages - Array of chat messages
 * @param {boolean} [stream=false] - Streaming mode flag
 * @param {Object} [options={}] - tools, signal, isSmallTask, jsonSchema, configOverride, callbacks
 */
export const fetchAI = async (messages, stream = false, options = {}) => {
  const {
    tools = null,
    signal = null,
    isSmallTask = false,
    jsonSchema = null,
    configOverride = null,
    onToken = null,
    onReasoning = null,
    onMood = null,
    onToolCall = null
  } = options

  const currentConfig = await getAllConfig()
  const conf = { ...(currentConfig[0] || {}), ...(configOverride || {}) }

  // 1. Streaming Mode
  if (stream) {
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

    if (window.api?.onAiMood && onMood) {
      unsubMood = window.api.onAiMood((payload) => {
        if (payload?.mood) onMood(payload.mood)
      })
    }

    try {
      const result = await window.api.fetchAI(
        { messages, tools, config: conf, isSmallTask, stream: true },
        signal
      )
      if (result?.toolCalls && onToolCall) {
        onToolCall(result.toolCalls)
      }
      return result
    } finally {
      unsubToken?.()
      unsubMood?.()
    }
  }

  // 2. Non-Streaming Mode
  return window.api.fetchAI(
    { messages, config: conf, isSmallTask, jsonSchema, stream: false },
    signal
  )
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
