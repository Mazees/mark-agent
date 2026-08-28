import { fetchAIStream } from '../ai/core'
import { subagentStore } from './subagentStore'
import { buildSubagentSystemPrompt } from './subagentPrompt'
import { core_tools_schema } from '../tools/core-tools'
import { GROUP_TOOLS_SCHEMA } from '../tools/group-tools'

// Registry AbortController aktif per sub-agent
const subagentAbortControllers = new Map()

/**
 * Normalisasi query/argumen tool OpenAPI ke parameter native tool execution
 */
const normalizeSubagentToolQuery = (tool, queryOrArgs) => {
  if (typeof queryOrArgs === 'string') return queryOrArgs
  if (!queryOrArgs || typeof queryOrArgs !== 'object') return ''

  const a = queryOrArgs

  switch (tool) {
    case 'read-file':
      if (a.start_line !== undefined && a.end_line !== undefined) {
        return `${a.path || ''}||${a.start_line}||${a.end_line}`
      }
      return a.path || ''

    case 'write-file':
      return `${a.path || ''}||${a.content || ''}`

    case 'replace-content':
      return `${a.path || ''}||${a.target_content || ''}||${a.replacement_content || ''}`

    case 'replace-lines':
      return `${a.path || ''}||${a.start_line || 1}||${a.end_line || 1}||${a.new_code || ''}`

    case 'delete-file':
    case 'file-outline':
      return a.path || ''

    case 'list-dir':
      return a.path || ''

    case 'find-files':
      if (a.subfolder) return `${a.pattern || ''}||${a.subfolder}`
      return a.pattern || ''

    case 'grep-search':
      if (a.path) return `${a.keyword || ''}||${a.path}`
      return a.keyword || ''

    case 'read-document':
      if (a.keyword) return `${a.path || ''}||${a.keyword}`
      return a.path || ''

    case 'read-tools':
      return a.group_name || ''

    case 'run-powershell':
      return a.command || ''

    case 'open':
      return a.target || ''

    case 'browser-navigate':
      return a.url || ''

    case 'browser-read':
    case 'browser-show':
    case 'browser-hide':
      return ''

    case 'browser-click':
      return String(a.element_id ?? '')

    case 'browser-type':
      return `${a.element_id ?? ''}||${a.text || ''}`

    case 'browser-scroll':
      return a.direction || 'down'

    case 'browser-extract':
      return a.selector || ''

    case 'browser-script':
      return a.script || ''

    case 'browser-screenshot':
      return a.filename || 'screenshot.png'

    case 'browser-download':
      return `${a.url || ''}||${a.filename || ''}`

    case 'browser-ask-user':
      return a.prompt || ''

    case 'browser-close':
      return ''

    case 'os-click':
    case 'os-double-click':
      return String(a.target || '')

    case 'os-type':
      return a.text || ''

    case 'os-key':
      return a.combo || ''

    case 'os-scroll':
      return `${a.direction || 'down'}||${a.amount || 3}`

    case 'os-delay':
      return String(a.ms || 1000)

    case 'os-search':
      return a.keyword || ''

    case 'os-focus-window':
      return a.title || ''

    case 'os-list-windows':
    case 'os-control-open':
    case 'os-control-close':
      return ''

    case 'gdrive-info':
      return 'all'

    case 'gdrive-search':
      if (a.pagination) return `${a.query || ''}||${a.pagination}`
      return a.query || ''

    case 'gdrive-list':
      if (a.pagination) return `${a.folder_id || ''}||${a.pagination}`
      return a.folder_id || ''

    case 'gdrive-read':
      return a.file_id || ''

    case 'gdrive-upload':
      return `${a.name || ''}||${a.content || ''}`

    case 'gdrive-create':
      return `${a.name || ''}||${a.type || 'doc'}`

    case 'gdrive-move':
      return `${a.file_id || ''}||${a.folder_id || ''}`

    case 'gdrive-copy':
      return `${a.file_id || ''}||${a.new_name || ''}`

    case 'gcalendar-list':
      if (a.time_min) return `${a.pagination || '0-10'}||${a.time_min}`
      return a.pagination || '0-10'

    case 'gcalendar-create':
      return `${a.summary || ''}||${a.description || ''}||${a.start_time || ''}||${a.end_time || ''}`

    case 'gcalendar-delete':
      return a.event_id || ''

    case 'gmail-search':
      if (a.pagination) return `${a.query || 'is:unread'}||${a.pagination}`
      return a.query || 'is:unread'

    case 'gmail-list':
      return a.pagination || '0-10'

    case 'gmail-read':
    case 'gmail-mark-read':
      return a.message_id || ''

    case 'gmail-send':
      return `${a.to || ''}||${a.subject || ''}||${a.body || ''}`

    case 'screenshot-to-tg':
      return ''

    case 'tg-send':
      return `${a.chat_id || ''}||${a.type || 'text'}||${a.content || ''}`

    case 'speak':
      return a.text || ''

    case 'analyze-screen':
    case 'camera-look':
      return a.query || ''

    case 'yt-search':
      return a.query || ''

    case 'yt-summary':
      return a.url || ''

    case 'music-play':
      return a.title || ''

    case 'music-toggle':
    case 'music-next':
    case 'music-prev':
      return ''

    case 'git-status':
      return a.path || ''

    case 'git-diff':
      return a.file_path || ''

    case 'git-commit':
      return a.message || ''

    case 'git-revert':
      return a.file_path || ''

    case 'run-task':
      return `${a.task_id || ''}||${a.command || ''}`

    case 'read-task-output':
      return `${a.task_id || ''}||${a.lines || 50}`

    case 'kill-task':
      return a.task_id || ''

    case 'memory-search':
      return a.query || ''

    default:
      if (a.query) return a.query
      return JSON.stringify(a)
  }
}

/**
 * Menjalankan satu putaran eksekusi ReAct untuk sub-agent menggunakan Native Function Calling & SSE Streaming.
 * @param {string} subagentId ID sub-agent
 * @param {string|null} incomingMessage Pesan baru dari Lead Agent (Mark) atau User
 * @param {string} senderType 'mark' | 'user'
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
    const tag = isUser ? '[DARI CREATOR / USER (MADA)]:' : '[DARI LEAD AGENT (MARK)]:'
    await subagentStore.addMessage(subagentId, {
      sender: isUser ? 'user' : 'mark',
      role: 'user',
      content: `${tag} ${incomingMessage}`
    })
  }

  // Siapkan AbortController
  const abortController = new AbortController()
  subagentAbortControllers.set(subagentId, abortController)
  await subagentStore.updateSubagent(subagentId, { status: 'running' })

  // Filter tools OpenAPI schema yang diizinkan untuk sub-agent ini
  const forbiddenTools = ['spawn_subagent', 'send_message', 'kill_subagent', 'wait_subagents']
  const specificAllowed =
    Array.isArray(subagent.allowedTools) &&
    subagent.allowedTools.length > 0 &&
    !subagent.allowedTools.includes('*') &&
    subagent.allowedTools.some((t) => t && t.trim() !== '')
      ? subagent.allowedTools.map((t) => t.trim())
      : null

  const allowedSchemas = []

  // 1. Core tools
  for (const t of core_tools_schema) {
    const name = t.function?.name
    if (forbiddenTools.includes(name)) continue
    if (specificAllowed && !specificAllowed.includes(name)) continue
    allowedSchemas.push(t)
  }

  // 2. Group tools
  for (const group of Object.values(GROUP_TOOLS_SCHEMA)) {
    for (const t of group.tools || []) {
      const name = t.function?.name
      if (forbiddenTools.includes(name)) continue
      if (specificAllowed && !specificAllowed.includes(name)) continue
      allowedSchemas.push(t)
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
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
        }))
      ]

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

          const query = normalizeSubagentToolQuery(toolName, parsedArgs)
          let resultString = ''

          try {
            let res
            if (toolName === 'read-tools') {
              const { group_tools } = await import('../tools/group-tools.js')
              const groups = await group_tools()
              const groupName = (parsedArgs.group_name || query || '').trim()
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
              const formatted = await executeMemorySearch(parsedArgs.query || query)
              res = { success: true, data: formatted }
            } else if (window.api && window.api.executeNativeTool) {
              res = await window.api.executeNativeTool(toolName, query, { sessionId: subagentId })
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

          if (resultString.length > 4000) {
            resultString =
              resultString.slice(0, 4000) +
              `\n\n[...SISA DATA DIPOTONG (Total: ${resultString.length} karakter)...]`
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
        status: 'idle',
        finalAnswer: latestSubagentReply
      })

      return {
        success: true,
        subagentId,
        reply: latestSubagentReply,
        thought: turnReasoning || '',
        turnCount: currentTurn
      }
    }

    await subagentStore.updateSubagent(subagentId, {
      status: 'idle',
      finalAnswer: latestSubagentReply || 'Misi sub-agent selesai.'
    })

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
    await subagentStore.updateSubagent(subagentId, { status: 'failed' })
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
 */
export function killSubagentExecution(subagentId) {
  const ctrl = subagentAbortControllers.get(subagentId)
  if (ctrl) {
    ctrl.abort()
    subagentAbortControllers.delete(subagentId)
  }
  subagentStore.updateSubagent(subagentId, { status: 'killed' })
  if (window.api && window.api.executeNativeTool) {
    window.api.executeNativeTool('browser-close', '', { sessionId: subagentId }).catch(() => {})
  }
}
