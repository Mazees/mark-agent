import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { Readable } from 'stream'
import ytSearch from 'yt-search'
import { YoutubeTranscript } from 'youtube-transcript-plus'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Patch MsEdgeTTS prototype to prevent unhandled crashes when streams close prematurely,
// when connections are rejected, or when WebSocket events throw without handler.
if (!MsEdgeTTS.__mark_patched) {
  MsEdgeTTS.__mark_patched = true

  MsEdgeTTS.prototype._pushAudioData = function (data, requestId) {
    if (this._streams && this._streams[requestId] && this._streams[requestId].audio) {
      try {
        if (!this._streams[requestId].audio.destroyed) {
          this._streams[requestId].audio.push(data)
        }
      } catch (_) {}
    }
  }

  MsEdgeTTS.prototype._pushMetadata = function (data, requestId) {
    if (this._streams && this._streams[requestId] && this._streams[requestId].metadata) {
      try {
        if (!this._streams[requestId].metadata.destroyed) {
          this._streams[requestId].metadata.push(data)
        }
      } catch (_) {}
    }
  }

  // Override _rawSSMLRequest with explicit catch handler on _send() to eliminate UnhandledPromiseRejection
  MsEdgeTTS.prototype._rawSSMLRequest = function (requestSSML) {
    this._metadataCheck()
    const requestId = MsEdgeTTS.randomHex(16)
    const request =
      `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
      requestSSML.trim()
    const self = this
    const audioStream = new Readable({
      read() {},
      destroy(error, callback) {
        delete self._streams[requestId]
        if (typeof callback === 'function') callback(error)
      }
    })
    const metadataStream = this._hasMetadataBoundaries()
      ? new Readable({
          read() {},
          destroy(error, callback) {
            delete self._streams[requestId]
            if (typeof callback === 'function') callback(error)
          }
        })
      : null

    audioStream.on('error', () => {
      audioStream.destroy()
      metadataStream?.destroy()
    })
    audioStream.once('close', () => {
      audioStream.destroy()
      metadataStream?.destroy()
    })

    this._streams[requestId] = {
      audio: audioStream,
      metadata: metadataStream
    }

    // Attach catch handler directly to eliminate UnhandledPromiseRejection and pipe error to audioStream
    this._send(request).catch((err) => {
      const errMsg = typeof err === 'string' ? err : err?.message || 'TTS connection failed'
      if (!audioStream.destroyed) {
        audioStream.destroy(new Error(errMsg))
      }
    })

    return { audioStream, metadataStream, requestId }
  }

  const originalInitClient = MsEdgeTTS.prototype._initClient
  MsEdgeTTS.prototype._initClient = async function () {
    try {
      const res = await originalInitClient.apply(this, arguments)
      if (this._ws) {
        const origOnMessage = this._ws.onmessage
        this._ws.onmessage = (m) => {
          try {
            const buffer = Buffer.from(m.data)
            const message = buffer.toString()
            const match = /X-RequestId:(.*?)\r\n/gm.exec(message)
            const requestId = match ? match[1] : null

            if (message.includes('Path:turn.end') && requestId) {
              if (this._streams && this._streams[requestId] && this._streams[requestId].audio) {
                try {
                  if (!this._streams[requestId].audio.destroyed) {
                    this._streams[requestId].audio.push(null)
                  }
                } catch (_) {}
              }
              return
            }

            if (origOnMessage) {
              origOnMessage.call(this._ws, m)
            }
          } catch (_) {
            // Ignore unparseable or orphaned socket packets
          }
        }
      }
      return res
    } catch (connectErr) {
      const msg =
        typeof connectErr === 'string' ? connectErr : connectErr?.message || 'TTS connection failed'
      throw new Error(msg)
    }
  }
}

const TEMP_DIR = path.join(os.tmpdir(), 'mark-audio')
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

/**
 * Menghasilkan readable stream audio langsung untuk HTTP response streaming.
 * Menggunakan instance terisolasi per permintaan dengan penutupan socket otomatis
 * agar tahan terhadap idle timeout dan permintaan kalimat paralel.
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

  const tts = new MsEdgeTTS()
  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const streamObj = tts.toStream(text, { rate: rateStr, pitch: pitchStr })

  const cleanup = () => {
    try {
      tts.close()
    } catch (_) {}
  }

  streamObj.audioStream.once('end', cleanup)
  streamObj.audioStream.once('close', cleanup)
  streamObj.audioStream.once('error', cleanup)

  return streamObj.audioStream
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
 * Mengambil transkrip dari video YouTube
 * @param {string} url
 * @param {string} [lang='id']
 */
export async function getTranscript(url, lang = 'id') {
  if (!url || typeof url !== 'string') return ''
  try {
    const transcriptList = await YoutubeTranscript.fetchTranscript(url, { lang })
    if (transcriptList && transcriptList.length > 0) {
      return transcriptList.map((t) => t.text).join(' ')
    }
    // Fallback tanpa filter bahasa jika bahasa target tidak tersedia
    const fallbackList = await YoutubeTranscript.fetchTranscript(url)
    return fallbackList.map((t) => t.text).join(' ')
  } catch (err) {
    console.warn('[YouTube Transcript] Gagal mengambil transkrip:', err?.message || err)
    return `Gagal mengambil transkrip video: ${err?.message || 'Video tidak memiliki transkrip atau dibatasi'}`
  }
}
