import { useEffect } from 'react'
import { getNextAction, getPlanConclusion } from '../../api/ai/planning'
import { getSearchResult, getYoutubeSummary } from '../../api/ai/tools'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import { insertMemory, updateMemory, deleteMemory, getAllMemory } from '../../api/db'
import { getUnifiedContext } from '../../api/vectorMemory'

export const useMarkPlan = ({
  chatData, setChatData, config, isSpeak, abortControllerRef, setIsLoading, setIsAgentBusy, setMessage,
  handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData,
  pushProcess, activeTopic, setActiveTopic, currentMusicTrack, requestApproval
}) => {
  // Listener for 'ai-status' events from Main Process (via IPC)
  useEffect(() => {
    if (window.api && window.api.onAiStatus) {
      window.api.onAiStatus((msg) => {
        setChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          return [...filtered, { role: 'ai', content: msg, isThinking: true }]
        })
      })
    }
  }, [setChatData])

  const handlePlanningCommand = async (userInput, waContext = null, isAutonomous = false, autonomousInitialMessage = null, options = {}, isSystem = false) => {
    const finalIsSpeak = options.forceSpeak !== undefined ? options.forceSpeak : isSpeak
    if (!userInput) return

    // Jangan blokir UI Desktop jika perintah datang dari background/WhatsApp
    if (!waContext && !isAutonomous) {
      setIsLoading(true)
      setMessage('') // Clear input box instantly upon sending
    }
    setIsAgentBusy(true)

    const timestampStr = getCurrentTimeInfo()
    // Pesan dari system (greetingPrompt, awareness) pakai role 'system' agar AI bisa bedain dari pesan user
    const userMessage = { role: isSystem ? 'system' : 'user', content: userInput, timestamp: timestampStr }

    // ========== STEP 1: PERSIAPAN CHAT SESSION ==========
    const rawSession = [
      ...chatData
        .filter(item => item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing)
        .map(item => ({
          role: item.role === 'ai' ? 'assistant' : 'user',
          content: item.content,
          mood: item.mood,
          isProactive: item.isProactive,
          timestamp: item.timestamp
        }))
    ]
    let chatSession = []
    rawSession.forEach((item, index) => {
      if (index > 0 && item.role === chatSession[chatSession.length - 1].role) {
        chatSession[chatSession.length - 1].content += `\n ${item.content}`
      } else {
        chatSession.push(item)
      }
    })
    chatSession = [...chatSession].slice(-1 * (config[0]?.context || 10))
    chatSession = [...chatSession, userMessage]

    if (!isAutonomous && !isSystem) {
      setChatData(prev => [...prev, userMessage])
    }
    abortControllerRef.current = new AbortController()

    try {
      // ========== STEP 2: AMBIL MEMORI & KONTEKS ==========
      
      const allMemory = await getAllMemory()
      const contextPromise = getUnifiedContext(userInput, allMemory)
        const abortPromise = new Promise((_, reject) => {
          const onAbort = () => reject(new Error('AbortError'));
          if (abortControllerRef.current.signal.aborted) return onAbort();
          abortControllerRef.current.signal.addEventListener('abort', onAbort);
        })
        const unifiedContext = await Promise.race([contextPromise, abortPromise])

      let contextMsgStr = ''
      if (waContext) contextMsgStr += `Permintaan ini berasal dari WhatsApp (JID: ${waContext.jid}).\n`
      if (isSystem) contextMsgStr += `[SYSTEM INSTRUCTION]: Pesan ini adalah instruksi internal dari sistem, bukan dari user.\n`
      if (isAutonomous) contextMsgStr += `[AWARENESS MODE]: Ini adalah pemikiran autonom-mu sendiri.\n`
      if (currentMusicTrack && currentMusicTrack.title) {
        contextMsgStr += `[STATUS SISTEM]: Sedang memutar "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}.\n`
      }

      // Inject window tracker — biar AI tau user lagi ngapain di PC
      try {
        const activityBuffer = await window.api.getActivityBuffer()
        if (activityBuffer && activityBuffer.length > 0) {
          const recent = activityBuffer.slice(-5) // Ambil 5 aktivitas terakhir saja biar hemat token
          const activitySummary = recent.map(a => `[${a.time}] ${a.app}${a.title ? ` — ${a.title}` : ''}`).join('\n')
          contextMsgStr += `[AKTIVITAS PC USER (terakhir)]\n${activitySummary}\n`
        }
      } catch (_) { /* Silent fail — jika API tidak tersedia */ }

      if (isAutonomous && autonomousInitialMessage) {
        setChatData(prev => [
          ...prev,
          { role: 'ai', content: autonomousInitialMessage, isProactive: true, isThinking: false, timestamp: timestampStr }
        ])
      }

      // ========== STEP 3: AGENTIC LOOP ==========
      const loopMessages = [...chatSession]

      let isDone = false
      let stepCount = 0
      let lastDecision = null
      let allSources = []
      let lastActionTool = null
      let lastActionQuery = null
      let duplicateActionCount = 0
      let lastToolExecution = null

      const agenticProcessId = `agentic-${Date.now()}`
      let execSteps = [{ task: 'Menganalisis Konteks...' }] // Initial node for hologram

      while (!isDone) {
        // --- Safety: Cek abort ---
        if (abortControllerRef.current.signal.aborted) break

        stepCount++

        // --- Safety: Idle Detection (duplicate action guard) ---
        if (duplicateActionCount >= 2) {
          console.warn('[useMarkPlan] Duplicate action detected 2x, forcing done.')
          isDone = true
          break
        }

        // --- Update UI: Tampilkan step ke berapa ---
        setChatData(prev => {
          const filtered = prev.filter(item => !item.isThinking)
          return [...filtered, { role: 'ai', content: 'Bentar, mikir dlu...', isThinking: true }]
        })

        

        // --- Panggil AI: getNextAction ---
        const decision = await getNextAction(
          userInput,
          loopMessages,
          abortControllerRef.current.signal,
          unifiedContext,
          contextMsgStr,
          activeTopic
        )

        lastDecision = decision

        // --- Update active_topic jika ada ---
        if (decision.active_topic) {
          setActiveTopic(decision.active_topic)
        }

        // --- Handle memory jika ada ---
        if (decision.memory) {
          const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
          if (actions[decision.memory.action]) {
            const memoryData = { ...decision.memory }
            memoryData.memory = memoryData.memory.trim().replace(/^[\\\"]+|[\\\"]+$/g, '').replace(/\\n/g, '\n')
            const dateStr = getCurrentTimeInfo()
            memoryData.memory = `[${dateStr}] ${memoryData.memory}`
            await actions[decision.memory.action](memoryData)
          }
        }

        // ========== CEK KEPUTUSAN AI ==========

        // --- OPSI A: AI mau JAWAB (answer ada, action null) → SELESAI ---
        if (decision.answer && !decision.action) {
          isDone = true
          
          execSteps.push({ task: 'Selesai' });
          if (execSteps.length > 2) {
            pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'done',
            data: { steps: [...execSteps], currentStep: execSteps.length, reasoning: decision.thought || 'Selesai' }
          })
          }

          // TTS
          if (finalIsSpeak && decision.answer) {
            setChatData(prev => [
              ...prev.filter(item => !item.isThinking),
              { role: 'ai', content: 'Bentar...', isThinking: true }
            ])
            await playVoice(decision.answer)
          }

          // Notification
          if (window.api.showNotification && !document.hasFocus() && decision.answer) {
            window.api.showNotification('Mark', decision.answer)
          }

          // Tampilkan jawaban akhir di UI (skip jika autonomous DAN punya initial message)
          if (!isAutonomous || !autonomousInitialMessage) {
            setChatData(prev => {
              const filtered = prev.filter(item => !item.isThinking)
              const aiMsg = {
                role: 'ai',
                content: decision.answer,
                reasoning: decision.thought,
                mood: decision.mood || 'neutral',
                isMemorySaved: decision.memory?.action === 'insert',
                isMemoryUpdated: decision.memory?.action === 'update',
                isMemoryDeleted: decision.memory?.action === 'delete',
                pluginExecution: lastToolExecution,
                isProactive: isAutonomous,
                timestamp: getCurrentTimeInfo()
              }
              if (allSources.length > 0) {
                const uniqueSources = []
                const seenLinks = new Set()
                allSources.forEach(source => {
                  const id = source.link || JSON.stringify(source)
                  if (!seenLinks.has(id)) { seenLinks.add(id); uniqueSources.push(source) }
                })
                aiMsg.sources = uniqueSources
              }
              return [...filtered, aiMsg]
            })
          } else {
            // Autonomous: hapus isThinking bubble saja, jawaban sudah ada di autonomousInitialMessage
            setChatData(prev => prev.filter(item => !item.isThinking))
          }

          break // EXIT LOOP
        }

        // --- OPSI B: AI mau EKSEKUSI TOOL (action ada) → LANJUT LOOP ---
        if (decision.action && decision.action.tool) {
          const tool = decision.action.tool
          const query = decision.action.query || ''

          // Idle detection: cek duplikat
          if (tool === lastActionTool && query === lastActionQuery) {
            duplicateActionCount++
          } else {
            duplicateActionCount = 0
          }
          lastActionTool = tool
          lastActionQuery = query

          // Add to hologram plan
          execSteps.push({ task: `Eksekusi ${tool}`, query: query });
          pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: { steps: [...execSteps], currentStep: execSteps.length - 1, reasoning: decision.thought || `Menjalankan ${tool}` }
          })

          // Update UI
          setChatData(prev => {
            const filtered = prev.filter(item => !item.isThinking)
            return [...filtered, { role: 'ai', content: 'Bentar...', isThinking: true }]
          })

          // ========== EXECUTE TOOL ==========
          let resultString = 'Tidak ada hasil.'

          try {
            if (tool === 'search') {
              // --- WEB SEARCH ---
              const searchProcessId = `search-${Date.now()}`
              const searchResult = await new Promise((resolve, reject) => {
                const onAbort = () => { clearTimeout(timeoutId); reject(new Error('AbortError')) }
                if (abortControllerRef.current.signal.aborted) return onAbort()
                abortControllerRef.current.signal.addEventListener('abort', onAbort)

                pushProcess({
                  id: searchProcessId,
                  type: 'web-search',
                  status: 'active',
                  data: {
                    query: query,
                    sendDataWebSearch: (search, result) => {
                      abortControllerRef.current.signal.removeEventListener('abort', onAbort)
                      clearTimeout(timeoutId)
                      pushProcess({ id: searchProcessId, type: 'web-search', status: 'done', data: { query } })
                      resolve({ search, result })
                    }
                  }
                })

                const timeoutId = setTimeout(() => {
                  abortControllerRef.current.signal.removeEventListener('abort', onAbort)
                  resolve({ search: [], result: [] })
                }, 45000)
              })

              // Summarize search results menggunakan getSearchResult yang sudah ada
              const chatSlice = chatData
                .filter(item => item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing)
                .map(item => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }))
                .slice(-10)

              const searchSumObj = await getSearchResult(
                searchResult.search, searchResult.result, query, abortControllerRef.current.signal, chatSlice
              )
              resultString = searchSumObj.answer
              if (searchSumObj.sources && searchSumObj.sources.length > 0) {
                allSources = [...allSources, ...searchSumObj.sources]
              }

            } else if (tool === 'yt-search') {
              // --- YOUTUBE SEARCH ---
              const ytResults = await window.api.searchYoutube(query)
              resultString = JSON.stringify(ytResults)

            } else if (tool === 'yt-summary') {
              // --- YOUTUBE SUMMARY ---
              setChatData(prev => [...prev, {
                role: 'ai', content: 'Menonton video youtube...', isSummarizing: true, youtubeLink: query
              }])
              const yData = await getYoutubeData(query)
              resultString = await getYoutubeSummary(query, yData, abortControllerRef.current.signal)
              setChatData(prev => prev.filter(item => !item.isSummarizing))

            } else if (tool.startsWith('music')) {
              // --- MUSIC ---
              resultString = await handleMusic(tool, query)

            } else if (tool === 'wa-send') {
              // --- WHATSAPP SEND ---
              const [targetJid, targetText] = (query || '').split('|')
              if (targetJid && targetText) {
                const res = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
                resultString = res?.success
                  ? `Berhasil mengirim pesan WhatsApp ke ${targetJid}`
                  : `Gagal: ${res?.error || 'Unknown'}`
              } else {
                resultString = `Gagal: format query salah (harus "JID|pesan"): ${query}`
              }

            } else if (tool === 'screenshot') {
              // --- SCREENSHOT ---
              if (waContext) {
                window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
                resultString = 'Screenshot berhasil dikirim.'
              } else {
                resultString = 'Screenshot hanya tersedia via WhatsApp.'
              }

            } else if (['read-file', 'write-file', 'replace-lines', 'delete-file', 'list-dir', 'grep-search', 'run-powershell'].includes(tool)) {
              // --- NATIVE TOOLS (Built-in) ---
              const approvalCheck = await window.api.checkToolApproval(tool, query)
              
              if (approvalCheck.needsApproval && requestApproval) {
                const userApproved = await requestApproval(approvalCheck.message, tool, query)
                if (!userApproved) {
                  resultString = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
                  loopMessages.push(
                    { role: 'assistant', content: JSON.stringify({ thought: decision.thought, action: decision.action }) },
                    { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${resultString}` }
                  )
                  continue
                }
              }
              
              const nativePromise = window.api.executeNativeTool(tool, query)
              const abortPromise = new Promise((_, reject) => {
                const onAbort = () => reject(new Error('AbortError'));
                if (abortControllerRef.current.signal.aborted) return onAbort();
                abortControllerRef.current.signal.addEventListener('abort', onAbort);
              })
              
              const res = await Promise.race([nativePromise, abortPromise])
              if (res.success) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else {
                resultString = `[ERROR] ${tool} gagal: ${res.error}`
              }
              
              lastToolExecution = { action: tool, query, result: resultString }

            } else {
              // --- PLUGIN FALLBACK ---
              const pluginProcessId = `plugin-${Date.now()}`
              pushProcess({ id: pluginProcessId, type: 'plugin-execution', status: 'active', data: { action: tool, query } })

              const pluginPromise = window.api.executePlugin(tool, query)
              const abortPromise = new Promise((_, reject) => {
                const onAbort = () => reject(new Error('AbortError'));
                if (abortControllerRef.current.signal.aborted) return onAbort();
                abortControllerRef.current.signal.addEventListener('abort', onAbort);
              })
              const res = await Promise.race([pluginPromise, abortPromise])
              if (res.success) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else {
                resultString = `[ERROR] Plugin ${tool} gagal: ${res.error}`
              }

              lastToolExecution = { action: tool, query, result: resultString }
              pushProcess({ id: pluginProcessId, type: 'plugin-execution', status: 'done', data: { action: tool, query, result: resultString } })
            }
          } catch (toolError) {
            if (toolError.name === 'AbortError' || toolError.message.includes('AbortError')) {
              throw toolError;
            }
            resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
          }

          // --- FEED OBSERVATION BACK KE AI ---
          loopMessages.push(
            { role: 'assistant', content: JSON.stringify({ thought: decision.thought, action: decision.action }) },
            { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${resultString}` }
          )

          continue
        }

        // --- FALLBACK: Jika AI tidak mengisi action maupun answer ---
        console.warn('[useMarkPlan] AI returned neither action nor answer. Forcing done.')
        isDone = true
        setChatData(prev => [
          ...prev.filter(item => !item.isThinking),
          { role: 'ai', content: 'Maaf terjadi kesalahan di proses berpikir.', mood: 'neutral', timestamp: getCurrentTimeInfo() }
        ])
      }

      // ========== CLEANUP ==========
      if (!lastDecision?.answer) {
         if (execSteps.length > 2) {
          pushProcess({ id: agenticProcessId, type: 'planning', status: 'done', data: { steps: [...execSteps], currentStep: execSteps.length, reasoning: 'Loop Selesai' } })
         }
      }
      
      if (!waContext && !isAutonomous) {
        setIsLoading(false)
      }
      setIsAgentBusy(false)

    } catch (error) {
      if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
        console.error('Planning Error:', error)
      }
      
      if (!waContext && !isAutonomous) {
        setIsLoading(false)
      }
      setIsAgentBusy(false)
      if (error.name === 'AbortError' || error.message.includes('AbortError')) {
        setChatData(prev => [
          ...prev.filter(item => !item.isThinking && !item.isSearching),
          {
            role: 'ai',
            content: 'Oke, proses gue batalin ya bro.',
            reasoning: 'Proses dibatalkan secara paksa.',
            mood: 'neutral',
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          }
        ])
      } else {
        setChatData(prev => [
          ...prev.filter(item => !item.isThinking && !item.isSearching),
          { role: 'ai', content: `Maaf, terjadi kesalahan: ${error.message}` }
        ])
      }
    }
  }

  return { handlePlanningCommand }
}
