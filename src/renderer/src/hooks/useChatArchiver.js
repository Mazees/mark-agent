import { useEffect, useRef } from 'react'
import { indexSingleTurn } from '../api/turnPairMigrator'

export const useChatArchiver = ({
  chatData,
  activeTopic,
  isLoading,
  sessionId = 1
}) => {
  const currentSessionId = sessionId || 1
  const wasLoadingRef = useRef(false)
  const lastIndexedPairIdRef = useRef(null)

  useEffect(() => {
    // Deteksi transisi ketika Mark selesai merespons (isLoading: true -> false)
    const justFinishedLoading = wasLoadingRef.current && !isLoading
    wasLoadingRef.current = isLoading

    if (justFinishedLoading && Array.isArray(chatData) && chatData.length >= 2) {
      // Cari pesan balasan AI terakhir yang valid
      let lastAiMsg = null
      let userMsg = null

      for (let i = chatData.length - 1; i >= 0; i--) {
        const msg = chatData[i]
        if (!msg) continue
        if (!lastAiMsg && msg.role === 'ai' && !msg.isThinking && !msg.isSearching && !msg.isSummarizing) {
          lastAiMsg = msg
          // Cari pesan user sebelum pesan AI ini
          for (let j = i - 1; j >= 0; j--) {
            if (chatData[j]?.role === 'user') {
              userMsg = chatData[j]
              break
            }
          }
          break
        }
      }

      if (userMsg && lastAiMsg) {
        const turnKey = `${currentSessionId}-${userMsg.timestamp || ''}-${lastAiMsg.timestamp || ''}`
        if (lastIndexedPairIdRef.current !== turnKey) {
          lastIndexedPairIdRef.current = turnKey
          // Index secara instan di background
          indexSingleTurn(currentSessionId, activeTopic, userMsg, lastAiMsg).catch((err) => {
            console.warn('[useChatArchiver] Realtime indexSingleTurn error:', err)
          })
        }
      }
    }
  }, [chatData, activeTopic, isLoading, currentSessionId])
}
