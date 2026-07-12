import { useEffect, useRef } from 'react'
import { getAllMemory } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse } from '../api/ai/awareness'
import { analyzeImage } from '../api/vision'

const CHECKIN_INTERVAL = 10 * 60 * 1000
const INITIAL_DELAY = 60 * 1000

export const useAwareness = ({ isLoading, isAgentBusy, setChatData, setOrbStatus, config, chatData, handlePlanningCommand, currentMusicTrack }) => {
  const isRequestingRef = useRef(false)
  const chatDataRef = useRef(chatData)
  const configRef = useRef(config)
  const handlePlanningCommandRef = useRef(handlePlanningCommand)
  const currentMusicTrackRef = useRef(currentMusicTrack)
  const isLoadingRef = useRef(isLoading)
  const isAgentBusyRef = useRef(isAgentBusy)

  useEffect(() => {
    chatDataRef.current = chatData
    configRef.current = config
    handlePlanningCommandRef.current = handlePlanningCommand
    currentMusicTrackRef.current = currentMusicTrack
    isLoadingRef.current = isLoading
    isAgentBusyRef.current = isAgentBusy
  }, [chatData, config, handlePlanningCommand, currentMusicTrack, isLoading, isAgentBusy])

  const isAwarenessEnabled = config?.[0]?.awarenessEnabled !== false;

  useEffect(() => {
    if (!isAwarenessEnabled) return;
    if (isLoading || isAgentBusy) return;

    const checkIn = async () => {
      if (isAgentBusyRef.current || isLoadingRef.current || isRequestingRef.current) return

      try {
        isRequestingRef.current = true
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
          .filter(m => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map(m => ({ role: m.role, content: m.content }))

        // Clear buffer right away so we don't send the exact same bulk again later
        if (window.api.clearActivityBuffer) {
          window.api.clearActivityBuffer()
        }

        let visionDescription = ""
        try {
          const screens = await window.api.takeScreenshot()
          if (screens && screens.length > 0) {
            console.log(`[useAwareness] Menganalisis ${screens.length} screenshot layar...`)
            for (let i = 0; i < screens.length; i++) {
              const screenDesc = await analyzeImage(screens[i].data, "Describe what the user is doing on their computer screen right now.")
              visionDescription += `[Layar ${screens[i].name}]: ${screenDesc}\n`
            }
            console.log('[useAwareness] Hasil Vision:', visionDescription)
          }
        } catch (e) {
          console.error('[useAwareness] Error saat memproses screenshot:', e)
        }

        const result = await getAwarenessResponse(
          buffer, 
          memoryRef, 
          configRef.current, 
          recentChat, 
          currentMusicTrackRef.current,
          visionDescription
        )
        console.log('[useAwareness] AI Response:', result)

        if (result.should_act && result.message) {
          if (isLoadingRef.current) {
            console.log('[useAwareness] Skip triggering action karena Mark sedang sibuk (isLoading true)')
            return
          }
          console.log('[useAwareness] Triggering autonomous action!')
          // Push notification
          if (window.api.showNotification && !document.hasFocus()) {
            window.api.showNotification('Mark', result.message)
          }

          // Jika ada perintah autonomus, bypass chat bubble biasa dan langsung eksekusi plan siluman
          if (result.autonomous_prompt && handlePlanningCommandRef.current) {
             handlePlanningCommandRef.current(result.autonomous_prompt, null, true, result.message, {}, true)
          } else {
             // Kalau cuma mau ngomong biasa tanpa ngejalanin plan
             setChatData(prev => [...prev, {
               role: 'ai',
               content: result.message,
               isProactive: true,
               mood: result.mood
             }])
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
  }, [isLoading, isAgentBusy, isAwarenessEnabled, setChatData, setOrbStatus])
}
