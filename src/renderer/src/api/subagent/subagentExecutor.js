import { fetchAI } from '../ai/core'
import { subagentStore } from './subagentStore'
import { buildSubagentSystemPrompt } from './subagentPrompt'
import { core_tools_schema } from '../tools/core-tools'
import { webApi } from '../web-bridge.js'
import {
  MAX_CONTEXT_TOKENS,
  MAX_CONTEXT_CHARS,
  IN_LOOP_COMPACT_THRESHOLD,
  checkAndCompressInLoop
} from '../ai/contextManager'

// Registry AbortController aktif per sub-agent
const subagentAbortControllers = new Map()

/**
 * Menjalankan satu putaran eksekusi ReAct untuk sub-agent menggunakan Native Function Calling & SSE Streaming.
 */
export async function runSubagentTurn(subagentId, incomingMessage = null, senderType = 'mark') {
  const subagent = await subagentStore.getSubagent(subagentId)
  if (!subagent) {
    return { success: false, error: 'Sub-agent tidak ditemukan.' }
  }

  if (subagent.status === 'completed' || subagent.status === 'killed') {
    // Jika ada pesan baru ke subagent yang sudah selesai, hidupkan kembali (re-activate)
    await subagentStore.updateSubagent(subagentId, { status: 'running' })
  }

  // Rekam pesan masuk jika ada
  if (incomingMessage) {
    const isUser = senderType === 'user'
    const isPeer = senderType === 'subagent' || senderType === 'peer'
    const tag = isUser
      ? '[DARI CREATOR / USER]:'
      : isPeer
        ? '[DARI SESAMA SUB-AGENT]:'
        : '[DARI LEAD AGENT (MARK)]:'
    await subagentStore.addMessage(subagentId, {
      sender: isUser ? 'user' : isPeer ? 'peer' : 'mark',
      role: 'user',
      content: `${tag} ${incomingMessage}`
    })
  }

  // Siapkan AbortController
  const abortController = new AbortController()
  subagentAbortControllers.set(subagentId, abortController)
  await subagentStore.updateSubagent(subagentId, { status: 'running' })

  // Filter tools OpenAPI schema yang diizinkan untuk sub-agent ini
  const forbiddenTools = ['spawn_subagent', 'kill_subagent', 'wait_subagents']
  const specificAllowed =
    Array.isArray(subagent.allowedTools) &&
    subagent.allowedTools.length > 0 &&
    !subagent.allowedTools.includes('*') &&
    subagent.allowedTools.some((t) => t && t.trim() !== '')
      ? subagent.allowedTools.map((t) => t.trim())
      : null

  const allowedSchemas = []
  const registeredToolNames = new Set()

  // 1. Core tools
  for (const t of core_tools_schema) {
    const name = t.function?.name
    if (!name || forbiddenTools.includes(name) || registeredToolNames.has(name)) continue
    if (specificAllowed && !specificAllowed.includes(name)) continue
    allowedSchemas.push(t)
    registeredToolNames.add(name)
  }

  // 2. Group tools
  const groupToolsData = await webApi.getGroupTools()
  const groupToolsSchema = groupToolsData?.schema || {}
  for (const group of Object.values(groupToolsSchema)) {
    for (const t of group.tools || []) {
      const name = t.function?.name
      if (!name || forbiddenTools.includes(name) || registeredToolNames.has(name)) continue
      if (specificAllowed && !specificAllowed.includes(name)) continue
      allowedSchemas.push(t)
      registeredToolNames.add(name)
    }
  }

  const systemPrompt = buildSubagentSystemPrompt({
    role: subagent.role,
    goal: subagent.goal
  })

  let currentTurn = subagent.turnCount || 0
  let latestSubagentReply = ''

  try {
    while (!abortController.signal.aborted) {
      currentTurn++
      await subagentStore.updateSubagent(subagentId, { turnCount: currentTurn })

      if (abortController.signal.aborted) {
        break
      }

      // Ambil seluruh riwayat pesan sub-agent dari database
      const history = await subagentStore.getMessages(subagentId)
      let messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => {
          let textContent = m.content
          if (typeof textContent === 'string' && textContent.startsWith('[')) {
            try {
              const parsed = JSON.parse(textContent)
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
                textContent = parsed
              }
            } catch {
              /* ignore */
            }
          } else if (Array.isArray(textContent)) {
            // Sudah berbentuk array multimodal
          } else if (typeof textContent === 'object' && textContent !== null) {
            textContent =
              textContent.answer ||
              textContent.content ||
              textContent.message ||
              JSON.stringify(textContent)
          }

          // Jika ada turn assistant kosong dan tanpa tool_calls, ubah menjadi user turn dengan prefix
          if (
            (m.role === 'assistant' || m.role === 'model') &&
            !textContent &&
            (!m.tool_calls || m.tool_calls.length === 0)
          ) {
            return {
              role: 'user',
              content: '[Catatan Sistem]: Lanjutkan analisis dan langkah kerja berikutnya.'
            }
          }

          return {
            role: m.role,
            content: textContent,
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
          }
        })
      ]

      if (
        messagesPayload.length > 1 &&
        messagesPayload[messagesPayload.length - 1].role === 'assistant'
      ) {
        messagesPayload.push({
          role: 'user',
          content: '[Instruksi Lanjutan]: Lanjutkan giliran kerjamu.'
        })
      }

      // In-Loop Context Guard (Hermes 50% Threshold + O(n) Pruning untuk Sub-Agent)
      try {
        const inLoopResult = await checkAndCompressInLoop({
          loopMessages: messagesPayload,
          sessionId: `subagent_${subagentId}`,
          maxTokens: MAX_CONTEXT_TOKENS,
          maxChars: MAX_CONTEXT_CHARS,
          thresholdRatio: IN_LOOP_COMPACT_THRESHOLD,
          protectLastN: 6,
          protectFirstN: 1, // Pertahankan system prompt subagent
          activeConfig: {}
        })

        if (inLoopResult?.compressed && inLoopResult.loopMessages) {
          messagesPayload = inLoopResult.loopMessages
        }
      } catch (subErr) {
        console.warn(`[subagentExecutor:${subagentId}] In-loop compaction warning:`, subErr)
      }

      let turnReasoning = ''
      let turnContent = ''

      const streamResult = await fetchAI(messagesPayload, true, {
        sessionId: `subagent_${subagentId}`,
        tools: allowedSchemas,
        signal: abortController.signal,
        onReasoning: (chunk) => {
          turnReasoning += chunk
        },
        onToken: (token) => {
          turnContent += token
        }
      })

      let effectiveToolCalls = streamResult.toolCalls
      if (
        (!effectiveToolCalls || effectiveToolCalls.length === 0) &&
        (streamResult.content || turnContent)
      ) {
        const checkText = (streamResult.content || turnContent || '').trim()
        const rawMatch = checkText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        let cand = (rawMatch ? rawMatch[1] : checkText).trim()
        const firstBrace = cand.indexOf('{')
        const lastBrace = cand.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          cand = cand.substring(firstBrace, lastBrace + 1).trim()
        }
        if (
          cand.includes('"tool_calls"') ||
          cand.includes('"action"') ||
          cand.includes('"tool"') ||
          cand.includes('"name"')
        ) {
          try {
            const { jsonrepair } = await import('jsonrepair')
            let pObj = null
            try {
              pObj = JSON.parse(cand)
            } catch (_) {
              pObj = JSON.parse(jsonrepair(cand))
            }
            if (pObj) {
              if (Array.isArray(pObj.tool_calls) && pObj.tool_calls.length > 0) {
                effectiveToolCalls = pObj.tool_calls.map((tc, idx) => ({
                  id: tc.id || `call_subagent_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.name || tc.function?.name,
                    arguments:
                      typeof tc.arguments === 'object'
                        ? JSON.stringify(tc.arguments)
                        : String(tc.arguments || '{}')
                  }
                }))
              } else if (Array.isArray(pObj.action) && pObj.action.length > 0) {
                effectiveToolCalls = pObj.action
                  .filter((act) => act && (act.tool || act.name))
                  .map((act, idx) => ({
                    id: `call_subagent_${Date.now()}_${idx}`,
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
              } else if (Array.isArray(pObj) && pObj.length > 0) {
                effectiveToolCalls = pObj
                  .filter((item) => item && (item.name || item.tool || item.function?.name))
                  .map((item, idx) => ({
                    id: item.id || `call_subagent_${Date.now()}_${idx}`,
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
              } else if (pObj.action && (pObj.action.tool || pObj.action.name)) {
                effectiveToolCalls = [
                  {
                    id: `call_subagent_${Date.now()}_0`,
                    type: 'function',
                    function: {
                      name: pObj.action.tool || pObj.action.name,
                      arguments:
                        typeof pObj.action.arguments === 'object'
                          ? JSON.stringify(pObj.action.arguments)
                          : typeof pObj.action.query === 'object'
                            ? JSON.stringify(pObj.action.query)
                            : JSON.stringify(
                                pObj.action.query !== undefined ? { query: pObj.action.query } : {}
                              )
                    }
                  }
                ]
              } else if (pObj.tool) {
                effectiveToolCalls = [
                  {
                    id: `call_subagent_${Date.now()}_0`,
                    type: 'function',
                    function: {
                      name: pObj.tool,
                      arguments:
                        typeof pObj.query === 'object'
                          ? JSON.stringify(pObj.query)
                          : JSON.stringify(
                              pObj.query !== undefined
                                ? { query: pObj.query }
                                : pObj.arguments || {}
                            )
                    }
                  }
                ]
              }
            }
          } catch (_) {}
        }
      }

      // KONDISI 1: Sub-Agent Memanggil Native Tool Calls
      if (effectiveToolCalls && effectiveToolCalls.length > 0) {
        const assistantMsg = {
          sender: 'subagent',
          role: 'assistant',
          content: streamResult.content || null,
          thought: turnReasoning || null,
          tool_calls: effectiveToolCalls
        }
        await subagentStore.addMessage(subagentId, assistantMsg)
        const turnVisualUrls = []

        for (const tc of effectiveToolCalls) {
          const toolName = tc.function?.name
          let parsedArgs = {}
          try {
            parsedArgs = JSON.parse(tc.function?.arguments || '{}')
          } catch {
            parsedArgs = { raw: tc.function?.arguments || '' }
          }

          if (!toolName || abortController.signal.aborted) continue

          let resultString = ''

          try {
            let res
            if (toolName === 'message_agent') {
              const targetQuery = parsedArgs.target_agent || parsedArgs.targetAgent || ''
              const msgText = parsedArgs.message || ''

              if (!targetQuery || !msgText) {
                res = {
                  success: false,
                  error:
                    'Parameter message_agent tidak lengkap (target_agent dan message wajib ada).'
                }
              } else {
                const allAgents = await subagentStore.listSubagents()
                const targetAgent = allAgents.find(
                  (s) =>
                    s.id === targetQuery ||
                    s.name.toLowerCase() === targetQuery.toLowerCase() ||
                    s.name.toLowerCase().replace(/^@/, '') ===
                      targetQuery.toLowerCase().replace(/^@/, '')
                )

                if (!targetAgent) {
                  res = {
                    success: false,
                    error: `Sub-agent '${targetQuery}' tidak ditemukan. Daftar agen yang tersedia: ${allAgents.map((a) => `@${a.name}`).join(', ')}`
                  }
                } else if (targetAgent.id === subagentId) {
                  res = {
                    success: false,
                    error: 'Dilarang mengirim message_agent ke diri sendiri.'
                  }
                } else {
                  // Jalankan turn pada sub-agent target
                  const peerResult = await runSubagentTurn(
                    targetAgent.id,
                    `[PESAN DARI @${subagent.name}]: ${msgText}`,
                    'subagent'
                  )
                  if (peerResult.success) {
                    res = {
                      success: true,
                      data: `[JAWABAN DARI @${targetAgent.name}]:\n"${peerResult.reply}"\n${peerResult.thought ? `(Reasoning: ${peerResult.thought})` : ''}`
                    }
                  } else {
                    res = {
                      success: false,
                      error: `Sub-agent @${targetAgent.name} error: ${peerResult.error}`
                    }
                  }
                }
              }
            } else if (toolName === 'report_to_lead') {
              const summary = parsedArgs.summary || 'Misi telah selesai.'
              const artifact = parsedArgs.artifact || null
              const parentSessionId = String(subagent.parentSessionId || '1')
              const parentSessionTitle =
                subagent.parentSessionTitle ||
                (parentSessionId === '1' ? 'Main Thread' : `Sesi #${parentSessionId}`)

              // Broadcast push notification ke WebSocket Hub jika tersedia
              try {
                if (window.api && window.api.broadcastWsEvent) {
                  window.api.broadcastWsEvent('subagent:report', {
                    subagentId,
                    subagentName: subagent.name,
                    role: subagent.role,
                    summary,
                    artifact,
                    parentSessionId,
                    parentSessionTitle,
                    timestamp: Date.now()
                  })
                }
              } catch {
                /* ignore */
              }

              // Simpan record report ke subagent
              await subagentStore.updateSubagent(subagentId, {
                status: 'completed',
                finalAnswer: summary
              })

              res = {
                success: true,
                data: `[LAPORAN TERKIRIM KE LEAD AGENT (MARK)]\nLaporan berhasil disampaikan ke sesi "${parentSessionTitle}". Mark telah menerima push notification.`
              }
            } else if (toolName === 'read-tools') {
              const { definition: groups = {} } = await webApi.getGroupTools()
              const groupName = (parsedArgs.group_name || '').trim()
              if (!groupName) {
                res = {
                  success: false,
                  error: 'Harap sebutkan nama_grup (misal: "advanced_browser").'
                }
              } else if (groups[groupName]) {
                const formatted = Object.entries(groups[groupName].tools)
                  .map(([k, v]) => `- ${k}: ${v}`)
                  .join('\n')
                res = {
                  success: true,
                  data: `[PANDUAN TOOL ${groupName.toUpperCase()}]:\n${formatted}`
                }
              } else {
                res = { success: false, error: `Grup tool '${groupName}' tidak ditemukan.` }
              }
            } else if (toolName === 'memory-search') {
              const { executeMemorySearch } = await import('../vectorMemory.js')
              const formatted = await executeMemorySearch(parsedArgs.query || '')
              res = { success: true, data: formatted }
            } else if (toolName === 'analyze-screen') {
              try {
                const screens = await window.api?.takeScreenshot?.()
                const screenArray = Array.isArray(screens) ? screens : screens ? [screens] : []
                if (screenArray.length > 0) {
                  const promptText =
                    parsedArgs?.query ||
                    parsedArgs?.prompt ||
                    'Jelaskan apa yang kamu lihat di monitor ini secara ringkas, fokus pada teks, editor kode, atau pesan error.'
                  const contentArray = [
                    { type: 'text', text: promptText },
                    ...screenArray.map((scr) => ({ type: 'image_url', image_url: { url: scr } }))
                  ]
                  const visionResponse = await fetchAI(
                    [{ role: 'user', content: contentArray }],
                    false,
                    {
                      isSmallTask: true
                    }
                  )
                  const textContent =
                    typeof visionResponse === 'object' && visionResponse.content
                      ? visionResponse.content
                      : String(visionResponse)
                  res = {
                    success: true,
                    data: `[Vision AI - analyze-screen]:\n${textContent}`,
                    imageUrls: screenArray
                  }
                } else {
                  res = { success: false, error: 'Gagal mengambil tangkapan layar untuk analisis.' }
                }
              } catch (scrErr) {
                res = { success: false, error: `Error analyze-screen: ${scrErr.message}` }
              }
            } else if (toolName === 'camera-look') {
              try {
                const cameraFrame = await window.api?.captureCameraFrame?.()
                if (cameraFrame) {
                  const promptText =
                    parsedArgs?.query ||
                    parsedArgs?.prompt ||
                    'Jelaskan apa yang terlihat di depan kamera secara ringkas.'
                  const contentArray = [
                    { type: 'text', text: promptText },
                    { type: 'image_url', image_url: { url: cameraFrame } }
                  ]
                  const visionResponse = await fetchAI(
                    [{ role: 'user', content: contentArray }],
                    false,
                    {
                      isSmallTask: true
                    }
                  )
                  const textContent =
                    typeof visionResponse === 'object' && visionResponse.content
                      ? visionResponse.content
                      : String(visionResponse)
                  res = {
                    success: true,
                    data: `[Vision AI - camera-look]:\n${textContent}`,
                    imageUrls: [cameraFrame]
                  }
                } else {
                  res = {
                    success: false,
                    error: 'Kamera tidak aktif atau tidak dapat mengambil frame.'
                  }
                }
              } catch (camErr) {
                res = { success: false, error: `Error camera-look: ${camErr.message}` }
              }
            } else if (window.api && window.api.executeNativeTool) {
              res = await window.api.executeNativeTool(toolName, parsedArgs, {
                sessionId: subagentId
              })
              if (res && res.success && res.dataUrl) {
                if (toolName === 'read-image') {
                  const promptText =
                    parsedArgs?.query ||
                    parsedArgs?.prompt ||
                    'Jelaskan apa yang kamu lihat pada gambar ini secara rinci.'
                  try {
                    const visionResponse = await fetchAI(
                      [
                        {
                          role: 'user',
                          content: [
                            { type: 'text', text: promptText },
                            { type: 'image_url', image_url: { url: res.dataUrl } }
                          ]
                        }
                      ],
                      false,
                      { isSmallTask: true }
                    )
                    const textContent =
                      typeof visionResponse === 'object' && visionResponse.content
                        ? visionResponse.content
                        : String(visionResponse)
                    res.data = `[Vision AI - read-image] Analisis berkas '${res.filename || 'gambar'}':\n${textContent}`
                  } catch (vErr) {
                    res.data = `Berkas gambar '${res.filename || 'gambar'}' berhasil dibaca. (Analisis teks awal dilewati: ${vErr.message}). Gambar visual diteruskan ke observasi.`
                  }
                } else if (toolName === 'browser-screenshot' && (parsedArgs?.query || res.query)) {
                  const promptText =
                    parsedArgs?.query || res.query || 'Jelaskan tampilan visual halaman web ini.'
                  try {
                    const visionResponse = await fetchAI(
                      [
                        {
                          role: 'user',
                          content: [
                            { type: 'text', text: promptText },
                            { type: 'image_url', image_url: { url: res.dataUrl } }
                          ]
                        }
                      ],
                      false,
                      { isSmallTask: true }
                    )
                    const textContent =
                      typeof visionResponse === 'object' && visionResponse.content
                        ? visionResponse.content
                        : String(visionResponse)
                    res.data = `[Vision AI - browser-screenshot] ${res.message || 'Screenshot berhasil diambil.'}\nHasil analisis:\n${textContent}`
                  } catch (vErr) {
                    res.data = `${res.message || 'Screenshot berhasil diambil.'} (Analisis teks awal dilewati: ${vErr.message}). Gambar visual diteruskan ke observasi.`
                  }
                }
                res.imageUrls = [res.dataUrl]
              }
            } else {
              res = { success: false, error: 'IPC executeNativeTool tidak tersedia.' }
            }

            if (res && res.success) {
              if (res.data !== undefined) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else if (res.output !== undefined) {
                resultString =
                  typeof res.output === 'string' ? res.output : JSON.stringify(res.output)
              } else if (res.result !== undefined) {
                resultString =
                  typeof res.result === 'string' ? res.result : JSON.stringify(res.result)
              } else if (res.content !== undefined) {
                resultString =
                  typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
              } else if (res.contents !== undefined) {
                resultString =
                  typeof res.contents === 'string' ? res.contents : JSON.stringify(res.contents)
              } else {
                resultString = res.message || 'Success'
              }
            } else {
              resultString = `[ERROR] ${res?.message || res?.error || 'Unknown error'}`
            }

            if (Array.isArray(res?.imageUrls) && res.imageUrls.length > 0) {
              for (const u of res.imageUrls) {
                if (u && !turnVisualUrls.includes(u)) {
                  turnVisualUrls.push(u)
                }
              }
            }
          } catch (err) {
            resultString = `[ERROR] Tool ${toolName} crash: ${err.message}`
          }

          // Catat pesan role 'tool'
          await subagentStore.addMessage(subagentId, {
            sender: 'tool',
            role: 'tool',
            tool_call_id: tc.id,
            name: toolName,
            content: resultString
          })
        }

        // Jika ada tool visual yang dieksekusi, suntikkan observasi multimodal
        if (turnVisualUrls.length > 0) {
          await subagentStore.addMessage(subagentId, {
            sender: 'user',
            role: 'user',
            content: [
              {
                type: 'text',
                text: '[Visual Observation]: Berikut adalah gambar visual aktual beresolusi penuh dari eksekusi tool di atas untuk kamu analisis secara langsung:'
              },
              ...turnVisualUrls.map((url) => ({
                type: 'image_url',
                image_url: { url }
              }))
            ]
          })
        }

        // Lanjut ke giliran berikutnya agar subagent mengevaluasi hasil tool
        continue
      }

      // KONDISI 2: Sub-Agent Menyelesaikan Misi (Direct text answer / Finish reason: stop)
      latestSubagentReply = streamResult.content || turnContent || 'Misi teknis selesai.'
      await subagentStore.addMessage(subagentId, {
        sender: 'subagent',
        role: 'assistant',
        content: latestSubagentReply,
        thought: turnReasoning || null
      })

      await subagentStore.updateSubagent(subagentId, {
        status: 'completed',
        finalAnswer: latestSubagentReply
      })

      // Otomatis laporkan hasil akhir ke Lead Agent (Mark) jika subagent menjawab teks
      try {
        const parentSessionId = String(subagent.parentSessionId || '1')
        const parentSessionTitle =
          subagent.parentSessionTitle ||
          (parentSessionId === '1' ? 'Main Thread' : `Sesi #${parentSessionId}`)

        if (window.api && window.api.broadcastWsEvent) {
          window.api.broadcastWsEvent('subagent:report', {
            subagentId,
            subagentName: subagent.name,
            role: subagent.role,
            summary: latestSubagentReply,
            artifact: null,
            parentSessionId,
            parentSessionTitle,
            timestamp: Date.now()
          })
        }
      } catch (reportErr) {
        console.warn('[subagentExecutor] Gagal auto-report ke Lead Agent:', reportErr)
      }

      return {
        success: true,
        subagentId,
        reply: latestSubagentReply,
        thought: turnReasoning || '',
        turnCount: currentTurn
      }
    }

    // Jika turn berakhir secara alami tanpa pemanggilan tool di turn terakhir (status completed/selesai)
    await subagentStore.updateSubagent(subagentId, {
      status: 'completed',
      finalAnswer: latestSubagentReply || 'Misi sub-agent selesai.'
    })

    if (latestSubagentReply) {
      try {
        const parentSessionId = String(subagent.parentSessionId || '1')
        const parentSessionTitle =
          subagent.parentSessionTitle ||
          (parentSessionId === '1' ? 'Main Thread' : `Sesi #${parentSessionId}`)

        if (window.api && window.api.broadcastWsEvent) {
          window.api.broadcastWsEvent('subagent:report', {
            subagentId,
            subagentName: subagent.name,
            role: subagent.role,
            summary: latestSubagentReply,
            artifact: null,
            parentSessionId,
            parentSessionTitle,
            timestamp: Date.now()
          })
        }
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      subagentId,
      reply: latestSubagentReply || 'Misi selesai.',
      turnCount: currentTurn
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      await subagentStore.updateSubagent(subagentId, { status: 'killed' })
      return { success: false, subagentId, error: 'Eksekusi dibatalkan oleh pengguna.' }
    }
    console.error(`[Subagent Execution Error on ${subagentId}]:`, err)
    // Rekam pesan error agar terlihat langsung di Agent Workspace UI
    await subagentStore.addMessage(subagentId, {
      sender: 'system',
      role: 'system',
      content: `[ERROR EKSEKUSI]: ${err.message || 'Terjadi kesalahan tidak terduga saat memproses AI.'}`
    })
    await subagentStore.updateSubagent(subagentId, {
      status: 'failed',
      finalAnswer: `Error: ${err.message}`
    })
    return { success: false, subagentId, error: err.message }
  } finally {
    subagentAbortControllers.delete(subagentId)
    if (window.api && window.api.executeNativeTool) {
      window.api.executeNativeTool('browser-close', '', { sessionId: subagentId }).catch(() => {})
    }
  }
}

/**
 * Membatalkan paksa eksekusi sub-agent yang sedang berjalan
 * @param {string} subagentId ID sub-agent
 * @param {boolean} isDeleting Apakah pembatalan ini karena penghapusan entitas
 */
export function killSubagentExecution(subagentId, isDeleting = false) {
  const ctrl = subagentAbortControllers.get(subagentId)
  if (ctrl) {
    ctrl.abort()
    subagentAbortControllers.delete(subagentId)
  }
  if (!isDeleting) {
    subagentStore.updateSubagent(subagentId, { status: 'killed' }).catch(() => {})
  }
  if (window.api && window.api.executeNativeTool) {
    window.api.executeNativeTool('browser-close', '', { sessionId: subagentId }).catch(() => {})
  }
}
