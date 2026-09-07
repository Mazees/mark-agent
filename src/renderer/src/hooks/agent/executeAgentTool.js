import { createAgentTask, startAgentTaskStep } from '../../api/taskStore.js'

/**
 * executeAgentTool
 * Menangani ladder eksekusi berbagai jenis tool:
 * - Sub-agents (spawn_subagent, message_agent, wait_subagents, send_message, list_subagents, kill_subagent)
 * - Durable Tasks (create_agent_task)
 * - Plugin & Ekstensi (list-plugins, read-tools, read-skill)
 * - Native OS / Browser Tools (fallback via window.api.executeNativeTool)
 */
export async function executeAgentTool({
  tool,
  rawArgs,
  config,
  context,
  activeSessionNum,
  activeTopic,
  userInput,
  durableTask,
  agenticProcessId,
  targetPushProcess,
  targetSetChatData,
  currentSignal,
  abortControllerRef,
  getCurrentTimeInfo,
  activeTaskObjectiveRef
}) {
  let res
  let updatedDurableTask = durableTask
  let durableActiveStep = null

  if (tool === 'spawn_subagent') {
    const { subagentStore } = await import('../../api/subagent/subagentStore.js')
    const { runSubagentTurn } = await import('../../api/subagent/subagentExecutor.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const name = a.name || 'Specialist-Agent'
    const role = a.role || 'Technical Specialist'
    const goal = a.goal || 'Selesaikan misi teknis'
    const initialMessage = a.initial_message || goal
    const rawTools = a.tools
    const tools = Array.isArray(rawTools)
      ? rawTools
      : rawTools
        ? String(rawTools)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : ['*']

    const originatingSessionId = String(
      context?.sessionId || activeSessionNum || activeTopic?.id || 1
    )
    const originatingSessionTitle =
      context?.sessionTitle ||
      activeTopic?.title ||
      activeTopic?.name ||
      (originatingSessionId === '1' ? 'Main Thread' : `Sesi #${originatingSessionId}`)

    const sub = await subagentStore.createSubagent({
      name,
      role,
      goal,
      allowedTools: tools,
      parentSessionId: originatingSessionId,
      parentSessionTitle: originatingSessionTitle
    })

    if (sub.isExisting && sub.wasRunning) {
      res = {
        success: true,
        data: `[SUB-AGENT @${sub.name} SUDAH AKTIF BERJALAN]\n- ID: ${sub.id}\n- Role: ${sub.role}\n- Status: ${sub.status}\nSub-agent @${sub.name} saat ini sedang aktif mengerjakan tugas sebelumnya. Tidak ada duplikasi yang dibuat. Gunakan 'message_agent' jika ingin menambahkan pesan ke agen ini, atau tunggu hingga laporannya selesai.`
      }
    } else {
      runSubagentTurn(sub.id, initialMessage, 'lead').catch((err) => {
        console.error(`[Sub-Agent ${sub.id}] Background execution error:`, err)
      })

      res = {
        success: true,
        data: `[SUB-AGENT BERHASIL DILUNCURKAN SECARA ASINKRON (NON-BLOCKING)]\n- Nama: ${sub.name}\n- ID: ${sub.id}\n- Role: ${sub.role}\n- Goal: ${sub.goal}\nSub-agent telah mulai bekerja secara mandiri di background. Kamu TIDAK PERLU menunggu (dilarang mem-blocking). Langsung beritahu user bahwa tugas telah didelegasikan ke @${sub.name} dan dia akan melapor secara otomatis via push notification ketika selesai.`
      }
    }
  } else if (tool === 'create_agent_task') {
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const title = a.title || 'Durable Task'
    const objective = a.objective || userInput
    const stepsInput =
      Array.isArray(a.steps) && a.steps.length > 0
        ? a.steps
        : [
            { id: 'step-1', title: 'Analisis & Pengumpulan Data', objective, deliverable: 'Data awal' },
            { id: 'step-2', title: 'Eksekusi Teknis', objective, deliverable: 'Hasil eksekusi' },
            { id: 'step-3', title: 'Penyusunan Output Final', objective, deliverable: 'Hasil final' }
          ]

    const documentsPath = await window.api.getDocumentsPath?.()
    const artifactRoot = documentsPath
      ? `${documentsPath.replace(/[\\/]$/, '')}/Mark Tasks/${Date.now()}`
      : null

    updatedDurableTask = await createAgentTask({
      title,
      objective,
      mode: 'durable',
      artifactRoot,
      steps: stepsInput.map((step, idx) => ({
        id: step.id || `step-${idx + 1}`,
        title: step.title || `Langkah ${idx + 1}`,
        objective: step.objective || objective,
        deliverable: step.deliverable || 'Output kerja',
        acceptanceCriteria: Array.isArray(step.acceptanceCriteria)
          ? step.acceptanceCriteria
          : ['Selesai sesuai instruksi'],
        artifactPath: artifactRoot ? `${artifactRoot}/${step.id || `step-${idx + 1}`}.md` : null
      }))
    })

    durableActiveStep = await startAgentTaskStep(
      updatedDurableTask.id,
      updatedDurableTask.activeStepId
    )
    if (activeTaskObjectiveRef) {
      activeTaskObjectiveRef.current = durableActiveStep?.objective || updatedDurableTask.objective
    }

    if (targetPushProcess) {
      targetPushProcess({
        id: agenticProcessId,
        type: 'planning',
        status: 'active',
        data: {
          steps: stepsInput.map((step) => ({ task: step.title })),
          currentStep: 0,
          reasoning: `Durable task dibuat: ${title}`
        }
      })
    }

    if (targetSetChatData) {
      targetSetChatData((prev) => [
        ...prev.filter((item) => !item.isThinking),
        {
          role: 'ai',
          isPlanSteps: true,
          plan: stepsInput.map((step) => ({
            id: step.id,
            title: step.title,
            task: step.title,
            objective: step.objective,
            deliverable: step.deliverable
          })),
          currentStep: 0,
          reasoning: `Mission Control diaktifkan: ${title}`,
          timestamp: getCurrentTimeInfo ? getCurrentTimeInfo() : '',
          created_at: Date.now()
        }
      ])
    }

    res = {
      success: true,
      data: `[MISSION CONTROL DIAKTIFKAN - TASK BERHASIL DIBUAT]:\n- Task ID: ${updatedDurableTask.id}\n- Judul: "${title}"\n- Total Steps: ${stepsInput.length}\nLangkah aktif saat ini: "${durableActiveStep?.title}". Sekarang fokus eksekusi langkah ini menggunakan tools yang sesuai!`
    }
  } else if (tool === 'message_agent') {
    const { subagentStore } = await import('../../api/subagent/subagentStore.js')
    const { runSubagentTurn } = await import('../../api/subagent/subagentExecutor.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const targetQuery = a.target_agent || a.targetAgent || ''
    const msgText = a.message || ''

    if (!targetQuery || !msgText) {
      res = {
        success: false,
        error: 'Parameter message_agent tidak lengkap (target_agent dan message wajib ada).'
      }
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
          error: `Sub-agent dengan nama/ID '${targetQuery}' tidak ditemukan. Gunakan 'list_subagents' untuk memeriksa daftar agen aktif.`
        }
      } else {
        const runResult = await runSubagentTurn(targetAgent.id, msgText, 'lead')
        if (runResult.success) {
          res = {
            success: true,
            data: `[BALASAN DARI @${targetAgent.name} (${targetAgent.id})]:\n"${runResult.reply}"\n${runResult.thought ? `(Reasoning: ${runResult.thought})\n` : ''}`
          }
        } else {
          res = { success: false, error: `Sub-agent @${targetAgent.name} error: ${runResult.error}` }
        }
      }
    }
  } else if (tool === 'wait_subagents') {
    const { subagentStore } = await import('../../api/subagent/subagentStore.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const targetIdsRaw = a.targets || 'all'
    const maxWaitSeconds = Number(a.timeout || 40) || 40

    let targetIds = []
    if (targetIdsRaw === 'all' || !targetIdsRaw) {
      const running = await subagentStore.listSubagents('running')
      targetIds = running.map((s) => s.id)
    } else {
      targetIds = Array.isArray(targetIdsRaw)
        ? targetIdsRaw
        : String(targetIdsRaw)
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
    }

    if (targetIds.length === 0) {
      const all = await subagentStore.listSubagents()
      const summary = all
        .slice(0, 5)
        .map((s) => `- [${s.name} (${s.id})]: Status=${s.status}\n  Hasil: ${s.finalAnswer || '(Belum ada laporan)'}`)
        .join('\n\n')
      res = {
        success: true,
        data: `Tidak ada sub-agent yang sedang berjalan.\nRiwayat sub-agent:\n${summary || 'Kosong'}`
      }
    } else {
      const startTime = Date.now()
      let allDone = false
      let finalAgents = []

      while (Date.now() - startTime < maxWaitSeconds * 1000) {
        if (abortControllerRef?.current?.signal?.aborted) break
        const agents = await Promise.all(targetIds.map((id) => subagentStore.getSubagent(id)))
        finalAgents = agents.filter(Boolean)

        const hasFailed = finalAgents.some(
          (a) => a.status === 'failed' || a.status === 'killed'
        )
        if (hasFailed) break

        const stillRunning = finalAgents.some((a) => a.status === 'running')
        if (!stillRunning) {
          allDone = true
          break
        }
        await new Promise((r) => setTimeout(r, 1500))
      }

      const failedAgents = finalAgents.filter(
        (a) => a.status === 'failed' || a.status === 'killed'
      )
      const runningAgents = finalAgents.filter((a) => a.status === 'running')

      const reports = finalAgents
        .map((a) => {
          const isFailed = a.status === 'failed' || a.status === 'killed'
          const isRunning = a.status === 'running'
          const statusTag = isFailed
            ? `[PERHATIAN: STATUS ${a.status.toUpperCase()} - GAGAL/PERLU RETRY DENGAN send_message]`
            : isRunning
              ? `[STATUS: RUNNING - SEDANG BERJALAN DI BACKGROUND]`
              : `[STATUS: COMPLETED - SELESAI]`
          return `### LAPORAN ${a.name} (${a.role}) - ID: ${a.id}\nStatus: ${statusTag} (Total Turns: ${a.turnCount || 0})\nGoal: ${a.goal}\nHasil Akhir:\n${a.finalAnswer || (isFailed ? 'Eksekusi agen ini terhenti atau mengalami kegagalan sebelum mencapai goal.' : isRunning ? '(Sedang aktif memproses langkah di background secara paralel)' : '(Belum ada output)')}`
        })
        .join('\n\n---\n\n')

      let statusSummary = allDone ? 'SEMUA SELESAI' : 'WAKTU HABIS SEBAGIAN'
      let failPrompt = ''
      if (failedAgents.length > 0) {
        const failedInfo = failedAgents.map((a) => `"${a.id}" (${a.name})`).join(', ')
        failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - EARLY FAIL INTERRUPT]: Sub-agent ${failedInfo} GAGAL saat sub-agent lain masih bekerja! Kamu WAJIB SEGERA mengirim pesan instruksi perbaikan/query alternatif ke ID tersebut menggunakan 'send_message' (format: "subagent_id", message: "instruksi").`
      } else if (runningAgents.length > 0) {
        failPrompt = `\n\n[PENGINGAT ORCHESTRATOR]: Masih ada ${runningAgents.length} sub-agent yang sedang bekerja di background. Jika kamu butuh menunggu mereka, panggil kembali 'wait_subagents'.`
      } else {
        failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - PROTOKOL PEER-REVIEW & PIPELINE RELAY]: Sub-agent telah memberikan laporan. Sebagai Lead Orchestrator:\n1. RELAY DATA: Kamu BISA meneruskan/menyalurkan temuan dari satu agen ke agen lain yang membutuhkan via 'send_message'.\n2. REVIEW KRITIS: Evaluasi temuan agen secara mendalam sebelum menyusun kesimpulan akhir.`
      }

      res = {
        success: true,
        data: `[STATUS SUB-AGENTS (${statusSummary})]:\n\n${reports}${failPrompt}`
      }
    }
  } else if (tool === 'send_message') {
    const { runSubagentTurn } = await import('../../api/subagent/subagentExecutor.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const targetId = a.subagent_id || ''
    const msgText = a.message || ''

    if (!targetId || !msgText) {
      res = {
        success: false,
        error: 'Parameter send_message tidak lengkap (subagent_id dan message wajib ada).'
      }
    } else {
      const runResult = await runSubagentTurn(targetId, msgText)
      if (runResult.success) {
        res = {
          success: true,
          data: `[BALASAN EVALUASI DARI SUB-AGENT (${targetId})]:\n"${runResult.reply}"\n${runResult.thought ? `(Pemikiran: ${runResult.thought})\n` : ''}Evaluasi apakah hasil pendalaman ini sudah memenuhi standar kualitas tinggi.`
        }
      } else {
        res = { success: false, error: `Sub-Agent error: ${runResult.error}` }
      }
    }
  } else if (tool === 'list_subagents') {
    const { subagentStore } = await import('../../api/subagent/subagentStore.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const filter = a.status || (typeof rawArgs === 'string' ? rawArgs.trim().toLowerCase() : null)
    const list = await subagentStore.listSubagents(filter)
    if (!list || list.length === 0) {
      res = { success: true, data: 'Tidak ada sub-agent yang aktif/tersedia saat ini.' }
    } else {
      const summary = list
        .map(
          (s) =>
            `- [${s.id}] ${s.name} (${s.role}): Status=${s.status}, Turns=${s.turnCount || 0}, Goal="${s.goal}"\n  Hasil: ${s.finalAnswer ? s.finalAnswer.slice(0, 150) + '...' : '(Belum ada)'}`
        )
        .join('\n\n')
      res = { success: true, data: `Daftar Sub-Agent Terdaftar:\n${summary}` }
    }
  } else if (tool === 'kill_subagent') {
    const { killSubagentExecution } = await import('../../api/subagent/subagentExecutor.js')
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const targetId = a.subagent_id || (typeof rawArgs === 'string' ? rawArgs.trim() : '')
    if (!targetId) {
      res = { success: false, error: 'Sebutkan subagent_id yang ingin dihentikan.' }
    } else {
      killSubagentExecution(targetId)
      res = { success: true, data: `Sub-agent ${targetId} berhasil dihentikan paksa.` }
    }
  } else if (tool === 'list-plugins') {
    try {
      const plugins = await window.api.getPlugins()
      if (!plugins || plugins.length === 0) {
        res = { success: true, data: 'Belum ada custom plugin lokal yang terpasang di Documents/Mark Plugins.' }
      } else {
        const summary = plugins
          .map((p) => {
            const acts = (p.actions || []).map((a) => `    * ${a.name}: ${a.description || a.triggerHint || ''}`).join('\n')
            return `- Plugin "${p.name}" (v${p.version || '1.0.0'}, Status: ${p.isEnabled !== false ? 'AKTIF' : 'NONAKTIF'}):\n  Deskripsi: ${p.description || '-'}\n  Actions:\n${acts || '    (Tidak ada action)'}`
          })
          .join('\n\n')
        res = { success: true, data: `Daftar Custom Plugin Terpasang:\n${summary}` }
      }
    } catch (pErr) {
      res = { success: false, error: `Gagal memuat plugin: ${pErr.message}` }
    }
  } else if (tool === 'read-tools') {
    const { group_tools } = await import('../../api/tools/group-tools.js')
    const groups = await group_tools()
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const groupName = (a.group_name || (typeof rawArgs === 'string' ? rawArgs : '') || '').trim()
    if (!groupName) {
      res = {
        success: false,
        message: 'Harap sebutkan group_name yang ingin dimuat (misal: "advanced_browser").'
      }
    } else if (groups[groupName]) {
      const toolDescriptions = Object.entries(groups[groupName].tools)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
      res = {
        success: true,
        loaded_group: groupName,
        message: `BERHASIL MEMUAT GRUP TOOL: ${groupName}.\nDokumentasi tool:\n${toolDescriptions}`
      }
    } else {
      res = {
        success: false,
        message: `Grup tool "${groupName}" tidak ditemukan.`
      }
    }
  } else if (tool === 'read-skill') {
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const skillName = (a.skill_name || (typeof rawArgs === 'string' ? rawArgs : '') || '').trim()
    if (!skillName) {
      res = { success: false, message: 'Harap sebutkan skill_name yang ingin dibaca.' }
    } else {
      const { getLearnedSkill } = await import('../../api/db.js')
      const learned = await getLearnedSkill(skillName)
      if (learned && learned.content) {
        res = {
          success: true,
          data: `[PEDOMAN PROSEDUR KEAHLIAN (LEARNED): ${skillName.toUpperCase()}]\n${learned.content}`
        }
      } else {
        const { NATIVE_SKILLS } = await import('../../components/core/native-skills.js')
        const native = NATIVE_SKILLS.find(
          (s) => s.name.toLowerCase() === skillName.toLowerCase()
        )
        if (native && native.content) {
          res = {
            success: true,
            data: `[PEDOMAN SKILL BAWAAN: ${skillName.toUpperCase()}]\n${native.content}`
          }
        } else if (window.api && window.api.readSkill) {
          const skillData = await window.api.readSkill(skillName)
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
              message: `Skill "${skillName}" tidak ditemukan.`
            }
          }
        } else {
          res = {
            success: false,
            message: `Skill "${skillName}" tidak ditemukan.`
          }
        }
      }
    }
  } else {
    const activeConfig = {
      ...(Array.isArray(config) ? config[0] : config),
      workspaceRoot: context?.workspaceRoot
    }
    const nativePromise = window.api.executeNativeTool(tool, rawArgs, activeConfig)
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
    durableActiveStep
  }
}
