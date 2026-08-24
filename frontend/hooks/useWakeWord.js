import { useState, useRef, useEffect, useCallback } from 'react'
import {
  startWebSpeechRecognition,
  stopWebSpeechRecognition,
  isWebSpeechSupported
} from '../api/webSpeech'
import { detectWakeWord } from '../api/wakeWord'
import { playWakeChime } from '../api/audioFeedback'
import { getAllConfig } from '../api/db'

export const useWakeWord = ({
  isInteractiveMicActive = false,
  isAgentBusy = false,
  onWakeWordTriggered // Callback ({ command, wakePhrase })
}) => {
  const [isWakeWordRunning, setIsWakeWordRunning] = useState(false)
  const [wakeWordStatus, setWakeWordStatus] = useState('standby')

  const isEnabledRef = useRef(false)
  const keywordRef = useRef('hey-mark')
  const isPassiveListeningRef = useRef(false)
  const onTriggerRef = useRef(onWakeWordTriggered)
  const isInteractiveMicRef = useRef(isInteractiveMicActive)
  const isAgentBusyRef = useRef(isAgentBusy)

  useEffect(() => {
    onTriggerRef.current = onWakeWordTriggered
  }, [onWakeWordTriggered])

  useEffect(() => {
    isInteractiveMicRef.current = isInteractiveMicActive
    isAgentBusyRef.current = isAgentBusy
  }, [isInteractiveMicActive, isAgentBusy])

  const stopPassiveListener = useCallback(() => {
    if (isPassiveListeningRef.current) {
      console.log('[WakeWord] Stopping passive listener...')
      stopWebSpeechRecognition()
      isPassiveListeningRef.current = false
      setIsWakeWordRunning(false)
      setWakeWordStatus('standby')
    }
  }, [])

  const startPassiveListener = useCallback(async () => {
    if (!isEnabledRef.current) return
    if (isInteractiveMicRef.current || isAgentBusyRef.current || window.isMarkSpeaking) {
      stopPassiveListener()
      return
    }
    if (isPassiveListeningRef.current) return
    if (!isWebSpeechSupported()) return

    isPassiveListeningRef.current = true
    setIsWakeWordRunning(true)
    setWakeWordStatus('listening_wake_word')
    console.log('[WakeWord] Passive listener started. Listening for wake keyword:', keywordRef.current)

    startWebSpeechRecognition({
      lang: 'id-ID',
      continuous: true,
      onInterim: (interim) => {
        if (!isEnabledRef.current || !isPassiveListeningRef.current) return
        if (window.isMarkSpeaking || isInteractiveMicRef.current || isAgentBusyRef.current) return

        console.log('[WakeWord] Interim heard:', interim)
        const result = detectWakeWord(interim, keywordRef.current)
        if (result.detected) {
          console.log('[WakeWord] Wake word detected in interim!', result)
          stopPassiveListener()
          playWakeChime()
          if (onTriggerRef.current) {
            onTriggerRef.current({
              command: result.command,
              wakePhrase: result.wakePhrase
            })
          }
        }
      },
      onResult: (finalText) => {
        if (!isEnabledRef.current || !isPassiveListeningRef.current) return
        if (window.isMarkSpeaking || isInteractiveMicRef.current || isAgentBusyRef.current) return

        console.log('[WakeWord] Final speech heard:', finalText)
        const result = detectWakeWord(finalText, keywordRef.current)
        if (result.detected) {
          console.log('[WakeWord] Wake word detected in final!', result)
          stopPassiveListener()
          playWakeChime()
          if (onTriggerRef.current) {
            onTriggerRef.current({
              command: result.command,
              wakePhrase: result.wakePhrase
            })
          }
        }
      },
      onError: (err) => {
        if (err.message !== 'no-speech' && err.message !== 'aborted') {
          console.warn('[WakeWord] Passive listener error:', err.message)
        }
      },
      onEnd: () => {
        isPassiveListeningRef.current = false
        setIsWakeWordRunning(false)

        // Loop continuous listening saat dalam mode standby (selama Mark tidak bicara dan mic utama mati)
        if (
          isEnabledRef.current &&
          !isInteractiveMicRef.current &&
          !isAgentBusyRef.current &&
          !window.isMarkSpeaking
        ) {
          setTimeout(() => {
            if (
              isEnabledRef.current &&
              !isInteractiveMicRef.current &&
              !isAgentBusyRef.current &&
              !window.isMarkSpeaking
            ) {
              startPassiveListener()
            }
          }, 800)
        }
      }
    })
  }, [stopPassiveListener])

  // Muat konfigurasi Wake Word dari DB atau Event
  const refreshWakeWordConfig = useCallback(
    async (event) => {
      try {
        if (event?.detail && typeof event.detail.enabled === 'boolean') {
          const enabled = event.detail.enabled
          const keyword = event.detail.keyword || 'hey-mark'
          isEnabledRef.current = enabled
          keywordRef.current = keyword
          console.log('[WakeWord] Config updated via event:', { enabled, keyword })

          if (enabled && !isInteractiveMicRef.current && !isAgentBusyRef.current && !window.isMarkSpeaking) {
            startPassiveListener()
          } else {
            stopPassiveListener()
          }
          return
        }

        const config = await getAllConfig()
        const cfg = config[0]
        const enabled = Boolean(cfg?.wakeWordEnabled)
        const keyword = cfg?.wakeWordKeyword || 'hey-mark'

        isEnabledRef.current = enabled
        keywordRef.current = keyword
        console.log('[WakeWord] Config loaded from DB:', { enabled, keyword })

        if (enabled && !isInteractiveMicRef.current && !isAgentBusyRef.current && !window.isMarkSpeaking) {
          startPassiveListener()
        } else {
          stopPassiveListener()
        }
      } catch (e) {
        console.warn('[WakeWord] Failed to load config:', e)
      }
    },
    [startPassiveListener, stopPassiveListener]
  )

  // Dengarkan saat Mark selesai berbicara atau menjawab untuk re-arm Wake Word
  useEffect(() => {
    const handleReArm = () => {
      if (isEnabledRef.current && !isInteractiveMicRef.current) {
        setTimeout(() => {
          if (isEnabledRef.current && !isInteractiveMicRef.current && !window.isMarkSpeaking) {
            console.log('[WakeWord] Re-arming passive listener after speech/plan...')
            startPassiveListener()
          }
        }, 500)
      }
    }

    const handleSpeechStart = () => {
      stopPassiveListener()
    }

    window.addEventListener('mark-speaking-ended', handleReArm)
    window.addEventListener('mark-plan-completed', handleReArm)
    window.addEventListener('mark-speaking-started', handleSpeechStart)
    window.addEventListener('wake-word-config-changed', refreshWakeWordConfig)

    return () => {
      window.removeEventListener('mark-speaking-ended', handleReArm)
      window.removeEventListener('mark-plan-completed', handleReArm)
      window.removeEventListener('mark-speaking-started', handleSpeechStart)
      window.removeEventListener('wake-word-config-changed', refreshWakeWordConfig)
    }
  }, [refreshWakeWordConfig, startPassiveListener, stopPassiveListener])

  // Perubahan kondisi Mic Interaktif / Agent Busy
  useEffect(() => {
    if (isInteractiveMicActive || isAgentBusy) {
      stopPassiveListener()
    } else if (isEnabledRef.current && !window.isMarkSpeaking) {
      setTimeout(() => {
        if (!isInteractiveMicRef.current && !isAgentBusyRef.current && !window.isMarkSpeaking) {
          startPassiveListener()
        }
      }, 400)
    }
  }, [isInteractiveMicActive, isAgentBusy, startPassiveListener, stopPassiveListener])

  // Inisialisasi saat mount
  useEffect(() => {
    refreshWakeWordConfig()
    return () => stopPassiveListener()
  }, [refreshWakeWordConfig, stopPassiveListener])

  return {
    isWakeWordRunning,
    wakeWordStatus,
    refreshWakeWordConfig
  }
}
