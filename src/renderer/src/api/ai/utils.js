import { getAllConfig } from '../db'

export const getCurrentTimeInfo = (dateObj = new Date()) => {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
  return dateObj.toLocaleDateString('id-ID', options)
}




let ttsAudioContext = null;

export const playVoice = async (text, onStart, onEnd) => {
  try {
    if (!text || typeof text !== 'string') {
      if (onStart) onStart()
      if (onEnd) onEnd()
      return
    }

    // Bersihkan tag [mood:xxx], format markdown berlebih, dan tag teknis agar tidak terbaca oleh TTS
    const cleanText = text
      .replace(/\[mood:[a-zA-Z_]+\]/gi, '')
      .replace(/```[\s\S]*?```/g, '') // Hapus blok kode
      .replace(/`([^`]+)`/g, '$1') // Bersihkan inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bersihkan bold
      .replace(/\*([^*]+)\*/g, '$1') // Bersihkan italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Bersihkan link
      .replace(/^[\s>#-]+/gm, '') // Bersihkan simbol quote/heading/list di awal baris
      .trim()

    if (!cleanText) {
      if (onStart) onStart()
      if (onEnd) onEnd()
      return
    }

    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    // 1. Minta data audio (base64) ke backend
    const audioBase64 = await window.api.textToSpeech(cleanText, rate, pitch)

    if (audioBase64) {
      // 2. Bikin object Audio baru dari string base64 tadi
      const audio = new Audio(audioBase64)
      audio.crossOrigin = "anonymous"

      // Setup Web Audio API for Intensity Extraction
      if (!ttsAudioContext) {
        ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (ttsAudioContext.state === 'suspended') {
        await ttsAudioContext.resume()
      }

      const source = ttsAudioContext.createMediaElementSource(audio)
      const analyser = ttsAudioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      analyser.connect(ttsAudioContext.destination)

      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)
      let animationId = null

      const updateIntensity = () => {
        if (!window.isMarkSpeaking) return
        analyser.getFloatTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / bufferLength)
        
        // Normalisasi RMS untuk visualisasi (RMS biasanya berkisar antara 0.01 - 0.15)
        const normalized = Math.min(1, Math.max(0, rms - 0.01) * 8)
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: normalized }))
        animationId = requestAnimationFrame(updateIntensity)
      }

      audio.onended = () => {
        window.isMarkSpeaking = false
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
        if (animationId) cancelAnimationFrame(animationId)
        if (onEnd) onEnd()
      }

      // 3. Mainkan!
      window.isMarkSpeaking = true
      await audio.play()
      updateIntensity()
      if (onStart) onStart()
    } else {
      if (onStart) onStart()
      if (onEnd) onEnd()
    }
  } catch (error) {
    console.error('Gagal memutar suara:', error)
    if (window.api && window.api.showNotification) {
      window.api.showNotification('Error TTS', String(error.message || error))
    }
    window.isMarkSpeaking = false
    window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
    if (onStart) onStart()
    if (onEnd) onEnd()
  }
}

// ==========================================
// TELEGRAM UTILS
// ==========================================
export const formatForTelegram = (text) => {
  if (!text) return ''
  return text.trim()
}

// ==========================================
// PLANNING (AGENTIC) FUNCTIONS
// ==========================================
