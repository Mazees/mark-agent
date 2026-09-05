import { fetchAIStream } from '../ai/core'
import { subagentStore } from './subagentStore'
import { buildSubagentSystemPrompt } from './subagentPrompt'
import { core_tools_schema } from '../tools/core-tools'
import { GROUP_TOOLS_SCHEMA } from '../tools/group-tools'

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
      sender: isUser ? 'user' : (isPeer ? 'peer' : 'mark'),
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
  for (const group of Object.values(GROUP_TOOLS_SCHEMA)) {
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
          if (typeof textContent === 'object' && textContent !== null) {
            textContent = textContent.answer || textContent.content || textContent.message || JSON.stringify(textContent)
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

      if (messagesPayload.length > 1 && messagesPayload[messagesPayload.length - 1].role === 'assistant') {
        messagesPayload.push({
          role: 'user',
          content: '[Instruksi Lanjutan]: Lanjutkan giliran kerjamu.'
        })
      }

      let turnReasoning = ''
      let turnContent = ''

      const streamResult = await fetchAIStream({
        messages: messagesPayload,
        tools: allowedSchemas,
        signal: abortController.signal,
        onReasoning: (chunk) => {
          turnReasoning += chunk
        },
        onToken: (token) => {
          turnContent += token
        }
      })

      // KONDISI 1: Sub-Agent Memanggil Native Tool Calls
      if (streamResult.toolCalls && streamResult.toolCalls.length > 0) {
        const assistantMsg = {
          sender: 'subagent',
          role: 'assistant',
          content: streamResult.content || null,
          thought: turnReasoning || null,
          tool_calls: streamResult.toolCalls
        }
        await subagentStore.addMessage(subagentId, assistantMsg)

        for (const tc of streamResult.toolCalls) {
          const toolName = tc.function?.name
          let parsedArgs = {}
          try {
            parsedArgs = JSON.parse(tc.function?.arguments || '{}')
          } catch (_) {
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
                res = { success: false, error: 'Parameter message_agent tidak lengkap (target_agent dan message wajib ada).' }
              } else {
                const allAgents = await subagentStore.listSubagents()
                const targetAgent = allAgents.find(
                  (s) =>
                    s.id === targetQuery ||
                    s.name.toLowerCase() === targetQuery.toLowerCase() ||
                    s.name.toLowerCase().replace(/^@/, '') === targetQuery.toLowerCase().replace(/^@/, '')
                )

                if (!targetAgent) {
                  res = {
                    success: false,
                    error: `Sub-agent '${targetQuery}' tidak ditemukan. Daftar agen yang tersedia: ${allAgents.map((a) => `@${a.name}`).join(', ')}`
                  }
                } else if (targetAgent.id === subagentId) {
                  res = { success: false, error: 'Dilarang mengirim message_agent ke diri sendiri.' }
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
                    res = { success: false, error: `Sub-agent @${targetAgent.name} error: ${peerResult.error}` }
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
              } catch (_) {}

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
              const { group_tools } = await import('../tools/group-tools.js')
              const groups = await group_tools()
              const groupName = (parsedArgs.group_name || '').trim()
              if (!groupName) {
                res = { success: false, error: 'Harap sebutkan nama_grup (misal: "advanced_browser").' }
              } else if (groups[groupName]) {
                const formatted = Object.entries(groups[groupName].tools)
                  .map(([k, v]) => `- ${k}: ${v}`)
                  .join('\n')
                res = { success: true, data: `[PANDUAN TOOL ${groupName.toUpperCase()}]:\n${formatted}` }
              } else {
                res = { success: false, error: `Grup tool '${groupName}' tidak ditemukan.` }
              }
            } else if (toolName === 'memory-search') {
              const { executeMemorySearch } = await import('../vectorMemory.js')
              const formatted = await executeMemorySearch(parsedArgs.query || '')
              res = { success: true, data: formatted }
            } else if (window.api && window.api.executeNativeTool) {
              res = await window.api.executeNativeTool(toolName, parsedArgs, { sessionId: subagentId })
            } else {
              res = { success: false, error: 'IPC executeNativeTool tidak tersedia.' }
            }

            if (res && res.success) {
              if (res.data !== undefined) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else if (res.output !== undefined) {
                resultString = typeof res.output === 'string' ? res.output : JSON.stringify(res.output)
              } else if (res.result !== undefined) {
                resultString = typeof res.result === 'string' ? res.result : JSON.stringify(res.result)
              } else if (res.content !== undefined) {
                resultString = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
              } else if (res.contents !== undefined) {
                resultString = typeof res.contents === 'string' ? res.contents : JSON.stringify(res.contents)
              } else {
                resultString = res.message || 'Success'
              }
            } else {
              resultString = `[ERROR] ${res?.message || res?.error || 'Unknown error'}`
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
      } catch (_) {}
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
    await subagentStore.updateSubagent(subagentId, { status: 'failed', finalAnswer: `Error: ${err.message}` })
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
