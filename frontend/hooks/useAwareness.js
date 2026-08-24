import { useEffect, useRef } from 'react'
import { getAllMemory } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse } from '../api/ai/awareness'

const CHECKIN_INTERVAL = 10 * 60 * 1000
const INITIAL_DELAY = 60 * 1000

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
    return shared / Math.min(incomingTokens.size, previousTokens.size) >= 0.45
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

    const checkIn = async () => {
      if (isAgentBusyRef.current || isLoadingRef.current || isRequestingRef.current) return
      
      const now = Date.now()
      // Minimal harus nunggu 9 menit (540,000 ms) dari check-in terakhir buat nge-trigger lagi
      if (now - lastCheckInRef.current < 540000) {
        console.log('[useAwareness] Skip check-in: Belum waktunya (terlalu cepat).')
        return
      }

      try {
        isRequestingRef.current = true
        lastCheckInRef.current = Date.now()
        console.log('[useAwareness] Memulai check-in...')

        const buffer = await window.api.getActivityBuffer()
        if (!buffer || buffer.length < 1) {
          console.log('[useAwareness] Skip check-in: Buffer kosong')
          isRequestingRef.current = false
          return
        }

        console.log('[useAwareness] Mengirim buffer ke AI:', buffer)
        const allMemory = await getAllMemory()
        const memoryRef = await getRelevantMemory('aktivitas user bekerja dan rutinitas', allMemory)

        // Ambil 5 riwayat chat terakhir tanpa status isThinking dll
        const recentChat = (chatDataRef.current || [])
          .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map((m) => ({ role: m.role, content: m.content }))

        console.log('[useAwareness] chatDataRef.current length:', chatDataRef.current?.length);
        console.log('[useAwareness] recentChat extracted:', recentChat);

        // Clear buffer right away so we don't send the exact same bulk again later
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
        console.log('[useAwareness] AI Response:', result)

        // Filter terakhir di UI layer: awareness tidak boleh memparafrase pesan terbaru.
        const recentVisibleMessages = (chatDataRef.current || [])
          .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-8)

        if (
          result.message &&
          isSimilarAwarenessMessage(result.message, recentVisibleMessages)
        ) {
          console.log('[useAwareness] Skip check-in: message terlalu mirip dengan chat terbaru.')
          return
        }

        if (result.should_act || result.autonomous_prompt) {
          if (isLoadingRef.current) {
            console.log(
              '[useAwareness] Skip triggering action karena Mark sedang sibuk (isLoading true)'
            )
            return
          }
          console.log('[useAwareness] Triggering autonomous action!')
          // Push notification
          if (window.api.showNotification && !document.hasFocus() && result.message) {
            window.api.showNotification('Mark', result.message)
          }

          if (result.message && window.api?.tgBroadcastToAdmins) {
            window.api.tgBroadcastToAdmins(`[AWARENESS] *Mark (PC)*:\n${result.message}`)
          }

          // Jika ada perintah autonomus, bypass chat bubble biasa dan langsung eksekusi plan siluman
          if (result.autonomous_prompt && handlePlanningCommandRef.current) {
            handlePlanningCommandRef.current(
              result.autonomous_prompt,
              null,
              true,
              result.message || "Melakukan pengecekan background...",
              { disableTools: false },
              true
            )
          } else if (result.message) {
            // Kalau cuma mau ngomong biasa tanpa ngejalanin plan
            setChatData((prev) => [
              ...prev,
              {
                role: 'ai',
                content: result.message,
                isProactive: true,
                mood: result.mood
              }
            ])
          }

          // Orb nudge animation
          setOrbStatus('nudge')
          setTimeout(() => {
            setOrbStatus('idle')
          }, 3000)
        }
      } catch (err) {
        console.error('[Awareness Hook] Error during check-in:', err)
      } finally {
        isRequestingRef.current = false
      }
    }

    const id = setInterval(checkIn, CHECKIN_INTERVAL)
    const initialTimeout = setTimeout(checkIn, INITIAL_DELAY)

    return () => {
      clearInterval(id)
      clearTimeout(initialTimeout)
    }
  }, [isAwarenessEnabled, setChatData, setOrbStatus]) // Hapus isLoading & isAgentBusy dari deps biar gak keriset mulu
}
