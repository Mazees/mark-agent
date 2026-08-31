import { getAllConfig } from '../db'
import { jsonrepair } from 'jsonrepair'

export const fetchAIStream = async ({
  messages,
  tools = null,
  signal = null,
  isSmallTask = false,
  configOverride = null,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onToolCall = null
}) => {
  const currentConfig = await getAllConfig()
  const conf = { ...(currentConfig[0] || {}), ...(configOverride || {}) }

  let unsubToken = null
  let unsubMood = null

  if (window.api && window.api.onAiToken && (onToken || onReasoning)) {
    unsubToken = window.api.onAiToken((payload) => {
      if (payload && payload.token) {
        if (payload.type === 'thought') {
          onReasoning?.(payload.token)
        } else {
          onToken?.(payload.token)
        }
      }
    })
  }

  if (window.api && window.api.onAiMood && onMood) {
    unsubMood = window.api.onAiMood((payload) => {
      if (payload && payload.mood) {
        onMood(payload.mood)
      }
    })
  }

  return new Promise((resolve, reject) => {
    let hasResolved = false

    const onAbort = () => {
      if (hasResolved) return
      hasResolved = true
      if (unsubToken) unsubToken()
      if (unsubMood) unsubMood()
      const err = new Error('AbortError')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal) {
      if (signal.aborted) return onAbort()
      if (typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort)
      }
    }

    window.api
      .fetchAIStream({ messages, tools, config: conf, isSmallTask }, signal)
      .then((result) => {
        if (hasResolved) return
        hasResolved = true
        if (unsubToken) unsubToken()
        if (unsubMood) unsubMood()
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort)
        }

        if (result && result.error) {
          const err = new Error(result.error.message)
          err.code = result.error.code
          reject(err)
          return
        }

        if (result && result.toolCalls && onToolCall) {
          onToolCall(result.toolCalls)
        }

        resolve(result)
      })
      .catch((e) => {
        if (hasResolved) return
        hasResolved = true
        if (unsubToken) unsubToken()
        if (unsubMood) unsubMood()
        if (signal) signal.removeEventListener('abort', onAbort)
        reject(e)
      })
  })
}

export const fetchAI = async (
  messages,
  signalOrOptions = null,
  isSmallTask = false,
  jsonSchema = null,
  configOverride = null
) => {
  let signal = signalOrOptions
  let smallTask = isSmallTask
  let schema = jsonSchema
  let override = configOverride

  if (
    signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    !(signalOrOptions instanceof AbortSignal) &&
    typeof signalOrOptions.addEventListener !== 'function'
  ) {
    signal = signalOrOptions.signal || null
    smallTask = signalOrOptions.isSmallTask ?? isSmallTask
    schema = signalOrOptions.jsonSchema ?? jsonSchema
    override = signalOrOptions.configOverride ?? configOverride
  }

  const currentConfig = await getAllConfig()
  const conf = { ...(currentConfig[0] || {}), ...(override || {}) }

  return new Promise((resolve, reject) => {
    let hasResolved = false

    const onAbort = () => {
      if (hasResolved) return
      hasResolved = true
      const err = new Error('AbortError')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal) {
      if (signal.aborted) return onAbort()
      if (typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort)
      }
    }

    // --- DEBUG LOG: Token Usage & Payload ---
    console.groupCollapsed(`[fetchAI] Request Payload (${smallTask ? 'Small Task' : 'Main Task'})`);
    console.log("Total Messages:", messages.length);
    let totalChars = 0;
    messages.forEach((m, i) => {
      const charLen = m.content?.length || 0;
      totalChars += charLen;
      console.log(`%c[Msg ${i} | ${m.role.toUpperCase()}]`, 'color: #3b82f6; font-weight: bold;', `${charLen} chars`);
      console.log(m.content);
    });
    console.log(`%c[ESTIMASI ESTIMATED TOKENS]`, 'color: #ef4444; font-weight: bold;', `~${Math.round(totalChars / 2.5)} tokens (Bahasa Indonesia & JSON overhead)`);
    console.groupEnd();
    // --- END DEBUG LOG ---

    console.log('%c[fetchAI] FULL RAW REQUEST JSON:', 'color: #10b981; font-weight: bold;');
    console.log(JSON.stringify({ messages, isSmallTask: smallTask, jsonSchema: schema }, null, 2));

    window.api
      .fetchAI({ messages, config: conf, isSmallTask: smallTask, jsonSchema: schema }, signal)
      .then((result) => {
      if (hasResolved) return;
      hasResolved = true;
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);

      console.log('%c[fetchAI] FULL RAW RESPONSE RESULT (JSON):', 'color: #10b981; font-weight: bold;');
      console.log(result);

      if (result && result.error) {
        const err = new Error(result.error.message)
        err.code = result.error.code
        reject(err)
        return
      }
      resolve(result);
    }).catch(e => {
      if (hasResolved) return;
      hasResolved = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(e);
    })
  });
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    // If it's already an object
    if (typeof rawResponse === 'object') {
      if (rawResponse.thought !== undefined || rawResponse.action !== undefined || rawResponse.answer !== undefined) {
        return rawResponse
      }
      if (typeof rawResponse.content === 'string' && rawResponse.content.trim().length > 0) {
        rawResponse = rawResponse.content
      } else if (typeof rawResponse.reasoning === 'string' && rawResponse.reasoning.includes('{') && rawResponse.reasoning.includes('}')) {
        rawResponse = rawResponse.reasoning
      } else if (typeof rawResponse.text === 'string' && rawResponse.text.trim().length > 0) {
        rawResponse = rawResponse.text
      } else if (typeof rawResponse.message === 'string' && rawResponse.message.trim().length > 0) {
        rawResponse = rawResponse.message
      } else {
        try {
          rawResponse = JSON.stringify(rawResponse)
        } catch (_) {
          return null
        }
      }
    }

    if (typeof rawResponse !== 'string') {
      rawResponse = String(rawResponse || '')
    }

    let text = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')

    let firstIndex = -1
    let lastIndex = -1

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstIndex = firstBrace
    } else if (firstBracket !== -1) {
      firstIndex = firstBracket
    }

    if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) {
      lastIndex = lastBrace
    } else if (lastBracket !== -1) {
      lastIndex = lastBracket
    }

    if (firstIndex === -1 || lastIndex === -1) return null

    const jsonStr = text.substring(firstIndex, lastIndex + 1)

    try {
      return JSON.parse(jsonStr)
    } catch (_) {}

    let cleaned = jsonStr
      .replace(/\r?\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/\\(?!(["\\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    // Ultimate fallback using jsonrepair for missing brackets/quotes
    try {
      const repaired = jsonrepair(cleaned)
      return JSON.parse(repaired)
    } catch (_) {}

    return null
  } catch (error) {
    console.error('Gagal Parse JSON:', error)
    try {
      const lastResort = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}
