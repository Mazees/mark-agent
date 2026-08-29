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




let ttsAudioContext = null
let currentAudioElement = null

// Bersihkan tag [mood:xxx], format markdown berlebih, dan tag teknis agar tidak terbaca oleh TTS
export const cleanTextForTTS = (text) => {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/\[mood:[a-zA-Z_]+\]/gi, '')
    .replace(/```[\s\S]*?```/g, '') // Hapus blok kode
    .replace(/`([^`]+)`/g, '$1') // Bersihkan inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bersihkan bold
    .replace(/\*([^*]+)\*/g, '$1') // Bersihkan italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Bersihkan link
    .replace(/^[\s>#-]+/gm, '') // Bersihkan simbol quote/heading/list di awal baris
    .trim()
}

/**
 * Speech Queue Manager untuk memutar audio per kalimat secara berurutan,
 * mulus, dan gapless dengan audio pre-buffering.
 */
class SpeechQueueManager {
  constructor() {
    this.queue = []
    this.isPlaying = false
    this.currentAudio = null
    this.activeSessionId = 0
  }

  reset() {
    this.activeSessionId++
    // Bersihkan dan pause semua item di antrean yang mungkin sudah di-preload
    for (const item of this.queue) {
      if (item.audio) {
        try {
          item.audio.pause()
          item.audio.currentTime = 0
          item.audio.src = ''
        } catch (_) {}
      }
    }
    this.queue = []

    if (this.currentAudio) {
      try {
        this.currentAudio.pause()
        this.currentAudio.currentTime = 0
        this.currentAudio.src = ''
      } catch (_) {}
      this.currentAudio = null
    }
    if (currentAudioElement) {
      try {
        currentAudioElement.pause()
        currentAudioElement.currentTime = 0
        currentAudioElement.src = ''
      } catch (_) {}
      currentAudioElement = null
    }

    this.isPlaying = false
    window.isMarkSpeaking = false
    window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
  }

  async preloadItem(item) {
    if (item.audioPromise) return item.audioPromise
    item.audioPromise = (async () => {
      try {
        const config = await getAllConfig()
        const rate = config[0]?.ttsRate ?? 0
        const pitch = config[0]?.ttsPitch ?? 0

        const audioSrc = await window.api.textToSpeech(item.text, rate, pitch)
        if (!audioSrc || item.sessionId !== this.activeSessionId) return null

        const audio = new Audio(audioSrc)
        audio.crossOrigin = 'anonymous'
        audio.preload = 'auto'
        // Picu buffer awal audio di latar belakang
        audio.load()
        item.audio = audio
        return audio
      } catch (err) {
        console.warn('[SpeechQueue] Preload audio failed:', err)
        return null
      }
    })()
    return item.audioPromise
  }

  enqueue(text) {
    const clean = cleanTextForTTS(text)
    if (!clean) return
    const sessionId = this.activeSessionId
    const item = {
      text: clean,
      sessionId,
      audio: null,
      audioPromise: null
    }

    // Segera mulai preload audio di latar belakang
    this.preloadItem(item)
    this.queue.push(item)

    if (!this.isPlaying) {
      this.playNext()
    }
  }

  async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false
      window.isMarkSpeaking = false
      window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
      return
    }

    const item = this.queue.shift()
    if (item.sessionId !== this.activeSessionId) {
      // Abaikan jika sesi bicara sudah di-reset
      this.playNext()
      return
    }

    // Pastikan item berikutnya di queue (jika ada) sedang di-preload
    if (this.queue.length > 0) {
      this.preloadItem(this.queue[0])
    }

    this.isPlaying = true
    try {
      // Dapatkan audio yang sudah di-preload atau tunggu sampai siap
      let audio = item.audio
      if (!audio && item.audioPromise) {
        audio = await item.audioPromise
      } else if (!audio) {
        audio = await this.preloadItem(item)
      }

      if (!audio || item.sessionId !== this.activeSessionId) {
        this.playNext()
        return
      }

      this.currentAudio = audio
      currentAudioElement = audio

      let animationId = null
      let analyser = null
      let dataArray = null
      let bufferLength = 0

      try {
        if (!ttsAudioContext || ttsAudioContext.state === 'closed') {
          ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)()
        }
        if (ttsAudioContext.state === 'suspended') {
          await ttsAudioContext.resume()
        }

        const source = ttsAudioContext.createMediaElementSource(audio)
        analyser = ttsAudioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.4
        source.connect(analyser)
        analyser.connect(ttsAudioContext.destination)

        bufferLength = analyser.frequencyBinCount
        dataArray = new Uint8Array(bufferLength)
      } catch (_) {}

      const updateIntensity = () => {
        if (!window.isMarkSpeaking || !analyser) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength
        const normalized = Math.min(1, Math.max(0, (avg - 8) / 55))
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: normalized }))
        animationId = requestAnimationFrame(updateIntensity)
      }

      const cleanupAndNext = () => {
        if (animationId) cancelAnimationFrame(animationId)
        if (this.currentAudio === audio) {
          this.currentAudio = null
        }
        this.playNext()
      }

      audio.onended = cleanupAndNext
      audio.onerror = cleanupAndNext

      window.isMarkSpeaking = true
      await audio.play()
      if (analyser) updateIntensity()
    } catch (err) {
      console.warn('[SpeechQueue] Error playing segment:', err)
      this.playNext()
    }
  }
}

export const speechQueue = new SpeechQueueManager()

export const playVoice = async (text, onStart, onEnd) => {
  try {
    if (!text || typeof text !== 'string') {
      if (onStart) onStart()
      if (onEnd) onEnd()
      return
    }

    speechQueue.reset()

    // Hentikan pemutaran sebelumnya jika sedang ada suara aktif
    if (currentAudioElement) {
      try {
        currentAudioElement.pause()
        currentAudioElement.currentTime = 0
      } catch (_) {}
      currentAudioElement = null
    }

    const cleanText = cleanTextForTTS(text)
    if (!cleanText) {
      if (onStart) onStart()
      if (onEnd) onEnd()
      return
    }

    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    // 1. Minta stream URL audio ke backend
    const audioSrc = await window.api.textToSpeech(cleanText, rate, pitch)

    if (audioSrc) {
      // 2. Bikin object Audio baru dari stream URL
      const audio = new Audio(audioSrc)
      audio.crossOrigin = 'anonymous'
      currentAudioElement = audio

      let animationId = null
      let analyser = null
      let dataArray = null
      let bufferLength = 0

      // Setup Web Audio API for Intensity Extraction
      try {
        if (!ttsAudioContext || ttsAudioContext.state === 'closed') {
          ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)()
        }
        if (ttsAudioContext.state === 'suspended') {
          await ttsAudioContext.resume()
        }

        const source = ttsAudioContext.createMediaElementSource(audio)
        analyser = ttsAudioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.4
        source.connect(analyser)
        analyser.connect(ttsAudioContext.destination)

        bufferLength = analyser.frequencyBinCount
        dataArray = new Uint8Array(bufferLength)
      } catch (_) {
        // Fallback jika createMediaElementSource terhalang: audio tetap play secara mandiri
      }

      const updateIntensity = () => {
        if (!window.isMarkSpeaking || !analyser) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength
        // Normalisasi 0 - 255 menjadi 0.0 - 1.0 dengan respons dinamis
        const normalized = Math.min(1, Math.max(0, (avg - 8) / 55))
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: normalized }))
        animationId = requestAnimationFrame(updateIntensity)
      }

      audio.onended = () => {
        window.isMarkSpeaking = false
        if (currentAudioElement === audio) {
          currentAudioElement = null
        }
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
        if (animationId) cancelAnimationFrame(animationId)
        if (onEnd) onEnd()
      }

      audio.onerror = (e) => {
        console.warn('[playVoice] Audio playback warning:', e)
        window.isMarkSpeaking = false
        if (currentAudioElement === audio) {
          currentAudioElement = null
        }
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
        if (animationId) cancelAnimationFrame(animationId)
        if (onEnd) onEnd()
      }

      // 3. Mainkan audio seketika
      window.isMarkSpeaking = true
      await audio.play()
      if (analyser) updateIntensity()
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
