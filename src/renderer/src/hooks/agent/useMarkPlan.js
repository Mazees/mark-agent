import { useEffect, useRef } from 'react'
import { buildPlanningSystemPrompt } from '../../api/ai/planning'
import { getYoutubeSummary } from '../../api/ai/tools'
import { fetchAI } from '../../api/ai/core'
import { playVoice, speechQueue, getCurrentTimeInfo } from '../../api/ai/utils'
import { executeAgentTool } from './executeAgentTool.js'
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
import { buildDurableStepCheckpoint } from '../../api/taskExecutor'
import {
  startAgentTaskStep,
  checkpointAgentTaskStep,
  transitionAgentTask
} from '../../api/taskStore'
import { getUnifiedContext, generateVector, executeMemorySearch } from '../../api/vectorMemory'
import { searchMemoriesInOrama } from '../../api/oramaStore'
import { buildOptimizedChatSession } from '../../api/ai/contextCompactor'
import {
  MAX_CONTEXT_CHARS,
  calculateSessionChars,
  executeSessionCompaction,
  assembleCompactedPayload
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
      activeSessionNum = 1,
      activeTopic = null,
      userInput = '',
      durableTask = null,
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
              (typeof rawArgs === 'string' ? rawArgs : '') ||
              'Jelaskan apa yang kamu lihat di layar ini secara ringkas.'

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

            const visionResponse = await fetchAI([{ role: 'user', content: contentArray }], false, {
              signal: currentSignal,
              isSmallTask: true
            })
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

              const promptText =
                (typeof rawArgs === 'object' && rawArgs?.prompt) ||
                (typeof rawArgs === 'string' ? rawArgs : '') ||
                'Jelaskan dengan detail apa yang terlihat dari kamera ini.'

              const contentArray = [
                {
                  type: 'text',
                  text: promptText
                },
                { type: 'image_url', image_url: { url: cameraFrame } }
              ]

              const visionResponse = await fetchAI(
                [{ role: 'user', content: contentArray }],
                false,
                { signal: currentSignal, isSmallTask: true }
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
        const approvalCheck = await window.api.checkToolApproval(tool, rawArgs)

        if (approvalCheck.needsApproval && requestApproval) {
          const userApproved = await requestApproval(approvalCheck.message, tool, rawArgs)
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
        } else {
          resultString = `[ERROR] ${tool} gagal: ${(res && (res.message || res.error)) || 'Unknown error'}`
        }

        return {
          res,
          success: Boolean(res?.success),
          resultString,
          rejected: false,
          toolExecution: { action: tool, query: stringQuery, result: resultString },
          loadedGroup: res?.loaded_group || null,
          durableTask: executionResult?.durableTask || null,
          durableActiveStep: executionResult?.durableActiveStep || null
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
      // FASE 3.5: PRE-FLIGHT CONTEXT COMPACTION (Ambang Batas 525.000 Karakter)
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

      const currentEstimatedChars = calculateSessionChars(
        effectiveSourceMessages,
        activeSummaryBlock,
        activeLastCompactedId
      )

      // Bypass proses kompaksi berat jika instruksi internal (greeting sistem / awareness autonomous / disableTools)
      const isInternalTurn = Boolean(
        isSystem || isAutonomous || opts.skipCompaction || opts.disableTools
      )

      if (!isInternalTurn && currentEstimatedChars >= MAX_CONTEXT_CHARS) {
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

              // Segera update indikator context-tracker agar gauge langsung berwarna hijau
              const activeCharsAfterCompact = Number(compactionResult.currentChars || 0)
              window.dispatchEvent(
                new CustomEvent('context-tracker-updated', {
                  detail: {
                    sessionId: String(activeSessionNum),
                    currentChars: activeCharsAfterCompact,
                    maxChars: MAX_CONTEXT_CHARS,
                    percentage: Math.min(100, (activeCharsAfterCompact / MAX_CONTEXT_CHARS) * 100),
                    lastCompactedAt: Date.now()
                  }
                })
              )
            }
          }
        } catch (compactErr) {
          console.error('[useMarkPlan] Gagal context compaction:', compactErr)
        } finally {
          targetSetChatData((prev) => prev.filter((item) => item.id !== compactBannerId))
        }
      }

      // ------------------------------------------------------------------------
      // FASE 4: AGENTIC REACT LOOP (Native Function Calling + SSE Token Stream)
      // ------------------------------------------------------------------------
      const loopMessages =
        !isInternalTurn &&
        (activeSessionCompact?.summaryBlock || activeSessionCompact?.summary_block)
          ? assembleCompactedPayload({
              messages: effectiveSourceMessages,
              sessionCompact: activeSessionCompact,
              systemPrompt
            })
          : [
              { role: 'system', content: systemPrompt },
              ...optimizedHistory.map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: payloadContent }
            ]

      let isDone = false
      let stepCount = 0
      let executedToolsList = []
      let lastToolExecution = null
      accumulatedThoughts = []
      let currentActiveMood = 'neutral'
      let finalContentAccumulator = ''
      execSteps = [{ task: 'Menganalisis Konteks...' }]
      const dynamicallyLoadedToolGroups = new Set()
      let consecutiveErrors = 0
      const maxConsecutiveErrorRetries = 50
      const toolCallCounts = new Map()

      while (!isDone && !sessionAbortController.signal.aborted) {
        // Cek Abort Signal
        if (sessionAbortController.signal.aborted) {
          if (durableTask) {
            await transitionAgentTask(durableTask.id, 'cancelled', 'user_abort').catch(() => {})
            targetSetChatData((prev) =>
              prev.map((msg) => {
                if (!msg.isPlanSteps || msg.taskId !== durableTask.id) return msg
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
            isAutonomous && autonomousInitialMessage ? autonomousInitialMessage : ''
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
        let sentenceBuffer = ''

        // Request streaming ke Backend AI Bridge
        const streamResult = await fetchAI(loopMessages, true, {
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

            // Sentence-Level Streaming TTS: Deteksi kalimat lengkap secara real-time
            if (finalIsSpeak) {
              sentenceBuffer += token
              // Deteksi batas akhir kalimat (. ! ? atau newline ganda)
              const sentenceEndMatch = sentenceBuffer.match(/^(.*?[\.!\?\n]+)([\s\S]*)$/)
              if (sentenceEndMatch) {
                const completeSentence = sentenceEndMatch[1].trim()
                sentenceBuffer = sentenceEndMatch[2] || ''
                if (completeSentence) {
                  speechQueue.enqueue(completeSentence)
                }
              }
            }

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

        if (streamResult?.mood && streamResult.mood !== 'neutral') {
          currentActiveMood = streamResult.mood
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

        // ======================================================================
        // CABANG 1: MODEL MEMANGGIL NATIVE TOOL CALLS
        // ======================================================================
        if (effectiveToolCalls && effectiveToolCalls.length > 0) {
          const assistantMsg = {
            role: 'assistant',
            content: streamResult.content || null,
            tool_calls: effectiveToolCalls
          }
          loopMessages.push(assistantMsg)

          for (const tc of effectiveToolCalls) {
            const toolName = tc.function?.name
            let parsedArgs = {}
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}')
            } catch (_) {
              parsedArgs = { raw: tc.function?.arguments || '' }
            }

            if (!toolName) continue
            if (sessionAbortController.signal.aborted) break

            const toolSignature = `${toolName}:${JSON.stringify(parsedArgs)}`
            const toolCallCount = (toolCallCounts.get(toolSignature) || 0) + 1
            toolCallCounts.set(toolSignature, toolCallCount)
            if (toolCallCount > 3) {
              const error = new Error(
                `Tool yang sama dipanggil berulang kali tanpa perubahan: ${toolName}.`
              )
              error.code = 'LOOP_GUARD'
              throw error
            }

            if (toolCallCount === 3) {
              const loopWarning = `[SISTEM STOP LOOP]: Tool "${toolName}" dengan parameter identik telah dipanggil berulang kali tanpa perubahan hasil. DILARANG memanggil tool ini lagi dengan parameter yang sama. Segera evaluasi hasil yang sudah didapat dan lanjutkan ke langkah berikutnya atau berikan kesimpulan akhir kepada pengguna.`
              executedToolsList.push({
                tool: toolName,
                query: JSON.stringify(parsedArgs),
                status: 'failed',
                fullResult: loopWarning,
                resultSummary: loopWarning
              })
              const toolObservation = {
                type: 'tool_result',
                tool_call_id: tc.id,
                name: toolName,
                success: false,
                data: null,
                error: loopWarning
              }
              loopMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: JSON.stringify(toolObservation)
              })
              continue
            }

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
            const currentSessionTitle =
              activeSessionNum === 1
                ? activeTopic?.title || activeTopic?.name || 'Main Thread'
                : `Sesi #${activeSessionNum}`

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
            if (execResult.durableActiveStep) {
              durableActiveStep = execResult.durableActiveStep
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
          }

          // Lanjut ke giliran berikutnya untuk membiarkan model menganalisis observasi tool
          continue
        }

        // ======================================================================
        // CABANG 2: SELESAI / DIRECT TEXT RESPONSE (Stop / Selesai)
        // ======================================================================
        const turnAnswer = streamResult.content || currentTurnContent || ''

        // Jika giliran ini bagian dari Durable Task, kelola checkpointing & promosi step
        if (durableTask && durableActiveStep) {
          const currentStep = durableActiveStep
          const checkpoint = buildDurableStepCheckpoint(
            currentStep,
            turnAnswer,
            durableTask.maxRetries || 2
          )
          const stepValidation = checkpoint.validation
          const checkpointData = { ...checkpoint }
          delete checkpointData.canRetry

          // Simpan artefak markdown jika lolos validasi dan memiliki artifactPath
          if (
            stepValidation?.isComplete &&
            currentStep.artifactPath &&
            window.api?.executeNativeTool
          ) {
            try {
              await window.api.executeNativeTool(
                'write-file',
                { path: currentStep.artifactPath, content: turnAnswer },
                { workspaceRoot: opts.workspaceRoot }
              )
            } catch (err) {
              console.warn('[useMarkPlan] Gagal menulis artefak step:', err)
            }
          }

          const checkpointCompleted = checkpointData.status === 'completed'
          const checkpointCanRetry =
            !checkpointCompleted && (currentStep.attempts || 0) < (durableTask.maxRetries || 2) + 1
          const checkpointNeedsRevision = !checkpointCompleted && checkpointCanRetry

          const checkpointedTask = await checkpointAgentTaskStep(
            durableTask.id,
            currentStep.id,
            checkpointData
          )

          if (!checkpointCompleted && !checkpointCanRetry) {
            await transitionAgentTask(
              durableTask.id,
              'failed',
              'Tahap gagal memenuhi kriteria setelah batas retry.'
            )
            durableTask = checkpointedTask
            durableActiveStep = null
            if (activeTaskObjectiveRef) activeTaskObjectiveRef.current = null
          } else {
            const nextStep = checkpointCompleted
              ? checkpointedTask?.steps?.find((s) => s.id === checkpointedTask.activeStepId)
              : null

            durableTask = checkpointedTask
            durableTaskForRecovery = checkpointedTask
            durableActiveStep = nextStep || (checkpointNeedsRevision ? currentStep : null)
            if (activeTaskObjectiveRef) {
              activeTaskObjectiveRef.current =
                nextStep?.objective || (checkpointNeedsRevision ? currentStep.objective : null)
            }

            // Perbarui state Task Workflow Bubble di chatData secara real-time
            targetSetChatData((prev) =>
              prev.map((msg) => {
                if (!msg.isPlanSteps || msg.taskId !== durableTask.id) return msg
                const updatedPlan = (msg.plan || []).map((s, sIdx) => {
                  const isCurrentMatch =
                    s.id === currentStep.id ||
                    (s.id &&
                      currentStep.id &&
                      (s.id.endsWith(currentStep.id) || currentStep.id.endsWith(s.id))) ||
                    (s.stepIndex !== undefined && s.stepIndex === currentStep.stepIndex) ||
                    sIdx === (currentStep.stepIndex ?? currentStep.index ?? 0)

                  if (isCurrentMatch) {
                    return {
                      ...s,
                      status: checkpointCompleted ? 'completed' : 'failed',
                      output: turnAnswer.slice(0, 1000),
                      artifactPath: currentStep.artifactPath
                    }
                  }

                  const isNextMatch =
                    nextStep &&
                    (s.id === nextStep.id ||
                      (s.id &&
                        nextStep.id &&
                        (s.id.endsWith(nextStep.id) || nextStep.id.endsWith(s.id))) ||
                      (s.stepIndex !== undefined && s.stepIndex === nextStep.stepIndex) ||
                      sIdx === (nextStep.stepIndex ?? nextStep.index ?? 0))

                  if (isNextMatch) {
                    return { ...s, status: 'running' }
                  }
                  return s
                })
                return {
                  ...msg,
                  taskStatus: nextStep ? 'running' : 'completed',
                  currentStep: nextStep
                    ? (nextStep.stepIndex ?? nextStep.index ?? 0)
                    : (msg.plan || []).length,
                  plan: updatedPlan
                }
              })
            )

            // Jika butuh revisi, minta AI memperbaiki dan ulangi tahap ini
            if (!checkpointCompleted && checkpointNeedsRevision) {
              loopMessages.push({
                role: 'assistant',
                content: `[TAHAP PERLU REVISI]: ${turnAnswer}`
              })
              loopMessages.push({
                role: 'user',
                content: `[REVISI TAHAP] Ulangi dan lengkapi tahap "${currentStep.title}". Kekurangan: ${(stepValidation?.missingRequirements || []).join('; ')}. Penuhi target deliverable!`
              })
              await startAgentTaskStep(durableTask.id, durableActiveStep.id)
              continue
            }

            // Jika masih ada tahap berikutnya, promosikan dan lanjutkan loop ReAct
            if (nextStep) {
              consecutiveErrors = 0
              toolCallCounts.clear()
              loopMessages.push({
                role: 'assistant',
                content: `[TAHAP SELESAI]: "${currentStep.title}". Output: ${turnAnswer}`
              })
              loopMessages.push({
                role: 'user',
                content: `[LANJUTKAN TAHAP BERIKUTNYA]: "${nextStep.title}"\n- Sasaran: ${nextStep.objective}\n- Target Deliverable: ${nextStep.deliverable}\n${nextStep.acceptanceCriteria?.length ? `- Kriteria: ${nextStep.acceptanceCriteria.join(', ')}` : ''}\nKerjakan tahap ini sekarang menggunakan tools yang relevan sampai tuntas!`
              })
              await startAgentTaskStep(durableTask.id, nextStep.id)
              targetPushProcess({
                id: agenticProcessId,
                type: 'planning',
                status: 'active',
                data: {
                  steps: durableTask.steps.map((s) => ({ task: s.title })),
                  currentStep: nextStep.stepIndex ?? nextStep.index ?? 0,
                  reasoning: `Tahap "${currentStep.title}" selesai. Melanjutkan ke "${nextStep.title}"...`
                }
              })
              continue
            }
          }
        }

        // Jika Durable Task selesai seluruhnya, tandai status final
        if (durableTask) {
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
            .replace(/^\[mood:[a-zA-Z_]+\]\s*/i, '')
            .trim()
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

        // Meta-Learning: Sintesis skill otomatis jika turn berhasil mengeksekusi tool bermakna
        if (
          !isAutonomous &&
          !isSystem &&
          executedToolsList &&
          executedToolsList.length > 0 &&
          finalContentAccumulator
        ) {
          synthesizeSkillAndSave({
            userPrompt: lastUserPromptRef.current || userInput,
            executedTools: executedToolsList,
            finalAnswer: finalContentAccumulator,
            thought: currentTurnReasoning || accumulatedThoughts.join('\n\n')
          }).catch((err) => {
            console.warn('[useMarkPlan] Background Meta-Learning error:', err)
          })
        }

        break
      }

      // Pastikan sisa thinking indicator selalu dibersihkan jika loop selesai
      targetSetChatData((prev) => {
        const hasThinking = prev.some((item) => item.isThinking)
        if (!hasThinking) return prev
        const filtered = prev.filter((item) => !item.isThinking)
        if (finalContentAccumulator) return filtered
        return [
          ...filtered,
          {
            role: 'ai',
            content: 'Tugas telah selesai diproses.',
            executedTools: executedToolsList.length > 0 ? executedToolsList : null,
            isTaskDone: true,
            reasoning: accumulatedThoughts.join('\n\n') || null,
            mood: currentActiveMood || 'neutral',
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now()
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

      // Post-Turn Context Sync: Hitung total karakter terkini dan trigger event ke UI
      try {
        const latestSessionData = activeSessionNum === 1 ? chatData : inMemorySessionData
        const latestChars = calculateSessionChars(
          latestSessionData,
          activeSessionCompact?.summaryBlock || activeSessionCompact?.summary_block || '',
          activeSessionCompact?.lastCompactedMessageId ||
            activeSessionCompact?.last_compacted_message_id ||
            null
        )
        window.dispatchEvent(
          new CustomEvent('context-tracker-updated', {
            detail: {
              sessionId: String(activeSessionNum),
              currentChars: latestChars,
              maxChars: MAX_CONTEXT_CHARS,
              percentage: Math.min(100, (latestChars / MAX_CONTEXT_CHARS) * 100),
              lastCompactedAt: activeSessionCompact?.lastCompactedAt || null
            }
          })
        )
      } catch (_) {}

      try {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch (_) {}
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
        if (durableTaskForRecovery) {
          transitionAgentTask(
            durableTaskForRecovery.id,
            'cancelled',
            'Eksekusi dibatalkan atas permintaan pengguna.'
          ).catch(() => {})
        }
      }

      targetSetChatData((prev) => {
        let updated = prev.filter((item) => !item.isThinking)
        if (isAbort && durableTaskForRecovery) {
          updated = updated.map((msg) => {
            if (!msg.isPlanSteps || msg.taskId !== durableTaskForRecovery.id) return msg
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
        return [
          ...updated,
          {
            role: 'ai',
            content: isAbort
              ? 'Eksekusi dibatalkan atas permintaan pengguna.'
              : `Terjadi kendala saat memproses: ${error.message}`,
            mood: isAbort ? 'neutral' : 'sadness',
            timestamp: getCurrentTimeInfo(),
            created_at: Date.now()
          }
        ]
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
