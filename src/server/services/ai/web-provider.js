import fs from 'fs'
import path from 'path'
import os from 'os'
import { generateGeminiResponse } from '../gemini-web.js'
import {
  generateDeepSeekResponse,
  uploadImageFile,
  waitForFileReady,
  getSessionState
} from '../deepseek-web.js'
import {
  cleanAndParse,
  checkCloudThrottle,
  getSystemSignature,
  createMoodStreamFilter
} from './ai-utils.js'
import { getActiveConfig, loadConfig } from '../../config-manager.js'
import { GROUP_TOOLS_SCHEMA } from '../../tools/group-tools.js'
import { loadAllPlugins } from '../../../main/plugins/plugin-loader.js'

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

/**
 * Membangun Dynamic State Anchor ringkas untuk turn sela sesi aktif DeepSeek Web.
 * Memangkas persona dan background statis (~15.000 char -> ~400-800 char),
 * namun tetap membawa waktu real-time, status PC, status musik, relational traits,
 * mood continuity anchor, serta skema tools jika hasTools aktif.
 */
function buildDynamicStateAnchor(sysMsgs, lastAssistant, hasTools = false) {
  const fullContent = (sysMsgs || [])
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n')

  const extractedSections = []

  // 1. Konteks Waktu & Riwayat
  const timeMatch = fullContent.match(/\[KONTEKS WAKTU & RIWAYAT\][\s\S]*?(?=\n#|\n\n\[|$)/i)
  if (timeMatch) extractedSections.push(timeMatch[0].trim())

  // 2. Relational Growth (warmth, trust, sarcasm)
  const relMatch = fullContent.match(/# RELATIONAL GROWTH[\s\S]*?(?=\n#|\n\n\[|$)/i)
  if (relMatch) extractedSections.push(relMatch[0].trim())

  // 3. Telemetri Fisik PC
  const telemMatch = fullContent.match(/# TELEMETRI FISIK PC[\s\S]*?(?=\n#|\n\n\[|$)/i)
  if (telemMatch) extractedSections.push(telemMatch[0].trim())

  // 4. Status Player Musik
  const musicMatch = fullContent.match(/# STATUS PLAYER MUSIK[\s\S]*?(?=\n#|\n\n\[|$)/i)
  if (musicMatch) extractedSections.push(musicMatch[0].trim())

  // 5. Gumaman Batin Terakhir
  const thoughtMatch = fullContent.match(/# GUMAMAN BATIN TERAKHIR[\s\S]*?(?=\n#|\n\n\[|$)/i)
  if (thoughtMatch) extractedSections.push(thoughtMatch[0].trim())

  const lastMood = lastAssistant?.mood || 'neutral'
  const dynamicBody = extractedSections.length > 0 ? `\n\n${extractedSections.join('\n\n')}` : ''

  let toolSection = ''
  if (hasTools) {
    const toolMatch = fullContent.match(/# TOOLS & CAPABILITY REGISTRY[\s\S]*$/i)
    if (toolMatch) {
      toolSection = `\n\n${toolMatch[0].trim()}`
    }
  }

  return `[DYNAMIC STATE ANCHOR - MARK AI OS]
Kamu adalah MARK (Metacognitive Artificial Relational Knowledge). Tetap konsisten dengan kepribadian santai/cerdas tongkrongan, bukan robot kaku.
ATURAN EMOSI MUTLAK: Awali karakter pertama responmu dengan tag <mood:nama_mood> (joy/sadness/fear/anger/disgust/anxiety/envy/embarrassment/ennui/neutral).
Status emosi giliran sebelumnya: <mood:${lastMood}>. Pertahankan kontinuitas transisi emosi secara natural!${dynamicBody}${toolSection}`
}

export async function executeWebProvider({
  messages,
  tools = null,
  stream = false,
  config = {},
  isSmallTask = false,
  jsonSchema = null,
  sessionId = null,
  onToken = null,
  onReasoning = null,
  onMood = null,
  onToolCall = null,
  onStatus = null
}) {
  const activeConf = getActiveConfig() || {}
  const conf = { ...activeConf, ...(config || {}) }
  const isGemini = conf.aiProvider === 'gemini-web'
  const hasTools = Array.isArray(tools) && tools.length > 0
  const shouldStreamContent = stream && !hasTools && !jsonSchema

  let streamedAnyToken = false
  const moodFilter =
    shouldStreamContent && onToken
      ? createMoodStreamFilter(
          (token) => {
            streamedAnyToken = true
            onToken(token)
          },
          (mood) => {
            onMood?.(mood)
          }
        )
      : null

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
4. Format JSON untuk memanggil tool WAJIB persis seperti ini (mendukung BATCH / MULTI-TOOL sekaligus):
{
  "tool_calls": [
    {
      "name": "nama_tool_1",
      "arguments": { "parameter_key": "parameter_value" }
    },
    {
      "name": "nama_tool_2",
      "arguments": { "parameter_key": "parameter_value" }
    }
  ]
}
5. ATURAN BATCH & PARALLEL ACTIONS (EFISIENSI MAKSIMAL):
   - Kamu SANGAT DIANJURKAN menyertakan beberapa tool sekaligus di dalam array "tool_calls" dalam satu giliran jika aksi-aksi tersebut sekuensial dan sudah pasti (misal otomasi PC: klik + ketik + key combo, riset web: multi-fetch beberapa URL, atau membaca beberapa berkas sekaligus).
   - Seluruh tool dalam array "tool_calls" akan dieksekusi secara berurutan dan hasilnya dikembalikan sekaligus dalam observasi berikutnya.
6. Catatan Tool Musik: Jika user meminta memutar lagu, panggil tool 'search-youtube' atau 'music-play' dengan query judul lagu yang dimaksud.
7. HANYA JIKA kamu TIDAK memanggil tool sama sekali, barulah kamu boleh menjawab dengan pesan teks santai/biasa kepada pengguna.`

    const sysIdx = workMessages.findIndex((m) => m.role === 'system')
    if (sysIdx >= 0) {
      workMessages[sysIdx].content += toolInstruction
    } else {
      workMessages.unshift({ role: 'system', content: toolInstruction })
    }
  }

  // 3. Susun Full Prompt Tunggal
  // Untuk DeepSeek Web yang sudah memiliki sesi bersambung (chained session aktif),
  // hanya kirim turn pesan aktif terbaru (setelah pesan assistant terakhir).
  // Untuk turn pertama sesi atau Gemini, kirim semua pesan (full context).
  const userToken =
    conf.deepseekUserToken?.trim() ||
    getActiveConfig()?.deepseekUserToken?.trim() ||
    loadConfig()?.deepseekUserToken?.trim() ||
    ''

  const dsSessionState =
    !isGemini && !!userToken ? getSessionState(userToken, isSmallTask, sessionId) : null
  const isDeepSeekActiveSession = !isGemini && !!userToken && !!dsSessionState?.lastMessageId
  const currentTurnCount = dsSessionState?.turnCount || 0

  let messagesToPrompt = workMessages
  if (isDeepSeekActiveSession) {
    let lastAssistantIdx = -1
    for (let i = workMessages.length - 1; i >= 0; i--) {
      const role = (workMessages[i]?.role || '').toLowerCase()
      if (role === 'assistant' || role === 'ai' || role === 'model') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx >= 0 && lastAssistantIdx < workMessages.length - 1) {
      const sysMsgs = workMessages.filter((m) => m.role === 'system')
      const activeTurn = workMessages.slice(lastAssistantIdx + 1).filter((m) => m.role !== 'system')
      const lastAssistant = workMessages[lastAssistantIdx]

      // Injeksi periodik: Turn 1 (currentTurnCount = 0) dan kelipatan 5 (currentTurnCount % 5 === 0)
      // mendapatkan Full System Prompt untuk me-refresh instruksi dan mengatasi lost-in-the-middle.
      // Turn sela (2-5, 7-10) mendapatkan Dynamic State Anchor ringkas.
      const isRefreshTurn = currentTurnCount % 5 === 0

      let effectiveSysMsgs = sysMsgs
      if (!isRefreshTurn) {
        const anchorText = buildDynamicStateAnchor(sysMsgs, lastAssistant, hasTools)
        effectiveSysMsgs = [{ role: 'system', content: anchorText }]
      }

      // Sertakan pesan asisten terakhir beserta mood-nya agar riwayat emosi tetap kontinu di sesi DeepSeek aktif
      messagesToPrompt = [...effectiveSysMsgs, lastAssistant, ...activeTurn]
    }
  }

  // Seluruh riwayat percakapan (system prompt, riwayat obrolan terdahulu, observasi tool, dan prompt aktif)
  // disusun utuh ke dalam fullPrompt agar model menerima 100% konteks obrolan.
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

    // Sisipkan riwayat mood pada pesan asisten terdahulu agar model memahami kesinambungan emosinya
    if (
      (roleName === 'ASSISTANT' || roleName === 'AI' || roleName === 'MODEL') &&
      m.mood &&
      !/^(?:<|\[)mood:/i.test(textBody.trim())
    ) {
      textBody = `<mood:${m.mood}> ${textBody}`
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
              streamedAnyToken = true
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
    const moodMatch = cleanReasoning.match(/(?:<|\[)mood:([a-zA-Z_]+)(?:>|\])/)
    if (moodMatch) {
      onMood?.(moodMatch[1].toLowerCase())
    }
    cleanReasoning = cleanReasoning.replace(/(?:<|\[)mood:[a-zA-Z_]+(?:>|\])/gi, '').trim()
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
      prelude.match(/(?:<|\[)mood:([a-zA-Z_]+)(?:>|\])/) ||
      cleanContent.match(/(?:<|\[)mood:([a-zA-Z_]+)(?:>|\])/)
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
        } else if (Array.isArray(parsed.action) && parsed.action.length > 0) {
          // Dukungan format BATCH ACTIONS array V4: { "action": [ { "tool": "...", "query": "..." }, ... ] }
          extractedToolCalls = parsed.action
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
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          // Dukungan format array tool calls langsung: [ { "name": "...", "arguments": ... }, ... ]
          extractedToolCalls = parsed
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
                            (item.query !== undefined
                              ? JSON.stringify({ query: item.query })
                              : '{}')
                        )
              }
            }))
        } else if (parsed.action && (parsed.action.tool || parsed.action.name)) {
          extractedToolCalls = [
            {
              id: `call_${Date.now()}_0`,
              type: 'function',
              function: {
                name: parsed.action.tool || parsed.action.name,
                arguments:
                  typeof parsed.action.arguments === 'object'
                    ? JSON.stringify(parsed.action.arguments)
                    : typeof parsed.action.query === 'object'
                      ? JSON.stringify(parsed.action.query)
                      : JSON.stringify(
                          parsed.action.query !== undefined ? { query: parsed.action.query } : {}
                        )
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
    const moodMatch = cleanContent.match(/(?:<|\[)mood:([a-zA-Z_]+)(?:>|\])/)
    if (moodMatch) {
      onMood?.(moodMatch[1].toLowerCase())
    }
    cleanContent = cleanContent.replace(/(?:<|\[)mood:[a-zA-Z_]+(?:>|\])/gi, '').trim()
    if (!streamedAnyToken) {
      onToken?.(cleanContent)
    }
  }

  return {
    content: cleanContent,
    reasoning: cleanReasoning,
    toolCalls: null,
    finishReason: 'stop'
  }
}
