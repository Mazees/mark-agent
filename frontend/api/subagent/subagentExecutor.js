import { fetchAI, cleanAndParse } from '../ai/core'
import { subagentStore } from './subagentStore'
import { buildSubagentSystemPrompt } from './subagentPrompt'
import { core_tools } from '../tools/core-tools'
import { GROUP_TOOLS_DEFINITION } from '../tools/group-tools'

// Registry AbortController aktif per sub-agent
const subagentAbortControllers = new Map()

/**
 * Menjalankan satu putaran eksekusi ReAct untuk sub-agent
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

  // Format tool bawaan (core) dan kelompok tool tambahan persis seperti Lead Agent (Mark)
  const forbiddenTools = ['spawn_subagent', 'send_message', 'kill_subagent', 'wait_subagents']
  const specificAllowed =
    Array.isArray(subagent.allowedTools) &&
    subagent.allowedTools.length > 0 &&
    !subagent.allowedTools.includes('*') &&
    subagent.allowedTools.some((t) => t && t.trim() !== '')
      ? subagent.allowedTools.map((t) => t.trim())
      : null

  const coreToolsText = Object.entries(core_tools)
    .filter(([k]) => {
      if (forbiddenTools.includes(k)) return false
      if (specificAllowed) return specificAllowed.includes(k)
      return true
    })
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const groupToolsText = GROUP_TOOLS_DEFINITION
    ? Object.entries(GROUP_TOOLS_DEFINITION)
        .map(([k, v]) => `- ${k}: ${v.description}`)
        .join('\n')
    : ''

  const systemPrompt = buildSubagentSystemPrompt({
    role: subagent.role,
    goal: subagent.goal,
    coreToolsText,
    groupToolsText
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

      // Ambil seluruh riwayat pesan sub-agent dari Dexie
      const history = await subagentStore.getMessages(subagentId)
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content }))
      ]

      const aiResponseRaw = await fetchAI(messagesPayload, {
        signal: abortController.signal
      })

      if (aiResponseRaw && aiResponseRaw.error) {
        throw new Error(aiResponseRaw.error)
      }

      const rawContent = aiResponseRaw?.content !== undefined ? aiResponseRaw.content : aiResponseRaw
      const decision = cleanAndParse(rawContent)
      if (!decision) {
        throw new Error('Sub-Agent mengembalikan output yang tidak dapat diparse sebagai JSON.')
      }

      // KONDISI 1: Sub-Agent Ingin Berbicara / Melapor ke Mark (action null / selesai)
      if (!decision.action && decision.answer) {
        latestSubagentReply = decision.answer
        await subagentStore.addMessage(subagentId, {
          sender: 'subagent',
          role: 'assistant',
          content: JSON.stringify({ thought: decision.thought, answer: decision.answer }),
          thought: decision.thought
        })
        await subagentStore.updateSubagent(subagentId, {
          status: 'idle',
          finalAnswer: decision.answer
        })

        return {
          success: true,
          subagentId,
          reply: decision.answer,
          thought: decision.thought || '',
          turnCount: currentTurn
        }
      }

      // KONDISI 2: Sub-Agent Ingin Mengeksekusi Tool
      if (decision.action) {
        await subagentStore.addMessage(subagentId, {
          sender: 'subagent',
          role: 'assistant',
          content: JSON.stringify({ thought: decision.thought, action: decision.action }),
          thought: decision.thought,
          action: decision.action
        })

        // Tangani Batch Actions vs Single Action
        const actionsToExecute = Array.isArray(decision.action) ? decision.action : [decision.action]
        const observations = []

        for (const act of actionsToExecute) {
          if (!act?.tool) continue
          if (abortController.signal.aborted) break

          try {
            let res
            if (act.tool === 'read-tools') {
              const { group_tools } = await import('../tools/group-tools.js')
              const groups = await group_tools()
              const groupName = (act.query || '').trim()
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
            } else if (act.tool === 'memory-search') {
              const { executeMemorySearch } = await import('../vectorMemory.js')
              const formatted = await executeMemorySearch(act.query || '')
              res = { success: true, data: formatted }
            } else if (window.api && window.api.executeNativeTool) {
              res = await window.api.executeNativeTool(act.tool, act.query || '', { sessionId: subagentId })
            } else {
              res = { success: false, error: 'IPC executeNativeTool tidak tersedia.' }
            }

            const resultStr = res.success
              ? typeof res.data === 'string'
                ? res.data
                : JSON.stringify(res.data)
              : `[ERROR] ${res.error}`

            observations.push(`[${act.tool}] ${resultStr}`)
          } catch (err) {
            observations.push(`[${act.tool} ERROR] ${err.message}`)
          }
        }

        let combinedObservation = observations.join('\n\n')
        if (combinedObservation.length > 4000) {
          combinedObservation =
            combinedObservation.slice(0, 4000) +
            `\n\n[...SISA DATA DIPOTONG (Total: ${combinedObservation.length} karakter)...]`
        }

        await subagentStore.addMessage(subagentId, {
          sender: 'tool',
          role: 'user',
          content: `[OBSERVATION]:\n${combinedObservation}`
        })
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
