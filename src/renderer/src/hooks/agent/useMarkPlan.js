import { getPlan, getTaskAction, getTaskSummary, getPlanConclusion } from '../../api/ai/planning'
import { getSearchResult, getYoutubeSummary } from '../../api/ai/tools'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import { getAnswer } from '../../api/ai/chat'
import { insertMemory, updateMemory, deleteMemory, getAllMemory } from '../../api/db'
import { getRelevantMemory } from '../../api/vectorMemory'

export const useMarkPlan = ({
  chatData, setChatData, config, isAction, isSpeak, abortControllerRef, setIsLoading, setMessage,
  handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData
}) => {
  const handlePlanningCommand = async (userInput) => {
    if (!userInput) return
    setIsLoading(true)
    const userMessage = { role: 'user', content: userInput }

    const rawSession = [
      ...chatData
        .filter(
          (item) =>
            item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing
        )
        .map((item) => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }))
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

    setChatData((prev) => [...prev, userMessage])
    abortControllerRef.current = new AbortController()

    try {
      const allMemory = await getAllMemory()
      const memoryReference = await getRelevantMemory(userInput, allMemory)

      // 1. Get Plan
      setChatData((prev) => [
        ...prev,
        { role: 'ai', content: 'Menganalisis instruksi dan membuat rencana...', isThinking: true }
      ])
      const planData = await getPlan(
        userInput,
        isAction.web,
        abortControllerRef.current.signal,
        chatSession,
        memoryReference
      )

      if (!planData.plan || planData.plan.length === 0) {
        // Fallback to normal conversation if plan is empty
        const answer = await getAnswer(
          userInput,
          memoryReference,
          chatSession,
          abortControllerRef.current.signal,
          isAction.web
        )
        if (!answer || !answer.answer) throw new Error('Gagal mengurai jawaban dari Mark menjadi format JSON.')

        if (isSpeak) {
          playVoice(answer.answer)
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
        } else {
          setChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            const aiResponse = {
              role: 'ai',
              content: answer.answer,
              reasoning: planData.reasoning,
              isMemorySaved: answer.memory?.action === 'insert' && answer.command?.action !== 'search',
              isMemoryUpdated: answer.memory?.action === 'update',
              isMemoryDeleted: answer.memory?.action === 'delete'
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
        }
        if (answer.command?.action?.startsWith('music')) {
          await handleMusic(answer.command.action, answer.command?.query)
        }
        setMessage('')
        setIsLoading(false)
        return
      }

      setChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        return [
          ...filtered,
          { role: 'ai', content: '', reasoning: planData.reasoning, isPlanSteps: true, plan: planData.plan, currentStep: 0 }
        ]
      })

      let contextSummaries = []
      let previousContext = []
      let allSources = []

      // 2. Loop
      for (let i = 0; i < planData.plan.length; i++) {
        const planItem = planData.plan[i]
        const task = typeof planItem === 'object' ? planItem.task : planItem

        // UI update for running task - UPDATE currentStep instead of adding new thinking message
        setChatData((prev) =>
          prev.map((item) => (item.isPlanSteps ? { ...item, currentStep: i } : item))
        )

        let actionData;
        if (typeof planItem === 'object' && planItem.action && !planItem.is_dynamic) {
          // Gunakan query dari plan karena is_dynamic false
          actionData = { action: planItem.action, query: planItem.query || '' }
        } else {
          // JIT Query Resolution: fallback ke getTaskAction jika is_dynamic true atau format lama
          actionData = await getTaskAction(
            task,
            previousContext,
            isAction.web,
            abortControllerRef.current.signal
          )
        }

        let actionResult = null
        let summary = 'Tidak ada hasil'

        // Execute Action
        if (actionData.action === 'search') {
          actionResult = await new Promise((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timeoutId)
              reject(new Error('AbortError'))
            }

            if (abortControllerRef.current.signal.aborted) {
              return onAbort()
            }
            abortControllerRef.current.signal.addEventListener('abort', onAbort)

            setChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              {
                role: 'ai',
                content: '...',
                isSearching: true,
                query: actionData.query,
                sendDataWebSearch: (search, result) => {
                  abortControllerRef.current.signal.removeEventListener('abort', onAbort)
                  clearTimeout(timeoutId)
                  resolve({ search, result })
                }
              }
            ])

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
          await handleMusic(actionData.action, actionData.query)
          if (actionData.action === 'music-next') {
            summary = 'Memutar lagu selanjutnya.'
          } else if (actionData.action === 'music-prev') {
            summary = 'Memutar lagu sebelumnya.'
          } else if (actionData.action === 'music-toggle') {
            summary = 'Pause/Resume lagu.'
          } else if (actionData.action === 'music-play') {
            summary = `Memutar lagu dari hasil pencarian: "${actionData.query}".`
          } else {
            summary = `Menampilkan hasil pencarian lagu untuk: "${actionData.query}".`
          }
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

        setChatData((prev) => prev.filter((item) => !item.isSearching))
      }

      // All steps done
      setChatData((prev) =>
        prev.map((item) => (item.isPlanSteps ? { ...item, currentStep: planData.plan.length } : item))
      )

      // 3. Conclusion
      setChatData((prev) => [
        ...prev,
        { role: 'ai', content: 'Merangkum hasil akhir...', isThinking: true }
      ])
      const { answer: finalAnswer, reasoning: finalReasoning, memory: finalMemory } = await getPlanConclusion(
        userInput,
        contextSummaries,
        abortControllerRef.current.signal,
        chatSession,
        memoryReference
      )

      const uniqueSources = []
      const seenLinks = new Set()
      allSources.forEach((source) => {
        const identifier = source.link || source.url || JSON.stringify(source)
        if (!seenLinks.has(identifier)) {
          seenLinks.add(identifier)
          uniqueSources.push(source)
        }
      })

      setChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        const newAiMsg = { 
          role: 'ai', 
          content: finalAnswer, 
          reasoning: finalReasoning,
          isMemorySaved: finalMemory?.action === 'insert',
          isMemoryUpdated: finalMemory?.action === 'update',
          isMemoryDeleted: finalMemory?.action === 'delete'
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
        playVoice(finalAnswer)
      }

      setMessage('')
      setIsLoading(false)
    } catch (error) {
      console.error('Planning Error:', error)
      setIsLoading(false)
      if (error.name === 'AbortError') {
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
