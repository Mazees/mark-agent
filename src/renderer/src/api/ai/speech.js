import { getAllConfig } from '../db'
import { stripMarkTags } from '@shared/parsers/mark-tag-parser.js'

export const cleanTextForTTS = (text) => {
  if (!text || typeof text !== 'string') return ''
  return stripMarkTags(text)
    .replace(/(?:<mic>|\(Mikrofon\))/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[\s>#-]+/gm, '')
    .trim()
}

let audioContext = null
const intensity = (value) =>
  window.dispatchEvent(new CustomEvent('mark-intensity', { detail: value }))

// One completion path prevents onerror and play() rejection from advancing the queue twice.
async function playSegment(audio, signal, onStart) {
  let source, analyser, frame
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) {
      if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext()
      if (audioContext.state === 'suspended') await audioContext.resume()
      signal.throwIfAborted()
      source = audioContext.createMediaElementSource(audio)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      analyser.connect(audioContext.destination)
    }
  } catch (error) {
    if (signal.aborted) throw error
  }
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (error) => {
      if (finished) return
      finished = true
      audio.onended = null
      audio.onerror = null
      signal.removeEventListener('abort', abort)
      if (frame != null) cancelAnimationFrame(frame)
      source?.disconnect()
      analyser?.disconnect()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      window.isMarkSpeaking = false
      intensity(0)
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(signal.reason || new DOMException('Dibatalkan', 'AbortError'))
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    const animate = () => {
      if (finished || !analyser) return
      analyser.getByteFrequencyData(data)
      const average = data.reduce((sum, value) => sum + value, 0) / data.length
      intensity(Math.min(1, Math.max(0, (average - 8) / 55)))
      frame = requestAnimationFrame(animate)
    }
    audio.onended = () => finish()
    audio.onerror = () => {
      const error = new Error('Audio Edge TTS tidak dapat diputar.')
      error.playbackStarted = audio.currentTime > 0
      finish(error)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) return abort()
    Promise.resolve()
      .then(() => audio.play())
      .then(() => {
        if (finished) return
        window.isMarkSpeaking = true
        intensity(0)
        onStart?.()
        animate()
      })
      .catch(finish)
  })
}

class SpeechQueueManager {
  constructor() {
    this.queue = []
    this.activeSessionId = 0
    this.sourceSessionId = '1'
    this.controller = new AbortController()
    this.isPlaying = false
    this.settings = null
    this.failed = false
    this.hasQueued = false
  }

  reset(sessionId = '1') {
    this.controller.abort()
    this.controller = new AbortController()
    this.activeSessionId++
    this.sourceSessionId = String(sessionId)
    window.markSpeakingSessionId = this.sourceSessionId
    for (const item of this.queue) {
      item.audio?.pause()
      if (item.audio) {
        item.audio.removeAttribute('src')
        item.audio.load()
      }
      item.resolve(false)
    }
    this.queue = []
    this.isPlaying = false
    this.settings = null
    this.failed = false
    this.hasQueued = false
    window.isMarkSpeaking = false
    intensity(0)
  }

  preloadItem(item) {
    if (item.audioPromise) return item.audioPromise
    const settings = this.settings
    item.audioPromise = (async () => {
      try {
        const { rate, pitch, voice } = await settings
        if (item.generation !== this.activeSessionId) return null
        const url = await window.api.textToSpeech(item.text, rate, pitch, voice)
        if (item.generation !== this.activeSessionId || !url) return null
        const audio = new Audio(url)
        audio.crossOrigin = 'anonymous'
        audio.preload = 'auto'
        audio.load()
        item.audio = audio
        return audio
      } catch (error) {
        item.error = error
        return null
      }
    })()
    return item.audioPromise
  }

  enqueue(text, callbacks = {}) {
    const clean = cleanTextForTTS(text)
    if (!clean || this.failed) return Promise.resolve(false)
    this.hasQueued = true
    if (!this.settings)
      this.settings = getAllConfig().then((config) => ({
        rate: config[0]?.ttsRate ?? 10,
        pitch: config[0]?.ttsPitch ?? 55,
        voice: config[0]?.ttsVoice || 'id-ID-ArdiNeural'
      }))
    return new Promise((resolve) => {
      const item = { text: clean, generation: this.activeSessionId, resolve, callbacks }
      this.queue.push(item)
      // Only the current sentence and its immediate successor may preload.
      if (this.queue.length === 1) this.preloadItem(item)
      if (!this.isPlaying) void this.playNext()
    })
  }

  async playNext() {
    if (this.isPlaying) return
    this.isPlaying = true
    const generation = this.activeSessionId
    const signal = this.controller.signal
    while (this.queue.length && generation === this.activeSessionId) {
      const item = this.queue.shift()
      if (this.queue.length) this.preloadItem(this.queue[0])
      let success = false,
        failure = null
      for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
        try {
          const audio = await this.preloadItem(item)
          signal.throwIfAborted()
          if (!audio) throw item.error || new Error('Audio Edge TTS belum tersedia.')
          this.currentAudio = audio
          window.markSpeakingSessionId = this.sourceSessionId
          await playSegment(audio, signal, item.callbacks.onStart)
          success = true
          break
        } catch (error) {
          failure = error
          item.audioPromise = null
          item.audio = null
          if (signal.aborted || error.playbackStarted || error.name === 'NotAllowedError') break
        }
      }
      item.resolve(success)
      item.callbacks.onEnd?.()
      if (generation !== this.activeSessionId) return
      this.currentAudio = null
      if (!success) {
        this.failed = true
        for (const pending of this.queue) {
          pending.audio?.pause()
          if (pending.audio) {
            pending.audio.removeAttribute('src')
            pending.audio.load()
          }
          pending.resolve(false)
        }
        this.queue = []
        this.activeSessionId++
        console.warn('[SpeechQueue] Pemutaran dihentikan:', failure?.message)
        window.dispatchEvent(
          new CustomEvent('mark-tts-error', {
            detail: {
              sessionId: this.sourceSessionId,
              message:
                'Suara Mark terhenti karena audio tidak dapat diputar. Jawaban tetap tersedia di percakapan.'
            }
          })
        )
        break
      }
    }
    this.isPlaying = false
    window.isMarkSpeaking = false
    intensity(0)
  }
}

export const speechQueue = new SpeechQueueManager()

export async function playVoice(text, onStart, onEnd, sessionId = '1') {
  speechQueue.reset(sessionId)
  return speechQueue.enqueue(text, { onStart, onEnd })
}
