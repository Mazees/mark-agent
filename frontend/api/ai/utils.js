import { getAllConfig } from '../db'

export const getCurrentTimeInfo = () => {
  const now = new Date()
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ]

  const dayName = days[now.getDay()]
  const date = now.getDate()
  const monthName = months[now.getMonth()]
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return `Hari ${dayName}, Tanggal ${date} ${monthName} ${year}, Jam ${hours}:${minutes} WIB`
}

export const formatForTelegram = (text) => {
  if (!text) return ''
  return text
}

let ttsAudioContext = null

export const playVoice = async (text, onStart, onEnd) => {
  try {
    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    // Bersihkan format markdown dan tag khusus agar teks yang dibacakan alami
    const cleanSpeechText = (text || '')
      .replace(/```[\s\S]*?```/g, '') // Hapus blok kode
      .replace(/`([^`]+)`/g, '$1') // Hapus inline code backticks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Ambil teks dari link markdown [teks](url)
      .replace(/[*_~#>[\]()]/g, '') // Hapus simbol markdown
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleanSpeechText) {
      if (onStart) onStart()
      if (onEnd) onEnd()
      return
    }

    // 1. Minta data audio (base64) ke Node.js backend
    const rawAudio = await window.api.textToSpeech(cleanSpeechText, rate, pitch)
    const audioBase64 = typeof rawAudio === 'string' ? rawAudio : rawAudio?.data || rawAudio?.audio || ''

    if (audioBase64 && typeof audioBase64 === 'string') {
      // 2. Ubah data base64 menjadi ArrayBuffer murni
      const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '')
      const binaryString = atob(base64Data)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // 3. Setup Web Audio API
      if (!ttsAudioContext) {
        ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (ttsAudioContext.state === 'suspended') {
        await ttsAudioContext.resume()
      }

      // 4. Decode MP3 audio buffer
      const audioBuffer = await ttsAudioContext.decodeAudioData(bytes.buffer.slice(0))
      const source = ttsAudioContext.createBufferSource()
      source.buffer = audioBuffer

      // 5. Sambungkan ke AnalyserNode untuk ekstraksi visualisasi intensitas suara
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

        // Normalisasi RMS untuk visualisasi (berkisar antara 0.01 - 0.15)
        const normalized = Math.min(1, Math.max(0, rms - 0.01) * 8)
        window.dispatchEvent(new CustomEvent('mark-intensity', { detail: normalized }))
        animationId = requestAnimationFrame(updateIntensity)
      }

      window.isMarkSpeaking = true
      window.dispatchEvent(new CustomEvent('mark-speaking-started'))
      if (onStart) onStart()

      // 6. Mainkan dan tunggu sampai audio selesai diputar
      await new Promise((resolve) => {
        source.onended = () => {
          window.isMarkSpeaking = false
          window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
          window.dispatchEvent(new CustomEvent('mark-speaking-ended'))
          if (animationId) cancelAnimationFrame(animationId)
          if (onEnd) onEnd()
          resolve()
        }
        source.start(0)
        updateIntensity()
      })
    } else {
      window.dispatchEvent(new CustomEvent('mark-speaking-ended'))
      if (onStart) onStart()
      if (onEnd) onEnd()
    }
  } catch (error) {
    console.error('[playVoice] Gagal memutar suara TTS:', error)
    window.isMarkSpeaking = false
    window.dispatchEvent(new CustomEvent('mark-intensity', { detail: 0 }))
    window.dispatchEvent(new CustomEvent('mark-speaking-ended'))
    if (onStart) onStart()
    if (onEnd) onEnd()
  }
}
