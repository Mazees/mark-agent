import { useEffect } from 'react'
import { getPlan, getTaskAction, getTaskSummary, getPlanConclusion } from '../../api/ai/planning'
import { getSearchResult, getYoutubeSummary } from '../../api/ai/tools'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import { insertMemory, updateMemory, deleteMemory, getAllMemory } from '../../api/db'
import { getRelevantMemory } from '../../api/vectorMemory'

export const useMarkPlan = ({
  chatData, setChatData, config, isSpeak, abortControllerRef, setIsLoading, setMessage,
  handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData,
  pushProcess, activeTopic, setActiveTopic, currentMusicTrack
}) => {
  useEffect(() => {
    if (window.api.onAiStatus) {
      window.api.onAiStatus((statusMsg) => {
        setChatData((prev) => {
          const newChat = [...prev]
          const lastIdx = newChat.length - 1
          if (newChat[lastIdx]?.isThinking) {
             newChat[lastIdx].content = statusMsg
          }
          return newChat
        })
      })
    }
  }, [setChatData])

  const handlePlanningCommand = async (userInput, waContext = null, isAutonomous = false, autonomousInitialMessage = null) => {
    if (!userInput) return
    setIsLoading(true)
    const timestampStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    const userMessage = { role: 'user', content: userInput, timestamp: timestampStr }

    const rawSession = [
      ...chatData
        .filter(
          (item) =>
            item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing
        )
        .map((item) => ({ 
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
        chatSession[chatSession.length - 1].content =
          chatSession[chatSession.length - 1].content + `\n ${item.content}`
      } else {
        chatSession.push(item)
      }
    })

    chatSession = [...chatSession].slice(-1 * (config[0]?.context || 10))
    chatSession = [...chatSession, userMessage]

    // Invisible execution: Do not push user's message to UI if autonomous
    if (!isAutonomous) {
      setChatData((prev) => [...prev, userMessage])
    }
    abortControllerRef.current = new AbortController()

    try {
      const allMemory = await getAllMemory()
      const memoryReference = await getRelevantMemory(userInput, allMemory)

      // Construct contextMsg
      let contextMsgStr = ''
      if (waContext) contextMsgStr += `Permintaan ini berasal dari WhatsApp (JID: ${waContext.jid}).\n`
      if (isAutonomous) contextMsgStr += `[AWARENESS MODE]: Ini adalah pemikiran autonom-mu sendiri, bukan perintah user secara langsung. Kamu baru saja memikirkan ide ini dan sekarang sedang mengeksekusinya.\n`
      if (currentMusicTrack && currentMusicTrack.title) {
        contextMsgStr += `[STATUS SISTEM]: Saat ini kamu sedang memutar lagu "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist} di background.\n`
      }

      if (isAutonomous && autonomousInitialMessage) {
        setChatData((prev) => [
          ...prev,
          { role: 'ai', content: autonomousInitialMessage, isProactive: true, isThinking: false, timestamp: timestampStr }
        ])
      }

      // 1. Get Plan
      setChatData((prev) => [
        ...prev,
        { role: 'ai', content: 'Menganalisis instruksi dan membuat rencana...', isThinking: true }
      ])
      const planData = await getPlan(
        userInput,
        true,
        abortControllerRef.current.signal,
        chatSession,
        memoryReference,
        contextMsgStr,
        activeTopic
      )

      if (planData.active_topic !== undefined) {
        setActiveTopic(planData.active_topic)
      }

      // Pencegahan Fast Bypass untuk perintah yang butuh balasan data (misal: search)
      const dataFetchingActions = ['search', 'summary', 'yt-summary', 'yt-search', 'read_file']
      if ((!planData.plan || planData.plan.length === 0) && planData.command && dataFetchingActions.includes(planData.command.action)) {
        console.log('[useMarkPlan] Data-fetching command detected in Fast Bypass. Converting to Multi-Step Plan.')
        planData.plan = [{
          task: `Execute ${planData.command.action} for "${planData.command.query}"`,
          action: planData.command.action,
          query: planData.command.query,
          is_dynamic: false
        }]
        planData.direct_answer = null 
      }

      if (!planData.plan || planData.plan.length === 0) {
        const isPluginAction = planData.command?.action && planData.command.action !== 'none' && planData.command.action !== 'search' && planData.command.action !== 'yt-search' && planData.command.action !== 'yt-summary';

        if (!planData.direct_answer && !isPluginAction) {
          throw new Error('Gagal merespons: direct_answer kosong setelah retry.')
        }

        console.log('[useMarkPlan] Menggunakan direct_answer (Fast Bypass)');
        const answer = {
          answer: planData.direct_answer || '',
          command: planData.command,
          memory: planData.memory || null
        }

        if (isSpeak && !isPluginAction && answer.answer) {
          await playVoice(answer.answer)
        }
        
        if (window.api.showNotification && !isPluginAction && !document.hasFocus() && answer.answer) {
          window.api.showNotification('Mark', answer.answer)
        }

        if (answer.memory && answer.command?.action !== 'search') {
          const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
          if (actions[answer.memory.action]) {
            const memoryData = { ...answer.memory }
            memoryData.memory = memoryData.memory.trim().replace(/^[\\"]+|[\\"]+$/g, '').replace(/\\n/g, '\n')
            const dateStr = getCurrentTimeInfo()
            memoryData.memory = `[${dateStr}] ${memoryData.memory}`
            await actions[answer.memory.action](memoryData)
          }
        }

        if (answer.command?.action === 'yt-search') {
          handleYoutubeSearch(answer, abortControllerRef.current.signal)
        } else if (!isPluginAction) {
          setChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            const aiResponse = {
              role: 'ai',
              content: answer.answer,
              reasoning: planData.reasoning,
              mood: planData.mood || 'neutral',
              isMemorySaved: answer.memory?.action === 'insert' && answer.command?.action !== 'search',
              isMemoryUpdated: answer.memory?.action === 'update',
              isMemoryDeleted: answer.memory?.action === 'delete',
              timestamp: timestampStr
            }
            if (answer.command?.run && String(answer.command.run).toLowerCase() !== 'null') {
              return [...filtered, aiResponse, { role: 'command', content: answer.command.run, risk: answer.command.risk }]
            }
            return [...filtered, aiResponse]
          })
        }

        if (answer.command?.action === 'search') {
          await handleSearchCommand(userInput, answer.command.query, abortControllerRef.current.signal, chatSession)
        }
        if (answer.command?.action === 'yt-summary') {
          await handleYoutubeSummary(answer.command.query, abortControllerRef.current.signal)

        } else if (answer.command?.action && answer.command.action !== 'none' && answer.command.action !== 'search' && answer.command.action !== 'yt-search') {
          const act = answer.command.action
          const qry = answer.command.query

          const pluginProcessId = `plugin-${Date.now()}`
          pushProcess({
            id: pluginProcessId,
            type: 'plugin-execution',
            status: 'active',
            data: { action: act, query: qry }
          })

          await new Promise(resolve => setTimeout(resolve, 500))

          try {
            let res;
            if (act === 'screenshot') {
              if (waContext) {
                window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
                res = { success: true, data: 'Screenshot berhasil dikirim secara asinkron.' }
              } else {
                res = { success: false, error: 'Fitur screenshot saat ini hanya tersedia jika diminta melalui WhatsApp.' }
              }
            } else if (act === 'wa-send') {
              const [targetJid, targetText] = (qry || '').split('|')
              if (targetJid && targetText) {
                 const waRes = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
                 if (waRes && waRes.success) {
                   res = { success: true, data: `Berhasil mengirim pesan WhatsApp ke ${targetJid}` }
                 } else {
                   res = { success: false, error: `Gagal mengirim pesan: ${waRes?.error || 'Unknown error'}` }
                 }
              } else {
                 res = { success: false, error: `Gagal mengirim pesan, format query AI salah: ${qry}` }
              }
            } else if (act.startsWith('music')) {
              const musicResult = await handleMusic(act, qry)
              res = { success: true, data: musicResult }
            } else {
              res = await window.api.executePlugin(act, qry)
            }
            
            setChatData((prev) => prev.filter(item => !item.isThinking))

            if (res.success) {
              const summaryStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              
              pushProcess({
                id: pluginProcessId,
                type: 'plugin-execution',
                status: 'done',
                data: { action: act, query: qry, result: summaryStr }
              })
              
              setChatData((prev) => [ ...prev, { role: 'ai', content: 'Membaca hasil eksekusi...', isThinking: true } ])
              await new Promise(resolve => setTimeout(resolve, 500))

              const followUpInput = `Pertanyaan user: "${userInput}"`
              const followUpSession = [
                ...chatSession,
                { role: 'assistant', content: `[SYSTEM LOG] Memulai plugin ${act}...` }
              ]
              const followUp = await getPlanConclusion(
                followUpInput, 
                [summaryStr], 
                abortControllerRef.current.signal, 
                followUpSession, 
                memoryReference,
                contextMsgStr,
                activeTopic
              )

              if (window.api.showNotification && !document.hasFocus()) {
                window.api.showNotification('Mark', followUp.answer)
              }

              setChatData((prev) => [
                ...prev.filter(item => !item.isThinking),
                { 
                  role: 'ai', 
                  content: followUp.answer, 
                  command: followUp.command,
                  isMemorySaved: answer.memory?.action === 'insert' && answer.command?.action !== 'search',
                  isMemoryUpdated: answer.memory?.action === 'update',
                  isMemoryDeleted: answer.memory?.action === 'delete',
                  pluginExecution: {
                    action: act,
                    query: qry,
                    result: summaryStr
                  }
                }
              ])
            } else {
               setChatData((prev) => [ ...prev, { role: 'ai', content: `[Error eksekusi plugin ${act}]: ${res.error}` } ])
            }
          } catch (err) {
            setChatData((prev) => [ ...prev.filter(item => !item.isThinking), { role: 'ai', content: `[Crash eksekusi plugin ${act}]: ${err.message}` } ])
          }
        }
        setMessage('')
        setIsLoading(false)
        return
      }

      const planProcessId = `plan-${Date.now()}`
      pushProcess({
        id: planProcessId,
        type: 'planning',
        status: 'active',
        data: { plan: planData.plan, currentStep: 0, reasoning: planData.reasoning }
      })

      let contextSummaries = []
      let previousContext = []
      let allSources = []

      // 2. Loop
      let errorRetryCount = 0;
      for (let i = 0; i < planData.plan.length; i++) {
        if (errorRetryCount >= 3) {
          console.warn('[useMarkPlan] Maksimal retry error tercapai, menghentikan loop untuk mencegah infinite retry.')
          contextSummaries.push(`[SYSTEM LOG] Proses dihentikan paksa karena 3 kali percobaan eksekusi gagal berturut-turut.`)
          break
        }

        const planItem = planData.plan[i]
        const task = typeof planItem === 'object' ? planItem.task : planItem

        pushProcess({
          id: planProcessId,
          type: 'planning',
          status: 'active',
          data: { plan: planData.plan, currentStep: i, reasoning: planData.reasoning }
        })

        let actionData;
        if (typeof planItem === 'object' && planItem.action && !planItem.is_dynamic) {
          // Gunakan query dari plan karena is_dynamic false
          actionData = { action: planItem.action, query: planItem.query || '' }
        } else {
          // JIT Query Resolution: fallback ke getTaskAction jika is_dynamic true atau format lama
          actionData = await getTaskAction(
            task,
            previousContext,
            true,
            abortControllerRef.current.signal
          )
        }

        let actionResult = null
        let summary = 'Tidak ada hasil'

        // Execute Action
        if (actionData.action === 'search') {
          const searchProcessId = `search-${Date.now()}`
          actionResult = await new Promise((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timeoutId)
              reject(new Error('AbortError'))
            }

            if (abortControllerRef.current.signal.aborted) {
              return onAbort()
            }
            abortControllerRef.current.signal.addEventListener('abort', onAbort)

            pushProcess({
              id: searchProcessId,
              type: 'web-search',
              status: 'active',
              data: {
                query: actionData.query,
                sendDataWebSearch: (search, result) => {
                  abortControllerRef.current.signal.removeEventListener('abort', onAbort)
                  clearTimeout(timeoutId)
                  pushProcess({ id: searchProcessId, type: 'web-search', status: 'done', data: { query: actionData.query } })
                  resolve({ search, result })
                }
              }
            })

            const timeoutId = setTimeout(() => {
              abortControllerRef.current.signal.removeEventListener('abort', onAbort)
              resolve({ search: [], result: [] })
            }, 45000)
          })
          
          const chatSessionSlice = chatData
            .filter(
              (item) =>
                item.role !== 'command' &&
                !item.isThinking &&
                !item.isSearching &&
                !item.isSummarizing
            )
            .map((item) => ({
              role: item.role === 'ai' ? 'assistant' : 'user',
              content: item.content
            }))
            .slice(-10)
            
          const searchSumObj = await getSearchResult(
            actionResult.search,
            actionResult.result,
            task,
            abortControllerRef.current.signal,
            chatSessionSlice
          )
          summary = searchSumObj.answer
          if (searchSumObj.sources && searchSumObj.sources.length > 0) {
            allSources = [...allSources, ...searchSumObj.sources]
          }
        } else if (actionData.action === 'yt-search') {
          actionResult = await window.api.searchYoutube(actionData.query)
          summary = await getTaskSummary(
            task,
            actionResult,
            previousContext,
            abortControllerRef.current.signal
          )
        } else if (actionData.action === 'yt-summary') {
          setChatData((prev) => [...prev, { role: 'ai', content: 'Sedang menonton video youtube (hal ini akan membutuhkan waktu beberapa saat mohon ditunggu)...', isSummarizing: true, youtubeLink: actionData.query }])
          const yData = await getYoutubeData(actionData.query)
          const sum = await getYoutubeSummary(
            actionData.query,
            yData,
            abortControllerRef.current.signal
          )
          summary = sum
          if (i === planData.plan.length - 1) {
            setChatData((prev) => [
              ...prev.filter((item) => !item.isSummarizing),
              { role: 'ai', content: sum, isYoutubeSummary: true, youtubeLink: actionData.query }
            ])
          } else {
            setChatData((prev) => prev.filter((item) => !item.isSummarizing))
          }
        } else if (actionData.action?.startsWith('music')) {
          summary = await handleMusic(actionData.action, actionData.query)
        } else if (actionData.action === 'wa-send') {
          const [targetJid, targetText] = (actionData.query || '').split('|')
          if (targetJid && targetText) {
             const res = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
             if (res && res.success) {
               summary = `[SYSTEM LOG] Berhasil mengirim pesan WhatsApp ke ${targetJid}`
             } else {
               summary = `[SYSTEM LOG] Gagal mengirim pesan WhatsApp ke ${targetJid}: ${res?.error || 'Unknown error'}`
             }
          } else {
             summary = `[SYSTEM LOG] Gagal mengirim pesan WhatsApp, format query salah: ${actionData.query}`
          }
        } else if (actionData.action === 'screenshot') {
          if (waContext) {
             window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
             summary = `[SYSTEM LOG] Screenshot berhasil dikirim secara asinkron.`
          } else {
             summary = `[SYSTEM LOG] Gagal mengambil screenshot, fitur ini hanya tersedia via request WhatsApp.`
          }
        } else if (actionData.action && actionData.action !== 'none' && actionData.action !== 'summary') {
          const act = actionData.action
          const qry = actionData.query
          
          const pluginProcessId = `plugin-${Date.now()}`
          pushProcess({
            id: pluginProcessId,
            type: 'plugin-execution',
            status: 'active',
            data: { action: act, query: qry }
          })
          
          const res = await window.api.executePlugin(act, qry)
          
          setChatData((prev) => prev.filter((item) => !item.isThinking))
          
          if (res.success) {
            const resultStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
            summary = `Hasil Eksekusi Plugin ${act}: ${resultStr}`
            errorRetryCount = 0;
          } else {
            summary = `Gagal mengeksekusi plugin ${act}: ${res.error}`
            errorRetryCount++
            
            // AUTO RECOVERY: Force dynamic retry to fix the error
            const retryStep = {
              task: `Memperbaiki error dari aksi sebelumnya`,
              action: 'none',
              query: '',
              is_dynamic: true
            }
            
            if (i === planData.plan.length - 1) {
              planData.plan.push(retryStep)
            } else {
              planData.plan.splice(i + 1, 0, retryStep)
            }
          }
          pushProcess({
            id: pluginProcessId,
            type: 'plugin-execution',
            status: 'done',
            data: { action: act, query: qry, result: summary }
          })
        } else {
          const chatSessionSlice = chatData
            .filter(
              (item) =>
                item.role !== 'command' &&
                !item.isThinking &&
                !item.isSearching &&
                !item.isSummarizing
            )
            .map((item) => ({
              role: item.role === 'ai' ? 'assistant' : 'user',
              content: item.content
            }))
            .slice(-10)
          const searchSumObj = await getSearchResult(
            [],
            previousContext,
            task,
            abortControllerRef.current.signal,
            chatSessionSlice
          )
          summary = searchSumObj.answer
          if (searchSumObj.sources && searchSumObj.sources.length > 0) {
            allSources = [...allSources, ...searchSumObj.sources]
          }
        }

        contextSummaries.push(summary)
        previousContext.push(`Task: ${task} -> Hasil: ${summary}`)

        if (typeof planData.plan[i] === 'object') {
          planData.plan[i] = { ...planData.plan[i], result: summary }
        } else {
          planData.plan[i] = { task: planData.plan[i], result: summary }
        }
      }

      pushProcess({
        id: planProcessId,
        type: 'planning',
        status: 'done',
        data: { plan: planData.plan, currentStep: planData.plan.length, reasoning: planData.reasoning }
      })

      // 3. Conclusion
      setChatData((prev) => [
        ...prev,
        { role: 'ai', content: 'Merangkum hasil akhir...', isThinking: true }
      ])
      const { answer: finalAnswer, reasoning: finalReasoning, memory: finalMemory, mood: finalMood } = await getPlanConclusion(
        userInput,
        contextSummaries,
        abortControllerRef.current.signal,
        chatSession,
        memoryReference,
        contextMsgStr
      )

      const uniqueSources = []
      const seenLinks = new Set()
      allSources.forEach((source) => {
        const identifier = source.link || JSON.stringify(source)
        if (!seenLinks.has(identifier)) {
          seenLinks.add(identifier)
          uniqueSources.push(source)
        }
      })

      if (window.api.showNotification && !document.hasFocus()) {
        window.api.showNotification('Mark', finalAnswer)
      }

      setChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        const newAiMsg = { 
          role: 'ai', 
          content: finalAnswer, 
          reasoning: finalReasoning,
          mood: finalMood || 'neutral',
          isMemorySaved: finalMemory?.action === 'insert',
          isMemoryUpdated: finalMemory?.action === 'update',
          isMemoryDeleted: finalMemory?.action === 'delete',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        }
        if (uniqueSources.length > 0) {
          newAiMsg.sources = uniqueSources
        }
        
        // Cek apakah step terakhir adalah yt-summary
        let lastStepAction = ''
        if (planData.plan && planData.plan.length > 0) {
          const lastItem = planData.plan[planData.plan.length - 1]
          lastStepAction = typeof lastItem === 'object' ? lastItem.action : ''
        }
        
        if (lastStepAction === 'yt-summary') {
          newAiMsg.isPlanConclusion = true
        }

        return [...filtered, newAiMsg]
      })

      if (finalMemory) {
        const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
        if (actions[finalMemory.action]) {
          const memoryData = { ...finalMemory }
          memoryData.memory = memoryData.memory.trim().replace(/^[\\"]+|[\\"]+$/g, '').replace(/\\n/g, '\n')
          const dateStr = new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit' })
          memoryData.memory = `[${dateStr}] ${memoryData.memory}`
          await actions[finalMemory.action](memoryData)
        }
      }

      if (isSpeak) {
        await playVoice(finalAnswer)
      }

      setMessage('')
      setIsLoading(false)
    } catch (error) {
      console.error('Planning Error:', error)
      setIsLoading(false)
      if (error.name === 'AbortError' || error.message.includes('AbortError')) {
        setChatData((prev) => [...prev.filter((item) => !item.isThinking && !item.isSearching)])
        setChatData((prev) => prev.slice(0, -1))
      } else {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking && !item.isSearching),
          { role: 'ai', content: `Maaf, terjadi kesalahan di proses planning: ${error.message}` }
        ])
      }
    }
  }


  return { handlePlanningCommand }
}
