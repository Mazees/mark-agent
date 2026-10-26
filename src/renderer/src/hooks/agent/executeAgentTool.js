import { executeSubagentTool, SUBAGENT_TOOLS } from './executeSubagentTool.js'
import { executeWorkflowTool } from './executeWorkflowTool.js'
import { webApi } from '../../api/web-bridge.js'

/**
 * executeAgentTool
 * Menangani ladder eksekusi berbagai jenis tool:
 * - Minibots (spawn_subagent, message_agent, wait_subagents, send_message, list_subagents, kill_subagent)
 * - Durable Tasks (create_agent_task)
 * - Plugin & Ekstensi (list-plugins, read-tools, read-skill)
 * - Native OS / Browser Tools (fallback via window.api.executeNativeTool)
 */
export async function executeAgentTool({
  tool,
  rawArgs: incomingArgs,
  computerUseApprovalToken,
  config,
  context,
  activeSessionNum,
  activeTopic,
  userInput,
  durableTask,
  durableActiveStep: incomingDurableActiveStep = null,
  agenticProcessId,
  targetSetChatData,
  currentSignal,
  getCurrentTimeInfo
}) {
  let res
  let updatedDurableTask = durableTask
  let durableActiveStep = incomingDurableActiveStep

  // Sanitasi parameter reason: simpan untuk timeline UI dan buang sebelum dikirim ke fungsi native
  let rawArgs = incomingArgs
  let execReason = null
  if (incomingArgs && typeof incomingArgs === 'object' && !Array.isArray(incomingArgs)) {
    rawArgs = { ...incomingArgs }
    if (rawArgs.reason) {
      execReason = String(rawArgs.reason).trim()
      delete rawArgs.reason
    }
  } else if (typeof incomingArgs === 'string') {
    try {
      const parsed = JSON.parse(incomingArgs)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.reason) {
        execReason = String(parsed.reason).trim()
        delete parsed.reason
        rawArgs = JSON.stringify(parsed)
      }
    } catch {
      /* Input remains a plain string. */
    }
  }

  if (currentSignal?.aborted) {
    throw new Error('AbortError')
  }

  if (SUBAGENT_TOOLS.includes(tool)) {
    const res = await executeSubagentTool(tool, rawArgs, {
      sessionId: String(context?.sessionId || activeSessionNum || activeTopic?.id || 1),
      sessionTitle: context?.sessionTitle || activeTopic?.title,
      workspaceRoot: context?.workspaceRoot,
      signal: currentSignal,
      processId: agenticProcessId,
      taskId: durableTask?.id,
      stepId: durableActiveStep?.id
    })
    return { res, durableTask, durableActiveStep, reason: execReason }
  }
  if (['create_agent_task', 'mark_done_task', 'read_task', 'update_task_plan'].includes(tool)) {
    return executeWorkflowTool({
      tool,
      args: rawArgs,
      context,
      activeSessionNum,
      userInput,
      durableTask,
      targetSetChatData,
      getCurrentTimeInfo,
      requestId: tool === 'create_agent_task' ? `${agenticProcessId}:create` : context?.toolCallId
    })
  } else if (tool === 'list-plugins') {
    try {
      const plugins = await window.api.getPlugins()
      if (!plugins || plugins.length === 0) {
        res = {
          success: true,
          data: 'Belum ada custom plugin lokal yang terpasang di Documents/Mark Plugins.'
        }
      } else {
        const summary = plugins
          .map((p) => {
            const acts = (p.actions || [])
              .map((a) => `    * ${a.name}: ${a.description || a.triggerHint || ''}`)
              .join('\n')
            return `- Plugin "${p.name}" (v${p.version || '1.0.0'}, Status: ${p.isEnabled !== false ? 'AKTIF' : 'NONAKTIF'}):\n  Deskripsi: ${p.description || '-'}\n  Actions:\n${acts || '    (Tidak ada action)'}`
          })
          .join('\n\n')
        res = { success: true, data: `Daftar Custom Plugin Terpasang:\n${summary}` }
      }
    } catch (pErr) {
      res = { success: false, error: `Gagal memuat plugin: ${pErr.message}` }
    }
  } else if (tool === 'read-tools') {
    const { definition: groups = {} } = await webApi.getGroupTools()
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const groupName = (a.group_name || (typeof rawArgs === 'string' ? rawArgs : '') || '').trim()
    if (!groupName) {
      res = {
        success: false,
        message:
          'Harap sebutkan group_name yang ingin dimuat (misal: "advanced_browser", "youtube_music").'
      }
    } else if (groups[groupName]) {
      const toolDescriptions = Object.entries(groups[groupName].tools || {})
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
      res = {
        success: true,
        loaded_group: groupName,
        message: `BERHASIL MEMUAT GRUP TOOL: ${groupName}.\nDokumentasi tool:\n${toolDescriptions}`
      }
    } else {
      let matchedPlugin = null
      try {
        if (typeof window !== 'undefined' && window.api && window.api.getPlugins) {
          const plugins = await window.api.getPlugins()
          matchedPlugin = (plugins || []).find((p) => p.name === groupName && p.isEnabled !== false)
        }
      } catch {
        // ignore
      }

      if (matchedPlugin) {
        const actionDescs = (matchedPlugin.actions || [])
          .map((act) => `- ${act.name}: ${act.description || act.triggerHint || ''}`)
          .join('\n')
        res = {
          success: true,
          loaded_group: groupName,
          message: `BERHASIL MEMUAT GRUP PLUGIN: ${groupName}.\nDeskripsi: ${matchedPlugin.description || '-'}\nDaftar Tool/Action:\n${actionDescs || '    (Tidak ada action)'}`
        }
      } else {
        res = {
          success: false,
          message: `Grup tool "${groupName}" tidak ditemukan.`
        }
      }
    }
  } else if (tool === 'read-skill') {
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const skillName = (a.skill_name || (typeof rawArgs === 'string' ? rawArgs : '') || '').trim()
    if (!skillName) {
      res = { success: false, message: 'Harap sebutkan skill_name yang ingin dibaca.' }
    } else {
      const { getLearnedSkill, getAllLearnedSkills } = await import('../../api/db.js')
      let learned = await getLearnedSkill(skillName)
      if (!learned || !learned.content) {
        try {
          const allLearned = await getAllLearnedSkills()
          learned = (allLearned || []).find(
            (s) =>
              s.name?.toLowerCase() === skillName.toLowerCase() ||
              s.id?.toLowerCase() === skillName.toLowerCase()
          )
        } catch {
          // ignore
        }
      }

      if (learned && learned.content) {
        res = {
          success: true,
          data: `[PEDOMAN PROSEDUR KEAHLIAN (LEARNED): ${skillName.toUpperCase()}]\n${learned.content}`
        }
      } else {
        const { NATIVE_SKILLS } = await import('../../components/core/native-skills.js')
        const nativeSkill = (NATIVE_SKILLS || []).find(
          (s) => s.name.toLowerCase() === skillName.toLowerCase()
        )
        if (nativeSkill && nativeSkill.content) {
          res = {
            success: true,
            data: `[PEDOMAN SKILL BAWAAN: ${skillName.toUpperCase()}]\n${nativeSkill.content}`
          }
        } else {
          let skillData = null
          if (window.api && window.api.readSkill) {
            try {
              skillData = await window.api.readSkill(skillName)
            } catch {
              // ignore
            }
          }
          if (!skillData) {
            try {
              const { webApi } = await import('../../api/web-bridge.js')
              const serverSkill = await webApi.executeNativeTool('read-skill', {
                skill_name: skillName
              })
              if (serverSkill && serverSkill.success && (serverSkill.content || serverSkill.data)) {
                skillData = serverSkill.content || serverSkill.data
              }
            } catch {
              // ignore
            }
          }

          if (skillData) {
            const content = typeof skillData === 'string' ? skillData : skillData.content
            const basePath =
              typeof skillData === 'object' && skillData.basePath ? skillData.basePath : ''
            res = {
              success: true,
              data: `[PEDOMAN SKILL (FILE): ${skillName.toUpperCase()}]\n${basePath ? `[BASE PATH: ${basePath}]\n` : ''}${content}`
            }
          } else {
            res = {
              success: false,
              message: `Skill "${skillName}" tidak ditemukan di direktori Mark Skills maupun basis data. PENTING: DILARANG mencoba memanggil tool 'read-skill' lagi untuk skill ini. Segera lanjutkan menyelesaikan instruksi user secara mandiri menggunakan tool umum yang relevan atau langsung berikan respon.`
            }
          }
        }
      }
    }
  } else if (typeof tool === 'string' && tool.startsWith('plugin-')) {
    const pluginPromise = window.api?.executePlugin
      ? window.api.executePlugin(tool, rawArgs)
      : webApi.executePluginAction(tool, rawArgs)
    const abortPromise = new Promise((_, reject) => {
      const onAbort = () => reject(new Error('AbortError'))
      if (currentSignal?.aborted) return onAbort()
      currentSignal?.addEventListener('abort', onAbort)
    })
    res = await Promise.race([pluginPromise, abortPromise])
  } else {
    const activeConfig = {
      ...(Array.isArray(config) ? config[0] : config),
      workspaceRoot: context?.workspaceRoot,
      sessionId: String(context?.sessionId || activeSessionNum || 1),
      computerUseRunId: agenticProcessId,
      computerUseApprovalToken
    }
    if (tool.startsWith('browser-')) {
      const sessionId = String(context?.sessionId || activeSessionNum || 1)
      activeConfig.sessionId = sessionId === '1' ? 'main' : `workspace-${sessionId}`
    }
    const nativePromise = window.api.executeNativeTool(tool, rawArgs, activeConfig, currentSignal)
    const abortPromise = new Promise((_, reject) => {
      const onAbort = () => reject(new Error('AbortError'))
      if (currentSignal?.aborted) return onAbort()
      currentSignal?.addEventListener('abort', onAbort)
    })
    res = await Promise.race([nativePromise, abortPromise])
  }

  return {
    res,
    durableTask: updatedDurableTask,
    durableActiveStep,
    reason: execReason
  }
}
