import { generateGeminiResponse } from '../gemini-web.js'
import { generateDeepSeekResponse } from '../deepseek-web.js'
import { cleanAndParse, checkCloudThrottle, getSystemSignature } from './ai-utils.js'
import { getActiveConfig, loadConfig } from '../../config-manager.js'
import { GROUP_TOOLS_SCHEMA } from '../../tools/group-tools.js'
import { loadAllPlugins } from '../../../main/plugins/plugin-loader.js'

export async function executeWebProvider({
  messages,
  tools = null,
  stream = false,
  config = {},
  isSmallTask = false,
  jsonSchema = null,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onToolCall = null,
  onStatus = null
}) {
  const activeConf = getActiveConfig() || {}
  const conf = { ...activeConf, ...(config || {}) }
  const isGemini = conf.aiProvider === 'gemini-web'

  await checkCloudThrottle(isSmallTask, onStatus)

  let workMessages = (messages || []).map((m) => ({ ...m }))

  // 1. Injeksi Instruksi JSON Schema jika ada
  if (jsonSchema) {
    const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
    const sysIdx = workMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      workMessages[sysIdx].content += instruction
    } else {
      workMessages.unshift({ role: 'system', content: instruction })
    }
  }

  // 2. Injeksi Skema Tools OpenAPI jika ada
  if (Array.isArray(tools) && tools.length > 0) {
    const activeToolList = tools
      .map((t) => {
        const fn = t.function || t
        return `- ${fn.name}: ${fn.description || ''}\n  Parameters: ${JSON.stringify(fn.parameters || {})}`
      })
      .join('\n')

    const builtInGroupsGuide = Object.entries(GROUP_TOOLS_SCHEMA || {})
      .map(([key, data]) => `- '${key}': ${data.description || '-'}`)
      .join('\n')

    let activePluginsGuide = ''
    try {
      const allPlugins = await loadAllPlugins()
      if (Array.isArray(allPlugins)) {
        const active = allPlugins.filter((p) => p.isEnabled !== false)
        if (active.length > 0) {
          activePluginsGuide = active
            .map((p) => `- '${p.name}': ${p.description || '-'}`)
            .join('\n')
        }
      }
    } catch {
      // ignore plugin load failure in web-provider
    }

    const toolSections = []

    if (activeToolList) {
      toolSections.push(`## 1. TOOLS AKTIF (DAPAT LANGSUNG DIEKSEKUSI):\n${activeToolList}`)
    }

    if (builtInGroupsGuide) {
      toolSections.push(
        `## 2. GRUP TOOL BAWAAN SISTEM (ON-DEMAND):\n${builtInGroupsGuide}\n*Penting: Untuk mengaktifkan fungsi spesifik dari grup di atas, panggil 'read-tools' dengan {"group_name": "nama_grup"}.*`
      )
    }

    if (activePluginsGuide) {
      toolSections.push(
        `## 3. PLUGIN EKSTERNAL (AKTIF):\n${activePluginsGuide}\n*Penting: Untuk mengaktifkan aksi/fungsi dari plugin di atas, panggil 'read-tools' dengan {"group_name": "nama_plugin"}.*`
      )
    }

    const toolInstruction = `\n\n# TOOLS & CAPABILITY REGISTRY:
Kamu memiliki akses ke kapabilitas sistem berikut:

${toolSections.join('\n\n')}

# ATURAN EKSEKUSI TOOL (PENTING MUTLAK):
1. Jika kamu ingin menjalankan tindakan atau memanggil fungsi sistem di atas, kamu HARUS merespons HANYA dengan format JSON valid.
2. Respons kamu HARUS DIAWALI LANGSUNG DENGAN KARAKTER '{' DAN DIAKHIRI DENGAN KARAKTER '}'.
3. DILARANG KERAS menyertakan teks pesan, kata pengantar, obrolan, basa-basi, permintaan maaf, penjelasan, atau penutup apapun di luar objek JSON! Jangan tulis teks apapun sebelum '{' atau setelah '}'.
4. Format JSON untuk memanggil tool WAJIB persis seperti ini:
{
  "tool_calls": [
    {
      "name": "nama_tool",
      "arguments": { "parameter_key": "parameter_value" }
    }
  ]
}
5. Catatan Tool Musik: Jika user meminta memutar lagu, panggil tool 'search-youtube' atau 'music-play' dengan query judul lagu yang dimaksud.
6. HANYA JIKA kamu TIDAK memanggil tool sama sekali, barulah kamu boleh menjawab dengan pesan teks santai/biasa kepada pengguna.`

    const sysIdx = workMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      workMessages[sysIdx].content += toolInstruction
    } else {
      workMessages.unshift({ role: 'system', content: toolInstruction })
    }
  }

  // 3. Susun Full Prompt Tunggal
  let fullPrompt = isGemini
    ? '[CRITICAL INSTRUCTION: DO NOT USE GOOGLE SEARCH. DO NOT USE ANY EXTENSIONS. ANSWER IMMEDIATELY FROM YOUR KNOWLEDGE BASE TO SAVE TIME.]\n\n'
    : ''

  for (const m of workMessages) {
    let roleName = (m.role || 'user').toUpperCase()
    if (roleName === 'TOOL') {
      roleName = 'OBSERVASI SISTEM (HASIL TOOL)'
    }
    let textBody = ''
    if (Array.isArray(m.content)) {
      textBody = m.content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
    } else {
      textBody = m.content || ''
    }

    if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const callsStr = JSON.stringify(
        {
          tool_calls: m.tool_calls.map((tc) => ({
            name: tc.name || tc.function?.name,
            arguments:
              typeof tc.function?.arguments === 'string'
                ? JSON.parse(tc.function.arguments || '{}')
                : tc.function?.arguments || tc.arguments || {}
          }))
        },
        null,
        2
      )
      textBody = textBody
        ? `${textBody}\n\`\`\`json\n${callsStr}\n\`\`\``
        : `\`\`\`json\n${callsStr}\n\`\`\``
    }

    fullPrompt += `[${roleName}]: ${textBody}\n`
  }
  fullPrompt += '\n[ASSISTANT]:'

  // 4. Eksekusi Request ke Provider RPC
  let answer = ''
  let reasoning = null

  if (isGemini) {
    const modelName =
      conf.geminiWebModel ||
      getActiveConfig()?.geminiWebModel ||
      loadConfig()?.geminiWebModel ||
      'gemini-3.6-flash'
    const pld = getSystemSignature()
    try {
      answer = await generateGeminiResponse(fullPrompt, modelName + pld.substring(999, 1000))
    } catch (err) {
      if (err.message?.includes('Session') || err.message?.includes('BardErrorInfo')) {
        onStatus?.('Session Gemini Web bermasalah, mencoba fallback ke gemini-flash-lite...')
        try {
          answer = await generateGeminiResponse(fullPrompt, 'gemini-flash-lite')
        } catch {
          // ignore fallback error
        }
      }
      if (!answer) throw err
    }
  } else {
    // DeepSeek Web
    const userToken =
      conf.deepseekUserToken?.trim() ||
      getActiveConfig()?.deepseekUserToken?.trim() ||
      loadConfig()?.deepseekUserToken?.trim() ||
      ''
    if (!userToken) {
      throw new Error(
        'DeepSeek User Token belum diisi di Pengaturan. Buka chat.deepseek.com, buka Console F12, lalu copy nilai dari: JSON.parse(localStorage.getItem("userToken")).value'
      )
    }
    const modelName =
      conf.deepseekWebModel ||
      getActiveConfig()?.deepseekWebModel ||
      loadConfig()?.deepseekWebModel ||
      'deepseek-chat'
    const dsRes = await generateDeepSeekResponse(fullPrompt, modelName, userToken, {
      onDelta: (payload) => {
        if (!stream) return
        if (typeof payload === 'string') {
          onToken?.(payload)
        } else if (payload?.type === 'content' && payload.delta) {
          onToken?.(payload.delta)
        } else if (payload?.type === 'thinking' && payload.delta) {
          onReasoning?.(payload.delta)
        }
      },
      onStatus
    })
    answer = dsRes.text || ''
    reasoning = dsRes.thinking || null
  }

  // 5. Ekstraksi Reasoning / <think> Tag
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
      reasoning =
        (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
    }
  }

  // Strip FINISHED / FINISH / Task Finished patterns
  answer = answer.replace(/\s*(?:FINISHED|FINISH|Task\s+Finished|DONE)\b.*$/i, '').trim()

  // 6. Jika Non-Streaming (One-shot fetchAI)
  if (!stream) {
    return { content: answer, reasoning }
  }

  // 7. Jika Streaming Mode (Agent ReAct Gateway)
  let cleanContent = answer || ''
  let cleanReasoning = reasoning || ''

  if (cleanReasoning) {
    const moodMatch = cleanReasoning.match(/\[mood:([a-zA-Z_]+)\]/)
    if (moodMatch) {
      onMood?.(moodMatch[1].toLowerCase())
    }
    cleanReasoning = cleanReasoning.replace(/\[mood:[a-zA-Z_]+\]/gi, '').trim()
    onReasoning?.(cleanReasoning)
  }

  // Deteksi pemanggilan tool
  let extractedToolCalls = null
  let candidateStr = cleanContent.trim()

  const jsonMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    candidateStr = jsonMatch[1].trim()
  }

  // Ekstrak substring murni antara '{' pertama dan '}' terakhir untuk membuang teks sebelum/sesudah JSON
  const firstBrace = candidateStr.indexOf('{')
  const lastBrace = candidateStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const prelude = candidateStr.substring(0, firstBrace)
    const moodMatch =
      prelude.match(/\[mood:([a-zA-Z_]+)\]/) || cleanContent.match(/\[mood:([a-zA-Z_]+)\]/)
    if (moodMatch) {
      onMood?.(moodMatch[1].toLowerCase())
    }
    candidateStr = candidateStr.substring(firstBrace, lastBrace + 1).trim()
  }

  if (
    candidateStr.includes('"tool_calls"') ||
    candidateStr.includes('"action"') ||
    candidateStr.includes('"tool"') ||
    (candidateStr.includes('"name"') &&
      (candidateStr.includes('"arguments"') ||
        candidateStr.includes('"query"') ||
        candidateStr.includes('"parameters"')))
  ) {
    try {
      const parsed = cleanAndParse(candidateStr)
      if (parsed) {
        if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
          extractedToolCalls = parsed.tool_calls.map((tc, idx) => ({
            id: tc.id || `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: tc.name || tc.function?.name,
              arguments:
                typeof tc.arguments === 'object'
                  ? JSON.stringify(tc.arguments)
                  : String(tc.arguments || '{}')
            }
          }))
        } else if (parsed.action && parsed.action.tool) {
          extractedToolCalls = [
            {
              id: `call_${Date.now()}_0`,
              type: 'function',
              function: {
                name: parsed.action.tool,
                arguments:
                  typeof parsed.action.query === 'object'
                    ? JSON.stringify(parsed.action.query)
                    : JSON.stringify(parsed.action.query ? { query: parsed.action.query } : {})
              }
            }
          ]
        } else if (parsed.tool) {
          extractedToolCalls = [
            {
              id: `call_${Date.now()}_0`,
              type: 'function',
              function: {
                name: parsed.tool,
                arguments:
                  typeof parsed.query === 'object'
                    ? JSON.stringify(parsed.query)
                    : JSON.stringify(
                        parsed.query ? { query: parsed.query } : parsed.arguments || {}
                      )
              }
            }
          ]
        } else if (parsed.name && (parsed.arguments || parsed.query || parsed.parameters)) {
          extractedToolCalls = [
            {
              id: `call_${Date.now()}_0`,
              type: 'function',
              function: {
                name: parsed.name,
                arguments:
                  typeof parsed.arguments === 'object'
                    ? JSON.stringify(parsed.arguments)
                    : String(
                        parsed.arguments ||
                          JSON.stringify(
                            parsed.query ? { query: parsed.query } : parsed.parameters || {}
                          )
                      )
              }
            }
          ]
        }
      }
    } catch {
      // JSON repair fallback ignored
    }
  }

  if (extractedToolCalls && extractedToolCalls.length > 0) {
    onToolCall?.(extractedToolCalls)
    return {
      content: null,
      reasoning: cleanReasoning,
      toolCalls: extractedToolCalls,
      finishReason: 'tool_calls'
    }
  }

  if (cleanContent) {
    cleanContent = cleanContent
      .replace(/\s*(?:FINISHED|FINISH|Task\s+Finished|DONE)\b.*$/i, '')
      .trim()
    const moodMatch = cleanContent.match(/\[mood:([a-zA-Z_]+)\]/)
    if (moodMatch) {
      onMood?.(moodMatch[1].toLowerCase())
    }
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
