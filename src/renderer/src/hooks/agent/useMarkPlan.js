import { useEffect, useRef } from 'react'
import { buildPlanningSystemPrompt } from '../../api/ai/planning'
import { getYoutubeSummary } from '../../api/ai/tools'
import { fetchAI, fetchAIStream } from '../../api/ai/core'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import {
  deleteMemory,
  getAllMemory,
  insertMemory,
  updateMemory,
  saveSession,
  getChatData,
  db
} from '../../api/db'
import { checkTools, getActiveToolsSchema } from '../../api/tools/index'
import { createDurableTaskPlan } from '../../api/ai/taskPlanner'
import { buildDurableStepCheckpoint } from '../../api/taskExecutor'
import {
  createAgentTask,
  startAgentTaskStep,
  checkpointAgentTaskStep,
  transitionAgentTask
} from '../../api/taskStore'
import {
  getUnifiedContext,
  generateVector,
  executeMemorySearch
} from '../../api/vectorMemory'
import { searchMemoriesInOrama } from '../../api/oramaStore'
import { buildOptimizedChatSession } from '../../api/ai/contextCompactor'
import { saveWorkspaceWorkingMemory } from '../../api/workspaceRag'

// ============================================================================
// HELPER UTILITIES
// ============================================================================

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']

const isImagePath = (filePath = '') => {
  const ext = filePath.split('.').pop().toLowerCase()
  return IMAGE_EXTS.includes(`.${ext}`)
}

const convertFilePathToBase64 = async (filePath) => {
  try {
    const formattedUrl = filePath.startsWith('file://')
      ? filePath
      : `file:///${filePath.replace(/\\/g, '/')}`
    const res = await fetch(formattedUrl)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.error('[useMarkPlan] Failed to convert image file to Base64:', filePath, err)
    return null
  }
}

/**
 * Konversi objek parameter OpenAPI Function Call menjadi query string yang kompatibel dengan dispatcher legacy / node-tools.
 */
const normalizeToolQuery = (tool, queryOrArgs) => {
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

    case 'read-skill':
      return a.skill_name || ''

    case 'read-tools':
      return a.group_name || ''

    case 'run-powershell':
      return a.command || ''

    case 'open':
      return a.target || ''

    case 'browser-navigate':
      return a.url || ''

    case 'browser-click':
      return String(a.element_id ?? '')

    case 'browser-type':
      return `${a.element_id ?? ''}||${a.text || ''}`

    case 'browser-scroll':
      return a.direction || 'down'

    case 'browser-extract':
      return a.selector || ''

    case 'browser-screenshot':
      return a.filename || 'screenshot.png'

    case 'browser-ask-user':
      return a.prompt || ''

    case 'browser-close':
      return ''

    case 'os-click':
      return String(a.target || '')

    case 'os-type':
      return a.text || ''

    case 'os-key':
      return a.combo || ''

    case 'os-scroll':
      return `${a.direction || 'down'}||${a.amount || 3}`

    case 'os-search':
      return a.keyword || ''

    case 'os-focus-window':
      return a.title || ''

    case 'yt-search':
      return a.query || ''

    case 'yt-summary':
      return a.url || ''

    case 'music-play':
      return a.title || ''

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

    case 'spawn_subagent':
      return `${a.name || 'Worker'}||${a.role || 'Specialist'}||${a.goal || ''}||${a.initial_message || a.goal || ''}||${a.tools || '*'}`

    case 'send_message':
      return `${a.subagent_id || ''}||${a.message || ''}`

    case 'wait_subagents':
      return `${a.targets || 'all'}||${a.timeout || 40}`

    case 'kill_subagent':
      return `${a.subagent_id || ''}||${a.reason || ''}`

    case 'memory-search':
      return a.query || ''

    default:
      if (a.query) return a.query
      return JSON.stringify(a)
  }
}

// ============================================================================
// MAIN HOOK: useMarkPlan
// ============================================================================

export const useMarkPlan = ({
  chatData,
  setChatData,
  config,
  isSpeak,
  abortControllerRef,
  setIsLoading,
  setIsAgentBusy,
  runningSessionId,
  setRunningSessionId,
  runningSessionIds,
  setRunningSessionIds,
  addRunningSessionId,
  removeRunningSessionId,
  setMessage,
  handleYoutubeSearch,
  handleSearchCommand,
  handleYoutubeSummary,
  handleMusic,
  getYoutubeData,
  pushProcess,
  dismissProcess,
  activeTopic,
  setActiveTopic,
  currentMusicTrack,
  requestApproval,
  requestCameraCapture
}) => {
  // Map menyimpan sesi yang sedang berjalan: key = sessionId, value = { abortController, startTime, prompt }
  const activeSessionsRef = useRef(new Map())
  // Map menyimpan updater fungsi setChatData per sesi untuk IPC status AI
  const activeSessionUpdatersRef = useRef(new Map())

  // Listener event status AI dari Main Process (IPC)
  useEffect(() => {
    if (window.api && window.api.onAiStatus) {
      window.api.onAiStatus((msg) => {
        if (activeSessionUpdatersRef.current.size > 0) {
          for (const updater of activeSessionUpdatersRef.current.values()) {
            try {
              updater((prev) => {
                const filtered = prev.filter((item) => !item.isThinking)
                return [...filtered, { role: 'ai', content: msg, isThinking: true }]
              })
            } catch (e) {}
          }
        } else {
          setChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            return [...filtered, { role: 'ai', content: msg, isThinking: true }]
          })
        }
      })
    }

    if (window.api && window.api.onAiAbort) {
      const unsub = window.api.onAiAbort((payload) => {
        console.warn('[useMarkPlan] Sinyal ai:abort diterima:', payload)
        handleStop()
      })
      return () => {
        if (typeof unsub === 'function') unsub()
      }
    }
  }, [setChatData])

  const activeTaskObjectiveRef = useRef(null)
  const interventionBufferRef = useRef([])
  const lastUserPromptRef = useRef('')
  const activeRunningSessionIdRef = useRef(1)

  const targetPushProcess = (proc) => {
    if (
      (activeRunningSessionIdRef.current === 1 || !activeRunningSessionIdRef.current) &&
      pushProcess
    ) {
      pushProcess(proc)
    }
  }

  // Menampung arahan/intervensi user saat ReAct loop sedang berjalan
  const handleIntervention = (msg) => {
    interventionBufferRef.current.push(msg)
  }

  // Penghentian tugas per-sesi secara independen
  const handleStop = (targetSessionId = null) => {
    if (targetSessionId !== null && targetSessionId !== undefined) {
      const numId = Number(targetSessionId)
      const session = activeSessionsRef.current.get(numId)
      if (session && session.abortController) {
        session.abortController.abort()
      }
      if (window.api && window.api.abortFetchAI) {
        try {
          window.api.abortFetchAI()
        } catch (_) {}
      }
      if (window.api && window.api.browserClose) {
        window.api
          .browserClose({ sessionId: numId === 1 ? 'main' : `workspace-${numId}` })
          .catch(() => {})
      }
    } else {
      // Hentikan seluruh sesi yang aktif
      for (const [id, session] of activeSessionsRef.current.entries()) {
        if (session.abortController) session.abortController.abort()
        if (window.api && window.api.browserClose) {
          window.api
            .browserClose({ sessionId: id === 1 ? 'main' : `workspace-${id}` })
            .catch(() => {})
        }
      }
      if (abortControllerRef?.current) abortControllerRef.current.abort()
      if (window.api && window.api.abortFetchAI) {
        try {
          window.api.abortFetchAI()
        } catch (_) {}
      }
    }
  }

  // ==========================================================================
  // DISPATCHER EKSEKUSI INDIVIDUAL TOOL (Native & Functional)
  // ==========================================================================
  const executeSingleTool = async (tool, rawArgs, context) => {
    const {
      tgContext,
      isAutonomous,
      pluginProcessId,
      targetSetChatData = setChatData,
      signal
    } = context
    const currentSignal = signal || abortControllerRef?.current?.signal
    let resultString = 'Tidak ada hasil.'

    const query = normalizeToolQuery(tool, rawArgs)

    try {
      // 1. YouTube Search
      if (tool === 'yt-search') {
        const q = typeof rawArgs === 'object' && rawArgs.query ? rawArgs.query : query
        const ytResults = await window.api.searchYoutube(q)
        resultString = JSON.stringify(ytResults)
      }
      // 2. YouTube Summary
      else if (tool === 'yt-summary') {
        const url = typeof rawArgs === 'object' && rawArgs.url ? rawArgs.url : query
        targetSetChatData((prev) => [
          ...prev,
          {
            role: 'ai',
            content: 'Menonton video youtube...',
            isSummarizing: true,
            youtubeLink: url
          }
        ])
        const yData = await getYoutubeData(url)
        resultString = await getYoutubeSummary(url, yData, currentSignal)
        targetSetChatData((prev) => prev.filter((item) => !item.isSummarizing))
      }
      // 3. Music Control
      else if (tool.startsWith('music')) {
        resultString = await handleMusic(tool, query, targetSetChatData)
      }
      // 4. Memory Vector Search
      else if (tool === 'memory-search') {
        const q = typeof rawArgs === 'object' && rawArgs.query ? rawArgs.query : query
        resultString = await executeMemorySearch(q)
      }
      // 5. Memory Management Tool
      else if (tool === 'manage-memory') {
        const memArgs = typeof rawArgs === 'object' ? rawArgs : {}
        const action = memArgs.action || 'insert'
        const type = memArgs.type || 'profile'
        const summary = memArgs.summary || ''
        const detail = memArgs.detail || summary

        let memContent = `[${getCurrentTimeInfo()}] ${detail || summary}`
        const memoryData = {
          type,
          summary,
          memory: memContent
        }

        // Orama Auto-Dedup check untuk profile / preference
        if (action === 'insert' && (type === 'profile' || type === 'preference')) {
          try {
            const newVec = await generateVector(memContent)
            if (newVec) {
              const similarMemories = await searchMemoriesInOrama(memContent, newVec, 1, type)
              if (similarMemories.length > 0 && similarMemories[0].score > 0.82) {
                memoryData.id = similarMemories[0].id
                await updateMemory(memoryData)
                resultString = `Memori yang mirip ditemukan (ID: ${memoryData.id}). Berhasil diperbarui.`
                return {
                  resultString,
                  rejected: false,
                  toolExecution: { action: tool, query, result: resultString }
                }
              }
            }
          } catch (err) {
            console.error('Error in Orama auto-dedup check:', err)
          }
        }

        if (action === 'insert') {
          await insertMemory(memoryData)
          resultString = `Fakta baru berhasil disimpan ke memori jangka panjang: "${summary}"`
        } else if (action === 'update') {
          await updateMemory(memoryData)
          resultString = `Memori berhasil diperbarui: "${summary}"`
        } else if (action === 'delete') {
          if (memArgs.id) {
            await deleteMemory(memArgs.id)
            resultString = `Memori ID ${memArgs.id} berhasil dihapus.`
          } else {
            resultString = `Gagal menghapus memori: ID memori tidak disertakan.`
          }
        }
      }
      // 6. Working Memory Update Tool
      else if (tool === 'update-working-memory') {
        const notes = typeof rawArgs === 'object' && rawArgs.notes ? rawArgs.notes : query
        if (context?.workspaceRoot && notes) {
          await saveWorkspaceWorkingMemory(context.workspaceRoot, { notes })
          resultString = `Catatan progres koding berhasil disimpan ke .mark/working-memory.json.`
        } else {
          resultString = `Working memory dicatat untuk sesi ini: ${notes}`
        }
      }
      // 7. Speak (TTS)
      else if (tool === 'speak') {
        const textToSpeak = typeof rawArgs === 'object' && rawArgs.text ? rawArgs.text : query
        if (textToSpeak && textToSpeak.trim() !== '') {
          targetSetChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            return [
              ...filtered,
              { role: 'ai', content: `(Sedang berbicara) ${textToSpeak}`, isThinking: true }
            ]
          })
          await playVoice(textToSpeak)
          resultString = `Berhasil berbicara secara lisan: "${textToSpeak}"`
        } else {
          resultString = 'Gagal: teks yang mau diucapkan kosong.'
        }
      }
      // 8. Screenshot ke Telegram
      else if (tool === 'screenshot-to-tg') {
        if (window.api && window.api.tgTakeScreenshot) {
          const targetChatId = tgContext?.chatId || null
          try {
            const ssRes = await window.api.tgTakeScreenshot(targetChatId)
            if (ssRes && ssRes.success === false) {
              resultString = `Gagal mengirim screenshot ke Telegram: ${ssRes.error || 'Terjadi kesalahan'}`
            } else {
              resultString =
                'Screenshot layar PC berhasil diambil dan dikirimkan ke Telegram Admin.'
            }
          } catch (e) {
            resultString = `Gagal mengirim screenshot ke Telegram: ${e.message}`
          }
        } else {
          resultString = 'Gagal: Fitur Telegram Bot belum tersedia.'
        }
      }
      // 9. Vision: Analyze Screen
      else if (tool === 'analyze-screen') {
        try {
          const screens = await window.api.takeScreenshot()
          const screenArray = Array.isArray(screens) ? screens : screens ? [screens] : []
          if (screenArray.length > 0) {
            targetSetChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: 'Memproses Vision AI...', isThinking: true }
            ])

            const contentArray = [
              {
                type: 'text',
                text: query || 'Jelaskan apa yang kamu lihat di layar ini secara ringkas.'
              },
              ...screenArray.map((scr) => ({
                type: 'image_url',
                image_url: { url: scr }
              }))
            ]

            const visionResponse = await fetchAI(
              [{ role: 'user', content: contentArray }],
              currentSignal,
              false
            )
            const textContent =
              typeof visionResponse === 'object' && visionResponse.content
                ? visionResponse.content
                : String(visionResponse)

            console.log(
              `[Vision AI - analyze-screen] Hasil analisis (${screenArray.length} monitor):`,
              textContent
            )
            resultString = `Hasil Analisis Layar (${screenArray.length} monitor):\n${textContent}`
          } else {
            resultString = 'Gagal mengambil screenshot layar untuk analisis.'
          }
        } catch (e) {
          resultString = `Gagal memproses analisis layar: ${e.message}`
        }
      }
      // 10. Vision: Camera Look
      else if (tool === 'camera-look') {
        try {
          if (config[0]?.cameraEnabled === false) {
            resultString =
              'Fitur kamera dimatikan di pengaturan. Beri tahu user untuk mengaktifkannya.'
          } else if (!requestCameraCapture) {
            resultString = 'Internal Error: Callback requestCameraCapture tidak tersedia.'
          } else {
            targetSetChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: 'Mengakses kamera...', isThinking: true }
            ])

            const cameraFrame = await requestCameraCapture({
              isAutonomous: isAutonomous,
              deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId : null
            })

            if (cameraFrame) {
              targetSetChatData((prev) => [
                ...prev.filter((item) => !item.isThinking),
                { role: 'ai', content: 'Menganalisis hasil kamera...', isThinking: true }
              ])

              const contentArray = [
                {
                  type: 'text',
                  text: query || 'Jelaskan dengan detail apa yang terlihat dari kamera ini.'
                },
                { type: 'image_url', image_url: { url: cameraFrame } }
              ]

              const visionResponse = await fetchAI(
                [{ role: 'user', content: contentArray }],
                currentSignal,
                false
              )
              const textContent =
                typeof visionResponse === 'object' && visionResponse.content
                  ? visionResponse.content
                  : String(visionResponse)

              console.log(`[Vision AI - camera-look] Hasil analisis:`, textContent)
              resultString = `Hasil Analisis Kamera:\n${textContent}`
            } else {
              resultString = 'Gagal mengambil gambar dari kamera.'
            }
          }
        } catch (e) {
          resultString = `Gagal memproses kamera: ${e.message}`
        }
      }
      // 11. Built-in Native Tools & Sub-Agent Orchestration
      else if (checkTools(tool)) {
        const approvalCheck = await window.api.checkToolApproval(tool, query)

        if (approvalCheck.needsApproval && requestApproval) {
          const userApproved = await requestApproval(approvalCheck.message, tool, query)
          if (!userApproved) {
            resultString = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
            return {
              resultString,
              rejected: true,
              toolExecution: { action: tool, query, result: resultString }
            }
          }
        }

        let res
        if (tool === 'spawn_subagent') {
          const { subagentStore } = await import('../../api/subagent/subagentStore.js')
          const { runSubagentTurn } = await import('../../api/subagent/subagentExecutor.js')
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const parts = (query || '').split('||')
          const name = a.name || parts[0]?.trim() || 'Worker-Agent'
          const role = a.role || parts[1]?.trim() || 'Technical Specialist'
          const goal = a.goal || parts[2]?.trim() || 'Selesaikan misi teknis'
          const initialMessage = a.initial_message || parts[3]?.trim() || goal
          const rawTools = a.tools || parts[4]
          const tools = rawTools
            ? String(rawTools)
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : ['*']

          const sub = await subagentStore.createSubagent({
            name,
            role,
            goal,
            allowedTools: tools,
            parentSessionId: 'main_chat'
          })

          // Jalankan loop eksekusi ReAct secara paralel di background (non-blocking)
          runSubagentTurn(sub.id, initialMessage).catch((err) => {
            console.error(`[Sub-Agent ${sub.id}] Background error:`, err)
          })

          res = {
            success: true,
            data: `[SUB-AGENT BERHASIL DIBUAT & BERJALAN DI BACKGROUND]\n- Nama: ${name}\n- ID: ${sub.id}\n- Role: ${role}\n- Goal: ${goal}\nSub-agent ini telah mulai bekerja secara paralel di background. Kamu bisa langsung membuat sub-agent lain (batch) atau gunakan tool 'wait_subagents' (targets: "all" atau ID-nya) untuk menunggu dan mengumpulkan hasil laporannya.`
          }
        } else if (tool === 'wait_subagents') {
          const { subagentStore } = await import('../../api/subagent/subagentStore.js')
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const parts = (query || '').split('||')
          const targetIdsRaw = a.targets || parts[0]?.trim() || 'all'
          const maxWaitSeconds = Number(a.timeout || parts[1]?.trim() || 40) || 40

          let targetIds = []
          if (targetIdsRaw === 'all' || !targetIdsRaw) {
            const running = await subagentStore.listSubagents('running')
            targetIds = running.map((s) => s.id)
          } else {
            targetIds = String(targetIdsRaw)
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
              if (abortControllerRef.current.signal.aborted) break
              const agents = await Promise.all(targetIds.map((id) => subagentStore.getSubagent(id)))
              finalAgents = agents.filter(Boolean)

              // Early-Fail Interrupt: Jika ada subagent yang gagal/error, langsung keluar dari loop
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
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const parts = (query || '').split('||')
          const targetId = a.subagent_id || parts[0]?.trim()
          const msgText = a.message || parts[1]?.trim()

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
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const filter = a.status || (query ? query.trim().toLowerCase() : null)
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
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const parts = (query || '').split('||')
          const targetId = a.subagent_id || parts[0]?.trim()
          if (!targetId) {
            res = { success: false, error: 'Sebutkan subagent_id yang ingin dihentikan.' }
          } else {
            killSubagentExecution(targetId)
            res = { success: true, data: `Sub-agent ${targetId} berhasil dihentikan paksa.` }
          }
        } else if (tool === 'read-tools') {
          const { group_tools } = await import('../../api/tools/group-tools.js')
          const groups = await group_tools()
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const groupName = (a.group_name || query || '').trim()
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
          const a = typeof rawArgs === 'object' ? rawArgs : {}
          const skillName = (a.skill_name || query || '').trim()
          if (!skillName) {
            res = { success: false, message: 'Harap sebutkan skill_name yang ingin dibaca.' }
          } else {
            // 1. Cek Dexie learnedSkills
            const { getLearnedSkill } = await import('../../api/db.js')
            const learned = await getLearnedSkill(skillName)
            if (learned && learned.content) {
              res = {
                success: true,
                data: `[PEDOMAN PROSEDUR KEAHLIAN (LEARNED): ${skillName.toUpperCase()}]\n${learned.content}`
              }
            } else {
              // 2. Cek NATIVE_SKILLS bawaan
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
                // 3. Cek berkas disk di Documents/Mark Skills
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
          const nativePromise = window.api.executeNativeTool(tool, query, activeConfig)
          const abortPromise = new Promise((_, reject) => {
            const onAbort = () => reject(new Error('AbortError'))
            if (currentSignal?.aborted) return onAbort()
            currentSignal?.addEventListener('abort', onAbort)
          })
          res = await Promise.race([nativePromise, abortPromise])
        }

        if (res && res.success) {
          if (res.data !== undefined) {
            resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
          } else if (res.output !== undefined) {
            resultString = typeof res.output === 'string' ? res.output : JSON.stringify(res.output)
          } else if (res.result !== undefined) {
            resultString = typeof res.result === 'string' ? res.result : JSON.stringify(res.result)
          } else if (res.content !== undefined) {
            resultString =
              typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
          } else if (res.contents !== undefined) {
            resultString =
              typeof res.contents === 'string' ? res.contents : JSON.stringify(res.contents)
          } else {
            resultString = res.message || 'Success'
          }

          // Pemotongan isi dokumen jika terlalu panjang
          if (tool === 'read-document') {
            const parts = query.split('||')
            let fullText =
              typeof res.data === 'object' && res.data !== null
                ? res.data.content || ''
                : String(res.data || resultString || '')
            if (fullText && fullText.length > 2500) {
              resultString = `${fullText.slice(0, 2500)}\n\n[DOKUMEN DIPOTONG (Total: ${fullText.length} karakter). Gunakan read-document dengan keyword untuk pencarian spesifik]`
            }
          }
        } else {
          resultString = `[ERROR] ${tool} gagal: ${(res && (res.message || res.error)) || 'Unknown error'}`
        }

        return {
          resultString,
          rejected: false,
          toolExecution: { action: tool, query, result: resultString },
          loadedGroup: res?.loaded_group || null
        }
      }
      // 12. Dynamic Plugin Execution
      else {
        targetPushProcess({
          id: pluginProcessId,
          type: 'plugin-execution',
          status: 'active',
          data: { action: tool, query }
        })

        const pluginPromise = window.api.executePlugin(tool, query)
        const abortPromise = new Promise((_, reject) => {
          const onAbort = () => reject(new Error('AbortError'))
          if (currentSignal?.aborted) return onAbort()
          currentSignal?.addEventListener('abort', onAbort)
        })
        const res = await Promise.race([pluginPromise, abortPromise])

        resultString = res.success
          ? typeof res.data === 'string'
            ? res.data
            : JSON.stringify(res.data)
          : `[ERROR] Plugin ${tool} gagal: ${res.error}`

        targetPushProcess({
          id: pluginProcessId,
          type: 'plugin-execution',
          status: 'done',
          data: { action: tool, query, result: resultString }
        })

        return {
          resultString,
          rejected: false,
          toolExecution: { action: tool, query, result: resultString }
        }
      }
    } catch (toolError) {
      if (toolError.name === 'AbortError' || toolError.message?.includes('AbortError')) {
        throw toolError
      }
      resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
    }

    return {
      resultString,
      rejected: false,
      toolExecution: { action: tool, query, result: resultString }
    }
  }

  // ==========================================================================
  // CORE HANDLER: handlePlanningCommand (Native ReAct Loop & Streaming Engine)
  // ==========================================================================
  const handlePlanningCommand = async (
    userInput,
    tgContextOrOptions = null,
    isAutonomous = false,
    autonomousInitialMessage = null,
    options = {},
    isSystem = false
  ) => {
    let tgContext = tgContextOrOptions
    let opts = options || {}

    // Flexible options detection
    if (
      tgContextOrOptions &&
      typeof tgContextOrOptions === 'object' &&
      !tgContextOrOptions.chatId &&
      !tgContextOrOptions.from
    ) {
      opts = tgContextOrOptions
      tgContext = null
    } else if (
      autonomousInitialMessage &&
      typeof autonomousInitialMessage === 'object' &&
      (autonomousInitialMessage.sessionId ||
        autonomousInitialMessage.customChatData ||
        autonomousInitialMessage.customSetChatData ||
        autonomousInitialMessage.onSaveSession)
    ) {
      opts = autonomousInitialMessage
      autonomousInitialMessage = null
    }

    // ------------------------------------------------------------------------
    // FASE 1: VALIDASI INPUT & PER-SESSION LOCKING
    // ------------------------------------------------------------------------
    const activeSessionNum = opts.sessionId ? Number(opts.sessionId) : 1
    activeRunningSessionIdRef.current = activeSessionNum

    if (activeSessionsRef.current.has(activeSessionNum)) {
      console.log(
        `[useMarkPlan] Menolak prompt masuk untuk Sesi ${activeSessionNum} karena sedang berjalan (Lock active).`
      )
      return
    }

    const sessionAbortController = new AbortController()
    activeSessionsRef.current.set(activeSessionNum, {
      abortController: sessionAbortController,
      startTime: Date.now(),
      prompt: userInput
    })

    if (activeSessionNum === 1) {
      abortControllerRef.current = sessionAbortController
    }

    if (addRunningSessionId) addRunningSessionId(activeSessionNum)
    setIsAgentBusy(true)

    let finalIsSpeak = opts.forceSpeak !== undefined ? opts.forceSpeak : isSpeak
    if (userInput && typeof userInput === 'string') {
      if (userInput.startsWith('(Mikrofon)')) {
        finalIsSpeak = true
      } else if (!isAutonomous && !isSystem) {
        finalIsSpeak = false
      }
    }

    if (!userInput) {
      activeSessionsRef.current.delete(activeSessionNum)
      if (removeRunningSessionId) removeRunningSessionId(activeSessionNum)
      return
    }

    if (!tgContext && !isAutonomous) {
      if (activeSessionNum === 1) {
        setIsLoading(true)
      }
      if (!isSystem && !opts.customSetChatData) {
        lastUserPromptRef.current = userInput
        setMessage('')
      }
    }

    const timestampStr = getCurrentTimeInfo()

    // ------------------------------------------------------------------------
    // FASE 2: FORMATTING PROMPT & VISION PAYLOAD
    // ------------------------------------------------------------------------
    let finalContent = userInput
    if (userInput.startsWith('/')) {
      const skillName = userInput.slice(1).split(' ')[0].trim()
      try {
        const skillData = await window.api.readSkill(skillName)
        const skillContent = typeof skillData === 'string' ? skillData : skillData?.content
        if (skillContent) {
          finalContent = `[SYSTEM INSTRUCTION - SKILL ACTIVATED]: Kamu sekarang harus bertindak dan mengikuti seluruh instruksi dalam dokumen skill berikut ini secara ketat:\n\n=== SKILL: ${skillName} ===\n${skillContent}\n====================\n\nInstruksi dari user: ${userInput.replace('/' + skillName, '').trim() || 'Jalankan skill ini sekarang!'}`
        } else {
          finalContent = `Skill "${skillName}" tidak ditemukan di direktori Mark Skills.`
        }
      } catch (err) {
        console.error('Error loading skill:', err)
      }
    } else if (isSystem) {
      finalContent = `[SYSTEM INSTRUCTION]: ${userInput}`
    }

    if (isAutonomous) {
      finalContent = `[SISTEM INTERNAL - INISIATIF OTONOM]: Otak bawah sadarmu berinisiatif untuk melakukan tindakan berikut: "${userInput}". LAKUKAN TUGAS INI! Bicaralah seolah-olah kamu yang memiliki inisiatif itu sendiri tanpa disuruh. PENTING: DILARANG KERAS menggunakan tool 'os-*' untuk interaksi PC secara otonom! Respons "answer"-mu HARUS SANGAT SINGKAT (1-2 kalimat pendek).`
    }

    let imageVisionPayloads = []
    if (userInput.includes('[FILE TERLAMPIR]:')) {
      const matches = userInput.match(/"([^"]+)"/g)
      if (matches && matches.length > 0) {
        const paths = matches.map((m) => m.replace(/^"|"$/g, ''))
        for (const p of paths) {
          if (isImagePath(p)) {
            const b64 = await convertFilePathToBase64(p)
            if (b64) {
              imageVisionPayloads.push({ type: 'image_url', image_url: { url: b64 } })
            }
          }
        }
      }
    }

    let payloadContent = finalContent
    if (imageVisionPayloads.length > 0) {
      payloadContent = [{ type: 'text', text: finalContent }, ...imageVisionPayloads]
    }

    const userMessage = {
      role: 'user',
      content: payloadContent,
      timestamp: timestampStr,
      created_at: Date.now(),
      source: tgContext ? 'telegram' : 'pc',
      sender:
        tgContext?.from?.first_name ||
        tgContext?.from?.username ||
        (tgContext ? 'Telegram Admin' : undefined)
    }

    // Penyiapan data sesi terisolasi (Database-First Persistent Pipeline)
    let inMemorySessionData = []
    if (activeSessionNum !== 1) {
      if (Array.isArray(opts.customChatData) && opts.customChatData.length > 0) {
        inMemorySessionData = [...opts.customChatData]
      } else {
        try {
          const existing = await getChatData(activeSessionNum)
          if (existing && Array.isArray(existing)) {
            inMemorySessionData = [...existing]
          }
        } catch (e) {}
      }
    }

    // Ambil workspaceRoot dari database jika belum disertakan di opts
    if (!opts.workspaceRoot) {
      try {
        const sessionRecord = await db.sessions.get(activeSessionNum)
        if (sessionRecord?.workspaceRoot) {
          opts.workspaceRoot = sessionRecord.workspaceRoot
        }
      } catch (e) {}
    }

    const targetSetChatData = (updater) => {
      if (activeSessionNum !== 1) {
        const next = typeof updater === 'function' ? updater(inMemorySessionData) : updater
        inMemorySessionData = next

        // 1. Direct persistent DB write
        saveSession(activeSessionNum, next).catch((err) => {
          console.warn(`[useMarkPlan] Gagal auto-save session ${activeSessionNum}:`, err)
        })

        // 2. Broadcast reactive event to UI
        window.dispatchEvent(
          new CustomEvent('session-updated', {
            detail: { sessionId: activeSessionNum, data: next }
          })
        )
      } else {
        setChatData(updater)
      }
    }

    activeSessionUpdatersRef.current.set(activeSessionNum, targetSetChatData)

    // ------------------------------------------------------------------------
    // FASE 3: PENYIAPAN HISTORY CHAT & RETRIEVAL KONTEKS
    // ------------------------------------------------------------------------
    const sourceChatData = activeSessionNum === 1 ? chatData : inMemorySessionData
    const optimizedHistory = buildOptimizedChatSession(sourceChatData, config[0]?.context || 10)

    if (!isAutonomous && !isSystem) {
      targetSetChatData((prev) => [...prev, userMessage])
    }

    const agenticProcessId = `agentic-${Date.now()}`
    let durableTaskForRecovery = null
    let execSteps = [{ task: 'Menganalisis Konteks...' }]
    let accumulatedThoughts = []

    try {
      let durableTask = null
      let durableActiveStep = null

      const allMemory = await getAllMemory()
      let searchQuery = userInput
      if (optimizedHistory.length > 0) {
        const lastMsg = optimizedHistory[optimizedHistory.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
          let lastAiText = lastMsg.content
          if (lastAiText.length > 600) {
            lastAiText = lastAiText.substring(0, 300) + ' ... ' + lastAiText.slice(-300)
          }
          searchQuery = `Konteks obrolan sebelumnya: "${lastAiText}". Pertanyaan user saat ini: "${userInput}"`
        }
      }

      const contextPromise = getUnifiedContext(searchQuery, allMemory)
      const abortPromise = new Promise((_, reject) => {
        const onAbort = () => reject(new Error('AbortError'))
        if (sessionAbortController.signal.aborted) return onAbort()
        sessionAbortController.signal.addEventListener('abort', onAbort)
      })
      const unifiedContext = await Promise.race([contextPromise, abortPromise])

      let contextMsgStr = ''
      if (tgContext)
        contextMsgStr += `Permintaan ini berasal dari Telegram (Chat ID: ${tgContext.chatId}).\n`
      if (isSystem)
        contextMsgStr += `[SYSTEM INSTRUCTION]: Pesan ini adalah instruksi internal sistem.\n`
      if (isAutonomous) {
        contextMsgStr += `[AWARENESS MODE]: Ini adalah pemikiran autonom-mu sendiri. Buka topik secara proaktif.\n`
      }
      if (currentMusicTrack && currentMusicTrack.title) {
        contextMsgStr += `[STATUS SISTEM]: Sedang memutar "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}.\n`
      }

      // Inject 5 aktivitas OS terakhir dari window tracker
      try {
        const activityBuffer = await window.api.getActivityBuffer()
        if (activityBuffer && activityBuffer.length > 0) {
          const recent = activityBuffer.slice(-5)
          const activitySummary = recent
            .map((a) => `[${a.time || a.timestamp}] ${a.app}${a.title ? ` — ${a.title}` : ''}`)
            .join('\n')
          contextMsgStr += `[AKTIVITAS PC USER (terakhir)]\n${activitySummary}\n`
        }
      } catch (_) {}

      // Ambil daftar sub-agent yang tersedia
      let existingSubagents = ''
      try {
        const { subagentStore } = await import('../../api/subagent/subagentStore.js')
        const allSubs = await subagentStore.listSubagents()
        if (allSubs && allSubs.length > 0) {
          existingSubagents = allSubs
            .slice(0, 10)
            .map(
              (s) =>
                `- [ID: ${s.id}] "${s.name}" (${s.role}) | Status: ${s.status} | Turns: ${s.turnCount || 0} | Goal: "${s.goal}"`
            )
            .join('\n')
        }
      } catch (e) {}

      // Susun System Prompt Mark V5
      const systemPrompt = await buildPlanningSystemPrompt(
        userInput,
        {
          ...opts,
          tgContext,
          currentMusicTrack,
          activeTaskObjective: activeTaskObjectiveRef.current,
          existingSubagents
        },
        unifiedContext,
        contextMsgStr
      )

      // ------------------------------------------------------------------------
      // FASE 4: AGENTIC REACT LOOP (Native Function Calling + SSE Token Stream)
      // ------------------------------------------------------------------------
      const loopMessages = [
        { role: 'system', content: systemPrompt },
        ...optimizedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: payloadContent }
      ]

      let isDone = false
      let stepCount = 0
      const MAX_STEPS = 20
      let executedToolsList = []
      let lastToolExecution = null
      accumulatedThoughts = []
      let currentActiveMood = 'neutral'
      let finalContentAccumulator = ''
      execSteps = [{ task: 'Menganalisis Konteks...' }]
      const dynamicallyLoadedToolGroups = new Set()

      while (!isDone && stepCount < MAX_STEPS) {
        // Cek Abort Signal
        if (sessionAbortController.signal.aborted) {
          if (durableTask && durableTask.status === 'running') {
            await transitionAgentTask(durableTask.id, 'paused', 'user_abort')
          }
          break
        }

        // Cek Intervensi User di tengah jalan
        if (interventionBufferRef.current.length > 0) {
          const interventions = interventionBufferRef.current.join('\n')
          loopMessages.push({ role: 'user', content: `[USER INTERVENTION]: ${interventions}` })
          interventionBufferRef.current = []

          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            { role: 'user', content: interventions }
          ])

          execSteps.push({ task: `Intervensi User: ${interventions}` })
          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length - 1,
              reasoning: 'Menerima arahan baru dari user di tengah proses.'
            }
          })
        }

        stepCount++

        // Ambil Tools OpenAPI Schema yang relevan dengan query/tugas saat ini + group yang sudah dimuat
        const activeTools = opts.disableTools
          ? null
          : await getActiveToolsSchema(
              userInput + ' ' + (activeTaskObjectiveRef.current || ''),
              dynamicallyLoadedToolGroups
            )

        // Loading thinking indicator di awal turn (tanpa teks placeholder dummy)
        targetSetChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const loadingText =
            isAutonomous && autonomousInitialMessage
              ? autonomousInitialMessage
              : ''
          return [
            ...filtered,
            {
              role: 'ai',
              content: loadingText,
              isThinking: true,
              reasoning: accumulatedThoughts[accumulatedThoughts.length - 1] || undefined,
              executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined,
              mood: currentActiveMood
            }
          ]
        })

        let currentTurnReasoning = ''
        let currentTurnContent = ''

        // Request streaming ke Backend AI Bridge
        const streamResult = await fetchAIStream({
          messages: loopMessages,
          tools: activeTools,
          signal: sessionAbortController.signal,
          onReasoning: (chunk) => {
            currentTurnReasoning += chunk
            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: currentTurnContent,
                  isThinking: true,
                  reasoning: currentTurnReasoning,
                  executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined,
                  mood: currentActiveMood
                }
              ]
            })
          },
          onMood: (moodTag) => {
            currentActiveMood = moodTag
            targetSetChatData((prev) =>
              prev.map((msg) => (msg.isThinking ? { ...msg, mood: moodTag } : msg))
            )
          },
          onToken: (token) => {
            currentTurnContent += token
            finalContentAccumulator = currentTurnContent
            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: currentTurnContent,
                  isThinking: true,
                  reasoning: currentTurnReasoning || undefined,
                  executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined,
                  mood: currentActiveMood
                }
              ]
            })
          }
        })

        if (currentTurnReasoning && !accumulatedThoughts.includes(currentTurnReasoning)) {
          accumulatedThoughts.push(currentTurnReasoning)
        }

        // ======================================================================
        // CABANG 1: MODEL MEMANGGIL NATIVE TOOL CALLS
        // ======================================================================
        if (streamResult.toolCalls && streamResult.toolCalls.length > 0) {
          const assistantMsg = {
            role: 'assistant',
            content: streamResult.content || null,
            tool_calls: streamResult.toolCalls
          }
          loopMessages.push(assistantMsg)

          for (const tc of streamResult.toolCalls) {
            const toolName = tc.function?.name
            let parsedArgs = {}
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}')
            } catch (_) {
              parsedArgs = { raw: tc.function?.arguments || '' }
            }

            if (!toolName) continue
            if (sessionAbortController.signal.aborted) break

            execSteps.push({ task: `Eksekusi ${toolName}`, query: JSON.stringify(parsedArgs) })
            targetPushProcess({
              id: agenticProcessId,
              type: 'planning',
              status: 'active',
              data: {
                steps: [...execSteps],
                currentStep: execSteps.length - 1,
                reasoning: currentTurnReasoning || `Mengeksekusi ${toolName}`
              }
            })

            const currentLiveTools = [
              ...executedToolsList,
              { tool: toolName, query: JSON.stringify(parsedArgs), status: 'running' }
            ]

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: streamResult.content || `Mengeksekusi [${toolName}]...`,
                  isThinking: true,
                  reasoning: currentTurnReasoning || undefined,
                  executedTools: currentLiveTools,
                  mood: currentActiveMood
                }
              ]
            })

            // Eksekusi tool
            const pluginProcessId = `plugin-${Date.now()}`
            const execResult = await executeSingleTool(toolName, parsedArgs, {
              tgContext,
              isAutonomous,
              loopMessages,
              pluginProcessId,
              targetSetChatData,
              workspaceRoot: opts.workspaceRoot,
              signal: sessionAbortController.signal
            })

            lastToolExecution = execResult.toolExecution
            if (execResult.loadedGroup) {
              dynamicallyLoadedToolGroups.add(execResult.loadedGroup)
            }
            executedToolsList.push({
              tool: toolName,
              query: JSON.stringify(parsedArgs),
              status: 'done',
              fullResult:
                typeof execResult.resultString === 'string'
                  ? execResult.resultString.slice(0, 4000)
                  : execResult.resultString,
              resultSummary:
                typeof execResult.resultString === 'string' && execResult.resultString.length > 250
                  ? execResult.resultString.slice(0, 250) + '...'
                  : execResult.resultString
            })

            let obsStr = execResult.resultString
            if (
              typeof execResult.resultString === 'string' &&
              execResult.resultString.length > 3000
            ) {
              obsStr = `${execResult.resultString.slice(0, 3000)}\n\n[SISA OUTPUT DIPOTONG (Total: ${execResult.resultString.length} karakter). Gunakan start_line/end_line atau grep-search untuk mencari bagian spesifik.]`
            }

            // Push role: 'tool' observation ke ephemeral context
            loopMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: toolName,
              content: obsStr
            })
          }

          // Lanjut ke giliran berikutnya untuk membiarkan model menganalisis observasi tool
          continue
        }

        // ======================================================================
        // CABANG 2: SELESAI / DIRECT TEXT RESPONSE (Stop / Selesai)
        // ======================================================================
        isDone = true
        finalContentAccumulator = streamResult.content || currentTurnContent || 'Selesai.'

        execSteps.push({ task: 'Selesai' })
        targetPushProcess({
          id: agenticProcessId,
          type: 'planning',
          status: 'done',
          data: {
            steps: [...execSteps],
            currentStep: execSteps.length,
            reasoning: currentTurnReasoning || 'Selesai'
          }
        })

        // TTS Lisan
        if (finalIsSpeak && finalContentAccumulator) {
          playVoice(finalContentAccumulator).catch(() => {})
        }

        // OS Notification
        if (window.api.showNotification && !document.hasFocus() && finalContentAccumulator) {
          window.api.showNotification('Mark', finalContentAccumulator)
        }

        // Tampilkan balasan final di chat UI
        targetSetChatData((prev) => {
          const filtered = prev.filter((item) => {
            if (item.isThinking) return false
            if (isAutonomous && item.isProactive && item.content === autonomousInitialMessage)
              return false
            return true
          })

          let finalOutput = (finalContentAccumulator || '').replace(/^\[mood:[a-zA-Z_]+\]\s*/i, '').trim()
          if (isAutonomous && autonomousInitialMessage) {
            finalOutput = `**${autonomousInitialMessage}**\n\n${finalOutput}`
          }

          const aiMsg = {
            role: 'ai',
            content: finalOutput,
            executedTools: executedToolsList.length > 0 ? executedToolsList : null,
            isTaskDone: true,
            reasoning: currentTurnReasoning || accumulatedThoughts.join('\n\n') || null,
            mood: currentActiveMood || 'neutral',
            pluginExecution: lastToolExecution,
            isProactive: isAutonomous,
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now(),
            source: tgContext ? 'telegram' : 'pc'
          }

          return [...filtered, aiMsg]
        })

        break
      }

      // ------------------------------------------------------------------------
      // FASE 5: CLEANUP & CLOSING
      // ------------------------------------------------------------------------
      targetPushProcess({
        id: agenticProcessId,
        type: 'planning',
        status: 'done',
        data: {
          steps: [...execSteps],
          currentStep: execSteps.length,
          reasoning: accumulatedThoughts[accumulatedThoughts.length - 1] || 'Selesai'
        }
      })
      setTimeout(() => {
        dismissProcess(agenticProcessId)
      }, 1500)

      if (!tgContext && !isAutonomous) {
        if (activeSessionNum === 1) {
          setIsLoading(false)
        }
        lastUserPromptRef.current = ''
      }

      try {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch (_) {}
    } catch (error) {
      console.error('[useMarkPlan] Critical ReAct Loop Error:', error)

      targetPushProcess({
        id: agenticProcessId,
        type: 'planning',
        status: 'failed',
        data: {
          steps: [...execSteps],
          currentStep: execSteps.length,
          reasoning: `Error: ${error.message}`
        }
      })
      setTimeout(() => {
        dismissProcess(agenticProcessId)
      }, 3000)

      if (durableTaskForRecovery && durableTaskForRecovery.status === 'running') {
        transitionAgentTask(
          durableTaskForRecovery.id,
          'failed',
          `Uncaught exception: ${error.message}`
        ).catch(() => {})
      }

      const isAbort = error.name === 'AbortError' || error.message?.includes('AbortError')

      targetSetChatData((prev) => [
        ...prev.filter((item) => !item.isThinking),
        {
          role: 'ai',
          content: isAbort
            ? 'Eksekusi dibatalkan atas permintaan pengguna.'
            : `Terjadi kendala saat memproses: ${error.message}`,
          mood: isAbort ? 'neutral' : 'sadness',
          timestamp: getCurrentTimeInfo(),
          created_at: Date.now()
        }
      ])
    } finally {
      activeSessionsRef.current.delete(activeSessionNum)
      activeSessionUpdatersRef.current.delete(activeSessionNum)
      if (removeRunningSessionId) removeRunningSessionId(activeSessionNum)
      if (activeSessionsRef.current.size === 0) {
        setIsAgentBusy(false)
        if (setRunningSessionId) setRunningSessionId(null)
      }
      if (activeSessionNum === 1) {
        setIsLoading(false)
      }
    }
  }

  return {
    handlePlanningCommand,
    handleIntervention,
    handleStop,
    activeRunningSessionIdRef
  }
}
