import {
  createAgentTask,
  startAgentTaskStep,
  getAgentTaskWithSteps,
  checkpointAgentTaskStep
} from '../../api/taskStore.js'
import { webApi } from '../../api/web-bridge.js'

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
  rawArgs: incomingArgs,
  config,
  context,
  activeSessionNum,
  activeTopic,
  userInput,
  durableTask,
  durableActiveStep: incomingDurableActiveStep = null,
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
    } catch (_) {}
  }

  if (currentSignal?.aborted) {
    throw new Error('AbortError')
  }

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
    if (durableTask) {
      res = {
        success: false,
        error: `[DILARANG]: Alur kerja '${durableTask.title}' (${durableTask.id}) sudah aktif dalam giliran ini. DILARANG membuat task baru dengan 'create_agent_task'! Fokus selesaikan tahapan alur kerja yang sedang berjalan menggunakan 'mark_done_task' atau berikan respon jawaban akhir jika seluruh tahap sudah selesai.`
      }
      return { res, durableTask, durableActiveStep }
    }

    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const title = a.title || 'Workflow'
    const objective = a.objective || userInput

    if (!Array.isArray(a.steps) || a.steps.length === 0) {
      res = {
        success: false,
        error:
          "Parameter 'steps' wajib berupa array minimal 1 langkah terstruktur (berisi id, title, objective, deliverable)."
      }
    } else {
      const stepsInput = a.steps
      const newTaskId = `task-${Date.now()}`

      let artifactRoot = null
      try {
        const resp = await fetch('/api/tasks/artifacts-dir').then((r) => r.json())
        if (resp?.success && resp?.data) {
          const cleanBase = resp.data.replace(/[\\/]+$/, '')
          const sep = cleanBase.includes('\\') ? '\\' : '/'
          artifactRoot = `${cleanBase}${sep}${newTaskId}`
          await fetch('/api/tasks/ensure-dir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath: artifactRoot })
          }).catch(() => {})
        }
      } catch (err) {
        void err
      }

      if (!artifactRoot && context?.workspaceRoot) {
        const cleanWs = context.workspaceRoot.replace(/[\\/]+$/, '')
        const sep = cleanWs.includes('\\') ? '\\' : '/'
        artifactRoot = `${cleanWs}${sep}.mark${sep}tasks${sep}${newTaskId}`
        await fetch('/api/tasks/ensure-dir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: artifactRoot })
        }).catch(() => {})
      }

      const pathSep = (artifactRoot || '').includes('\\') ? '\\' : '/'

      updatedDurableTask = await createAgentTask({
        id: newTaskId,
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
          artifactPath: artifactRoot
            ? `${artifactRoot}${pathSep}${step.id || `step-${idx + 1}`}.md`
            : null
        }))
      })

      durableActiveStep = await startAgentTaskStep(
        updatedDurableTask.id,
        updatedDurableTask.activeStepId
      )
      if (activeTaskObjectiveRef) {
        activeTaskObjectiveRef.current =
          durableActiveStep?.objective || updatedDurableTask.objective
      }

      if (targetPushProcess) {
        targetPushProcess({
          id: agenticProcessId,
          type: 'planning',
          status: 'active',
          data: {
            steps: stepsInput.map((step) => ({ task: step.title })),
            currentStep: 0,
            reasoning: `Task Workflow dibuat: ${title}`
          }
        })
      }

      if (targetSetChatData) {
        targetSetChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            isPlanSteps: true,
            taskId: updatedDurableTask.id,
            taskTitle: title,
            taskObjective: objective,
            artifactRoot,
            taskStatus: 'running',
            plan: (updatedDurableTask.steps && updatedDurableTask.steps.length > 0
              ? updatedDurableTask.steps
              : stepsInput
            ).map((step, idx) => ({
              id: step.id || `${updatedDurableTask.id}-step-${idx + 1}`,
              stepIndex: idx,
              index: idx,
              title: step.title || step.objective || `Tahap ${idx + 1}`,
              task: step.title || step.objective || `Tahap ${idx + 1}`,
              objective: step.objective || objective,
              deliverable: step.deliverable || 'Output kerja',
              acceptanceCriteria: Array.isArray(step.acceptanceCriteria)
                ? step.acceptanceCriteria
                : [],
              artifactPath:
                step.artifactPath ||
                (artifactRoot
                  ? `${artifactRoot}${pathSep}${step.id || `step-${idx + 1}`}.md`
                  : null),
              status: idx === 0 ? 'running' : 'pending'
            })),
            currentStep: 0,
            reasoning: `Task Workflow diaktifkan: ${title}`,
            timestamp: getCurrentTimeInfo ? getCurrentTimeInfo() : '',
            created_at: Date.now()
          }
        ])
      }

      res = {
        success: true,
        data: `[TASK WORKFLOW DIAKTIFKAN - TUGAS BERHASIL DIBUAT]:\n- Task ID: ${updatedDurableTask.id}\n- Judul: "${title}"\n- Total Steps: ${stepsInput.length}\n\n>>> TAHAP AKTIF SAAT INI (Tahap 1): "${durableActiveStep?.title}"\n- Sasaran: ${durableActiveStep?.objective}\n- Target Deliverable: ${durableActiveStep?.deliverable}\n\nPETUNJUK EKSEKUSI TAHAP 1:\n1. Kerjakan sasaran Tahap 1 terlebih dahulu di direktori workspace menggunakan tool yang relevan (seperti 'write-file' untuk membuat file, susun arsitektur, buat aset/kode). DILARANG LANGSUNG MEMANGGIL 'mark_done_task' SEBELUM PEKERJAAN ATAU FILE DELIVERABLE TAHAP INI SELESAI DIBUAT DI WORKSPACE!\n2. DILARANG mencari atau membaca kode internal aplikasi MARK!\n3. WAJIB UJI & VERIFIKASI SEBELUM TANDAI SELESAI: Lakukan pengujian/verifikasi hasil kerja terlebih dahulu (cek file/kode, uji jalan script/sintaks). Setelah teruji berhasil, barulah PANGGIL TOOL 'mark_done_task' dengan parameter stepIndex: 1, artifactContent, dan verificationProof (bukti hasil uji konkret)!`
      }
    }
  } else if (tool === 'mark_done_task') {
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const taskId = a.taskId || durableTask?.id

    if (!taskId) {
      res = {
        success: false,
        error: "Parameter 'taskId' wajib disertakan atau harus ada alur kerja aktif."
      }
    } else {
      const taskWithSteps = await getAgentTaskWithSteps(taskId)
      if (!taskWithSteps) {
        res = { success: false, error: `Task dengan ID '${taskId}' tidak ditemukan.` }
      } else {
        const steps = taskWithSteps.steps || []

        // 1. Resolusi stepNum: jika tidak disertakan atau NaN, otomatis ambil step aktif saat ini
        let parsedStep = parseInt(
          a.stepIndex ?? a.step_index ?? a.step ?? a.stepNumber ?? a.index,
          10
        )

        let currentStep = null
        if (!isNaN(parsedStep) && parsedStep >= 1) {
          currentStep =
            steps.find((s) => (s.stepIndex ?? s.index ?? 0) === parsedStep - 1) ||
            steps[parsedStep - 1]
        }

        // Jika stepNum belum ketemu atau tidak valid, cari step yang sedang aktif atau belum selesai
        if (!currentStep) {
          currentStep =
            steps.find((s) => s.status === 'running' && s.status !== 'completed') ||
            steps.find((s) => s.status !== 'completed') ||
            steps.find((s) => s.id === taskWithSteps.activeStepId) ||
            steps[0]
        }

        if (!currentStep) {
          res = {
            success: false,
            error: `Tidak ada tahap yang dapat diselesaikan di alur kerja '${taskId}'.`
          }
        } else {
          const stepNum =
            (currentStep.stepIndex ??
              currentStep.step_index ??
              currentStep.index ??
              steps.indexOf(currentStep)) + 1

          // 2. Cegah Re-Mark Done / Cicilan Draf: Tahap yang sudah selesai dilarang di-mark_done_task ulang
          if (currentStep.status === 'completed') {
            const nextPending = steps.find((s) => s.status !== 'completed')
            if (nextPending) {
              const nextIdx = (nextPending.stepIndex ?? nextPending.index ?? 0) + 1
              res = {
                success: false,
                error: `[DITOLAK - TAHAP ${stepNum} SUDAH SELESAI]: Tahap ${stepNum} ("${currentStep.title}") SUDAH SELESAI sebelumnya! DILARANG memanggil 'mark_done_task' berulang kali untuk tahap yang sama. 'mark_done_task' BUKAN alat untuk menyimpan draf atau cicilan progress. Kamu WAJIB LANGSUNG berpindah mengerjakan Tahap ${nextIdx}: "${nextPending.title}"!`
              }
              return {
                res,
                durableTask: updatedDurableTask,
                durableActiveStep
              }
            }
          }

          // 3. Validasi verifikasi dan pengujian sebelum menandai tahap selesai
          const verificationProof =
            typeof a.verificationProof === 'string' && a.verificationProof.trim()
              ? a.verificationProof.trim()
              : typeof a.testResult === 'string' && a.testResult.trim()
                ? a.testResult.trim()
                : typeof a.proof === 'string' && a.proof.trim()
                  ? a.proof.trim()
                  : ''

          if (!verificationProof || verificationProof.length < 15) {
            res = {
              success: false,
              error: `[VERIFIKASI WAJIB]: Tahap ${stepNum} ("${currentStep.title}") DITOLAK untuk ditandai selesai karena belum diverifikasi atau diuji! Kamu wajib menjalankan pengujian/verifikasi hasil pekerjaan terlebih dahulu di workspace (seperti memeriksa file dengan read-file, mengecek sintaks, atau menjalankan test dengan run-powershell). Setelah pengujian berhasil, panggil kembali 'mark_done_task' dengan parameter 'verificationProof' yang merangkum bukti uji konkret.`
            }
            return {
              res,
              durableTask: updatedDurableTask,
              durableActiveStep
            }
          }

          // 3. Resolusi konten deliverable artefak dan ringkasan
          let summary = typeof a.summary === 'string' ? a.summary.trim() : ''
          let artifactContent =
            typeof a.artifactContent === 'string' && a.artifactContent.trim()
              ? a.artifactContent
              : typeof a.artifact === 'string' && a.artifact.trim()
                ? a.artifact
                : typeof a.content === 'string' && a.content.trim()
                  ? a.content
                  : ''

          if (!artifactContent && summary) {
            artifactContent = `# Deliverable: ${currentStep.title}\n\n**Sasaran:** ${currentStep.objective || '-'}\n**Target Deliverable:** ${currentStep.deliverable || '-'}\n\n### Ringkasan Pengerjaan:\n${summary}\n\n### Bukti Pengujian & Verifikasi:\n${verificationProof}`
          } else if (!artifactContent) {
            artifactContent = `# Deliverable: ${currentStep.title}\n\n**Sasaran:** ${currentStep.objective || '-'}\n**Target Deliverable:** ${currentStep.deliverable || '-'}\n\nTahap telah diselesaikan dan diverifikasi sesuai kriteria penerimaan.\n\n### Bukti Pengujian & Verifikasi:\n${verificationProof}`
            if (!summary) summary = `Tahap ${stepNum} selesai & terverifikasi: ${currentStep.title}`
          } else if (
            !artifactContent.includes('Bukti Pengujian') &&
            !artifactContent.includes('Verifikasi')
          ) {
            artifactContent += `\n\n### Bukti Pengujian & Verifikasi:\n${verificationProof}`
          }

          if (!summary) {
            summary = `Tahap ${stepNum} selesai & terverifikasi: ${currentStep.title}`
          }

          // 3. Tulis file artefak markdown ke disk jika artifactRoot ada
          let finalArtifactPath = currentStep.artifactPath
          const artifactRoot = taskWithSteps.artifactRoot
          if (artifactRoot && window.api?.executeNativeTool) {
            const pathSep = artifactRoot.includes('\\') ? '\\' : '/'
            finalArtifactPath = `${artifactRoot}${pathSep}step_${stepNum}.md`
            try {
              await window.api.executeNativeTool(
                'write-file',
                { path: finalArtifactPath, content: artifactContent },
                { workspaceRoot: context?.workspaceRoot }
              )
            } catch (err) {
              console.warn('[executeAgentTool] Gagal menulis artefak:', err)
            }
          }

          // 4. Auto-complete semua tahap SEBELUM tahap ini jika ada yang terlewat
          for (let i = 0; i < steps.length; i++) {
            const priorStep = steps[i]
            const priorIdx = priorStep.stepIndex ?? priorStep.step_index ?? priorStep.index ?? i
            if (priorIdx < stepNum - 1 && priorStep.status !== 'completed') {
              try {
                await checkpointAgentTaskStep(taskId, priorStep.id, {
                  status: 'completed',
                  outputSummary:
                    priorStep.outputSummary || `Tahap ${priorIdx + 1} selesai: ${priorStep.title}`
                })
              } catch (pErr) {
                console.warn('[executeAgentTool] Gagal checkpoint tahap sebelumnya:', pErr)
              }
            }
          }

          // 5. Checkpoint step saat ini menjadi completed
          const checkpointed = await checkpointAgentTaskStep(taskId, currentStep.id, {
            status: 'completed',
            artifactPath: finalArtifactPath,
            outputSummary: summary
          })

          updatedDurableTask = checkpointed
          const nextStep = checkpointed?.steps?.find((s) => s.id === checkpointed.activeStepId)
          durableActiveStep = nextStep || null
          if (activeTaskObjectiveRef) {
            activeTaskObjectiveRef.current = nextStep ? nextStep.objective : null
          }

          // 6. Perbarui tampilan ChatData secara real-time
          const nextStepIdx = nextStep
            ? (nextStep.stepIndex ?? nextStep.step_index ?? nextStep.index ?? stepNum)
            : null

          if (targetSetChatData) {
            targetSetChatData((prev) =>
              prev.map((msg) => {
                if (!msg.isPlanSteps || msg.taskId !== taskId) return msg
                const updatedPlan = (msg.plan || []).map((s, idx) => {
                  const sIdx = s.stepIndex ?? s.step_index ?? s.index ?? idx
                  // Jika ini tahap yang diselesaikan ATAU tahap sebelumnya: tandai completed!
                  if (s.id === currentStep.id || sIdx <= stepNum - 1) {
                    return {
                      ...s,
                      status: 'completed',
                      artifactPath:
                        s.id === currentStep.id || sIdx === stepNum - 1
                          ? finalArtifactPath
                          : s.artifactPath || null,
                      outputSummary:
                        s.id === currentStep.id || sIdx === stepNum - 1
                          ? summary
                          : s.outputSummary || `Tahap ${sIdx + 1} selesai`
                    }
                  }
                  if (nextStep && (s.id === nextStep.id || sIdx === nextStepIdx)) {
                    return { ...s, status: 'running' }
                  }
                  return s
                })
                return {
                  ...msg,
                  taskStatus: nextStep ? 'running' : 'completed',
                  currentStep: nextStep ? nextStepIdx : (msg.plan || []).length,
                  plan: updatedPlan
                }
              })
            )
          }

          if (nextStep) {
            const nextIdx = nextStepIdx + 1
            res = {
              success: true,
              data: `[TAHAP ${stepNum} BERHASIL DISELESAIKAN]: Artefak telah disimpan ke '${finalArtifactPath || 'database'}'.\n\n>>> TAHAP AKTIF SELANJUTNYA (Tahap ${nextIdx}): "${nextStep.title}"\n- Sasaran: ${nextStep.objective}\n- Target Deliverable: ${nextStep.deliverable}\nSekarang fokus kerjakan tahap ${nextIdx} menggunakan tools yang sesuai di workspace. Uji dan verifikasi hasil sebelum memanggil 'mark_done_task' dengan parameter 'verificationProof'!`
            }
          } else {
            res = {
              success: true,
              data: `[SELURUH TAHAPAN ALUR KERJA TELAH TUNTAS]: Semua ${steps.length} langkah dalam alur kerja '${taskWithSteps.title}' berhasil diselesaikan dengan sempurna! Sekarang berikan jawaban akhir ringkasan menyeluruh kepada pengguna.`
            }
          }
        }
      }
    }
  } else if (tool === 'read_task') {
    const a = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
    const requestedId = a.taskId || durableTask?.id
    const stepNum =
      a.stepIndex !== undefined && a.stepIndex !== null ? parseInt(a.stepIndex, 10) : null

    let taskWithSteps = null
    if (requestedId) {
      taskWithSteps = await getAgentTaskWithSteps(requestedId)
    }
    if (!taskWithSteps && durableTask?.id) {
      taskWithSteps = await getAgentTaskWithSteps(durableTask.id)
    }
    if (!taskWithSteps) {
      const running = await listAgentTasks({ status: 'running', limit: 1 })
      if (running && running[0]) {
        taskWithSteps = await getAgentTaskWithSteps(running[0].id)
      }
    }

    if (!taskWithSteps) {
      res = {
        success: false,
        error: `Task dengan ID '${requestedId || 'aktif'}' tidak ditemukan di sistem.`
      }
    } else {
      const steps = taskWithSteps.steps || []
      if (stepNum !== null && !isNaN(stepNum)) {
        const step =
          steps.find((s) => (s.stepIndex ?? s.index ?? 0) === stepNum - 1) || steps[stepNum - 1]
        if (!step) {
          res = {
            success: false,
            error: `Tahap ke-${stepNum} tidak ditemukan di task '${taskId}'.`
          }
        } else {
          let artifactText = ''
          if (step.artifactPath && window.api?.executeNativeTool) {
            try {
              const readRes = await window.api.executeNativeTool('read-file', {
                path: step.artifactPath,
                raw: true
              })
              if (readRes && readRes.success) {
                artifactText = readRes.content || ''
              }
            } catch (err) {
              console.warn('[read_task] Gagal membaca artefak dari disk:', err)
            }
          }

          res = {
            success: true,
            data: `[ARTEFAK TAHAP ${stepNum}: "${step.title}"]\n- Status: ${step.status}\n- Sasaran: ${step.objective}\n- Deliverable: ${step.deliverable}\n- File Path: ${step.artifactPath || 'N/A'}\n\n--- ISI ARTEFAK DOKUMEN ---\n${artifactText || step.outputSummary || '(Artefak belum tersedia atau kosong)'}`
          }
        }
      } else {
        // Ringkasan semua step
        const stepsSummary = steps
          .map(
            (s, i) =>
              `${i + 1}. [${s.status.toUpperCase()}] ${s.title}\n   - Sasaran: ${s.objective}\n   - Deliverable: ${s.deliverable}\n   - Artefak: ${s.artifactPath || 'N/A'}`
          )
          .join('\n\n')

        res = {
          success: true,
          data: `[INFORMASI ALUR KERJA: "${taskWithSteps.title}"]\n- Task ID: ${taskWithSteps.id}\n- Sasaran Utama: ${taskWithSteps.objective}\n- Status: ${taskWithSteps.status}\n- Progres: ${steps.filter((s) => s.status === 'completed').length}/${steps.length} selesai\n\nDAFTAR TAHAP:\n${stepsSummary}\n\n[PERINGATAN ALUR KERJA]: DILARANG memanggil 'read_task' berulang kali untuk membaca pekerjaanmu sendiri! Kamu WAJIB langsung fokus membuat deliverable fisik tahap aktif berikutnya di workspace!`
        }
      }
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
          res = {
            success: false,
            error: `Sub-agent @${targetAgent.name} error: ${runResult.error}`
          }
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
        .map(
          (s) =>
            `- [${s.name} (${s.id})]: Status=${s.status}\n  Hasil: ${s.finalAnswer || '(Belum ada laporan)'}`
        )
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
        if (currentSignal?.aborted) break
        const agents = await Promise.all(targetIds.map((id) => subagentStore.getSubagent(id)))
        finalAgents = agents.filter(Boolean)

        const hasFailed = finalAgents.some((a) => a.status === 'failed' || a.status === 'killed')
        if (hasFailed) break

        const stillRunning = finalAgents.some((a) => a.status === 'running')
        if (!stillRunning) {
          allDone = true
          break
        }
        await new Promise((r) => setTimeout(r, 1500))
      }

      const failedAgents = finalAgents.filter((a) => a.status === 'failed' || a.status === 'killed')
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
          .map(
            (act) =>
              `- plugin-${matchedPlugin.name}-${act.name}: ${act.description || act.triggerHint || ''}`
          )
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
    durableActiveStep,
    reason: execReason
  }
}
