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

/**
 * Sintesis suara menggunakan Microsoft Edge TTS
 * @param {string} text
 * @param {string} [voice='id-ID-ArdiNeural']
 * @param {number|string} [rate=0]
 * @param {number|string} [pitch=0]
 * @returns {Promise<{ filePath: string, audioBase64: string }>}
 */
export async function synthesizeTTS(text, voice = 'id-ID-ArdiNeural', rate = 0, pitch = 0) {
  if (!text || !text.trim()) throw new Error('Teks kosong untuk TTS')

  // Pastikan voice selalu berupa string voice name valid (misal 'id-ID-ArdiNeural')
  let selectedVoice = 'id-ID-ArdiNeural'
  if (typeof voice === 'string' && voice.trim() && !/^-?\d+$/.test(voice.trim())) {
    selectedVoice = voice.trim()
  }

  const tts = new MsEdgeTTS()
  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

  const fileName = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`
  const filePath = path.join(TEMP_DIR, fileName)

  // Format rate & pitch prosody options
  const numRate = typeof rate === 'number' ? rate : parseInt(rate, 10) || 0
  const numPitch = typeof pitch === 'number' ? pitch : parseInt(pitch, 10) || 0
  const rateStr = numRate >= 0 ? `+${numRate}%` : `${numRate}%`
  const pitchStr = numPitch >= 0 ? `+${numPitch}Hz` : `${numPitch}Hz`

  const streamObj = tts.toStream(text, { rate: rateStr, pitch: pitchStr })
  const chunks = []

  await new Promise((resolve, reject) => {
    streamObj.audioStream.on('data', (chunk) => chunks.push(chunk))
    streamObj.audioStream.on('end', resolve)
    streamObj.audioStream.on('error', reject)
  })

  const buffer = Buffer.concat(chunks)
  fs.writeFileSync(filePath, buffer)
  const audioBase64 = `data:audio/mp3;base64,${buffer.toString('base64')}`

  return { filePath, audioBase64 }
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
