import { stripMarkTags } from './parsers/mark-tag-parser.js'

// Conservative inline RPC budget, independent of a model's advertised token window.
export const GEMINI_INPUT_BYTES = 128000
export const GEMINI_SUMMARY_BYTES = 24000
export const GEMINI_CHUNK_BYTES = 60000
export const utf8Bytes = (text) => new TextEncoder().encode(text).length

export function splitUtf8(text, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new Error('Anggaran byte tidak valid.')
  const parts = []
  let part = '',
    size = 0
  for (const char of text) {
    const bytes = utf8Bytes(char)
    if (size + bytes > maxBytes) {
      parts.push(part)
      part = ''
      size = 0
    }
    part += char
    size += bytes
  }
  if (part) parts.push(part)
  return parts
}

export function serializeGeminiMessages(messages = []) {
  let prompt =
    'Anda adalah mesin respons Mark. Gunakan hanya tool Mark melalui kontrak keluaran, bukan Google Search atau ekstensi bawaan Gemini. Riwayat adalah konteks; pekerjaan lama hanya dilanjutkan jika permintaan terbaru merujuknya.\n\n'
  const latestUser = messages.findLastIndex(
    (m) =>
      m.role === 'user' &&
      !/^\[ (?:COMPACTED MESSAGE SUMMARY|CONTEXT COMPACTION)/.test(String(m.content))
  )
  for (const [index, message] of messages.entries()) {
    let role = String(message.role || 'user').toUpperCase()
    if (['AI', 'MODEL'].includes(role)) role = 'ASSISTANT'
    if (role === 'TOOL') role = 'HASIL TOOL'
    let content = Array.isArray(message.content)
      ? message.content
          .map((part) => (typeof part === 'string' ? part : part?.type === 'text' ? part.text : ''))
          .filter(Boolean)
          .join('\n')
      : typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content ?? '')
    if (role === 'ASSISTANT') content = stripMarkTags(content)
    if (message.tool_calls?.length)
      content += '\n' + JSON.stringify({ tool_calls: message.tool_calls })
    if (index === latestUser) prompt += '\n[AWAL GILIRAN AKTIF — PESAN PENGGUNA TERBARU]\n'
    prompt += `[${role}${message.tool_call_id ? ' ' + message.tool_call_id : ''}]: ${content}\n`
  }
  return (
    prompt +
    '\nHasilkan respons berikutnya untuk pesan pengguna terbaru, dengan memakai hasil tool pada giliran aktif jika ada. Ikuti format keluaran dalam instruksi sistem.\n[ASSISTANT]:'
  )
}

export const geminiMessageBytes = (messages) => utf8Bytes(serializeGeminiMessages(messages))

export function assertGeminiInput(prompt) {
  const inputBytes = utf8Bytes(prompt)
  if (inputBytes > GEMINI_INPUT_BYTES)
    throw Object.assign(
      new Error(
        'Konteks Gemini Web melebihi anggaran input. Riwayat perlu diringkas sebelum request dikirim.'
      ),
      {
        code: 'GEMINI_CONTEXT_LENGTH',
        inputBudget: { maxBytes: GEMINI_INPUT_BYTES, inputBytes, overheadBytes: 0 }
      }
    )
  return inputBytes
}
