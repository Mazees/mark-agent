import { useEffect, useRef } from 'react'
import { buildPlanningSystemPrompt } from '../../api/ai/planning'
import { getYoutubeSummary } from '../../api/ai/tools'
import { fetchAI } from '../../api/ai/core'
import { playVoice, speechQueue, getCurrentTimeInfo } from '../../api/ai/utils'
import { executeAgentTool } from './executeAgentTool.js'
import { webApi } from '../../api/web-bridge.js'
import {
  deleteMemory,
  getAllMemory,
  insertMemory,
  updateMemory,
  saveSession,
  getChatData,
  getSessionCompact,
  db
} from '../../api/db'
import { checkTools, getActiveToolsSchema } from '../../api/tools/index'
import { startAgentTaskStep, transitionAgentTask } from '../../api/taskStore'
import { getUnifiedContext, generateVector, executeMemorySearch } from '../../api/vectorMemory'
import { searchMemoriesInOrama } from '../../api/oramaStore'
import {
  MAX_CONTEXT_TOKENS,
  MAX_CONTEXT_CHARS,
  GATEWAY_HYGIENE_THRESHOLD,
  IN_LOOP_COMPACT_THRESHOLD,
  calculateSessionTokens,
  calculateMessageTokens,
  calculateSessionChars,
  executeSessionCompaction,
  assembleCompactedPayload,
  pruneInFlightMessages,
  checkAndCompressInLoop
} from '../../api/ai/contextManager'
import { saveWorkspaceWorkingMemory } from '../../api/workspaceRag'
import { synthesizeSkillAndSave } from '../../api/ai/skillSynthesizer'

// ============================================================================
// HELPER UTILITIES
// ============================================================================

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']

const isImagePath = (filePath = '') => {
  if (typeof filePath === 'string' && filePath.startsWith('data:image/')) return true
  const ext = String(filePath || '')
    .split('.')
    .pop()
    .toLowerCase()
  return IMAGE_EXTS.includes(`.${ext}`)
}

const convertFilePathToBase64 = async (filePath) => {
  try {
    if (typeof filePath === 'string' && filePath.startsWith('data:image/')) {
      return filePath
    }
    if (window.api?.executeNativeTool) {
      try {
        const toolRes = await window.api.executeNativeTool('read-file', { path: filePath })
        if (toolRes && toolRes.success && toolRes.dataUrl) {
          return toolRes.dataUrl
        }
      } catch (_) {}
    }
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
  const chatDataRef = useRef(chatData)
  useEffect(() => {
    chatDataRef.current = chatData
  }, [chatData])

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
  const handleIntervention = (msg, targetSessionId = null, opts = {}) => {
    if (!msg || (typeof msg === 'string' && !msg.trim())) return
    const textMsg = typeof msg === 'string' ? msg.trim() : String(msg)
    const displayMsg = opts.displayPrompt || textMsg
    const sId =
      targetSessionId !== null && targetSessionId !== undefined
        ? Number(targetSessionId)
        : activeRunningSessionIdRef.current || 1

    const session = activeSessionsRef.current.get(sId)
    if (session) {
      if (!session.interventions) session.interventions = []
      session.interventions.push(textMsg)
    }

    const updater = activeSessionUpdatersRef.current.get(sId) || (sId === 1 ? setChatData : null)
    if (updater) {
      updater((prev) => {
        const thinkingItem = prev.find((item) => item.isThinking)
        const filtered = prev.filter((item) => !item.isThinking)
        const item = {
          role: 'user',
          content: displayMsg,
          timestamp: getCurrentTimeInfo(),
          created_at: Date.now(),
          isIntervention: true
        }
        return thinkingItem ? [...filtered, item, thinkingItem] : [...prev, item]
      })
    }
  }

  // Penghentian tugas per-sesi secara independen
  const handleStop = async (targetSessionId = null) => {
    try {
      speechQueue.reset()
    } catch (_) {}

    const numId =
      targetSessionId !== null && targetSessionId !== undefined ? Number(targetSessionId) : null
    const strId =
      targetSessionId !== null && targetSessionId !== undefined ? String(targetSessionId) : null

    const sessionsToAbort = []
    if (numId !== null) {
      const s = activeSessionsRef.current.get(numId) || activeSessionsRef.current.get(strId)
      if (s) sessionsToAbort.push(s)
    }

    if (sessionsToAbort.length === 0) {
      for (const s of activeSessionsRef.current.values()) {
        sessionsToAbort.push(s)
      }
    }

    for (const session of sessionsToAbort) {
      if (session.abortController) {
        try {
          session.abortController.abort()
        } catch (_) {}
      }
    }

    if (abortControllerRef?.current) {
      try {
        abortControllerRef.current.abort()
      } catch (_) {}
    }

    if (window.api && window.api.abortFetchAI) {
      try {
        window.api.abortFetchAI()
      } catch (_) {}
    }

    if (window.api && window.api.browserClose) {
      const closeId = numId === 1 || !numId ? 'main' : `workspace-${numId}`
      window.api.browserClose({ sessionId: closeId }).catch(() => {})
    }

    // Fail-safe: Langsung batalkan semua agent tasks yang berstatus running di SQLite
    try {
      const runningTasks = await db.agentTasks.where('status').equals('running').toArray()
      for (const t of runningTasks) {
        await transitionAgentTask(t.id, 'cancelled', 'user_abort').catch(() => {})
      }
    } catch (_) {}

    // Fail-safe: Langsung update chatData UI agar alur kerja dan spinner berhenti seketika
    const stopUpdater = (prev) => {
      const filtered = prev.filter((item) => !item.isThinking)
      return filtered.map((msg) => {
        if (!msg.isPlanSteps || msg.taskStatus !== 'running') return msg
        return {
          ...msg,
          taskStatus: 'stopped',
          plan: (msg.plan || []).map((s) => ({
            ...s,
            status: s.status === 'running' ? 'stopped' : s.status
          }))
        }
      })
    }

    if (numId !== null && activeSessionUpdatersRef.current.has(numId)) {
      activeSessionUpdatersRef.current.get(numId)(stopUpdater)
    } else {
      setChatData(stopUpdater)
      for (const updater of activeSessionUpdatersRef.current.values()) {
        updater(stopUpdater)
      }
    }

    if (numId === 1 || numId === null) {
      setIsLoading(false)
      setIsAgentBusy(false)
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
      activeSessionNum = 1,
      activeTopic = null,
      userInput = '',
      durableTask = null,
      durableActiveStep = null,
      agenticProcessId = null,
      targetSetChatData = setChatData,
      signal
    } = context
    const currentSignal = signal || abortControllerRef?.current?.signal
    let resultString = 'Tidak ada hasil.'

    const stringQuery =
      typeof rawArgs === 'string'
        ? rawArgs
        : typeof rawArgs === 'object' && rawArgs !== null
          ? rawArgs.query ||
            rawArgs.prompt ||
            rawArgs.text ||
            rawArgs.path ||
            JSON.stringify(rawArgs)
          : ''

    try {
      // 1. YouTube Search
      if (tool === 'yt-search') {
        const q = typeof rawArgs === 'object' && rawArgs?.query ? rawArgs.query : stringQuery
        const ytResults = await window.api.searchYoutube(q)
        resultString = JSON.stringify(ytResults)
      }
      // 2. YouTube Summary
      else if (tool === 'yt-summary') {
        const url = typeof rawArgs === 'object' && rawArgs?.url ? rawArgs.url : stringQuery
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
        const musicQuery =
          typeof rawArgs === 'object' && rawArgs?.query ? rawArgs.query : stringQuery
        resultString = await handleMusic(tool, musicQuery, targetSetChatData)
      }
      // 4. Memory Vector Search
      else if (tool === 'memory-search') {
        const q = typeof rawArgs === 'object' && rawArgs?.query ? rawArgs.query : stringQuery
        resultString = await executeMemorySearch(q)
      }
      // 5. Memory Management Tool
      else if (tool === 'manage-memory') {
        const memArgs = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
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
                  toolExecution: { action: tool, query: stringQuery, result: resultString }
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
        const notes = typeof rawArgs === 'object' && rawArgs?.notes ? rawArgs.notes : stringQuery
        if (context?.workspaceRoot && notes) {
          await saveWorkspaceWorkingMemory(context.workspaceRoot, { notes })
          resultString = `Catatan progres koding berhasil disimpan ke .mark/working-memory.json.`
        } else {
          resultString = `Working memory dicatat untuk sesi ini: ${notes}`
        }
      }
      // 7. Speak (TTS)
      else if (tool === 'speak') {
        const textToSpeak =
          typeof rawArgs === 'object' && rawArgs?.text ? rawArgs.text : stringQuery
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

            const promptText =
              (typeof rawArgs === 'object' && rawArgs?.prompt) ||
              (typeof rawArgs === 'object' && (rawArgs?.query || rawArgs?.prompt)) ||
              (typeof rawArgs === 'string' ? rawArgs : '') ||
              'Jelaskan apa yang kamu lihat di layar ini secara ringkas.'
            ;('Jelaskan apa yang kamu lihat di layar ini secara ringkas, fokus pada jendela aplikasi, teks, dan status UI.')

            const contentArray = [
              {
                type: 'text',
                text: promptText
              },
              ...screenArray.map((scr) => ({
                type: 'image_url',
                image_url: { url: scr }
              }))
            ]

            let textContent = ''
            try {
              const visionResponse = await fetchAI(
                [{ role: 'user', content: contentArray }],
                false,
                {
                  signal: currentSignal,
                  isSmallTask: true
                }
              )
              textContent =
                typeof visionResponse === 'object' && visionResponse.content
                  ? visionResponse.content
                  : String(visionResponse)
            } catch (vErr) {
              textContent = `(Analisis teks awal dilewati: ${vErr.message})`
            }

            console.log(
              `[Vision AI - analyze-screen] Hasil analisis (${screenArray.length} monitor):`,
              textContent
            )
            resultString = `Hasil Analisis Layar (${screenArray.length} monitor):\n${textContent}`
            return {
              success: true,
              resultString,
              rejected: false,
              imageUrls: screenArray,
              previewUrl: screenArray[0],
              toolExecution: { action: tool, query: stringQuery, result: resultString }
            }
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

              const promptText =
                (typeof rawArgs === 'object' && (rawArgs?.query || rawArgs?.prompt)) ||
                (typeof rawArgs === 'string' ? rawArgs : '') ||
                'Jelaskan dengan detail apa yang terlihat dari kamera ini.'

              const contentArray = [
                {
                  type: 'text',
                  text: promptText
                },
                { type: 'image_url', image_url: { url: cameraFrame } }
              ]

              let textContent = ''
              try {
                const visionResponse = await fetchAI(
                  [{ role: 'user', content: contentArray }],
                  false,
                  { signal: currentSignal, isSmallTask: true }
                )
                textContent =
                  typeof visionResponse === 'object' && visionResponse.content
                    ? visionResponse.content
                    : String(visionResponse)
              } catch (vErr) {
                textContent = `(Analisis teks awal dilewati: ${vErr.message})`
              }

              console.log(`[Vision AI - camera-look] Hasil analisis:`, textContent)
              resultString = `Hasil Analisis Kamera:\n${textContent}`
              return {
                success: true,
                resultString,
                rejected: false,
                imageUrls: [cameraFrame],
                previewUrl: cameraFrame,
                toolExecution: { action: tool, query: stringQuery, result: resultString }
              }
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
        const approvalCheck = await window.api.checkToolApproval(tool, rawArgs)

        if (approvalCheck.needsApproval && requestApproval) {
          const userApproved = await requestApproval(approvalCheck.message, tool, rawArgs, {
            sessionId: activeSessionNum,
            targetSetChatData
          })
          if (!userApproved) {
            resultString = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
            return {
              resultString,
              rejected: true,
              toolExecution: { action: tool, query: stringQuery, result: resultString }
            }
          }
        }

        const executionResult = await executeAgentTool({
          tool,
          rawArgs,
          config,
          context,
          activeSessionNum,
          activeTopic,
          userInput,
          durableTask,
          durableActiveStep,
          agenticProcessId,
          targetPushProcess,
          targetSetChatData,
          currentSignal,
          abortControllerRef,
          getCurrentTimeInfo,
          activeTaskObjectiveRef
        })

        const res = executionResult.res

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
            let fullText =
              typeof res.data === 'object' && res.data !== null
                ? res.data.content || ''
                : String(res.data || resultString || '')
            if (fullText && fullText.length > 2500) {
              resultString = `${fullText.slice(0, 2500)}\n\n[DOKUMEN DIPOTONG (Total: ${fullText.length} karakter). Gunakan read-document dengan keyword untuk pencarian spesifik]`
            }
          }

          // Analisis visual untuk read-image
          if (tool === 'read-image' && res.dataUrl) {
            const promptText =
              (typeof rawArgs === 'object' && (rawArgs?.query || rawArgs?.prompt)) ||
              (typeof rawArgs === 'string' ? rawArgs : '') ||
              'Jelaskan apa yang kamu lihat pada gambar ini secara rinci.'
            try {
              targetSetChatData((prev) => [
                ...prev.filter((item) => !item.isThinking),
                {
                  role: 'ai',
                  content: `Menganalisis gambar ${res.filename || ''}...`,
                  isThinking: true
                }
              ])
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
                { signal: currentSignal, isSmallTask: true }
              )
              const textContent =
                typeof visionResponse === 'object' && visionResponse.content
                  ? visionResponse.content
                  : String(visionResponse)
              resultString = `[Vision AI - read-image] Analisis berkas '${res.filename || 'gambar'}':\n${textContent}`
            } catch (vErr) {
              resultString = `Berkas gambar '${res.filename || 'gambar'}' berhasil dibaca. (Analisis teks awal dilewati: ${vErr.message}). Gambar visual diteruskan ke observasi.`
            }
          }

          // Analisis visual untuk browser-screenshot jika query disertakan
          if (tool === 'browser-screenshot' && res.dataUrl && (rawArgs?.query || res.query)) {
            const promptText =
              (typeof rawArgs === 'object' && (rawArgs?.query || rawArgs?.prompt)) ||
              res.query ||
              'Jelaskan tampilan visual halaman web ini.'
            try {
              targetSetChatData((prev) => [
                ...prev.filter((item) => !item.isThinking),
                { role: 'ai', content: 'Menganalisis tampilan web...', isThinking: true }
              ])
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
                { signal: currentSignal, isSmallTask: true }
              )
              const textContent =
                typeof visionResponse === 'object' && visionResponse.content
                  ? visionResponse.content
                  : String(visionResponse)
              resultString = `[Vision AI - browser-screenshot] ${res.message || 'Screenshot berhasil diambil.'}\nHasil analisis:\n${textContent}`
            } catch (vErr) {
              resultString = `${res.message || 'Screenshot berhasil diambil.'} (Analisis teks awal dilewati: ${vErr.message}). Gambar visual diteruskan ke observasi.`
            }
          }
        } else {
          resultString = `[ERROR] ${tool} gagal: ${(res && (res.message || res.error)) || 'Unknown error'}`
        }

        const toolImageUrls = res?.dataUrl ? [res.dataUrl] : null
        const toolPreviewUrl = res?.dataUrl || null

        return {
          res,
          success: Boolean(res?.success),
          resultString,
          rejected: false,
          imageUrls: toolImageUrls,
          previewUrl: toolPreviewUrl,
          toolExecution: { action: tool, query: stringQuery, result: resultString },
          loadedGroup: res?.loaded_group || null,
          durableTask: executionResult?.durableTask || durableTask || null,
          durableActiveStep:
            executionResult?.durableActiveStep !== undefined
              ? executionResult.durableActiveStep
              : durableActiveStep || null
        }
      }
      // 12. Dynamic Plugin Execution
      else {
        targetPushProcess({
          id: pluginProcessId,
          type: 'plugin-execution',
          status: 'active',
          data: { action: tool, query: stringQuery }
        })

        const pluginPromise = window.api.executePlugin(tool, rawArgs)
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
          data: { action: tool, query: stringQuery, result: resultString }
        })

        return {
          res,
          success: Boolean(res?.success),
          resultString,
          rejected: false,
          toolExecution: { action: tool, query: stringQuery, result: resultString }
        }
      }
    } catch (toolError) {
      if (toolError.name === 'AbortError' || toolError.message?.includes('AbortError')) {
        throw toolError
      }
      resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
    }

    return {
      success: !resultString.startsWith('[ERROR]'),
      resultString,
      rejected: false,
      toolExecution: { action: tool, query: stringQuery, result: resultString }
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
      opts = { ...opts, ...tgContextOrOptions }
      tgContext = null
    } else if (
      autonomousInitialMessage &&
      typeof autonomousInitialMessage === 'object' &&
      (autonomousInitialMessage.sessionId ||
        autonomousInitialMessage.customChatData ||
        autonomousInitialMessage.customSetChatData ||
        autonomousInitialMessage.onSaveSession)
    ) {
      opts = { ...opts, ...autonomousInitialMessage }
      autonomousInitialMessage = null
    }

    // ------------------------------------------------------------------------
    // FASE 1: VALIDASI INPUT & PER-SESSION LOCKING
    // ------------------------------------------------------------------------
    const activeSessionNum = opts.sessionId
      ? !isNaN(Number(opts.sessionId))
        ? Number(opts.sessionId)
        : String(opts.sessionId)
      : 1
    activeRunningSessionIdRef.current = activeSessionNum

    if (activeSessionsRef.current.has(activeSessionNum)) {
      handleIntervention(userInput, activeSessionNum, { displayPrompt: opts.displayPrompt })
      return
    }

    const sessionAbortController = new AbortController()
    const sessionRecord = {
      abortController: sessionAbortController,
      startTime: Date.now(),
      prompt: userInput,
      interventions: []
    }
    activeSessionsRef.current.set(activeSessionNum, sessionRecord)

    if (abortControllerRef) {
      abortControllerRef.current = sessionAbortController
    }

    if (addRunningSessionId) addRunningSessionId(activeSessionNum)
    setIsAgentBusy(true)

    let finalIsSpeak = opts.forceSpeak !== undefined ? opts.forceSpeak : isSpeak
    if (userInput && typeof userInput === 'string') {
      if (userInput.startsWith('<mic>') || userInput.startsWith('(Mikrofon)')) {
        finalIsSpeak = true
      } else if (!isAutonomous && !isSystem) {
        finalIsSpeak = false
      }
    }

    // Reset Speech Queue sebelum memulai turn baru
    if (finalIsSpeak) {
      speechQueue.reset()
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

    // 1. Ekstraksi langsung dari opts.attachedFiles jika tersedia
    if (Array.isArray(opts.attachedFiles) && opts.attachedFiles.length > 0) {
      for (const f of opts.attachedFiles) {
        const isImg =
          (f.type && f.type.startsWith('image/')) ||
          (f.path && isImagePath(f.path)) ||
          (f.name && isImagePath(f.name))
        if (isImg) {
          const imgUrl = f.previewUrl || (f.path ? await convertFilePathToBase64(f.path) : null)
          if (imgUrl) {
            imageVisionPayloads.push({ type: 'image_url', image_url: { url: imgUrl } })
          }
        }
      }
    }

    // 2. Fallback parsing dari teks [FILE TERLAMPIR]:
    if (imageVisionPayloads.length === 0 && userInput.includes('[FILE TERLAMPIR]:')) {
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

    let uiDisplayContent = opts.displayPrompt !== undefined ? opts.displayPrompt : userInput
    if (
      typeof uiDisplayContent === 'string' &&
      uiDisplayContent.includes('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')
    ) {
      const cleanBeforeSkill = uiDisplayContent
        .split('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')[0]
        .trim()
      uiDisplayContent = cleanBeforeSkill || 'Jalankan Skill'
    }

    // Jika ada gambar terlampir dan user tidak menulis teks manual, kosongkan teks display
    if (imageVisionPayloads.length > 0 && typeof opts.displayPrompt === 'string') {
      uiDisplayContent = opts.displayPrompt.trim()
    }

    let finalUserMessageContent = uiDisplayContent
    if (imageVisionPayloads.length > 0) {
      const textPart = typeof uiDisplayContent === 'string' ? uiDisplayContent.trim() : ''
      finalUserMessageContent = [
        ...(textPart ? [{ type: 'text', text: textPart }] : []),
        ...imageVisionPayloads
      ]
    }

    const userMessage = opts.customUserMessage
      ? {
          ...opts.customUserMessage,
          timestamp: timestampStr,
          created_at: Date.now()
        }
      : {
          role: 'user',
          content: finalUserMessageContent,
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
        setChatData((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater
          chatDataRef.current = next
          return next
        })
      }
    }

    activeSessionUpdatersRef.current.set(activeSessionNum, targetSetChatData)

    // ------------------------------------------------------------------------
    // FASE 3: PENYIAPAN HISTORY CHAT & RETRIEVAL KONTEKS
    // ------------------------------------------------------------------------
    const sourceChatData =
      activeSessionNum === 1 ? chatDataRef.current || chatData : inMemorySessionData
    const validHistory = sourceChatData.filter(
      (m) =>
        m &&
        !m.isThinking &&
        !m.isSearching &&
        !m.isSummarizing &&
        m.role !== 'command' &&
        m.role !== 'system'
    )

    if (!isAutonomous && !isSystem) {
      targetSetChatData((prev) => [
        ...prev,
        userMessage,
        {
          role: 'ai',
          content: 'Menganalisis instruksi...',
          isThinking: true,
          mood: 'neutral'
        }
      ])
    }

    const agenticProcessId = `agentic-${Date.now()}`
    let durableTaskForRecovery = null
    let execSteps = [{ task: 'Menganalisis Konteks...' }]
    let accumulatedThoughts = []
    let executedToolsList = []
    let currentInFlightTool = null
    let currentTurnReasoning = ''
    let finalContentAccumulator = ''

    try {
      let durableTask = null
      let durableActiveStep = null

      const allMemory = await getAllMemory()
      let searchQuery = userInput
      if (validHistory.length > 0) {
        const lastMsg = validHistory[validHistory.length - 1]
        if (lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'ai') && lastMsg.content) {
          let lastAiText =
            typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)
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
      let systemTelemetry = null
      try {
        if (window.api && typeof window.api.getSystemTelemetry === 'function') {
          systemTelemetry = await window.api.getSystemTelemetry()
        }
      } catch (_) {}

      const systemPrompt = await buildPlanningSystemPrompt(
        userInput,
        {
          ...opts,
          tgContext,
          currentMusicTrack,
          systemTelemetry,
          activeTaskObjective: activeTaskObjectiveRef.current,
          existingSubagents
        },
        unifiedContext,
        contextMsgStr
      )

      // ------------------------------------------------------------------------
      // FASE 3.5: PRE-FLIGHT CONTEXT COMPACTION (Ambang Batas 256.000 Tokens)
      // ------------------------------------------------------------------------
      let activeSessionCompact = null
      try {
        activeSessionCompact = await getSessionCompact(String(activeSessionNum))
      } catch (_) {}

      const activeSummaryBlock =
        activeSessionCompact?.summaryBlock || activeSessionCompact?.summary_block || ''
      const activeLastCompactedId =
        activeSessionCompact?.lastCompactedMessageId ||
        activeSessionCompact?.last_compacted_message_id ||
        null

      const currentUserMsg = { ...userMessage, content: payloadContent }
      let effectiveSourceMessages = [...sourceChatData, currentUserMsg]

      currentUserMsg.tokens = calculateMessageTokens(currentUserMsg)
      const currentEstimatedTokens = calculateSessionTokens(
        effectiveSourceMessages,
        activeSummaryBlock,
        activeLastCompactedId,
        systemPrompt,
        activeSessionCompact?.lastCompactedAt || activeSessionCompact?.last_compacted_at || null
      )

      // Bypass proses kompaksi berat jika instruksi internal (greeting sistem / awareness autonomous / disableTools)
      const isInternalTurn = Boolean(
        isSystem || isAutonomous || opts.skipCompaction || opts.disableTools
      )

      // Layer 1: Gateway Session Hygiene (Hermes 85% safety net)
      const gatewayHygieneTriggerTokens = MAX_CONTEXT_TOKENS * GATEWAY_HYGIENE_THRESHOLD
      if (!isInternalTurn && currentEstimatedTokens >= gatewayHygieneTriggerTokens) {
        const compactBannerId = `compact-banner-${Date.now()}`
        targetSetChatData((prev) => [
          ...prev,
          {
            id: compactBannerId,
            role: 'system',
            isCompacting: true,
            compactProgress: 'Memangkas log tool di memori...'
          }
        ])

        try {
          const compactionResult = await executeSessionCompaction({
            sessionId: String(activeSessionNum),
            messages: effectiveSourceMessages,
            activeConfig: config[0] || {},
            systemPrompt,
            onProgress: (prog) => {
              targetSetChatData((prev) =>
                prev.map((item) =>
                  item.id === compactBannerId ? { ...item, compactProgress: prog.text } : item
                )
              )
            }
          })

          if (compactionResult?.isCompacted) {
            if (compactionResult.compactedMessages) {
              effectiveSourceMessages = compactionResult.compactedMessages
              // Sinkronkan riwayat pesan terpangkas ke state UI & persistent storage
              targetSetChatData(compactionResult.compactedMessages)
            }
            if (compactionResult.newSummaryBlock && compactionResult.lastCompactedMessageId) {
              activeSessionCompact = {
                summaryBlock: compactionResult.newSummaryBlock,
                lastCompactedMessageId: compactionResult.lastCompactedMessageId,
                lastCompactedAt: Date.now()
              }
              window.dispatchEvent(
                new CustomEvent('session-compact-updated', {
                  detail: {
                    sessionId: String(activeSessionNum),
                    lastCompactedMessageId: compactionResult.lastCompactedMessageId,
                    summaryBlock: compactionResult.newSummaryBlock
                  }
                })
              )
            }

            // Segera update indikator context-tracker agar gauge langsung berwarna hijau
            const activeTokensAfterCompact = Number(
              compactionResult.currentTokens || compactionResult.currentChars || 0
            )
            window.dispatchEvent(
              new CustomEvent('context-tracker-updated', {
                detail: {
                  sessionId: String(activeSessionNum),
                  currentTokens: activeTokensAfterCompact,
                  maxTokens: MAX_CONTEXT_TOKENS,
                  percentage: Math.min(100, (activeTokensAfterCompact / MAX_CONTEXT_TOKENS) * 100),
                  currentChars: activeTokensAfterCompact,
                  maxChars: MAX_CONTEXT_TOKENS,
                  lastCompactedAt: activeSessionCompact?.lastCompactedAt || Date.now()
                }
              })
            )
          }
        } catch (compactErr) {
          console.error('[useMarkPlan] Gagal context compaction:', compactErr)
        } finally {
          targetSetChatData((prev) => (prev || []).filter((item) => item.id !== compactBannerId))
        }
      }

      // ------------------------------------------------------------------------
      // FASE 4: AGENTIC REACT LOOP (Native Function Calling + SSE Token Stream)
      // ------------------------------------------------------------------------
      let loopMessages = []

      if (isSystem) {
        // GREETING BOOT SEQUENCE: Sapaan awal startup hanya butuh systemPrompt + 1-2 pesan terakhir
        // Mencegah ledakan 1M+ token dari akumulasi ratusan riwayat masa lalu di database.
        const recentHistory = sourceChatData
          .filter(
            (m) =>
              m &&
              !m.isThinking &&
              !m.isSearching &&
              !m.isSummarizing &&
              m.role !== 'command' &&
              m.role !== 'system'
          )
          .slice(-2)

        loopMessages = [
          { role: 'system', content: systemPrompt },
          ...recentHistory.map((m) => {
            const role = m.role === 'ai' || m.role === 'planSteps' ? 'assistant' : m.role
            let content = m.content || ''
            if (role === 'assistant' && m.mood && !/^(?:<|\[)mood:/i.test(content)) {
              content = `<mood:${m.mood}> ${content}`
            }
            return { role, content, mood: m.mood || undefined }
          }),
          { role: 'user', content: payloadContent }
        ]
      } else if (isAutonomous) {
        // AWARENESS PROAKTIF: Cukup 3-4 pesan riwayat obrolan terkini
        const recentHistory = sourceChatData
          .filter(
            (m) =>
              m &&
              !m.isThinking &&
              !m.isSearching &&
              !m.isSummarizing &&
              m.role !== 'command' &&
              m.role !== 'system'
          )
          .slice(-4)

        loopMessages = [
          { role: 'system', content: systemPrompt },
          ...recentHistory.map((m) => {
            const role = m.role === 'ai' || m.role === 'planSteps' ? 'assistant' : m.role
            let content = m.content || ''
            if (role === 'assistant' && m.mood && !/^(?:<|\[)mood:/i.test(content)) {
              content = `<mood:${m.mood}> ${content}`
            }
            return { role, content, mood: m.mood || undefined }
          }),
          { role: 'user', content: payloadContent }
        ]
      } else {
        // TURN CHAT/CODING NORMAL:
        // Seluruh riwayat pesan & log tool dikirim 100% UTUH tanpa batasan turn (maxTurns)
        // selama masih berada dalam kapasitas 256.000 tokens (MAX_CONTEXT_TOKENS).
        loopMessages = assembleCompactedPayload({
          messages: effectiveSourceMessages,
          sessionCompact: activeSessionCompact,
          systemPrompt
        })
      }

      let isDone = false
      let stepCount = 0
      executedToolsList = []
      let lastToolExecution = null
      accumulatedThoughts = []
      let currentActiveMood = 'neutral'
      finalContentAccumulator = ''
      let savedTurnAiMsg = null
      let lastServerUsage = null
      execSteps = [{ task: 'Menganalisis Konteks...' }]
      const dynamicallyLoadedToolGroups = new Set()

      // Deteksi Tool Groups yang di-mention (@group_name) di input pengguna
      if (typeof userInput === 'string' && userInput.includes('@')) {
        try {
          const groupToolsData = await webApi.getGroupTools()
          const validGroupNames = new Set(
            groupToolsData?.names || Object.keys(groupToolsData?.schema || {})
          )
          const mentionMatches = userInput.match(/@([a-zA-Z0-9_-]+)/g) || []
          const taggedGroups = []
          for (const rawMatch of mentionMatches) {
            const groupName = rawMatch.slice(1).toLowerCase()
            if (validGroupNames.has(groupName)) {
              dynamicallyLoadedToolGroups.add(groupName)
              taggedGroups.push(groupName)
            }
          }
          if (taggedGroups.length > 0) {
            loopMessages.push({
              role: 'system',
              content: `[TOOL GROUPS AKTIF VIA MENTION USER]: Pengguna secara eksplisit menandai kelompok tool berikut: ${taggedGroups.map((g) => `@${g}`).join(', ')}. Seluruh kapabilitas tool dalam kelompok ini telah dibuka dan aktif. Utamakan penggunaan tool ini untuk menyelesaikan instruksi pengguna.`
            })
          }
        } catch (err) {
          console.error('[useMarkPlan] Gagal memproses mention tool group:', err)
        }
      }

      let consecutiveErrors = 0
      const maxConsecutiveErrorRetries = 50

      while (!isDone && !sessionAbortController.signal.aborted) {
        // Cek Abort Signal
        if (sessionAbortController.signal.aborted) {
          try {
            const runningTasks = await db.agentTasks.where('status').equals('running').toArray()
            for (const t of runningTasks) {
              await transitionAgentTask(t.id, 'cancelled', 'user_abort').catch(() => {})
            }
          } catch (_) {}
          targetSetChatData((prev) =>
            prev.map((msg) => {
              if (!msg.isPlanSteps || msg.taskStatus !== 'running') return msg
              return {
                ...msg,
                taskStatus: 'stopped',
                plan: (msg.plan || []).map((s) => ({
                  ...s,
                  status: s.status === 'running' ? 'stopped' : s.status
                }))
              }
            })
          )
          throw new Error('AbortError')
        }

        // Cek Intervensi User di tengah jalan
        if (sessionRecord.interventions?.length > 0) {
          const interventions = sessionRecord.interventions.splice(0).join('\n')
          loopMessages.push({ role: 'user', content: `[USER INTERVENTION]: ${interventions}` })

          targetSetChatData((prev) => {
            const alreadyPresent = prev.some(
              (m) => m.role === 'user' && m.isIntervention && m.content === interventions
            )
            if (alreadyPresent) return prev
            const thinkingItem = prev.find((m) => m.isThinking)
            const filtered = prev.filter((m) => !m.isThinking)
            const item = {
              role: 'user',
              content: interventions,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now(),
              isIntervention: true
            }
            return thinkingItem ? [...filtered, item, thinkingItem] : [...prev, item]
          })

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

        const isDurableTaskCompleted = Boolean(
          durableTask &&
          (durableTask.status === 'completed' ||
            (durableTask.steps &&
              durableTask.steps.length > 0 &&
              durableTask.steps.every((s) => s.status === 'completed')))
        )
        if (isDurableTaskCompleted) {
          durableActiveStep = null
        }

        // Ambil Tools OpenAPI Schema yang relevan dengan query/tugas saat ini + group yang sudah dimuat
        const activeTools =
          opts.disableTools || isDurableTaskCompleted
            ? null
            : await getActiveToolsSchema(
                userInput + ' ' + (activeTaskObjectiveRef.current || ''),
                dynamicallyLoadedToolGroups
              )

        // Loading thinking indicator di awal turn (akumulasi semua pemikiran dari langkah sebelumnya)
        targetSetChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const loadingText =
            isAutonomous && autonomousInitialMessage ? autonomousInitialMessage : ''
          const allPriorThoughts = accumulatedThoughts
            .map((t) => (typeof t === 'string' ? t.trim() : ''))
            .filter(Boolean)
          const initialReasoning =
            allPriorThoughts.length > 0
              ? Array.from(new Set(allPriorThoughts)).join('\n\n---\n\n')
              : undefined

          return [
            ...filtered,
            {
              role: 'ai',
              content: loadingText,
              isThinking: true,
              reasoning: initialReasoning,
              executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined,
              mood: currentActiveMood
            }
          ]
        })

        currentTurnReasoning = ''
        let currentTurnContent = ''
        let sentenceBuffer = ''

        // In-Flight Pruning: Jika akumulasi pesan tool di tengah loop mencapai batas kapasitas,
        // pangkas observasi tool terlama agar payload ReAct tetap berada di bawah 256K tokens.
        // Layer 2: In-Loop Agent ContextCompressor (Hermes 50% Threshold + O(n) Pruning)
        // Di setiap iterasi ReAct, evaluasi ukuran payload loopMessages.
        // Jika melebihi 50% kapasitas, lakukan pemangkasan Fase 1 O(n) dan jika perlu Fase 2-4 in-place.
        try {
          const inLoopResult = await checkAndCompressInLoop({
            loopMessages,
            sessionId: String(activeSessionNum || 1),
            maxTokens: MAX_CONTEXT_TOKENS,
            thresholdRatio: IN_LOOP_COMPACT_THRESHOLD,
            protectLastN: 6,
            protectFirstN: 2,
            activeConfig: config[0] || {},
            systemPrompt
          })

          if (inLoopResult?.compressed && inLoopResult.loopMessages) {
            loopMessages = inLoopResult.loopMessages
            if (inLoopResult.totalTokens || inLoopResult.totalChars) {
              const inLoopTokens = inLoopResult.totalTokens || inLoopResult.totalChars
              window.dispatchEvent(
                new CustomEvent('context-tracker-updated', {
                  detail: {
                    sessionId: String(activeSessionNum || 1),
                    currentTokens: inLoopTokens,
                    maxTokens: MAX_CONTEXT_TOKENS,
                    percentage: Math.min(100, (inLoopTokens / MAX_CONTEXT_TOKENS) * 100),
                    currentChars: inLoopTokens,
                    maxChars: MAX_CONTEXT_TOKENS,
                    lastCompactedAt: Date.now()
                  }
                })
              )
            }
          }
        } catch (inLoopErr) {
          console.warn('[useMarkPlan] In-loop compaction warning:', inLoopErr)
        }

        // Safety Net Pruning
        loopMessages = pruneInFlightMessages(loopMessages, MAX_CONTEXT_TOKENS)

        // Request streaming ke Backend AI Bridge
        const streamResult = await fetchAI(loopMessages, true, {
          sessionId: String(activeSessionNum || 1),
          tools: isDurableTaskCompleted ? null : activeTools,
          signal: sessionAbortController.signal,
          onReasoning: (chunk) => {
            currentTurnReasoning += chunk
            const currentCombined = [...accumulatedThoughts, currentTurnReasoning]
              .map((t) => (typeof t === 'string' ? t.trim() : ''))
              .filter(Boolean)
            const liveReasoning = Array.from(new Set(currentCombined)).join('\n\n---\n\n')

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: currentTurnContent,
                  isThinking: true,
                  reasoning: liveReasoning || undefined,
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

            // Sentence-Level Streaming TTS: Deteksi kalimat lengkap secara real-time
            if (finalIsSpeak) {
              sentenceBuffer += token
              // Deteksi batas akhir kalimat (. ! ? atau newline ganda)
              let sentenceEndMatch
              while ((sentenceEndMatch = sentenceBuffer.match(/^(.*?[\.!\?\n]+)([\s\S]*)$/))) {
                const completeSentence = sentenceEndMatch[1].trim()
                sentenceBuffer = sentenceEndMatch[2] || ''
                if (completeSentence) {
                  speechQueue.enqueue(completeSentence)
                }
              }
            }

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              const currentCombined = [...accumulatedThoughts, currentTurnReasoning]
                .map((t) => (typeof t === 'string' ? t.trim() : ''))
                .filter(Boolean)
              const liveReasoning = Array.from(new Set(currentCombined)).join('\n\n---\n\n')

              return [
                ...filtered,
                {
                  role: 'ai',
                  content: currentTurnContent,
                  isThinking: true,
                  reasoning: liveReasoning || undefined,
                  executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined,
                  mood: currentActiveMood
                }
              ]
            })
          }
        })

        if (
          currentTurnReasoning &&
          typeof currentTurnReasoning === 'string' &&
          currentTurnReasoning.trim()
        ) {
          const trimmed = currentTurnReasoning.trim()
          if (!accumulatedThoughts.includes(trimmed)) {
            accumulatedThoughts.push(trimmed)
          }
        }

        if (streamResult?.mood && streamResult.mood !== 'neutral') {
          currentActiveMood = streamResult.mood
        }

        if (streamResult?.usage) {
          lastServerUsage = streamResult.usage
          const liveTokens = Number(
            streamResult.usage.total_tokens ||
              (streamResult.usage.prompt_tokens || 0) +
                (streamResult.usage.completion_tokens || 0) ||
              0
          )
          if (liveTokens > 0) {
            window.dispatchEvent(
              new CustomEvent('context-tracker-updated', {
                detail: {
                  sessionId: String(activeSessionNum || 1),
                  currentTokens: liveTokens,
                  maxTokens: MAX_CONTEXT_TOKENS,
                  percentage: Math.min(100, (liveTokens / MAX_CONTEXT_TOKENS) * 100),
                  currentChars: liveTokens,
                  maxChars: MAX_CONTEXT_TOKENS,
                  lastCompactedAt: activeSessionCompact?.lastCompactedAt || Date.now()
                }
              })
            )
          }
        }

        if (streamResult?.finishReason === 'error') {
          throw new Error('Terjadi kesalahan pada respon stream AI.')
        }

        // Fallback Interceptor: Jika model mengembalikan teks JSON (tool_calls, mood, atau structured answer)
        let effectiveToolCalls = streamResult.toolCalls
        if ((!effectiveToolCalls || effectiveToolCalls.length === 0) && currentTurnContent) {
          const rawMatch = currentTurnContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
          let cand = (rawMatch ? rawMatch[1] : currentTurnContent).trim()
          const firstBrace = cand.indexOf('{')
          const lastBrace = cand.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            cand = cand.substring(firstBrace, lastBrace + 1).trim()
          }
          if (
            cand.includes('"tool_calls"') ||
            (cand.includes('"action"') && cand.includes('"tool"')) ||
            cand.includes('"mood"') ||
            cand.includes('"answer"')
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
                if (pObj.mood) {
                  currentActiveMood = String(pObj.mood).toLowerCase().trim()
                }
                if (pObj.answer !== undefined || pObj.content !== undefined) {
                  currentTurnContent = pObj.answer !== undefined ? pObj.answer : pObj.content
                  finalContentAccumulator = currentTurnContent
                }
                if (Array.isArray(pObj.tool_calls) && pObj.tool_calls.length > 0) {
                  effectiveToolCalls = pObj.tool_calls.map((tc, idx) => ({
                    id: tc.id || `call_fallback_${Date.now()}_${idx}`,
                    type: 'function',
                    function: {
                      name: tc.name || tc.function?.name,
                      arguments:
                        typeof tc.arguments === 'object'
                          ? JSON.stringify(tc.arguments)
                          : String(tc.arguments || '{}')
                    }
                  }))
                  currentTurnContent = ''
                  finalContentAccumulator = ''
                }
              }
            } catch (_) {}
          }
        }

        // Jika alur kerja Durable Task telah tuntas 100%, abaikan seluruh tool calls dan paksa penyelesaian
        if (isDurableTaskCompleted) {
          effectiveToolCalls = []
        }

        // ======================================================================
        // CABANG 1: MODEL MEMANGGIL NATIVE TOOL CALLS
        // ======================================================================
        if (effectiveToolCalls && effectiveToolCalls.length > 0) {
          sentenceBuffer = ''
          speechQueue.reset()
          const assistantMsg = {
            role: 'assistant',
            content: streamResult.content || null,
            tool_calls: effectiveToolCalls
          }
          loopMessages.push(assistantMsg)
          const turnVisualUrls = []

          for (const tc of effectiveToolCalls) {
            const toolName = tc.function?.name
            let parsedArgs = {}
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}')
            } catch (_) {
              parsedArgs = { raw: tc.function?.arguments || '' }
            }

            if (!toolName) continue
            if (sessionAbortController.signal.aborted) throw new Error('AbortError')

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

            currentInFlightTool = {
              tool: toolName,
              query: JSON.stringify(parsedArgs),
              status: 'running'
            }
            const currentLiveTools = [...executedToolsList, currentInFlightTool]

            const currentCombined = [...accumulatedThoughts, currentTurnReasoning]
              .map((t) => (typeof t === 'string' ? t.trim() : ''))
              .filter(Boolean)
            const liveReasoning = Array.from(new Set(currentCombined)).join('\n\n---\n\n')

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: streamResult.content || `Mengeksekusi [${toolName}]...`,
                  isThinking: true,
                  reasoning: liveReasoning || undefined,
                  executedTools: currentLiveTools,
                  mood: currentActiveMood,
                  usage: lastServerUsage || undefined,
                  tokens: lastServerUsage?.completion_tokens || undefined
                }
              ]
            })

            // Eksekusi tool
            const pluginProcessId = `plugin-${Date.now()}`
            const currentSessionTitle =
              activeSessionNum === 1
                ? activeTopic?.title || activeTopic?.name || 'Main Thread'
                : `Sesi #${activeSessionNum}`

            // Jika alur kerja Durable Task sudah selesai, tolak pemanggilan task baru atau mark_done_task
            if (
              durableTask &&
              !durableActiveStep &&
              (toolName === 'create_agent_task' || toolName === 'mark_done_task')
            ) {
              const rejectResult = `[TUGAS TELAH SELESAI]: Seluruh tahapan alur kerja '${durableTask.title}' telah tuntas 100%. DILARANG memanggil tool '${toolName}' lagi! SEGERA berikan jawaban akhir ringkasan menyeluruh kepada pengguna.`
              const toolObservation = {
                type: 'tool_result',
                tool_call_id: tc.id,
                tool: toolName,
                success: false,
                data: null,
                error: rejectResult
              }
              loopMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: JSON.stringify(toolObservation)
              })
              continue
            }

            const execResult = await executeSingleTool(toolName, parsedArgs, {
              tgContext,
              isAutonomous,
              loopMessages,
              pluginProcessId,
              targetSetChatData,
              activeSessionNum,
              activeTopic,
              userInput,
              durableTask,
              durableActiveStep,
              agenticProcessId,
              workspaceRoot: opts.workspaceRoot,
              sessionId: String(activeSessionNum || 1),
              sessionTitle: currentSessionTitle,
              signal: sessionAbortController.signal
            })

            if (execResult.durableTask) {
              durableTask = execResult.durableTask
              durableTaskForRecovery = execResult.durableTask
            }
            if (toolName === 'create_agent_task' || toolName === 'mark_done_task') {
              durableActiveStep = execResult.durableActiveStep || null
            }

            lastToolExecution = execResult.toolExecution
            if (execResult.loadedGroup) {
              dynamicallyLoadedToolGroups.add(execResult.loadedGroup)
            }
            const resStr = String(execResult.resultString || '')
            const executionSucceeded =
              execResult.success === true ||
              execResult.res?.success === true ||
              (!resStr.startsWith('[ERROR]') &&
                !resStr.includes(' crash:') &&
                !resStr.toLowerCase().includes(' gagal:'))
            if (executionSucceeded) {
              consecutiveErrors = 0
            } else {
              consecutiveErrors++
              if (consecutiveErrors >= maxConsecutiveErrorRetries) {
                const error = new Error(
                  `Batas retry error berturut-turut tercapai (${maxConsecutiveErrorRetries}).`
                )
                error.code = 'LOOP_GUARD'
                throw error
              }
            }

            executedToolsList.push({
              tool: toolName,
              query: JSON.stringify(parsedArgs),
              status: executionSucceeded ? 'done' : 'failed',
              preview: execResult.previewUrl || execResult.imageUrls?.[0] || null,
              fullResult:
                typeof execResult.resultString === 'string'
                  ? execResult.resultString.slice(0, 4000)
                  : execResult.resultString,
              resultSummary:
                typeof execResult.resultString === 'string' && execResult.resultString.length > 250
                  ? execResult.resultString.slice(0, 250) + '...'
                  : execResult.resultString
            })
            currentInFlightTool = null

            if (Array.isArray(execResult.imageUrls) && execResult.imageUrls.length > 0) {
              for (const u of execResult.imageUrls) {
                if (u && !turnVisualUrls.includes(u)) {
                  turnVisualUrls.push(u)
                }
              }
            }

            let obsStr = execResult.resultString
            if (
              typeof execResult.resultString === 'string' &&
              execResult.resultString.length > 3000
            ) {
              obsStr = `${execResult.resultString.slice(0, 3000)}\n\n[SISA OUTPUT DIPOTONG (Total: ${execResult.resultString.length} karakter). Gunakan start_line/end_line atau grep-search untuk mencari bagian spesifik.]`
            }

            const toolObservation = {
              type: 'tool_result',
              tool_call_id: tc.id,
              tool: toolName,
              success: executionSucceeded,
              data: executionSucceeded ? obsStr : null,
              error: executionSucceeded ? null : obsStr
            }

            // Push role: 'tool' observation ke ephemeral context
            loopMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: toolName,
              content: JSON.stringify(toolObservation)
            })

            // Jika mark_done_task berhasil dan ada tahap berikutnya, otomatis majukan loop
            if (
              toolName === 'mark_done_task' &&
              executionSucceeded &&
              execResult?.durableActiveStep &&
              execResult?.durableTask
            ) {
              const nextStep = execResult.durableActiveStep
              const nextIdx = (nextStep.stepIndex ?? nextStep.index ?? 0) + 1
              const totalSteps = execResult.durableTask?.steps?.length || 0
              const isNextLastStep = nextIdx === totalSteps
              consecutiveErrors = 0
              loopMessages.push({
                role: 'user',
                content: `[TAHAP SELESAI & PINDAH KE TAHAP ${nextIdx}${isNextLastStep ? ' - TAHAP TERAKHIR' : ''}]: Artefak tahap sebelumnya telah disimpan ke disk.\n\n>>> SEKARANG KERJAKAN TAHAP ${nextIdx}: "${nextStep.title}"\n- Sasaran: ${nextStep.objective}\n- Target Deliverable: ${nextStep.deliverable}\n${nextStep.acceptanceCriteria?.length ? `- Kriteria Sukses: ${nextStep.acceptanceCriteria.join(', ')}` : ''}\nKerjakan tugas tahap ini di workspace pengguna (buat file/tulis kode). DILARANG memanggil 'read_task' untuk membaca artefak sebelumnya (kamu sudah tahu apa yang kamu buat). WAJIB UJI & VERIFIKASI HASIL terlebih dahulu. DILARANG memanggil 'mark_done_task' sebelum pengujian berhasil! Setelah teruji, barulah PANGGIL TOOL 'mark_done_task' TEPAT 1 KALI dengan parameter stepIndex: ${nextIdx}, artifactContent, dan verificationProof (bukti hasil uji)!${isNextLastStep ? ' Karena ini adalah TAHAP TERAKHIR, saat deliverable tahap ini selesai dan diuji, panggil tool "mark_done_task" dengan parameter "summary" yang memuat rangkuman menyeluruh seluruh alur kerja proyek dari awal hingga akhir!' : ''}`
              })
              await startAgentTaskStep(execResult.durableTask.id, nextStep.id)
              targetPushProcess({
                id: agenticProcessId,
                type: 'planning',
                status: 'active',
                data: {
                  steps: (execResult.durableTask.steps || []).map((s) => ({ task: s.title })),
                  currentStep: nextStep.stepIndex ?? nextStep.index ?? 0,
                  reasoning: `Melanjutkan ke Tahap ${nextIdx}: "${nextStep.title}"...`
                }
              })
            } else if (
              toolName === 'mark_done_task' &&
              executionSucceeded &&
              !execResult?.durableActiveStep &&
              execResult?.durableTask
            ) {
              // Seluruh tahapan alur kerja telah tuntas 100%!
              consecutiveErrors = 0
              durableActiveStep = null

              const completedTask = execResult.durableTask
              const steps = completedTask.steps || []
              const taskTitle = completedTask.title || 'Task Workflow'

              let rawSummary =
                (typeof parsedArgs.summary === 'string' && parsedArgs.summary.trim()) ||
                (typeof parsedArgs.artifactContent === 'string' &&
                  parsedArgs.artifactContent.trim()) ||
                ''

              let finalReport = ''
              if (rawSummary && rawSummary.length > 150) {
                finalReport = rawSummary
              } else {
                const stepsSummary = steps
                  .map((s, i) => {
                    const num = (s.stepIndex ?? s.index ?? i) + 1
                    const title = s.title || `Tahap ${num}`
                    const out = s.outputSummary || s.deliverable || 'Selesai dan terverifikasi'
                    return `${num}. **${title}**: ${out}`
                  })
                  .join('\n')

                finalReport = `Seluruh tahapan alur kerja **${taskTitle}** telah berhasil diselesaikan dan terverifikasi 100%.\n\n### Rangkuman Hasil Pekerjaan:\n${stepsSummary}${rawSummary ? `\n\n**Catatan Tambahan:**\n${rawSummary}` : ''}`
              }

              // Pastikan nol emoji
              finalReport = finalReport
                .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
                .trim()

              isDone = true
              finalContentAccumulator = finalReport

              execSteps.push({ task: 'Selesai' })
              targetPushProcess({
                id: agenticProcessId,
                type: 'planning',
                status: 'done',
                data: {
                  steps: [...execSteps],
                  currentStep: execSteps.length,
                  reasoning: 'Seluruh tahapan tugas telah diselesaikan dan terverifikasi.'
                }
              })

              targetSetChatData((prev) => {
                const filtered = prev.filter((item) => !item.isThinking)
                const finalAllThoughts = [...accumulatedThoughts, currentTurnReasoning]
                  .map((t) => (typeof t === 'string' ? t.trim() : ''))
                  .filter(Boolean)
                const mergedReasoning =
                  finalAllThoughts.length > 0
                    ? Array.from(new Set(finalAllThoughts)).join('\n\n---\n\n')
                    : null

                const cleanFinalOutput = finalReport
                  .replace(/^(?:<|\[)mood:[a-zA-Z_]+(?:>|\])\s*/i, '')
                  .trim()

                const aiMsg = {
                  role: 'ai',
                  content: cleanFinalOutput,
                  executedTools: executedToolsList.length > 0 ? executedToolsList : null,
                  isTaskDone: true,
                  reasoning: mergedReasoning,
                  mood: currentActiveMood || 'neutral',
                  pluginExecution: lastToolExecution,
                  isProactive: isAutonomous,
                  timestamp: getCurrentTimeInfo(),
                  created_at: Date.now(),
                  source: tgContext ? 'telegram' : 'pc',
                  usage: lastServerUsage || null,
                  tokens:
                    lastServerUsage?.completion_tokens ||
                    calculateMessageTokens({
                      content: cleanFinalOutput,
                      reasoning: mergedReasoning
                    })
                }

                savedTurnAiMsg = aiMsg

                return filtered
                  .map((msg) => {
                    if (!msg.isPlanSteps || msg.taskId !== completedTask.id) return msg
                    return {
                      ...msg,
                      taskStatus: 'completed',
                      currentStep: (msg.plan || []).length,
                      plan: (msg.plan || []).map((s) => ({
                        ...s,
                        status: s.status === 'failed' ? 'failed' : 'completed'
                      }))
                    }
                  })
                  .concat(aiMsg)
              })

              if (finalIsSpeak && finalReport) {
                playVoice(finalReport).catch(() => {})
              }

              if (window.api?.showNotification && !document.hasFocus() && finalReport) {
                window.api.showNotification('Mark', `Alur kerja "${taskTitle}" tuntas!`)
              }

              break
            }
          }

          // Jika ada tool yang menghasilkan gambar visual, sertakan observasi multimodal
          if (turnVisualUrls.length > 0) {
            loopMessages.push({
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

          // Lanjut ke giliran berikutnya untuk membiarkan model menganalisis observasi tool
          if (sessionAbortController.signal.aborted) {
            throw new Error('AbortError')
          }
          if (isDone) {
            break
          }
          continue
        }

        // ======================================================================
        // CABANG 2: SELESAI / DIRECT TEXT RESPONSE (Stop / Selesai)
        // ======================================================================
        const turnAnswer = streamResult.content || currentTurnContent || ''

        // Jika alur kerja Durable Task sedang aktif tapi belum seluruh tahap selesai
        if (durableTask && !isDurableTaskCompleted) {
          const activeStep =
            durableActiveStep ||
            durableTask.steps?.find((s) => s.status === 'running') ||
            durableTask.steps?.find((s) => s.status !== 'completed') ||
            durableTask.steps?.[0]
          const curIdx = activeStep ? (activeStep.stepIndex ?? activeStep.index ?? 0) + 1 : 1
          const curTitle = activeStep?.title || 'Tahap Aktif'
          const curObj = activeStep?.objective || durableTask.objective || ''
          const curDeliv = activeStep?.deliverable || ''

          loopMessages.push({
            role: 'assistant',
            content: turnAnswer
          })
          loopMessages.push({
            role: 'user',
            content: `[PENGINGAT TAHAP AKTIF]: Kamu saat ini sedang berada di Tahap ${curIdx}: "${curTitle}".\n- Sasaran: ${curObj}\n- Target Deliverable: ${curDeliv}\n\nTahap ini BELUM selesai karena kamu belum memverifikasi hasil dan belum memanggil tool 'mark_done_task'. Kerjakan sasaran ini dengan tools yang relevan di workspace pengguna, lakukan pengujian/verifikasi hasil, lalu PANGGIL TOOL 'mark_done_task' dengan parameter stepIndex: ${curIdx}, artifactContent, dan verificationProof agar alur kerja dapat beralih ke tahap berikutnya!`
          })
          continue
        }

        // Jika seluruh tahapan Durable Task telah tuntas diselesaikan via mark_done_task
        if (durableTask && isDurableTaskCompleted) {
          targetSetChatData((prev) =>
            prev.map((msg) => {
              if (!msg.isPlanSteps || msg.taskId !== durableTask.id) return msg
              return {
                ...msg,
                taskStatus: 'completed',
                currentStep: (msg.plan || []).length,
                plan: (msg.plan || []).map((s) => ({
                  ...s,
                  status: s.status === 'failed' ? 'failed' : 'completed'
                }))
              }
            })
          )
        }

        // Cek apakah ada intervensi user yang masuk saat streaming giliran ini
        if (sessionRecord.interventions?.length > 0) {
          const interventions = sessionRecord.interventions.splice(0).join('\n')
          if (turnAnswer && turnAnswer.trim()) {
            loopMessages.push({ role: 'assistant', content: turnAnswer })
          }
          loopMessages.push({ role: 'user', content: `[USER INTERVENTION]: ${interventions}` })

          targetSetChatData((prev) => {
            const alreadyPresent = prev.some(
              (m) => m.role === 'user' && m.isIntervention && m.content === interventions
            )
            if (alreadyPresent) return prev
            const thinkingItem = prev.find((m) => m.isThinking)
            const filtered = prev.filter((m) => !m.isThinking)
            const item = {
              role: 'user',
              content: interventions,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now(),
              isIntervention: true
            }
            return thinkingItem ? [...filtered, item, thinkingItem] : [...prev, item]
          })

          execSteps.push({ task: `Intervensi User: ${interventions}` })
          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length - 1,
              reasoning: 'Menerima arahan baru dari user saat penyelesaian giliran.'
            }
          })

          continue
        }

        isDone = true
        finalContentAccumulator = turnAnswer || 'Selesai.'

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

        // TTS Lisan: Kirimkan sisa buffer kalimat yang belum ter-enqueue
        if (finalIsSpeak) {
          if (sentenceBuffer && sentenceBuffer.trim()) {
            speechQueue.enqueue(sentenceBuffer.trim())
            sentenceBuffer = ''
          } else if (
            !speechQueue.isPlaying &&
            speechQueue.queue.length === 0 &&
            finalContentAccumulator
          ) {
            // Fallback jika tidak ada tanda baca di output model sama sekali
            playVoice(finalContentAccumulator).catch(() => {})
          }
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

          let finalOutput = (finalContentAccumulator || '')
            .replace(/^(?:<|\[)mood:[a-zA-Z_]+(?:>|\])\s*/i, '')
            .trim()
          if (isAutonomous && autonomousInitialMessage) {
            finalOutput = `**${autonomousInitialMessage}**\n\n${finalOutput}`
          }

          const finalAllThoughts = [...accumulatedThoughts, currentTurnReasoning]
            .map((t) => (typeof t === 'string' ? t.trim() : ''))
            .filter(Boolean)
          const mergedReasoning =
            finalAllThoughts.length > 0
              ? Array.from(new Set(finalAllThoughts)).join('\n\n---\n\n')
              : null

          const aiMsg = {
            role: 'ai',
            content: finalOutput,
            executedTools: executedToolsList.length > 0 ? executedToolsList : null,
            isTaskDone: true,
            reasoning: mergedReasoning,
            mood: currentActiveMood || 'neutral',
            pluginExecution: lastToolExecution,
            isProactive: isAutonomous,
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now(),
            source: tgContext ? 'telegram' : 'pc',
            usage: lastServerUsage || null,
            tokens:
              lastServerUsage?.completion_tokens ||
              calculateMessageTokens({ content: finalOutput, reasoning: mergedReasoning })
          }

          savedTurnAiMsg = aiMsg
          return [...filtered, aiMsg]
        })

        // Meta-Learning: Sintesis skill otomatis jika turn berhasil mengeksekusi tool bermakna
        if (
          !isAutonomous &&
          !isSystem &&
          executedToolsList &&
          executedToolsList.length > 0 &&
          finalContentAccumulator
        ) {
          const finalAllThoughts = [...accumulatedThoughts, currentTurnReasoning]
            .map((t) => (typeof t === 'string' ? t.trim() : ''))
            .filter(Boolean)
          const mergedReasoning =
            finalAllThoughts.length > 0
              ? Array.from(new Set(finalAllThoughts)).join('\n\n---\n\n')
              : ''

          synthesizeSkillAndSave({
            userPrompt: lastUserPromptRef.current || userInput,
            executedTools: executedToolsList,
            finalAnswer: finalContentAccumulator,
            thought: mergedReasoning
          }).catch((err) => {
            console.warn('[useMarkPlan] Background Meta-Learning error:', err)
          })
        }

        break
      }

      if (sessionAbortController.signal.aborted) {
        throw new Error('AbortError')
      }

      // Pastikan sisa thinking indicator selalu dibersihkan jika loop selesai
      targetSetChatData((prev) => {
        const hasThinking = prev.some((item) => item.isThinking)
        if (!hasThinking) return prev
        const filtered = prev.filter((item) => !item.isThinking)
        if (finalContentAccumulator) return filtered

        const finalAllThoughts = [...accumulatedThoughts]
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter(Boolean)
        const mergedReasoning =
          finalAllThoughts.length > 0
            ? Array.from(new Set(finalAllThoughts)).join('\n\n---\n\n')
            : null

        return [
          ...filtered,
          {
            role: 'ai',
            content: 'Tugas telah selesai diproses.',
            executedTools: executedToolsList.length > 0 ? executedToolsList : null,
            isTaskDone: true,
            reasoning: mergedReasoning,
            mood: currentActiveMood || 'neutral',
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now(),
            usage: lastServerUsage || null,
            tokens:
              lastServerUsage?.completion_tokens ||
              calculateMessageTokens({
                content: 'Tugas telah selesai diproses.',
                reasoning: mergedReasoning
              })
          }
        ]
      })

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

      // Post-Turn Context Sync: Hitung total token terkini dan trigger event ke UI
      try {
        let latestSessionData =
          activeSessionNum === 1 ? chatDataRef.current || chatData : inMemorySessionData
        if (savedTurnAiMsg) {
          const hasAi = (latestSessionData || []).some(
            (m) => m.created_at === savedTurnAiMsg.created_at
          )
          if (!hasAi) {
            latestSessionData = [...(latestSessionData || []), savedTurnAiMsg]
          }
        }
        const latestTokens = calculateSessionTokens(
          latestSessionData,
          activeSessionCompact?.summaryBlock || activeSessionCompact?.summary_block || '',
          activeSessionCompact?.lastCompactedMessageId ||
            activeSessionCompact?.last_compacted_message_id ||
            null,
          systemPrompt,
          activeSessionCompact?.lastCompactedAt || activeSessionCompact?.last_compacted_at || null
        )
        window.dispatchEvent(
          new CustomEvent('context-tracker-updated', {
            detail: {
              sessionId: String(activeSessionNum),
              currentTokens: latestTokens,
              maxTokens: MAX_CONTEXT_TOKENS,
              percentage: Math.min(100, (latestTokens / MAX_CONTEXT_TOKENS) * 100),
              currentChars: latestTokens,
              maxChars: MAX_CONTEXT_TOKENS,
              lastCompactedAt: activeSessionCompact?.lastCompactedAt || null
            }
          })
        )
      } catch {
        /* ignore */
      }

      try {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch {
        /* ignore */
      }
    } catch (error) {
      const isAbort =
        error.name === 'AbortError' ||
        error.message?.includes('AbortError') ||
        Boolean(sessionAbortController?.signal?.aborted)

      if (!isAbort) {
        console.error('[useMarkPlan] Critical ReAct Loop Error:', error)
      } else {
        console.log('[useMarkPlan] ReAct loop dihentikan oleh pengguna.')
      }

      if (!isAbort) {
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
      } else {
        dismissProcess(agenticProcessId)
        try {
          speechQueue.reset()
        } catch (_) {}
        try {
          const runningTasks = await db.agentTasks.where('status').equals('running').toArray()
          for (const t of runningTasks) {
            await transitionAgentTask(
              t.id,
              'cancelled',
              'Eksekusi dibatalkan atas permintaan pengguna.'
            ).catch(() => {})
          }
        } catch (_) {}
        if (durableTaskForRecovery) {
          transitionAgentTask(
            durableTaskForRecovery.id,
            'cancelled',
            'Eksekusi dibatalkan atas permintaan pengguna.'
          ).catch(() => {})
        }
      }

      targetSetChatData((prev) => {
        const thinkingItem = prev.find((item) => item.isThinking)
        let updated = prev.filter((item) => !item.isThinking)

        if (isAbort) {
          updated = updated.map((msg) => {
            if (!msg.isPlanSteps) return msg
            if (durableTaskForRecovery && msg.taskId && msg.taskId !== durableTaskForRecovery.id)
              return msg
            return {
              ...msg,
              taskStatus: 'stopped',
              plan: (msg.plan || []).map((s) => ({
                ...s,
                status: s.status === 'running' ? 'stopped' : s.status
              }))
            }
          })
        }

        // Ambil riwayat tool yang sempat dieksekusi sebelum di-abort
        let rawExecutedTools =
          thinkingItem?.executedTools && thinkingItem.executedTools.length > 0
            ? [...thinkingItem.executedTools]
            : [...(executedToolsList || [])]

        // Pastikan in-flight tool yang sedang dieksekusi saat abort tidak hilang
        if (
          currentInFlightTool &&
          !rawExecutedTools.some(
            (t) =>
              t.tool === currentInFlightTool.tool &&
              (t.status === 'running' || t.status === 'stopped')
          )
        ) {
          rawExecutedTools.push(currentInFlightTool)
        }

        // Tandai tool yang sedang 'running' saat abort menjadi 'stopped'
        const preservedExecutedTools = rawExecutedTools.map((t) => ({
          ...t,
          status: t.status === 'running' ? 'stopped' : t.status
        }))

        // Ambil riwayat pemikiran (reasoning) yang sempat digenerate
        const allAccumulated = [...accumulatedThoughts, currentTurnReasoning]
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter(Boolean)
        const fallbackReasoning =
          allAccumulated.length > 0
            ? Array.from(new Set(allAccumulated)).join('\n\n---\n\n')
            : undefined
        const preservedReasoning = thinkingItem?.reasoning || fallbackReasoning

        // Ambil konten parsial yang sempat digenerate
        const rawContent =
          finalContentAccumulator ||
          (thinkingItem?.content && !thinkingItem.content.startsWith('Mengeksekusi [')
            ? thinkingItem.content
            : '')
        const partialContent = typeof rawContent === 'string' ? rawContent.trim() : ''

        let abortContent = ''
        if (isAbort) {
          abortContent = partialContent
            ? `${partialContent}\n\n[Eksekusi dihentikan oleh pengguna]`
            : 'Eksekusi dibatalkan atas permintaan pengguna.'
        } else {
          abortContent = partialContent
            ? `${partialContent}\n\n[Terjadi kendala saat memproses: ${error.message}]`
            : `Terjadi kendala saat memproses: ${error.message}`
        }

        const finalUpdated = [
          ...updated,
          {
            role: 'ai',
            content: abortContent,
            reasoning: preservedReasoning,
            executedTools: preservedExecutedTools.length > 0 ? preservedExecutedTools : undefined,
            mood: isAbort ? 'neutral' : 'sadness',
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now()
          }
        ]

        if (activeSessionNum === 1) {
          saveSession('1', finalUpdated).catch((err) => {
            console.warn('[useMarkPlan] Gagal auto-save abort main thread session 1:', err)
          })
        }

        return finalUpdated
      })
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
