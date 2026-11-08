import { responseContract, usesPersonalMood } from '../../../shared/agent-mode.js'
import { deepseekAuth } from '../deepseek-auth.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { generateGeminiResult, generateGeminiCompactionResult } from '../gemini-web.js'
import { GEMINI_COMPACTION_MODEL } from '../../../shared/gemini-models.js'
import {
  generateDeepSeekResponse,
  uploadImageFile,
  waitForFileReady,
  withDeepSeekSignal
} from '../deepseek-web.js'
import { cleanAndParse, checkCloudThrottle, stripMarkTags } from './ai-utils.js'
import { getActiveConfig, loadConfig } from '../../config-manager.js'
import { GROUP_TOOLS_SCHEMA } from '../../tools/group-tools.js'
import { loadAllPlugins } from '../../../main/plugins/plugin-loader.js'
import {
  GEMINI_INPUT_BYTES,
  serializeGeminiMessages,
  geminiMessageBytes,
  assertGeminiInput
} from '../../../shared/gemini-context.js'

/**
 * Ekstraksi path / data URL berkas gambar dari array pesan chat (hanya turn aktif terbaru)
 */
function extractImageSources(messages) {
  const sources = []
  if (!Array.isArray(messages) || messages.length === 0) return sources

  // Hanya periksa turn aktif terbaru (setelah pesan assistant terakhir).
  // Mencegah gambar dari riwayat masa lalu di-upload ulang saat greeting atau pesan follow-up.
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || '').toLowerCase()
    if (role === 'assistant' || role === 'ai' || role === 'model') {
      lastAssistantIdx = i
      break
    }
  }

  const activeTurnMessages = messages.slice(lastAssistantIdx + 1)
  if (activeTurnMessages.length === 0) return sources

  const resolvePath = (val) => {
    if (!val || typeof val !== 'string') return null
    const trimmed = val.trim().replace(/^['"]|['"]$/g, '')
    if (trimmed.startsWith('data:image/')) return trimmed
    if (trimmed.startsWith('/api/chat/temp-file/')) {
      const fn = decodeURIComponent(trimmed.replace('/api/chat/temp-file/', ''))
      return path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads', fn)
    }
    if (fs.existsSync(trimmed)) return trimmed
    if (trimmed.includes('temp-uploads')) {
      const fn = path.basename(trimmed)
      const testPath = path.join(os.homedir(), '.config', 'mark-agent', 'temp-uploads', fn)
      if (fs.existsSync(testPath)) return testPath
    }
    return null
  }

  for (const m of activeTurnMessages) {
    if (!m) continue
    if (typeof m.content === 'string') {
      if (m.content.includes('[FILE TERLAMPIR]:')) {
        const afterTag = m.content.split(/\[FILE TERLAMPIR\]:/i)[1] || ''
        const line = afterTag.split('\n')[0]
        const matches = line.match(/"([^"]+)"/g)
        if (matches) {
          for (const raw of matches) {
            const resolved = resolvePath(raw)
            if (resolved) sources.push(resolved)
          }
        }
      }
      const mdRegex = /!\[.*?\]\(([^)]+)\)/gi
      let mdMatch
      while ((mdMatch = mdRegex.exec(m.content)) !== null) {
        const resolved = resolvePath(mdMatch[1])
        if (resolved) sources.push(resolved)
      }
    } else if (Array.isArray(m.content)) {
      for (const item of m.content) {
        if (!item) continue
        if (typeof item === 'string') {
          const resolved = resolvePath(item)
          if (resolved) sources.push(resolved)
        } else if (item.type === 'image_url') {
          const url =
            item.image_url?.url ||
            item.url ||
            (typeof item.image_url === 'string' ? item.image_url : null)
          const resolved = resolvePath(url)
          if (resolved) sources.push(resolved)
        } else if (item.image_url || item.url) {
          const url = item.image_url?.url || item.image_url || item.url
          if (typeof url === 'string') {
            const resolved = resolvePath(url)
            if (resolved) sources.push(resolved)
          }
        }
      }
    }
  }
  return [...new Set(sources)]
}

export const executeWebProvider = (options) => {
  if ((options.config?.aiProvider || getActiveConfig()?.aiProvider) !== 'deepseek-web')
    return executeWebProviderInternal(options)
  return withDeepSeekSignal(
    options.signal,
    () => executeWebProviderInternal(options),
    options.scope || (String(options.sessionId || '').startsWith('subagent_') ? 'subagent' : 'lead')
  )
}

async function executeWebProviderInternal({
  messages,
  tools = null,
  stream = false,
  config = {},
  isSmallTask = false,
  purpose = null,
  jsonSchema = null,
  sessionId = null,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onMeta = null,
  onToolCall = null,
  onStatus = null,
  signal = null,
  scope = null
}) {
  const activeConf = getActiveConfig() || {}
  const conf = { ...activeConf, ...(config || {}) }
  const isGemini = conf.aiProvider === 'gemini-web'
  const isCompaction = purpose === 'compaction' && isSmallTask === true && !stream
  const shouldStreamContent = false
  const moodFilter = null

  await checkCloudThrottle(isSmallTask, onStatus)
  signal?.throwIfAborted()

  let workMessages = (messages || []).map((m) => ({ ...m }))

  // 1. Injeksi Instruksi JSON Schema jika ada
  if (!(isGemini && isCompaction) && jsonSchema) {
    const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
    const sysIdx = workMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      workMessages[sysIdx].content += instruction
    } else {
      workMessages.unshift({ role: 'system', content: instruction })
    }
  }

  // 2. Injeksi Skema Tools OpenAPI jika ada
  if (!(isGemini && isCompaction) && Array.isArray(tools) && tools.length > 0) {
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

${responseContract({ web: true, personal: usesPersonalMood({ sessionId, purpose, isSmallTask }) })}

Jika pengguna meminta memutar lagu, gunakan tool musik yang tersedia.`

    const sysIdx = workMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      workMessages[sysIdx].content += toolInstruction
    } else {
      workMessages.unshift({ role: 'system', content: toolInstruction })
    }
  }

  // The DeepSeek transport may rotate or retry with a new chat after this point.
  // Every request must therefore be self-contained, including its original user goal.
  const messagesToPrompt = workMessages

  // Seluruh riwayat percakapan (system prompt, riwayat obrolan terdahulu, observasi tool, dan prompt aktif)
  // disusun sesuai konteks dari caller, termasuk ringkasan bila sudah dikompaksi.
  let fullPrompt = isGemini
    ? '[CRITICAL INSTRUCTION: DO NOT USE GOOGLE SEARCH. DO NOT USE ANY EXTENSIONS. ANSWER IMMEDIATELY FROM YOUR KNOWLEDGE BASE TO SAVE TIME.]\n\n'
    : ''

  for (const m of messagesToPrompt) {
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

    // Bersihkan sisa tag XML dari riwayat pesan asisten agar model web tidak bingung
    if (roleName === 'ASSISTANT' || roleName === 'AI' || roleName === 'MODEL') {
      textBody = stripMarkTags(textBody)
    }

    fullPrompt += `[${roleName}]: ${textBody}\n`
  }
  fullPrompt += '\n[ASSISTANT]:'
  if (isGemini)
    fullPrompt +=
      '\nJawab permintaan USER terbaru berdasarkan observasi terkini. Pesan asisten dan hasil tool di riwayat adalah data historis; jangan menghidupkan kembali pekerjaan lama yang tidak diminta. Jika USER hanya menyapa, balas sapaan tanpa menjalankan tool.\n'

  // 4. Eksekusi Request ke Provider RPC
  let answer = ''
  let reasoning = null
  let providerMeta = {}

  if (isGemini) {
    fullPrompt = serializeGeminiMessages(workMessages)
    try {
      assertGeminiInput(fullPrompt)
    } catch (cause) {
      cause.inputBudget.overheadBytes = Math.max(
        0,
        cause.inputBudget.inputBytes - geminiMessageBytes(messages)
      )
      throw cause
    }
    const modelName = isCompaction
      ? GEMINI_COMPACTION_MODEL
      : conf.geminiWebModel ||
        getActiveConfig()?.geminiWebModel ||
        loadConfig()?.geminiWebModel ||
        'gemini-3.6-flash'
    const requestOptions = {
      signal,
      scope: scope || (String(sessionId || '').startsWith('subagent_') ? 'subagent' : 'lead'),
      onStatus
    }
    const result = isCompaction
      ? await generateGeminiCompactionResult(fullPrompt, requestOptions)
      : await generateGeminiResult(fullPrompt, modelName, requestOptions)
    answer = result.text
    reasoning = result.reasoning
    providerMeta = {
      requestedModel: modelName,
      actualModel: result.actualModel,
      ...(isCompaction ? { authenticationMode: 'anonymous' } : {}),
      inputUsage: { inputBytes: geminiMessageBytes(workMessages), maxBytes: GEMINI_INPUT_BYTES }
    }
  } else {
    // DeepSeek Web
    const userToken = await deepseekAuth.getToken()
    const modelName =
      conf.deepseekWebModel ||
      getActiveConfig()?.deepseekWebModel ||
      loadConfig()?.deepseekWebModel ||
      'deepseek-chat'

    // Pemrosesan berkas gambar untuk Vision jika ada lampiran
    const refFileIds = []
    const detectedImages = extractImageSources(workMessages)
    if (detectedImages.length > 0) {
      for (let idx = 0; idx < detectedImages.length; idx++) {
        const imgSrc = detectedImages[idx]
        try {
          if (typeof onStatus === 'function') {
            onStatus(`Mengupload gambar (${idx + 1}/${detectedImages.length}) ke DeepSeek...`)
          }
          const { fileId } = await uploadImageFile(userToken, imgSrc)
          if (typeof onStatus === 'function') {
            onStatus(
              `Menunggu DeepSeek selesai memproses gambar (${idx + 1}/${detectedImages.length})...`
            )
          }
          await waitForFileReady(userToken, fileId)
          refFileIds.push(fileId)
        } catch (imgErr) {
          if (signal?.aborted) throw imgErr
          console.warn(
            '[web-provider] Gagal mengunggah gambar ke DeepSeek:',
            imgErr?.message || imgErr
          )
          if (typeof onStatus === 'function') {
            onStatus(`Peringatan unggah gambar: ${imgErr?.message || imgErr}`)
          }
        }
      }
    }

    const dsRes = await generateDeepSeekResponse(fullPrompt, modelName, userToken, {
      refFileIds,
      isSmallTask,
      sessionId,
      onDelta: (payload) => {
        if (!stream) return
        if (payload?.type === 'thinking' && payload.delta) {
          onReasoning?.(payload.delta)
        } else if (shouldStreamContent) {
          const delta = typeof payload === 'string' ? payload : payload?.delta
          if (delta) {
            if (moodFilter) {
              moodFilter(delta)
            } else {
              onToken?.(delta)
            }
          }
        }
      },
      onStatus
    })
    moodFilter?.flush()
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

  if (!isGemini && purpose !== 'compaction' && !answer && reasoning) {
    const firstBrace = reasoning.indexOf('{')
    const lastBrace = reasoning.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      answer = reasoning.substring(firstBrace, lastBrace + 1)
      reasoning =
        (reasoning.substring(0, firstBrace) + reasoning.substring(lastBrace + 1)).trim() || null
    }
  }

  // Strip FINISHED / FINISH / Task Finished patterns
  if (!isGemini)
    answer = answer.replace(/\s*(?:FINISHED|FINISH|Task\s+Finished|DONE)\b.*$/i, '').trim()

  // 6. Jika Non-Streaming (One-shot fetchAI)
  if (!stream) {
    return { content: answer, reasoning, finishReason: 'stop', ...providerMeta }
  }

  // 7. Jika Streaming Mode (Agent ReAct Gateway)
  // 6. Parsing & Normalisasi Format Respon (Streaming & Non-Streaming)
  let cleanContent = answer || ''
  let cleanReasoning = reasoning || ''
  let extractedToolCalls = null
  let extractedMood = 'neutral'
  let extractedMessage = ''
  let awaitingUser = false

  let parsedJson = null
  const trimmedContent = cleanContent.trim()

  // 1. Coba parse langsung jika cleanContent adalah JSON valid utuh
  try {
    parsedJson = cleanAndParse(trimmedContent)
  } catch (_) {}

  // 2. Coba cari blok JSON terluar (outermost braces '{' ... '}')
  // Ini mencegah code blocks markdown di dalam properti "answer" merusak batas parsing JSON utama
  if (!parsedJson || typeof parsedJson !== 'object') {
    const firstBrace = trimmedContent.indexOf('{')
    const lastBrace = trimmedContent.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = trimmedContent.substring(firstBrace, lastBrace + 1).trim()
      try {
        parsedJson = cleanAndParse(jsonCandidate)
      } catch (_) {
        parsedJson = null
      }
    }
  }

  // 3. Fallback jika model membungkus seluruh respons dalam markdown fence (```json ... ```)
  if (!parsedJson || typeof parsedJson !== 'object') {
    const jsonFences = [...cleanContent.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
    for (const fence of jsonFences) {
      const inside = fence[1]?.trim() || ''
      if (
        inside.startsWith('{') ||
        inside.includes('"thought"') ||
        inside.includes('"answer"') ||
        inside.includes('"tool_calls"') ||
        inside.includes('"action"')
      ) {
        try {
          parsedJson = cleanAndParse(inside)
          if (parsedJson && typeof parsedJson === 'object') break
        } catch (_) {}
      }
    }
  }

  if (parsedJson && typeof parsedJson === 'object') {
    awaitingUser = parsedJson.await_user === true
    extractedMessage = stripMarkTags(parsedJson.message)
    // 1. Ekstraksi Mood dari properti JSON
    if (parsedJson.mood && typeof parsedJson.mood === 'string') {
      extractedMood = parsedJson.mood.toLowerCase().trim()
      onMood?.(extractedMood)
    }

    // 2. Ekstraksi Thought / Reasoning
    if (parsedJson.thought && typeof parsedJson.thought === 'string' && parsedJson.thought.trim()) {
      cleanReasoning = cleanReasoning
        ? `${cleanReasoning}\n\n${parsedJson.thought.trim()}`
        : parsedJson.thought.trim()
      onReasoning?.(cleanReasoning)
    }

    // 3. Ekstraksi Tool Calls
    if (Array.isArray(parsedJson.tool_calls) && parsedJson.tool_calls.length > 0) {
      extractedToolCalls = parsedJson.tool_calls.map((tc, idx) => ({
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
    } else if (Array.isArray(parsedJson.action) && parsedJson.action.length > 0) {
      // Dukungan format BATCH ACTIONS array V4: { "action": [ { "tool": "...", "query": "..." }, ... ] }
      extractedToolCalls = parsedJson.action
        .filter((act) => act && (act.tool || act.name))
        .map((act, idx) => ({
          id: `call_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: act.tool || act.name,
            arguments:
              typeof act.arguments === 'object'
                ? JSON.stringify(act.arguments)
                : typeof act.query === 'object'
                  ? JSON.stringify(act.query)
                  : JSON.stringify(
                      act.query !== undefined
                        ? { query: act.query }
                        : act.arguments !== undefined
                          ? { query: act.arguments }
                          : {}
                    )
          }
        }))
    } else if (Array.isArray(parsedJson) && parsedJson.length > 0) {
      // Dukungan format array tool calls langsung: [ { "name": "...", "arguments": ... }, ... ]
      extractedToolCalls = parsedJson
        .filter((item) => item && (item.name || item.tool || item.function?.name))
        .map((item, idx) => ({
          id: item.id || `call_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: item.name || item.tool || item.function?.name,
            arguments:
              typeof item.arguments === 'object'
                ? JSON.stringify(item.arguments)
                : typeof item.query === 'object'
                  ? JSON.stringify(item.query)
                  : String(
                      item.arguments ||
                        (item.query !== undefined ? JSON.stringify({ query: item.query }) : '{}')
                    )
          }
        }))
    } else if (parsedJson.action && (parsedJson.action.tool || parsedJson.action.name)) {
      extractedToolCalls = [
        {
          id: `call_${Date.now()}_0`,
          type: 'function',
          function: {
            name: parsedJson.action.tool || parsedJson.action.name,
            arguments:
              typeof parsedJson.action.arguments === 'object'
                ? JSON.stringify(parsedJson.action.arguments)
                : typeof parsedJson.action.query === 'object'
                  ? JSON.stringify(parsedJson.action.query)
                  : JSON.stringify(
                      parsedJson.action.query !== undefined
                        ? { query: parsedJson.action.query }
                        : {}
                    )
          }
        }
      ]
    } else if (parsedJson.tool) {
      extractedToolCalls = [
        {
          id: `call_${Date.now()}_0`,
          type: 'function',
          function: {
            name: parsedJson.tool,
            arguments:
              typeof parsedJson.query === 'object'
                ? JSON.stringify(parsedJson.query)
                : JSON.stringify(
                    parsedJson.query ? { query: parsedJson.query } : parsedJson.arguments || {}
                  )
          }
        }
      ]
    } else if (
      parsedJson.name &&
      (parsedJson.arguments || parsedJson.query || parsedJson.parameters)
    ) {
      extractedToolCalls = [
        {
          id: `call_${Date.now()}_0`,
          type: 'function',
          function: {
            name: parsedJson.name,
            arguments:
              typeof parsedJson.arguments === 'object'
                ? JSON.stringify(parsedJson.arguments)
                : String(
                    parsedJson.arguments ||
                      JSON.stringify(
                        parsedJson.query ? { query: parsedJson.query } : parsedJson.parameters || {}
                      )
                  )
          }
        }
      ]
    }

    // 4. Ekstraksi Answer / Response
    const possibleAnswer =
      parsedJson.answer !== undefined
        ? parsedJson.answer
        : parsedJson.response !== undefined
          ? parsedJson.response
          : parsedJson.reply !== undefined
            ? parsedJson.reply
            : parsedJson.message !== undefined
              ? parsedJson.message
              : parsedJson.text !== undefined
                ? parsedJson.text
                : parsedJson.content !== undefined
                  ? parsedJson.content
                  : null

    if (possibleAnswer !== null && possibleAnswer !== undefined) {
      cleanContent =
        typeof possibleAnswer === 'string'
          ? possibleAnswer
          : JSON.stringify(possibleAnswer, null, 2)
    } else if (extractedToolCalls && extractedToolCalls.length > 0) {
      cleanContent = ''
    }
  }

  // 5. Fallback Regex jika parsing JSON gagal namun model menghasilkan format JSON raw di cleanContent
  if (
    !parsedJson &&
    cleanContent.includes('"thought"') &&
    (cleanContent.includes('"answer"') ||
      cleanContent.includes('"response"') ||
      cleanContent.includes('"content"') ||
      cleanContent.includes('"tool_calls"'))
  ) {
    const thoughtMatch = cleanContent.match(
      /"thought"\s*:\s*"([\s\S]*?)(?=",\s*"(?:answer|response|content|action|tool_calls|mood)")/
    )
    if (thoughtMatch) {
      cleanReasoning = cleanReasoning
        ? `${cleanReasoning}\n\n${thoughtMatch[1].trim()}`
        : thoughtMatch[1].trim()
      onReasoning?.(cleanReasoning)
    }
    const answerMatch = cleanContent.match(
      /"(?:answer|response|content)"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"[^"]+"\s*:|\}\s*$)/
    )
    if (answerMatch) {
      cleanContent = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
    }
  }

  // Jika memanggil tool
  const progressMeta = {
    ...providerMeta,
    await_user: awaitingUser,
    mood: extractedMood,
    message: extractedMessage,
    done: !awaitingUser && !(extractedToolCalls && extractedToolCalls.length > 0),
    hasExplicitDone: true,
    hasTag: false
  }
  onMeta?.(progressMeta)
  if (!awaitingUser && extractedToolCalls && extractedToolCalls.length > 0) {
    onToolCall?.(extractedToolCalls)
    return {
      content: null,
      reasoning: cleanReasoning,
      toolCalls: extractedToolCalls,
      finishReason: 'tool_calls',
      mood: extractedMood,
      meta: progressMeta
    }
  }

  // Jika bukan pemanggilan tool (teks balasan final)
  cleanContent = stripMarkTags(cleanContent).trim()
  if (!isGemini)
    cleanContent = cleanContent
      .replace(/\s*(?:FINISHED|FINISH|Task\s+Finished|DONE)\b.*$/i, '')
      .trim()

  if (stream) {
    onToken?.(cleanContent)
  }

  return {
    content: cleanContent,
    reasoning: cleanReasoning,
    toolCalls: null,
    finishReason: 'stop',
    mood: extractedMood,
    meta: progressMeta
  }
}
