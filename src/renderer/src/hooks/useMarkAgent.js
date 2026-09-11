import { useEffect, useRef, useCallback } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useApproval } from '../contexts/ApprovalContext'
import { fetchAI } from '../api/ai/core'
import { saveSession, getChatData, saveMainThread, getMainThread } from '../api/db'
import { useMarkState, useMarkYoutube, useMarkMusic, useMarkPlan } from './agent'
import { useAwareness } from './useAwareness'
import { useRelationalGrowth } from './agent/useRelationalGrowth'
import { useChatArchiver } from './useChatArchiver'
import { useVAD } from './useVAD'
import { formatForTelegram, getCurrentTimeInfo } from '../api/ai/utils'

export const useMarkAgent = () => {
  const { requestApproval } = useApproval()
  const youtubeMusicTools = useYoutubeMusic()

  const state = useMarkState()
  const {
    chatData,
    setChatData,
    clearChat,
    config,
    setConfig,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    isAgentBusy,
    setIsAgentBusy,
    runningSessionId,
    setRunningSessionId,
    runningSessionIds,
    setRunningSessionIds,
    addRunningSessionId,
    removeRunningSessionId,
    isSpeak,
    setIsSpeak,
    abortControllerRef,
    handleStop,
    orbStatus,
    setOrbStatus,
    currentResponse,
    setCurrentResponse,
    notifications,
    pushNotification,
    activeProcesses,
    setActiveProcesses,
    pushProcess,
    dismissProcess,
    inputSource,
    setInputSource,
    activeTopic,
    setActiveTopic,
    currentActiveSessionId,
    setCurrentActiveSessionId,
    isChatLoaded,
    isBooting,
    setIsBooting
  } = state

  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useMarkYoutube(setChatData)
  const { handleMusic } = useMarkMusic(setChatData, abortControllerRef, youtubeMusicTools)

  const tools = {
    handleYoutubeSearch,
    handleYoutubeSummary,
    handleMusic,
    getYoutubeData,
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null
  }

  const requestCameraCaptureRef = useRef(null)

  const { handlePlanningCommand, handleIntervention, handleStop: planHandleStop } = useMarkPlan({
    ...state,
    ...tools,
    requestApproval,
    requestCameraCapture: async (args) => {
      console.log(
        '[useMarkAgent] requestCameraCapture called, ref.current:',
        !!requestCameraCaptureRef.current
      )
      if (requestCameraCaptureRef.current) {
        return await requestCameraCaptureRef.current(args)
      }
      console.warn(
        '[useMarkAgent] requestCameraCaptureRef.current is null! MarkHome belum set callback.'
      )
      return null
    }
  })

  useAwareness({
    isLoading,
    isAgentBusy,
    setChatData,
    setOrbStatus,
    config,
    chatData,
    handlePlanningCommand,
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null
  })

  useRelationalGrowth({ chatData })

  useChatArchiver({ chatData, activeTopic, config, pushNotification, isLoading })

  const activeTgRequestRef = useRef(null)
  const hasGreetedRef = useRef(false)

  // Welcome Greeting on Startup
  useEffect(() => {
    if (isChatLoaded && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      console.log('[useMarkAgent] Memicu pesan sambutan (Boot sequence)...')

      const bootSequence = async () => {
        let timeContext = ''
        let topicContext = ''

        if (chatData && chatData.length > 0) {
          const lastMsg = chatData[chatData.length - 1]
          let lastTimeMs = null

          if (lastMsg) {
            if (
              typeof lastMsg.created_at === 'number' &&
              !isNaN(lastMsg.created_at) &&
              lastMsg.created_at > 0
            ) {
              lastTimeMs = lastMsg.created_at
            } else if (
              typeof lastMsg.timestamp === 'number' &&
              !isNaN(lastMsg.timestamp) &&
              lastMsg.timestamp > 0
            ) {
              lastTimeMs = lastMsg.timestamp
            }
          }

          if (lastTimeMs && lastTimeMs > 0) {
            const diffMs = Date.now() - lastTimeMs
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
            const diffDays = Math.floor(diffHours / 24)

            if (diffDays >= 365 || diffDays < 0) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna baru saja membuka kembali aplikasi.`
            } else if (diffDays >= 3) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna sudah tidak membuka aplikasi/ngobrol selama ${diffDays} hari! Sapa dengan nada kaget, akrab, atau kangen bergaya santai (contoh: "Waduh kemana aja nih lama gak kelihatan", "Akhirnya nongkrong lagi kita", "Sibuk banget kayaknya baru kelihatan lagi", dll). JANGAN formal atau kaku!`
            } else if (diffDays >= 1) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna kembali setelah ${diffDays} hari tidak ngobrol. Beri sapaan santai dan ramah bahwa lu senang dia balik lagi.`
            } else if (diffHours >= 5) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna kembali setelah sekitar ${diffHours} jam dari obrolan terakhir hari ini.`
            } else {
              const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Kalian baru saja ngobrol belum lama ini (${diffMinutes} menit yang lalu). JANGAN sapa berlebihan seolah sudah lama tidak ketemu, cukup sambut santai melanjutkan obrolan.`
            }
          }

          const lastUserMsg = [...chatData]
            .reverse()
            .find((m) => m.role === 'user' && typeof m.content === 'string')
          if (lastUserMsg && lastUserMsg.content) {
            const cleanMsg = lastUserMsg.content.replace(/\[.*?\]/g, '').trim()
            if (cleanMsg && cleanMsg.length > 3) {
              topicContext = `\n[TOPIK TERAKHIR KALIAN DI RIWAYAT]: "${cleanMsg.slice(0, 100)}". PENTING: Topik obrolan terakhir ini adalah MASA LALU. JANGAN mengira pengguna MASIH atau SEDANG melakukan aktivitas/game tersebut sekarang! Jika ingin menyinggungnya, tanyakan secara lampau (contoh: "gimana main game/kerjaan kemarin?", bukan "masih main/kerja ya?").`
            }
          }
        }

        try {
          await handlePlanningCommand(
            `Aplikasi baru saja dinyalakan. Sapa pengguna dengan singkat, natural, hangat, dan tidak kaku layaknya teman dekat/asisten pribadi yang hidup (gunakan nama pengguna dari profil jika ada).${timeContext}${topicContext}\nTunjukkan bahwa kamu siap dan aktif merespons tanpa bersikap seperti robot kaku atau customer service.`,
            null, // waContext
            false, // isAutonomous
            null, // autonomousInitialMessage
            { disableTools: true }, // options
            true // isSystem
          )
        } catch (err) {
          console.error('[useMarkAgent] Gagal greeting via handlePlanningCommand:', err)
        } finally {
          setTimeout(() => {
            setIsBooting(false)
          }, 800)
        }
      }

      bootSequence()
    }
  }, [isChatLoaded, chatData])

  useEffect(() => {
    const handleTgAdminMessage = (e) => {
      const data = e.detail

      if (data.text.trim().toLowerCase() === '/stop') {
        handleStop()
        return
      }

      activeTgRequestRef.current = data
      setInputSource('tg')
      setIsSpeak(false) // Disable voice auto-reply for Telegram messages
      handlePlanningCommand(data.text, data)
    }

    window.addEventListener('tg-admin-message', handleTgAdminMessage)
    return () => window.removeEventListener('tg-admin-message', handleTgAdminMessage)
  }, [handlePlanningCommand, setInputSource, handleStop, setIsSpeak])

  // Subagent Push Notification & Completion Listener
  useEffect(() => {
    if (!window.api?.onSubagentReport) return

    const unsubReport = window.api.onSubagentReport(async (data) => {
      console.log('[useMarkAgent] Menerima subagent:report push event:', data)
      if (data && data.summary) {
        const targetSessionId = String(data.parentSessionId || '1')
        const targetSessionTitle =
          data.parentSessionTitle ||
          (targetSessionId === '1' ? 'Main Thread' : `Sesi #${targetSessionId}`)
        const activeSession = String(currentActiveSessionId || activeTopic?.id || '1')
        const isCurrentSession = activeSession === targetSessionId

        // 1. Desktop Notification (Hanya jika window sedang tidak aktif / dibackground)
        if (document.hidden && window.api?.showNotification) {
          window.api.showNotification({
            title: isCurrentSession
              ? `Laporan @${data.subagentName || 'Sub-Agent'}`
              : `Laporan @${data.subagentName || 'Sub-Agent'} [${targetSessionTitle}]`,
            body: data.summary
          })
        }

        // 2. Jika sesi yang menerima laporan sedang dibuka aktif oleh user
        if (isCurrentSession) {
          if (!isAgentBusy) {
            handlePlanningCommand(
              `[SUB-AGENT REPORT RECEIVED]: Sub-agent @${data.subagentName || 'Specialist'} telah menyelesaikan tugasnya dan melaporkan hasil berikut:\n"${data.summary}"\n${data.artifact ? `Artefak: ${data.artifact}` : ''}\nBeri tanggapan atau rangkumkan secara singkat kepada user.`,
              null,
              false,
              null,
              {
                sessionId: targetSessionId,
                disableTools: false,
                customUserMessage: {
                  role: 'user',
                  source: 'subagent',
                  sender: `@${data.subagentName || 'Sub-Agent'}`,
                  content: `[SUB-AGENT REPORT RECEIVED]: Sub-agent @${data.subagentName || 'Specialist'} telah menyelesaikan tugasnya dan melaporkan hasil berikut:\n"${data.summary}"\n${data.artifact ? `Artefak: ${data.artifact}` : ''}`
                }
              },
              true
            ).catch((err) => {
              console.error('[useMarkAgent] Error handling active session subagent report turn:', err)
            })
          }
        } else {
          // 3. Jika user sedang berada di sesi lain / background delivery
          try {
            const timestampStr = getCurrentTimeInfo()
            const existingData =
              targetSessionId === '1'
                ? (await getMainThread()) || []
                : (await getChatData(targetSessionId)) || []

            const userReportMessage = {
              role: 'user',
              content: `[SUB-AGENT REPORT RECEIVED]: Sub-agent @${data.subagentName || 'Specialist'} telah menyelesaikan tugasnya dan melaporkan hasil berikut:\n"${data.summary}"\n${data.artifact ? `Artefak: ${data.artifact}` : ''}`,
              timestamp: timestampStr,
              created_at: Date.now(),
              source: 'subagent',
              sender: `@${data.subagentName || 'Sub-Agent'}`
            }

            const aiSummaryMessage = {
              role: 'ai',
              content: `Laporan dari @${data.subagentName || 'Specialist'} telah diterima dan diarsipkan ke sesi ini:\n\n${data.summary}${data.artifact ? `\n\n**Artefak:**\n${data.artifact}` : ''}`,
              timestamp: timestampStr,
              created_at: Date.now() + 1,
              isThinking: false
            }

            const updatedHistory = [...existingData, userReportMessage, aiSummaryMessage]

            if (targetSessionId === '1') {
              await saveMainThread(updatedHistory)
            } else {
              await saveSession(targetSessionId, updatedHistory)
            }

            // Pancarkan event reactive update agar UI sesi yang sedang di background otomatis ter-update
            window.dispatchEvent(
              new CustomEvent('session-updated', {
                detail: { sessionId: targetSessionId, data: updatedHistory }
              })
            )
          } catch (dbErr) {
            console.error('[useMarkAgent] Gagal menyimpan background subagent report:', dbErr)
          }
        }
      }
    })

    return () => {
      if (unsubReport) unsubReport()
    }
  }, [
    handlePlanningCommand,
    isAgentBusy,
    pushNotification,
    currentActiveSessionId,
    activeTopic
  ])

  const isInitialSyncDoneRef = useRef(false)
  const lastSyncedMsgIdRef = useRef(null)

  useEffect(() => {
    if (!isChatLoaded) return

    // Pada render pertama setelah chat DB dimuat, tandai pesan AI terakhir sebagai "sudah tersinkron" agar pesan histori tidak terkirim ulang
    if (!isInitialSyncDoneRef.current) {
      isInitialSyncDoneRef.current = true
      if (chatData && chatData.length > 0) {
        const lastAiMsg = [...chatData]
          .reverse()
          .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
        if (lastAiMsg) {
          lastSyncedMsgIdRef.current = lastAiMsg.timestamp || lastAiMsg.content
        }
      }
      return
    }

    if (!isAgentBusy && activeTgRequestRef.current && chatData.length > 0) {
      const lastAiMsg = [...chatData]
        .reverse()
        .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
      if (lastAiMsg) {
        const currentReq = activeTgRequestRef.current
        activeTgRequestRef.current = null
        setInputSource('pc')
        lastSyncedMsgIdRef.current = lastAiMsg.timestamp || lastAiMsg.content

        window.api?.sendTgAgentExecutionDone({
          chatId: currentReq.chatId,
          result: { answer: formatForTelegram(lastAiMsg.content) },
          msgId: currentReq.msgId
        })
      }
    } else if (!isAgentBusy && chatData.length > 0 && inputSource !== 'tg' && !activeTgRequestRef.current) {
      const lastAiMsg = [...chatData]
        .reverse()
        .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
      const msgKey = lastAiMsg ? lastAiMsg.timestamp || lastAiMsg.content : null
      if (lastAiMsg && lastAiMsg.content && lastSyncedMsgIdRef.current !== msgKey) {
        lastSyncedMsgIdRef.current = msgKey
        if (window.api?.tgBroadcastToAdmins && !lastAiMsg.isProactive && lastAiMsg.source !== 'telegram') {
          window.api.tgBroadcastToAdmins(`*Mark (PC)*:\n${lastAiMsg.content}`)
        }
      }
    }
  }, [isAgentBusy, chatData, isChatLoaded, setInputSource])

  const handleSubmit = (e, textPrompt) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    const textToSend =
      typeof textPrompt === 'string' ? textPrompt.trim() : typeof e === 'string' ? e.trim() : ''
    if (!textToSend) return

    if (isLoading || isAgentBusy) {
      if (handleIntervention) {
        handleIntervention(textToSend)
      }
    } else {
      handlePlanningCommand(textToSend)
    }
  }

  const handleVoiceTranscript = useCallback((text, meta = {}) => {
    if (!text || !text.trim()) return
    const wakePrefix = meta?.isWakeWord && meta?.wakePhrase ? `${meta.wakePhrase} ` : ''
    const prefixedText = `(Mikrofon) ${wakePrefix}${text}`.trim()
    setMessage(prefixedText)
    setIsSpeak(true)
    handlePlanningCommand(prefixedText, null, false, null, { forceSpeak: true })
  }, [setMessage, setIsSpeak, handlePlanningCommand])

  const vad = useVAD({
    onTranscript: handleVoiceTranscript
  })

  return {
    chatData,
    setChatData,
    clearChat,
    isSpeak,
    setIsSpeak,
    config,
    isLoading,
    isAgentBusy,
    runningSessionId,
    setRunningSessionId,
    runningSessionIds,
    setRunningSessionIds,
    addRunningSessionId,
    removeRunningSessionId,
    message,
    setMessage,
    orbStatus,
    setOrbStatus,
    currentResponse,
    setCurrentResponse,
    notifications,
    pushNotification,
    activeProcesses,
    setActiveProcesses,
    pushProcess,
    dismissProcess,
    inputSource,
    setInputSource,
    handlePlanningCommand,
    handleStop: planHandleStop || handleStop,
    handleSubmit,
    isBooting,
    requestCameraCaptureRef,
    // VAD & Voice Engine
    isRecording: vad.isRecording,
    isProcessing: vad.isProcessing,
    audioIntensity: vad.audioIntensity,
    startRecording: vad.startRecording,
    stopRecording: vad.stopRecording,
    toggleRecording: vad.toggleRecording,
    toastMessage: vad.toastMessage
  }
}
