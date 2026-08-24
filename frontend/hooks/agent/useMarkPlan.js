import { useEffect, useRef } from 'react'
import { getNextAction } from '../../api/ai/planning'
import { getYoutubeSummary } from '../../api/ai/tools'
import { fetchAI } from '../../api/ai/core'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import { deleteMemory, getAllMemory, insertMemory, updateMemory, saveSession, getChatData } from '../../api/db'
import { checkTools } from '../../api/tools/index'
import { createDurableTaskPlan } from '../../api/ai/taskPlanner'
import { buildDurableStepCheckpoint } from '../../api/taskExecutor'
import {
  createAgentTask,
  startAgentTaskStep,
  checkpointAgentTaskStep,
  transitionAgentTask
} from '../../api/taskStore'
import { getUnifiedContext, searchExtendedMemory, generateVector, executeMemorySearch } from '../../api/vectorMemory'
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
  }, [setChatData])

  const activeTaskObjectiveRef = useRef(null)
  const interventionBufferRef = useRef([])
  const lastUserPromptRef = useRef('')
  const activeRunningSessionIdRef = useRef(1)

  const targetPushProcess = (proc) => {
    if ((activeRunningSessionIdRef.current === 1 || !activeRunningSessionIdRef.current) && pushProcess) {
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
      activeSessionsRef.current.delete(numId)
      activeSessionUpdatersRef.current.delete(numId)
      if (removeRunningSessionId) removeRunningSessionId(numId)
      if (numId === 1) setIsLoading(false)
      if (activeSessionsRef.current.size === 0) {
        setIsAgentBusy(false)
        if (setRunningSessionId) setRunningSessionId(null)
      }
      if (window.api && window.api.browserClose) {
        window.api.browserClose({ sessionId: numId === 1 ? 'main' : `workspace-${numId}` }).catch(() => {})
      }
    } else {
      // Hentikan seluruh sesi yang aktif
      for (const [id, session] of activeSessionsRef.current.entries()) {
        if (session.abortController) session.abortController.abort()
        if (window.api && window.api.browserClose) {
          window.api.browserClose({ sessionId: id === 1 ? 'main' : `workspace-${id}` }).catch(() => {})
        }
      }
      activeSessionsRef.current.clear()
      activeSessionUpdatersRef.current.clear()
      if (setRunningSessionIds) setRunningSessionIds([])
      if (setRunningSessionId) setRunningSessionId(null)
      if (abortControllerRef?.current) abortControllerRef.current.abort()
      if (window.api && window.api.abortFetchAI) {
        try {
          window.api.abortFetchAI()
        } catch (_) {}
      }
      setIsAgentBusy(false)
      setIsLoading(false)
    }
  }

  // ==========================================================================
  // DISPATCHER EKSEKUSI INDIVIDUAL TOOL
  // ==========================================================================
  const executeSingleTool = async (tool, query, context) => {
    const { tgContext, isAutonomous, pluginProcessId, targetSetChatData = setChatData, signal } = context
    const currentSignal = signal || abortControllerRef?.current?.signal
    let resultString = 'Tidak ada hasil.'

    try {
      // 1. YouTube Search
      if (tool === 'yt-search') {
        const ytResults = await window.api.searchYoutube(query)
        resultString = JSON.stringify(ytResults)
      }
      // 2. YouTube Summary
      else if (tool === 'yt-summary') {
        targetSetChatData((prev) => [
          ...prev,
          {
            role: 'ai',
            content: 'Menonton video youtube...',
            isSummarizing: true,
            youtubeLink: query
          }
        ])
        const yData = await getYoutubeData(query)
        resultString = await getYoutubeSummary(query, yData, currentSignal)
        targetSetChatData((prev) => prev.filter((item) => !item.isSummarizing))
      }
      // 3. Music Control
      else if (tool.startsWith('music')) {
        try {
          resultString = await handleMusic(tool, query, targetSetChatData)
        } catch (musicErr) {
          resultString = `[ERROR] Gagal memproses musik: ${musicErr.message}`
        }
      }
      // 4. Memory Vector Search
      else if (tool === 'memory-search') {
        resultString = await executeMemorySearch(query)
      }
      // 5. Speak (TTS)
      else if (tool === 'speak') {
        if (query && query.trim() !== '') {
          targetSetChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            return [
              ...filtered,
              { role: 'ai', content: `(Sedang berbicara) ${query}`, isThinking: true }
            ]
          })
          await playVoice(query)
          resultString = `Berhasil berbicara secara lisan: "${query}"`
        } else {
          resultString = 'Gagal: teks yang mau diucapkan kosong.'
        }
      }
      // 6. Screenshot ke Telegram
      else if (tool === 'screenshot-to-tg') {
        if (window.api && window.api.tgTakeScreenshot) {
          const targetChatId = tgContext?.chatId || null
          window.api.tgTakeScreenshot(targetChatId)
          resultString = 'Screenshot layar PC berhasil diambil dan dikirimkan ke Telegram Admin.'
        } else {
          resultString = 'Gagal: Fitur Telegram Bot belum tersedia.'
        }
      }
      // 7. Vision: Analyze Screen
      else if (tool === 'analyze-screen') {
        try {
          const screens = await window.api.takeScreenshot()
          if (screens && screens.length > 0) {
            targetSetChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: 'Memproses Vision AI...', isThinking: true }
            ])

            const contentArray = [
              {
                type: 'text',
                text: query || 'Jelaskan apa yang kamu lihat di layar ini secara ringkas.'
              },
              { type: 'image_url', image_url: { url: screens[0] } }
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

            console.log(`[Vision AI - analyze-screen] Hasil analisis:`, textContent)
            resultString = `Hasil Analisis Layar:\n${textContent}`
          } else {
            resultString = 'Gagal mengambil screenshot layar untuk analisis.'
          }
        } catch (e) {
          resultString = `Gagal memproses analisis layar: ${e.message}`
        }
      }
      // 8. Vision: Camera Look
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
      // 9. Built-in Native Tools
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
          const parts = (query || '').split('||')
          const name = parts[0]?.trim() || 'Worker-Agent'
          const role = parts[1]?.trim() || 'Technical Specialist'
          const goal = parts[2]?.trim() || 'Selesaikan misi teknis'
          const initialMessage = parts[3]?.trim() || goal
          const tools = parts[4]
            ? parts[4]
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
            data: `[SUB-AGENT BERHASIL DIBUAT & BERJALAN DI BACKGROUND]\n- Nama: ${name}\n- ID: ${sub.id}\n- Role: ${role}\n- Goal: ${goal}\nSub-agent ini telah mulai bekerja secara paralel di background. Kamu bisa langsung membuat sub-agent lain (batch) atau gunakan tool 'wait_subagents' (query: 'all' atau ID-nya) untuk menunggu dan mengumpulkan hasil laporannya.`
          }
        } else if (tool === 'wait_subagents') {
          const { subagentStore } = await import('../../api/subagent/subagentStore.js')
          const parts = (query || '').split('||')
          const targetIdsRaw = parts[0]?.trim() || 'all'
          const maxWaitSeconds = parseInt(parts[1]?.trim() || '40', 10) || 40

          let targetIds = []
          if (targetIdsRaw === 'all' || !targetIdsRaw) {
            const running = await subagentStore.listSubagents('running')
            targetIds = running.map((s) => s.id)
          } else {
            targetIds = targetIdsRaw
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

              const active = finalAgents.filter((a) => a.status === 'running').length
              const completed = finalAgents.length - active
              const elapsed = Math.round((Date.now() - startTime) / 1000)

              // Update status thinking secara live agar pengguna tahu sub-agent sedang bekerja
              targetSetChatData((prev) => {
                const filtered = prev.filter((item) => !item.isThinking)
                return [
                  ...filtered,
                  {
                    role: 'ai',
                    content: `Menunggu tim Sub-Agent bekerja...`,
                    isThinking: true
                  }
                ]
              })

              // Early-Fail Interrupt: Jika ada subagent yang gagal/error, langsung keluar dari loop tanpa menunggu yang lain
              const hasFailed = finalAgents.some(
                (a) => a.status === 'failed' || a.status === 'killed'
              )
              if (hasFailed) {
                break
              }

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

            let statusSummary = 'SEMUA SELESAI'
            if (failedAgents.length > 0 && runningAgents.length > 0) {
              statusSummary = `ADA AGEN GAGAL (${failedAgents.map((a) => a.id).join(', ')}), ${runningAgents.length} AGEN LAIN MASIH RUNNING`
            } else if (failedAgents.length > 0) {
              statusSummary = `ADA AGEN GAGAL (${failedAgents.map((a) => a.id).join(', ')})`
            } else if (runningAgents.length > 0) {
              statusSummary = `${runningAgents.length} AGEN MASIH RUNNING`
            }

            let failPrompt = ''
            if (failedAgents.length > 0) {
              const failedInfo = failedAgents.map((a) => `"${a.id}" (${a.name})`).join(', ')
              failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - EARLY FAIL INTERRUPT]: Sub-agent ${failedInfo} GAGAL saat sub-agent lain masih bekerja! Kamu WAJIB SEGERA mengirim pesan instruksi perbaikan/query alternatif ke ID tersebut menggunakan 'send_message' (format: "ID||instruksi kamu"). Sub-agent lain yang berstatus RUNNING akan tetap bekerja di background.`
            } else if (runningAgents.length > 0) {
              failPrompt = `\n\n[PENGINGAT ORCHESTRATOR]: Masih ada ${runningAgents.length} sub-agent yang sedang bekerja di background. Jika kamu butuh menunggu mereka, panggil kembali 'wait_subagents'.`
            } else {
              failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - PROTOKOL PEER-REVIEW & PIPELINE RELAY]: Sub-agent telah memberikan laporan. Sebagai Lead Orchestrator:\n1. RELAY DATA: Kamu BISA meneruskan/menyalurkan temuan dari satu agen ke agen lain yang membutuhkan via 'send_message' (misal: "id_agen_2||Temuan dari Agen 1: ... Tolong lanjutkan dengan menganalisis ...").\n2. REVIEW KRITIS: Evaluasi temuan agen secara mendalam sebelum menyusun kesimpulan akhir.`
            }

            res = {
              success: true,
              data: `[STATUS SUB-AGENTS (${statusSummary})]:\n\n${reports}${failPrompt}`
            }
          }
        } else if (tool === 'send_message') {
          const { runSubagentTurn } = await import('../../api/subagent/subagentExecutor.js')
          const parts = (query || '').split('||')
          const targetId = parts[0]?.trim()
          const msgText = parts[1]?.trim()

          if (!targetId || !msgText) {
            res = {
              success: false,
              error: 'Format query send_message salah. Gunakan: subagent_id||pesan_instruksi'
            }
          } else {
            const runResult = await runSubagentTurn(targetId, msgText)
            if (runResult.success) {
              res = {
                success: true,
                data: `[BALASAN EVALUASI DARI SUB-AGENT (${targetId})]:\n"${runResult.reply}"\n${runResult.thought ? `(Pemikiran: ${runResult.thought})\n` : ''}Evaluasi apakah hasil pendalaman ini sudah memenuhi standar kualitas tinggi. Jika sudah solid, susun jawaban komprehensif ke user. Jika masih butuh pengujian, kirimkan 'send_message' lanjutan.`
              }
            } else {
              res = { success: false, error: `Sub-Agent error: ${runResult.error}` }
            }
          }
        } else if (tool === 'list_subagents') {
          const { subagentStore } = await import('../../api/subagent/subagentStore.js')
          const filter = query ? query.trim().toLowerCase() : null
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
          const parts = (query || '').split('||')
          const targetId = parts[0]?.trim()
          if (!targetId) {
            res = { success: false, error: 'Sebutkan subagent_id yang ingin dihentikan.' }
          } else {
            killSubagentExecution(targetId)
            res = { success: true, data: `Sub-agent ${targetId} berhasil dihentikan paksa.` }
          }
        } else if (tool === 'read-tools') {
          const { group_tools } = await import('../../api/tools/group-tools.js')
          const groups = await group_tools()
          const groupName = query.trim()
          if (!groupName) {
            res = {
              success: false,
              message: 'Harap sebutkan nama_grup yang ingin dimuat (misal: "advanced_browser").'
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
          const skillName = (query || '').trim()
          if (!skillName) {
            res = { success: false, message: 'Harap sebutkan nama_skill yang ingin dibaca.' }
          } else {
            // 1. Cek Dexie learnedSkills (Self-Improved / Dynamic Native Skills)
            const { getLearnedSkill } = await import('../../api/db.js')
            const learned = await getLearnedSkill(skillName)
            if (learned && learned.content) {
              res = {
                success: true,
                data: `[PEDOMAN PROSEDUR KEAHLIAN (LEARNED/DEXIE): ${skillName.toUpperCase()}]\n${learned.content}`
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
                    message: `Skill "${skillName}" tidak ditemukan di keahlian internal maupun folder Mark Skills.`
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
          resultString =
            res.data !== undefined
              ? typeof res.data === 'string'
                ? res.data
                : JSON.stringify(res.data)
              : res.message || 'Success'

          // Pemotongan isi dokumen jika terlalu panjang
          if (tool === 'read-document') {
            const parts = query.split('||')
            let fullText =
              typeof res.data === 'object' && res.data !== null
                ? res.data.content || ''
                : String(res.data || '')
            if (fullText && fullText.length > 2500) {
              resultString = `${fullText.slice(0, 2500)}\n\n[DOKUMEN DIPOTONG (Total: ${fullText.length} karakter). Gunakan read-document dengan query "${parts[0]}||kata_kunci" untuk pencarian spesifik]`
            }
          }
        } else {
          resultString = `[ERROR] ${tool} gagal: ${(res && (res.message || res.error)) || 'Unknown error'}`
        }

        return {
          resultString,
          rejected: false,
          toolExecution: { action: tool, query, result: resultString }
        }
      }
      // 10. Plugin Execution
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
      if (toolError.name === 'AbortError' || toolError.message.includes('AbortError')) {
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
  // CORE HANDLER: handlePlanningCommand (ReAct Loop)
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

    // Flexible options detection: support options passed as 2nd arg or in other slots
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

    if (!tgContext && activeSessionsRef.current.has(activeSessionNum)) {
      const existing = activeSessionsRef.current.get(activeSessionNum)
      if (existing?.abortController) {
        console.log(
          `[useMarkPlan] Membatalkan sesi ${activeSessionNum} sebelumnya untuk memproses input baru: "${userInput}"`
        )
        try {
          existing.abortController.abort()
        } catch (_) {}
      }
      activeSessionsRef.current.delete(activeSessionNum)
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

        // 2. Broadcast reactive event to UI (listeners filter by activeSessionId)
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
    let chatSession = [...optimizedHistory, userMessage]

    if (!isAutonomous && !isSystem) {
      targetSetChatData((prev) => [...prev, userMessage])
    }

    const agenticProcessId = `agentic-${Date.now()}`
    let durableTaskForRecovery = null

    try {
      let durableTask = null
      let durableActiveStep = null

      const allMemory = await getAllMemory()
      let searchQuery = userInput
      if (chatSession.length > 1) {
        const lastMsg = chatSession[chatSession.length - 2]
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
            .map((a) => `[${a.time}] ${a.app}${a.title ? ` — ${a.title}` : ''}`)
            .join('\n')
          contextMsgStr += `[AKTIVITAS PC USER (terakhir)]\n${activitySummary}\n`
        }
      } catch (_) {}

      // Tampilkan ucapan inisiatif jika autonomous
      if (isAutonomous && autonomousInitialMessage && !tgContext) {
        targetSetChatData((prev) => [
          ...prev,
          {
            role: 'ai',
            content: autonomousInitialMessage,
            timestamp: getCurrentTimeInfo(),
            isProactive: true
          }
        ])
        chatSession.splice(chatSession.length - 1, 0, {
          role: 'assistant',
          content: autonomousInitialMessage
        })
      }

      // ------------------------------------------------------------------------
      // FASE 4: AGENTIC REACT LOOP
      // ------------------------------------------------------------------------
      const loopMessages = [...chatSession]
      let isDone = false
      let stepCount = 0
      let lastDecision = null
      let allSources = []
      let executedToolsList = []
      let accumulatedThoughts = []
      let lastToolExecution = null
      let durableFailed = false
      let execSteps = [{ task: 'Menganalisis Konteks...' }]

      while (!isDone) {
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

        // Loading thinking indicator
        targetSetChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const loadingText =
            isAutonomous && autonomousInitialMessage
              ? autonomousInitialMessage
              : 'Bentar, mikir dlu...'
          return [
            ...filtered,
            {
              role: 'ai',
              content: loadingText,
              isThinking: true,
              reasoning: lastDecision?.thought || undefined,
              executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined
            }
          ]
        })

        // Ambil daftar sub-agent yang tersedia untuk pencegahan duplikasi
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

        // Request keputusan giliran ke AI (getNextAction)
        const decision = await getNextAction(
          userInput,
          loopMessages,
          sessionAbortController.signal,
          unifiedContext,
          contextMsgStr,
          activeTopic,
          {
            ...opts,
            intentQuery: searchQuery,
            tgContext,
            currentMusicTrack,
            activeTaskObjective: activeTaskObjectiveRef.current,
            existingSubagents
          }
        )

        // Penanganan jika disableTools aktif
        if (opts.disableTools) {
          if (decision.action) decision.action = null
          if (!decision.answer) {
            decision.answer =
              'Halo! Aku sudah aktif dan siap membantumu. Ada yang bisa kita kerjakan hari ini?'
          }
        }

        lastDecision = decision
        if (decision?.thought && !accumulatedThoughts.includes(decision.thought)) {
          accumulatedThoughts.push(decision.thought)
        }
        let taskJustCreated = false

        // INTERCEPTOR: Membuat Durable Task Plan baru jika disarankan AI
        const suggestedMode = decision.suggested_mode || 'direct'
        if (
          suggestedMode === 'durable' &&
          !durableTask &&
          !isAutonomous &&
          !tgContext &&
          !opts.disableTools
        ) {
          console.log('[useMarkPlan] Interceptor triggered: mode=durable. Creating task plan...')
          const taskRoute = {
            mode: 'durable',
            reason: decision.thought,
            estimatedSteps: 3,
            confidence: 1
          }
          const durablePlan = await createDurableTaskPlan(
            userInput,
            taskRoute,
            sessionAbortController.signal
          )

          const documentsPath = await window.api.getDocumentsPath?.()
          const artifactRoot = documentsPath
            ? `${documentsPath.replace(/[\\/]$/, '')}/Mark Tasks/${Date.now()}`
            : null

          durableTask = await createAgentTask({
            title: durablePlan.title,
            objective: durablePlan.objective,
            mode: 'durable',
            constraints: durablePlan.constraints,
            contextSummary: durablePlan.contextSummary,
            artifactRoot,
            steps: durablePlan.steps.map((step) => ({
              id: step.id,
              title: step.title,
              objective: step.objective,
              deliverable: step.deliverable,
              acceptanceCriteria: step.acceptanceCriteria,
              artifactPath:
                artifactRoot && step.artifactName ? `${artifactRoot}/${step.artifactName}` : null
            }))
          })

          durableTaskForRecovery = durableTask
          durableActiveStep = await startAgentTaskStep(durableTask.id, durableTask.activeStepId)
          activeTaskObjectiveRef.current = durableActiveStep?.objective || durableTask.objective

          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: durablePlan.steps.map((step) => ({ task: step.title })),
              currentStep: 0,
              reasoning: `Durable task dibuat: ${taskRoute.reason}`
            }
          })

          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            {
              role: 'ai',
              isPlanSteps: true,
              plan: durablePlan.steps.map((step) => ({
                id: step.id,
                title: step.title,
                task: step.title,
                objective: step.objective,
                deliverable: step.deliverable
              })),
              currentStep: 0,
              reasoning: `Durable task dibuat: ${taskRoute.reason || durablePlan.objective}`,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now()
            }
          ])
          taskJustCreated = true
        }

        // Update task status & active topic
        if (decision.task_status === 'in_progress' && decision.objective) {
          activeTaskObjectiveRef.current = decision.objective
        } else if (decision.task_status === 'done' || decision.task_status === 'simple') {
          activeTaskObjectiveRef.current = null
        }
        if (decision.active_topic) {
          setActiveTopic(decision.active_topic)
        }

        // Simpan / Perbarui Memory jika diputuskan AI
        if (decision.memory) {
          const memoryData = { ...decision.memory }
          memoryData.memory = memoryData.memory
            .trim()
            .replace(/^[\\\"]+|[\\\"]+$/g, '')
            .replace(/\\n/g, '\n')
            .replace(/^\[.*?\]\s*/, '')
          memoryData.memory = `[${getCurrentTimeInfo()}] ${memoryData.memory}`

          // Orama Auto-Dedup check
          if (
            memoryData.action === 'insert' &&
            (memoryData.type === 'profile' || memoryData.type === 'preference')
          ) {
            try {
              const newVec = await generateVector(memoryData.memory)
              if (newVec) {
                const similarMemories = await searchMemoriesInOrama(
                  memoryData.memory,
                  newVec,
                  1,
                  memoryData.type
                )
                if (similarMemories.length > 0 && similarMemories[0].score > 0.82) {
                  memoryData.action = 'update'
                  memoryData.id = similarMemories[0].id
                }
              }
            } catch (err) {
              console.error('Error in Orama auto-dedup check:', err)
            }
          }

          const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
          if (actions[memoryData.action]) {
            await actions[memoryData.action](memoryData)
          }
        }

        // Jika durable task baru saja dibuat, lanjut eksekusi step 1
        if (taskJustCreated) {
          loopMessages.push({
            role: 'assistant',
            content: decision.thought || '[DURABLE TASK INITIATED]'
          })
          loopMessages.push({
            role: 'user',
            content: `[DURABLE TASK DIMULAI] Mulai eksekusi plan. Kerjakan step 1: "${durableActiveStep.title}". Objective: ${durableActiveStep.objective}. Deliverable: ${durableActiveStep.deliverable}. Gunakan tools yang tepat sekarang juga.`
          })
          contextMsgStr += `[DURABLE STEP AKTIF]: id=${durableActiveStep.id}; title="${durableActiveStep.title}"; objective="${durableActiveStep.objective}"; deliverable="${durableActiveStep.deliverable}".\n`
          if (durableActiveStep.acceptanceCriteria?.length > 0) {
            contextMsgStr += `[DURABLE STEP ACCEPTANCE]\n${durableActiveStep.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}\n`
          }
          continue
        }

        // ----------------------------------------------------------------------
        // EVALUASI KEPUTUSAN GILIRAN (Tool vs Jawaban / Selesai)
        // ----------------------------------------------------------------------
        const hasAction = !!(
          decision.action &&
          (decision.action.tool || Array.isArray(decision.action))
        )
        const isDoneSignal =
          decision.is_done === true ||
          opts.disableTools ||
          (!hasAction && !!decision.answer)

        // Kasus 1: Intermediate Speech (Bicara tanpa tool, tapi belum selesai)
        if (!hasAction && !isDoneSignal && decision.answer && !durableTask) {
          loopMessages.push({ role: 'assistant', content: decision.answer })
          loopMessages.push({
            role: 'user',
            content:
              '[LANJUTKAN] Kamu belum menyatakan selesai (is_done: false). Silakan panggil tool di action atau selesaikan tugasmu.'
          })
          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            { role: 'ai', content: decision.answer, isProactive: false, isIntermediate: true }
          ])
          continue
        }

        // Kasus 2: Selesai / Checkpoint Step (is_done: true atau selesai giliran)
        if (isDoneSignal || (!hasAction && durableTask)) {
          if (durableTask && durableActiveStep) {
            const currentStep = durableActiveStep
            const checkpoint = buildDurableStepCheckpoint(
              currentStep,
              decision.answer,
              durableTask.maxRetries
            )
            const stepValidation = checkpoint.validation
            const checkpointData = { ...checkpoint }
            delete checkpointData.canRetry

            // Penulisan artifact file jika lolos validasi
            if (
              stepValidation.isComplete &&
              currentStep.artifactPath &&
              window.api?.executeNativeTool
            ) {
              const artifactQuery = `${currentStep.artifactPath}||${decision.answer}`
              const approval = await window.api.checkToolApproval('write-file', artifactQuery)
              const approved =
                !approval?.needsApproval ||
                (requestApproval &&
                  (await requestApproval(approval.message, 'write-file', artifactQuery)))

              if (!approved) {
                checkpointData.status = 'needs_revision'
                checkpointData.error = 'Penulisan artifact ditolak user.'
                checkpointData.validation = {
                  ...stepValidation,
                  isComplete: false,
                  missingRequirements: ['Artifact belum disimpan karena approval ditolak.']
                }
              } else {
                const artifactResult = await window.api.executeNativeTool(
                  'write-file',
                  artifactQuery,
                  config
                )
                if (!artifactResult?.success) {
                  checkpointData.status = 'needs_revision'
                  checkpointData.error =
                    artifactResult?.error || artifactResult?.message || 'Artifact gagal ditulis.'
                }
              }
            }

            const checkpointCompleted = checkpointData.status === 'completed'
            const checkpointCanRetry =
              !checkpointCompleted && currentStep.attempts < durableTask.maxRetries + 1
            const checkpointNeedsRevision = !checkpointCompleted && checkpointCanRetry

            const checkpointedTask = await checkpointAgentTaskStep(
              durableTask.id,
              durableActiveStep.id,
              checkpointData
            )

            if (!checkpointCompleted && !checkpointCanRetry) {
              await transitionAgentTask(
                durableTask.id,
                'failed',
                'Step gagal memenuhi validasi setelah batas retry.'
              )
              decision.answer = `Task berhenti karena step "${currentStep.title}" belum memenuhi deliverable setelah ${currentStep.attempts} percobaan.`
              durableTask = checkpointedTask
              durableActiveStep = null
              activeTaskObjectiveRef.current = null
              durableFailed = true
            }

            const nextStep = checkpointCompleted
              ? checkpointedTask?.steps?.find((step) => step.id === checkpointedTask.activeStepId)
              : null
            durableTask = checkpointedTask
            durableActiveStep = nextStep || (checkpointNeedsRevision ? currentStep : null)
            activeTaskObjectiveRef.current =
              nextStep?.objective || (checkpointNeedsRevision ? currentStep.objective : null)

            // Step butuh revisi
            if (!checkpointCompleted && checkpointNeedsRevision) {
              loopMessages.push({
                role: 'assistant',
                content: `[STEP PERLU REVISI] ${decision.answer}`
              })
              loopMessages.push({
                role: 'user',
                content: `[REVISI DURABLE STEP] Ulangi step "${currentStep.title}". Kekurangan validasi: ${stepValidation.missingRequirements.join('; ')}`
              })
              await startAgentTaskStep(durableTask.id, durableActiveStep.id)
              continue
            }

            // Lanjut ke step berikutnya
            if (nextStep) {
              loopMessages.push({ role: 'assistant', content: `[STEP SELESAI] ${decision.answer}` })
              loopMessages.push({
                role: 'user',
                content: `[LANJUTKAN DURABLE TASK] Kerjakan step berikutnya: "${nextStep.title}". Objective: ${nextStep.objective}. Deliverable: ${nextStep.deliverable}. Jangan mengulang step sebelumnya.`
              })
              contextMsgStr += `[DURABLE STEP BERIKUTNYA]: id=${nextStep.id}; title="${nextStep.title}"; objective="${nextStep.objective}"; deliverable="${nextStep.deliverable}".\n`
              if (nextStep.acceptanceCriteria?.length > 0) {
                contextMsgStr += `[DURABLE STEP ACCEPTANCE]\n${nextStep.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}\n`
              }
              await startAgentTaskStep(durableTask.id, nextStep.id)
              targetPushProcess({
                id: agenticProcessId,
                type: 'planning',
                status: 'active',
                data: {
                  steps: durableTask.steps.map((step) => ({ task: step.title })),
                  currentStep: nextStep.index,
                  reasoning: `Step selesai. Lanjut ke: ${nextStep.title}`
                }
              })
              const nextIndex = durableTask.steps.findIndex((s) => s.id === nextStep.id)
              targetSetChatData((prev) =>
                prev.map((msg) =>
                  msg.isPlanSteps
                    ? {
                        ...msg,
                        currentStep: nextIndex !== -1 ? nextIndex : (msg.currentStep || 0) + 1
                      }
                    : msg
                )
              )
              continue
            }
          }

          // Semua step atau proses tunggal selesai total
          isDone = true
          if (durableTask) {
            targetSetChatData((prev) =>
              prev.map((msg) =>
                msg.isPlanSteps
                  ? {
                      ...msg,
                      currentStep: msg.plan ? msg.plan.length : 999
                    }
                  : msg
              )
            )
          }
          execSteps.push({ task: 'Selesai' })
          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: durableFailed ? 'failed' : 'done',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length,
              reasoning: decision.thought || 'Selesai'
            }
          })

          // TTS Lisan
          if (finalIsSpeak && decision.answer) {
            targetSetChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: 'Bentar...', isThinking: true }
            ])
            await playVoice(decision.answer)
          }

          // OS Notification
          if (window.api.showNotification && !document.hasFocus() && decision.answer) {
            window.api.showNotification('Mark', decision.answer)
          }

          // Tampilkan balasan final di chat UI
          targetSetChatData((prev) => {
            const filtered = prev.filter((item) => {
              if (item.isThinking) return false
              if (isAutonomous && item.isProactive && item.content === autonomousInitialMessage)
                return false
              return true
            })

            let finalOutput = decision.answer
            if (isAutonomous && autonomousInitialMessage) {
              finalOutput = `**${autonomousInitialMessage}**\n\n${decision.answer}`
            }

            const aiMsg = {
              role: 'ai',
              content: finalOutput,
              executedTools: executedToolsList.length > 0 ? executedToolsList : null,
              isTaskDone: decision.is_done === true,
              reasoning: decision.thought || lastDecision?.thought || null,
              mood: decision.mood || 'neutral',
              isMemorySaved: decision.memory?.action === 'insert',
              isMemoryUpdated: decision.memory?.action === 'update',
              isMemoryDeleted: decision.memory?.action === 'delete',
              pluginExecution: lastToolExecution,
              isProactive: isAutonomous,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now(),
              source: tgContext ? 'telegram' : 'pc'
            }

            if (allSources.length > 0) {
              const uniqueSources = []
              const seenLinks = new Set()
              allSources.forEach((source) => {
                const id = source.link || JSON.stringify(source)
                if (!seenLinks.has(id)) {
                  seenLinks.add(id)
                  uniqueSources.push(source)
                }
              })
              aiMsg.sources = uniqueSources
            }
            return [...filtered, aiMsg]
          })

          if (window.api && window.api.browserAction) {
            window.api.browserAction({ action: 'finish' }).catch(() => {})
          }

          // === WORKSPACE WORKING MEMORY AUTO-SAVE ===
          if (opts.workspaceRoot && (decision.working_memory || decision.objective)) {
            saveWorkspaceWorkingMemory(opts.workspaceRoot, {
              notes: decision.working_memory || undefined,
              activeObjective: decision.objective || undefined
            }).catch(() => {})
          }

          // === DEDICATED SELF-IMPROVING SKILL SYNTHESIZER ===
          if (decision.should_learn === true && executedToolsList.length > 0) {
            import('../../api/ai/skillSynthesizer.js')
              .then(({ synthesizeSkillAndSave }) => {
                synthesizeSkillAndSave({
                  userPrompt: userInput || lastUserPromptRef.current || '',
                  executedTools: executedToolsList,
                  finalAnswer: decision.answer || '',
                  thought: decision.thought || ''
                })
                  .then((saved) => {
                    if (saved) {
                      console.log(
                        `[useMarkPlan] ✨ Keahlian baru berhasil dipelajari: /${saved.name}`
                      )
                    }
                  })
                  .catch((err) => {
                    console.error('[useMarkPlan] Gagal mensintesis skill:', err)
                  })
              })
              .catch((err) => {
                console.error('[useMarkPlan] Gagal import skillSynthesizer:', err)
              })
          }

          break
        }

        // Kasus 3: Eksekusi Tool (Single / Batch)
        if (decision.action && (decision.action.tool || Array.isArray(decision.action))) {
          const actionList = Array.isArray(decision.action) ? decision.action : [decision.action]
          const isBatch = actionList.length > 1
          const batchResults = []

          for (let actionIdx = 0; actionIdx < actionList.length; actionIdx++) {
            const tool = actionList[actionIdx].tool
            const query = actionList[actionIdx].query || ''

            if (!tool) continue
            if (sessionAbortController.signal.aborted) break

            if (execSteps.length === 1 && execSteps[0].task === 'Menganalisis Konteks...') {
              execSteps = [{ task: `Eksekusi ${tool}`, query: query }]
            } else {
              execSteps.push({ task: `Eksekusi ${tool}`, query: query })
            }

            targetPushProcess({
              id: agenticProcessId,
              type: 'planning',
              status: 'active',
              data: {
                steps: [...execSteps],
                currentStep: execSteps.length - 1,
                reasoning: decision.thought || `Eksekusi ${tool}`
              }
            })

            const currentLiveTools = [
              ...executedToolsList,
              { tool, query, status: 'running' }
            ]

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              const loadingText =
                isAutonomous && autonomousInitialMessage
                  ? autonomousInitialMessage
                  : decision.intermediate_answer || `Mengeksekusi [${tool}]...`
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: loadingText,
                  isThinking: true,
                  reasoning: decision.thought,
                  executedTools: currentLiveTools,
                  mood: decision.mood || 'neutral'
                }
              ]
            })

            // Eksekusi tool
            const pluginProcessId = `plugin-${Date.now()}`
            const execResult = await executeSingleTool(tool, query, {
              tgContext,
              isAutonomous,
              loopMessages,
              decision,
              pluginProcessId,
              targetSetChatData,
              workspaceRoot: opts.workspaceRoot,
              signal: sessionAbortController.signal
            })

            if (execResult.rejected) {
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${execResult.resultString}`
                }
              )
              continue
            }

            lastToolExecution = execResult.toolExecution
            executedToolsList.push({
              tool: tool,
              query: query,
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

            if (isBatch) {
              batchResults.push(`[${tool}] ${execResult.resultString}`)
            } else {
              let obsStr = execResult.resultString
              if (
                typeof execResult.resultString === 'string' &&
                execResult.resultString.length > 3000
              ) {
                obsStr = `${execResult.resultString.slice(0, 3000)}\n\n[SISA OUTPUT DIPOTONG (Total: ${execResult.resultString.length} karakter). Gunakan startLine||endLine atau grep-search untuk mencari bagian spesifik.]`
              }
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${obsStr}` }
              )
            }
          }

          if (isBatch) {
            const combinedResult = `[BATCH ${actionList.length} actions]\n${batchResults.join('\n')}`
            let obsStr = combinedResult
            if (combinedResult.length > 3000) {
              obsStr =
                combinedResult.slice(0, 3000) +
                `\n\n[SISA OUTPUT DIPOTONG (Total: ${combinedResult.length} karakter)]`
            }
            loopMessages.push(
              {
                role: 'assistant',
                content: JSON.stringify({ thought: decision.thought, action: decision.action })
              },
              {
                role: 'user',
                content: `[OBSERVATION] Hasil eksekusi batch ${actionList.length} tools: ${obsStr}`
              }
            )
          }

          continue
        }

        // Kasus 4: Fallback jika AI tidak mengisi action maupun answer
        if (durableTask && durableActiveStep) {
          console.warn('[useMarkPlan] AI returned empty for durable task. Forcing retry.')
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM INSTRUCTION] Kamu WAJIB menggunakan "action" untuk menjalankan tool demi menyelesaikan step: "${durableActiveStep.title}"! Kamu tidak bisa hanya diam atau membalas kosong.`
          })
          continue
        }

        console.warn(
          '[useMarkPlan] AI returned neither action nor answer. Forcing done with fallback.'
        )
        isDone = true
        targetSetChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: (decision?.thought && decision.thought.trim()) || '...',
            mood: 'neutral',
            timestamp: getCurrentTimeInfo()
          }
        ])
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
          reasoning: lastDecision?.thought || 'Selesai'
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
      } catch (e) {}
    } catch (error) {
      // ------------------------------------------------------------------------
      // ERROR & ABORT RECOVERY
      // ------------------------------------------------------------------------
      if (
        durableTaskForRecovery &&
        (error.name === 'AbortError' || error.message.includes('AbortError'))
      ) {
        await transitionAgentTask(durableTaskForRecovery.id, 'paused', 'user_abort').catch(() => {})
      }
      if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
        console.error('Planning Error:', error)
      }

      if (!tgContext && !isAutonomous) {
        if (activeSessionNum === 1) {
          setIsLoading(false)
        }
        if (!isSystem && !opts.customSetChatData && lastUserPromptRef.current) {
          setMessage(lastUserPromptRef.current)
          lastUserPromptRef.current = ''
        }
      }

      try {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch (e) {}

      if (
        durableTaskForRecovery &&
        (error.name === 'AbortError' || error.message.includes('AbortError'))
      ) {
        targetPushProcess({
          id: agenticProcessId,
          type: 'planning',
          status: 'paused',
          data: {
            steps: [],
            currentStep: 0,
            reasoning: 'Task dipause karena proses dihentikan. Gunakan resume dari task manager.'
          }
        })
      } else {
        if (activeSessionNum === 1) {
          dismissProcess(agenticProcessId)
        }
      }

      if (error.name === 'AbortError' || error.message.includes('AbortError')) {
        targetSetChatData((prev) => [
          ...prev.filter((item) => !item.isThinking && !item.isSearching),
          {
            role: 'ai',
            content: 'Oke, proses gue batalin ya bro.',
            reasoning: 'Proses dibatalkan secara paksa.',
            mood: 'neutral',
            timestamp: new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit'
            })
          }
        ])
      } else {
        if (isSystem && !isAutonomous) {
          const fallbackGreetings = [
            'Sistem aktif. Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
            'Mark sudah online. Silakan berikan perintah.',
            'Halo bro! Sistem berhasil diinisialisasi. Ada yang perlu saya kerjakan?'
          ]
          const randomGreeting =
            fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)]
          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            {
              role: 'ai',
              content: randomGreeting,
              timestamp: new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          ])
        } else if (isAutonomous) {
          targetSetChatData((prev) =>
            prev.filter((item) => !item.isThinking && !item.isSearching && !item.isProactive)
          )
        } else {
          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            { role: 'ai', content: `Maaf, terjadi kesalahan: ${error.message}` }
          ])
        }
      }
    } finally {
      activeSessionUpdatersRef.current.delete(activeSessionNum)
      activeSessionsRef.current.delete(activeSessionNum)

      if (removeRunningSessionId) {
        removeRunningSessionId(activeSessionNum)
      }
      if (activeSessionsRef.current.size === 0) {
        setIsAgentBusy(false)
        if (setRunningSessionId) setRunningSessionId(null)
      }
      if (activeSessionNum === 1) {
        setIsLoading(false)
        window.dispatchEvent(new CustomEvent('mark-plan-completed'))
      }
    }
  }

  return { handlePlanningCommand, handleIntervention, handleStop }
}
