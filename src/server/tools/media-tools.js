import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import ytSearch from 'yt-search'
import { YoutubeTranscript } from 'youtube-transcript-plus'
import path from 'path'
import os from 'os'
import fs from 'fs'

const TEMP_DIR = path.join(os.tmpdir(), 'mark-audio')
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

let persistentTTSInstance = null
let currentConfiguredVoice = null

/**
 * Mendapatkan instance MsEdgeTTS persistent dengan voice yang sudah ter-setup
 * @param {string} voice
 */
async function getOrCreateTTSInstance(voice = 'id-ID-ArdiNeural') {
  if (!persistentTTSInstance || currentConfiguredVoice !== voice) {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    persistentTTSInstance = tts
    currentConfiguredVoice = voice
  }
  return persistentTTSInstance
}

/**
 * Menghasilkan readable stream audio langsung untuk HTTP response streaming
 * @param {string} text
 * @param {string} [voice='id-ID-ArdiNeural']
 * @param {number|string} [rate=0]
 * @param {number|string} [pitch=0]
 */
export async function streamTTS(text, voice = 'id-ID-ArdiNeural', rate = 0, pitch = 0) {
  if (!text || !text.trim()) throw new Error('Teks kosong untuk TTS')

  let selectedVoice = 'id-ID-ArdiNeural'
  if (typeof voice === 'string' && voice.trim() && !/^-?\d+$/.test(voice.trim())) {
    selectedVoice = voice.trim()
  }

  const numRate = typeof rate === 'number' ? rate : parseInt(rate, 10) || 0
  const numPitch = typeof pitch === 'number' ? pitch : parseInt(pitch, 10) || 0
  const rateStr = numRate >= 0 ? `+${numRate}%` : `${numRate}%`
  const pitchStr = numPitch >= 0 ? `+${numPitch}Hz` : `${numPitch}Hz`

  try {
    const tts = await getOrCreateTTSInstance(selectedVoice)
    const streamObj = tts.toStream(text, { rate: rateStr, pitch: pitchStr })
    return streamObj.audioStream
  } catch (err) {
    // Retry sekali jika socket terputus/stale
    persistentTTSInstance = null
    currentConfiguredVoice = null
    const tts = await getOrCreateTTSInstance(selectedVoice)
    const streamObj = tts.toStream(text, { rate: rateStr, pitch: pitchStr })
    return streamObj.audioStream
  }
}

/**
 * Sintesis suara menggunakan Microsoft Edge TTS (Buffer RAM langsung tanpa disk write)
 * @param {string} text
 * @param {string} [voice='id-ID-ArdiNeural']
 * @param {number|string} [rate=0]
 * @param {number|string} [pitch=0]
 * @returns {Promise<{ filePath: string, audioBase64: string }>}
 */
export async function synthesizeTTS(text, voice = 'id-ID-ArdiNeural', rate = 0, pitch = 0) {
  if (!text || !text.trim()) throw new Error('Teks kosong untuk TTS')

  let selectedVoice = 'id-ID-ArdiNeural'
  if (typeof voice === 'string' && voice.trim() && !/^-?\d+$/.test(voice.trim())) {
    selectedVoice = voice.trim()
  }

  const audioStream = await streamTTS(text, selectedVoice, rate, pitch)
  const chunks = []

  await new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk))
    audioStream.on('end', resolve)
    audioStream.on('error', reject)
  })

  const buffer = Buffer.concat(chunks)
  const audioBase64 = `data:audio/mp3;base64,${buffer.toString('base64')}`

  return { filePath: '', audioBase64 }
}

/**
 * Cari video atau musik YouTube
 * @param {string} query
 */
export async function searchYoutube(query) {
  if (!query) return []
  const result = await ytSearch(query)
  return result.videos.slice(0, 10).map((v) => ({
    id: v.videoId,
    videoId: v.videoId,
    title: v.title,
    url: v.url,
    timestamp: v.timestamp,
    seconds: v.seconds,
    views: v.views,
    author: v.author?.name || 'Unknown Artist',
    artist: v.author?.name || 'Unknown Artist',
    thumbnail: v.thumbnail || v.image || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`
  }))
}

/**
 * Ambil transkrip video YouTube
 * @param {string} url
 */
export async function getTranscript(url) {
  if (!url) return ''
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url)
    return transcript.map((t) => t.text).join(' ')
  } catch (err) {
    throw new Error(`Gagal mengambil transkrip: ${err.message}`)
  }
}
