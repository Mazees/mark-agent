import { useEffect, useRef } from 'react'
import { getAllMemory, insertMemory, getRelationship } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse, generateDailyJournalEntry } from '../api/ai/awareness'
import { subagentStore } from '../api/subagent/subagentStore'
import { runSubagentTurn } from '../api/subagent/subagentExecutor'

const CHECKIN_POLL_INTERVAL = 20 * 1000 // Polling telemetri setiap 20 detik
const MIN_CHECKIN_GAP = 3 * 60 * 1000 // Minimal 3 menit antar evaluasi normal

const formatAwarenessContent = (content) => {
  if (typeof content === 'string') return content
  if (content == null) return ''

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text') return part.text || ''
        if (part?.type === 'image_url') return '[Gambar]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content)
}

const tokenizeForSimilarity = (text) => {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
  )
}

const isSimilarAwarenessMessage = (message, recentMessages) => {
  const incomingTokens = tokenizeForSimilarity(message)
  if (incomingTokens.size < 4) return false

  return recentMessages.some((item) => {
    const previousTokens = tokenizeForSimilarity(formatAwarenessContent(item.content))
    if (previousTokens.size < 4) return false

    const shared = [...incomingTokens].filter((word) => previousTokens.has(word)).length
    return shared / Math.min(incomingTokens.size, previousTokens.size) >= 0.6
  })
}

export const useAwareness = ({
  isLoading,
  isAgentBusy,
  setChatData,
  setOrbStatus,
  config,
  chatData,
  handlePlanningCommand,
  currentMusicTrack
}) => {
  const isRequestingRef = useRef(false)
  const chatDataRef = useRef(chatData)
  const configRef = useRef(config)
  const handlePlanningCommandRef = useRef(handlePlanningCommand)
  const currentMusicTrackRef = useRef(currentMusicTrack)
  const isLoadingRef = useRef(isLoading)
  const isAgentBusyRef = useRef(isAgentBusy)
  const lastCheckInRef = useRef(0)

  // State Pelacak AFK & Tethering
  const wasAfkRef = useRef(false)
  const sentTelegramAfkRef = useRef(false)
  const lastJournalDateRef = useRef('')

  useEffect(() => {
    chatDataRef.current = chatData
    configRef.current = config
    handlePlanningCommandRef.current = handlePlanningCommand
    currentMusicTrackRef.current = currentMusicTrack
    isLoadingRef.current = isLoading
    isAgentBusyRef.current = isAgentBusy
  }, [chatData, config, handlePlanningCommand, currentMusicTrack, isLoading, isAgentBusy])

  const isAwarenessEnabled = config?.[0]?.awarenessEnabled !== false

  useEffect(() => {
    if (!isAwarenessEnabled) return

    const runEvaluation = async ({ isReturnFromAFK = false } = {}) => {
      if (isAgentBusyRef.current || isLoadingRef.current || isRequestingRef.current) return

      try {
        isRequestingRef.current = true
        lastCheckInRef.current = Date.now()

        const buffer = await window.api.getActivityBuffer()
        const telemetry = buffer?.telemetry || (await window.api.getSystemTelemetry?.()) || null
        if (buffer && telemetry) {
          buffer.telemetry = telemetry
        }

        const allMemory = await getAllMemory()
        const memoryRef = await getRelevantMemory('aktivitas user bekerja dan rutinitas', allMemory)

        const recentChat = (chatDataRef.current || [])
          .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map((m) => ({ role: m.role, content: m.content }))

        if (window.api.clearActivityBuffer) {
          window.api.clearActivityBuffer()
        }

        const result = await getAwarenessResponse(
          buffer,
          memoryRef,
          configRef.current,
          recentChat,
          currentMusicTrackRef.current
        )

        // Broadcast thought ticker ke UI
        if (result.thought) {
          window.dispatchEvent(
            new CustomEvent('mark:thought', {
              detail: { thought: result.thought, mood: result.mood }
            })
          )
        }

        // 1. Aksi: Journal (Refleksi Batin)
        if (
          result.action_type === 'journal' ||
          result.thought?.toLowerCase().includes('refleksi')
        ) {
          const journalText = result.thought || result.message
          if (journalText) {
            await insertMemory({
              type: 'private_journal',
              summary: `Refleksi Batin Mark - ${new Date().toLocaleDateString('id-ID')}`,
              memory: journalText
            })
          }
        }

        // 2. Aksi: Autonomous Task (Riset Mandiri AFK / Peeking)
        if (result.autonomous_prompt) {
          if (telemetry?.isUserAFK) {
            // User sedang AFK: delegasikan ke Sub-Agent senyap tanpa mengunci Main Thread
            try {
              const subAgent = await subagentStore.createSubagent({
                name: 'Mark-SideProject',
                role: 'Autonomous Curiosity Researcher',
                goal: result.autonomous_prompt,
                parentSessionId: '1',
                parentSessionTitle: 'Main Thread'
              })
              if (subAgent?.id) {
                runSubagentTurn(subAgent.id, result.autonomous_prompt, 'mark')
              }
            } catch (subErr) {
              console.warn('[useAwareness] Gagal spawn silent subagent:', subErr)
            }
          } else if (handlePlanningCommandRef.current) {
            // User aktif di depan layar: jalankan inisiatif via flow utama
            handlePlanningCommandRef.current(
              result.autonomous_prompt,
              null,
              true,
              result.message || 'Melakukan inisiatif otonom...',
              { disableTools: false },
              true
            )
          }
        }

        // 3. Aksi: Vocal (Balon Chat & Sapaan)
        const cleanMessage = (result.message || '').replace(/\[mood:[a-zA-Z_]+\]/gi, '').trim()
        if (result.action_type === 'vocal' && cleanMessage) {
          const recentVisibleMessages = (chatDataRef.current || [])
            .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
            .slice(-8)

          if (!isSimilarAwarenessMessage(cleanMessage, recentVisibleMessages)) {
            if (window.api.showNotification && !document.hasFocus()) {
              window.api.showNotification('Mark', cleanMessage)
            }

            setChatData((prev) => [
              ...prev,
              {
                role: 'ai',
                content: cleanMessage,
                isProactive: true,
                mood: result.mood,
                isReturnFromAFK
              }
            ])

            setOrbStatus('nudge')
            setTimeout(() => {
              setOrbStatus('idle')
            }, 3000)
          }
        }
      } catch (err) {
        console.error('[Awareness Hook] Error evaluasi:', err)
      } finally {
        isRequestingRef.current = false
      }
    }

    // Loop Utama Polling Telemetri & Event-Driven Trigger
    const pollTimer = setInterval(async () => {
      try {
        const idleSec = await (window.api?.getSystemIdleSeconds?.() || Promise.resolve(0))
        const isAFK = idleSec >= 900 // 15 menit idle

        // Deteksi Sleep State untuk OrbVisualizer
        if (isAFK && !wasAfkRef.current) {
          wasAfkRef.current = true
          window.dispatchEvent(new CustomEvent('mark:sleeping', { detail: { isSleeping: true } }))
        }

        // Deteksi Cross-Device Telegram Tethering (idle > 1 jam)
        if (idleSec >= 3600 && !sentTelegramAfkRef.current) {
          sentTelegramAfkRef.current = true
          if (window.api?.tgBroadcastToAdmins) {
            window.api.tgBroadcastToAdmins(
              'Laptop aman di ruangan, sistem Mark tetap aktif standby.'
            )
          }
        }

        // Deteksi Return from AFK (user kembali menyentuh mouse/keyboard)
        if (!isAFK && wasAfkRef.current) {
          wasAfkRef.current = false
          sentTelegramAfkRef.current = false
          // Trigger wake-up pulse pada orb
          window.dispatchEvent(
            new CustomEvent('mark:sleeping', {
              detail: { isSleeping: false, wakeUpPulse: true }
            })
          )
          // Picu evaluasi awareness seketika (Welcome Back)
          runEvaluation({ isReturnFromAFK: true })
          return
        }

        // Cek Refleksi Harian Tengah Malam (00:00 - 00:15)
        const now = new Date()
        const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
        if (now.getHours() === 0 && lastJournalDateRef.current !== todayKey) {
          lastJournalDateRef.current = todayKey
          try {
            const traits = await getRelationship('owner')
            const allMem = await getAllMemory()
            const actSummaries = (allMem || [])
              .filter((m) => m.type === 'notes' || m.type === 'profile')
              .slice(0, 5)
              .map((m) => m.memory)

            const journalContent = await generateDailyJournalEntry(
              actSummaries,
              traits,
              configRef.current
            )
            if (journalContent) {
              await insertMemory({
                type: 'private_journal',
                summary: `Refleksi Batin Mark - ${now.toLocaleDateString('id-ID')}`,
                memory: journalContent
              })
              window.dispatchEvent(
                new CustomEvent('mark:evaluate-relationship', {
                  detail: { summary: journalContent }
                })
              )
            }
          } catch (jErr) {
            console.warn('[Awareness] Gagal buat catatan harian tengah malam:', jErr)
          }
        }

        // Evaluasi Berkala Normal
        const nowMs = Date.now()
        if (nowMs - lastCheckInRef.current >= MIN_CHECKIN_GAP) {
          runEvaluation()
        }
      } catch (e) {
        console.warn('[useAwareness] Poll error:', e)
      }
    }, CHECKIN_POLL_INTERVAL)

    return () => {
      clearInterval(pollTimer)
    }
  }, [isAwarenessEnabled, setChatData, setOrbStatus])
}
