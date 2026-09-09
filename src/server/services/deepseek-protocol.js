const PROTOCOL_TYPES = new Set(['final', 'tool_calls', 'error'])

const protocolError = (code, message, details = null) => ({
  ok: false,
  error: { code, message, details }
})

const schemaFunction = (tool) => tool?.function || tool || {}

const parseEnvelope = (source) => {
  try {
    return JSON.parse(source)
  } catch (_) {}

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim())
    } catch (_) {}
  }

  const start = source.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1))
        } catch (_) {
          return null
        }
      }
    }
  }

  return null
}

const getSchemaToolMap = (activeTools) => {
  const map = new Map()
  for (const tool of Array.isArray(activeTools) ? activeTools : []) {
    const fn = schemaFunction(tool)
    if (typeof fn.name === 'string' && fn.name.trim()) {
      map.set(fn.name, fn)
    }
  }
  return map
}

const parseArguments = (value, toolName) => {
  if (value === undefined || value === null) {
    return protocolError(
      'INVALID_TOOL_ARGUMENTS',
      `Arguments tool '${toolName}' wajib berupa object.`
    )
  }

  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch (_) {
      return protocolError(
        'INVALID_TOOL_ARGUMENTS',
        `Arguments tool '${toolName}' bukan JSON valid.`
      )
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return protocolError(
      'INVALID_TOOL_ARGUMENTS',
      `Arguments tool '${toolName}' wajib berupa object.`
    )
  }

  return { ok: true, value: parsed }
}

const validateArguments = (toolName, args, schema, knownToolGroups) => {
  const parameters = schema?.parameters || {}
  const properties = parameters.properties || {}
  const required = Array.isArray(parameters.required) ? parameters.required : []

  for (const key of required) {
    if (!(key in args) || args[key] === null || args[key] === '') {
      return protocolError(
        'INVALID_TOOL_ARGUMENTS',
        `Tool '${toolName}' membutuhkan parameter '${key}'.`
      )
    }
  }

  if (parameters.additionalProperties === false) {
    const unknown = Object.keys(args).filter(
      (key) => !Object.prototype.hasOwnProperty.call(properties, key)
    )
    if (unknown.length > 0) {
      return protocolError(
        'INVALID_TOOL_ARGUMENTS',
        `Tool '${toolName}' menerima parameter tidak dikenal: ${unknown.join(', ')}.`
      )
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const expected = properties[key]?.type
    if (!expected || value === null) continue

    const valid =
      (expected === 'string' && typeof value === 'string') ||
      (expected === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (expected === 'boolean' && typeof value === 'boolean') ||
      (expected === 'object' && typeof value === 'object' && !Array.isArray(value)) ||
      (expected === 'array' && Array.isArray(value))

    if (!valid) {
      return protocolError(
        'INVALID_TOOL_ARGUMENTS',
        `Parameter '${key}' pada tool '${toolName}' memiliki tipe tidak valid.`
      )
    }
  }

  if (toolName === 'read-tools' && !knownToolGroups.has(args.group_name)) {
    return protocolError(
      'INVALID_TOOL_ARGUMENTS',
      `Group tool '${args.group_name || ''}' tidak dikenal.`
    )
  }

  return { ok: true }
}

const normalizeToolCall = (call, index, activeToolMap, knownToolGroups) => {
  const functionData = call?.function || call || {}
  const name = functionData.name || call?.name
  if (typeof name !== 'string' || !name.trim()) {
    return protocolError(
      'INVALID_TOOL_ARGUMENTS',
      `Tool call ke-${index + 1} tidak memiliki nama tool.`
    )
  }

  const schema = activeToolMap.get(name)
  if (!schema) {
    return protocolError('UNKNOWN_TOOL', `Tool '${name}' tidak tersedia pada registry aktif.`)
  }

  const rawArguments = functionData.arguments ?? call?.arguments
  const parsedArguments = parseArguments(rawArguments, name)
  if (!parsedArguments.ok) return parsedArguments

  const argumentValidation = validateArguments(name, parsedArguments.value, schema, knownToolGroups)
  if (!argumentValidation.ok) return argumentValidation

  return {
    ok: true,
    value: {
      id: call?.id || `call_deepseek_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(parsedArguments.value)
      }
    }
  }
}

export const parseDeepSeekProtocolResponse = (rawText, activeTools = [], toolGroups = []) => {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return protocolError('EMPTY_RESPONSE', 'DeepSeek mengembalikan response kosong.')
  }

  const source = rawText.trim().replace(/^\uFEFF/, '')
  let parsed = parseEnvelope(source)

  // Fallback: Jika parseEnvelope gagal, coba cari JSON object secara manual
  // untuk kasus JSON ter-escape atau terpotong whitespace/newline
  if (!parsed) {
    // Coba cari pattern {"type":"tool_calls",...,"tool_calls":[...]}
    // Regex lebih flexible: handle field tambahan seperti "mood" di antara type dan tool_calls
    const toolCallsMatch = source.match(/\{\s*"type"\s*:\s*"tool_calls"\s*,\s*[\s\S]*?"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}\s*\}/)
    if (toolCallsMatch) {
      try {
        parsed = JSON.parse(toolCallsMatch[0])
      } catch (_) {
        // Coba repair: replace escaped newlines dan quotes yang bermasalah
        try {
          const repaired = toolCallsMatch[0]
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
          parsed = JSON.parse(repaired)
        } catch (_) {}
      }
    }
    if (!parsed) {
      // Coba cari pattern {"type":"final",...,"content":"..."}
      const finalMatch = source.match(/\{\s*"type"\s*:\s*"final"\s*,\s*[\s\S]*?"content"\s*:\s*"[\s\S]*?"\s*\}/)
      if (finalMatch) {
        try {
          parsed = JSON.parse(finalMatch[0])
        } catch (_) {}
      }
    }
  }

  // Fallback: Jika tetap tidak ada JSON valid, anggap plain text sebagai final content
  if (!parsed) {
    return { ok: true, type: 'final', content: source }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return protocolError('INVALID_PROTOCOL', 'Envelope DeepSeek wajib berupa JSON object.')
  }

  if (!PROTOCOL_TYPES.has(parsed.type)) {
    // Fallback: JSON tanpa type dikenali → coba ekstrak content dari field umum
    const fallbackContent =
      parsed.content || parsed.response || parsed.answer || parsed.text || parsed.message
    if (typeof fallbackContent === 'string' && fallbackContent.trim()) {
      return { ok: true, type: 'final', content: fallbackContent }
    }
    return protocolError(
      'INVALID_PROTOCOL',
      `Tipe response DeepSeek tidak dikenal: ${String(parsed.type || '')}.`
    )
  }

  if (parsed.type === 'final') {
    const finalContent = parsed.content || parsed.text || parsed.response || parsed.answer
    if (typeof finalContent !== 'string' || !finalContent.trim()) {
      return protocolError(
        'INVALID_PROTOCOL',
        'Envelope final wajib memiliki content string yang tidak kosong.'
      )
    }
    if ('tool_calls' in parsed) {
      return protocolError('INVALID_PROTOCOL', 'Envelope final tidak boleh memiliki tool_calls.')
    }
    return { ok: true, type: 'final', content: finalContent }
  }

  if (parsed.type === 'error') {
    if (typeof parsed.message !== 'string' || !parsed.message.trim()) {
      return protocolError('INVALID_PROTOCOL', 'Envelope error wajib memiliki message string.')
    }
    return {
      ok: true,
      type: 'error',
      message: parsed.message,
      retryable: parsed.retryable !== false,
      code: typeof parsed.code === 'string' ? parsed.code : 'DEEPSEEK_MODEL_ERROR'
    }
  }

  if (!Array.isArray(parsed.tool_calls) || parsed.tool_calls.length === 0) {
    return protocolError(
      'INVALID_PROTOCOL',
      'Envelope tool_calls wajib memiliki minimal satu tool call.'
    )
  }
  const activeToolMap = getSchemaToolMap(activeTools)
  const knownToolGroups = new Set(Array.isArray(toolGroups) ? toolGroups : [])
  const normalizedCalls = []
  for (let index = 0; index < parsed.tool_calls.length; index += 1) {
    const normalized = normalizeToolCall(
      parsed.tool_calls[index],
      index,
      activeToolMap,
      knownToolGroups
    )
    if (!normalized.ok) return normalized
    normalizedCalls.push(normalized.value)
  }

  return { ok: true, type: 'tool_calls', toolCalls: normalizedCalls }
}

export const DEEPSEEK_PROTOCOL_TYPES = [...PROTOCOL_TYPES]
