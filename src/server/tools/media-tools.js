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
 * @returns {Promise<{ filePath: string, audioBase64: string }>}
 */
export async function synthesizeTTS(text, voice = 'id-ID-ArdiNeural') {
  if (!text || !text.trim()) throw new Error('Teks kosong untuk TTS')

  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

  const fileName = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`
  const filePath = path.join(TEMP_DIR, fileName)

  const writable = fs.createWriteStream(filePath)
  const readable = tts.toStream(text)

  await new Promise((resolve, reject) => {
    readable.pipe(writable)
    writable.on('finish', resolve)
    writable.on('error', reject)
  })

  const buffer = fs.readFileSync(filePath)
  const audioBase64 = buffer.toString('base64')

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
