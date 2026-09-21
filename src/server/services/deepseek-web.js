/**
 * DeepSeek Web RPC Engine for MARK Node.js Core
 * Reverse-engineered chat.deepseek.com client with native WASM PoW Solver
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const DEEPSEEK_WEB_MODELS = {
  'deepseek-chat': {
    modelType: 'default',
    thinking: false,
    search: false,
    name: 'deepseek-chat',
    desc: 'DeepSeek-V3/Chat model cepat & responsif'
  }
}

const BASE_HOST = 'chat.deepseek.com'

let wasmInstanceCache = null
const activeSessionCache = new Map()
const utilitySessionCache = new Map()
const sessionStateMap = new Map() // sessionId -> { lastMessageId, turnCount, createdAt, lastUsedAt }
let lastUsedToken = null

export function getSessionCacheKey(token, markSessionId = '1', isSmallTask = false) {
  const prefix = isSmallTask ? 'util_' : 'sess_'
  return `${token}:${prefix}${markSessionId || '1'}`
}

function ensureTokenSession(token) {
  // Jika token berubah, clear session cache lama
  if (lastUsedToken !== token) {
    if (lastUsedToken) {
      clearDeepSeekSession(lastUsedToken)
    }
    lastUsedToken = token
  }
}

export function clearDeepSeekSession(token = null, markSessionId = null) {
  if (token) {
    if (markSessionId) {
      for (const isSmall of [false, true]) {
        const cache = isSmall ? utilitySessionCache : activeSessionCache
        const key = getSessionCacheKey(token, markSessionId, isSmall)
        const sId = cache.get(key)
        if (sId) sessionStateMap.delete(sId)
        cache.delete(key)
      }
    } else {
      for (const [key, sId] of [...activeSessionCache.entries()]) {
        if (key.startsWith(`${token}:`)) {
          sessionStateMap.delete(sId)
          activeSessionCache.delete(key)
        }
      }
      for (const [key, sId] of [...utilitySessionCache.entries()]) {
        if (key.startsWith(`${token}:`)) {
          sessionStateMap.delete(sId)
          utilitySessionCache.delete(key)
        }
      }
    }
  } else {
    activeSessionCache.clear()
    utilitySessionCache.clear()
    sessionStateMap.clear()
  }
}

export function getSessionState(token, isSmallTask = false, markSessionId = '1') {
  const cache = isSmallTask ? utilitySessionCache : activeSessionCache
  const key = getSessionCacheKey(token, markSessionId, isSmallTask)
  const sessionId = cache.get(key)
  if (!sessionId) return null
  return sessionStateMap.get(sessionId) || null
}

/**
 * Inisialisasi WebAssembly PoW Solver bawaan DeepSeek
 */
async function getWasmSolver(wasmBuffer = null) {
  if (wasmInstanceCache) return wasmInstanceCache

  let buf = wasmBuffer
  if (!buf) {
    const localWasmPaths = [
      path.resolve(__dirname, '../bin/sha3_wasm_bg.wasm'),
      path.resolve(__dirname, '../assets/sha3_wasm_bg.wasm'),
      path.resolve(__dirname, '../../../resources/sha3_wasm_bg.wasm')
    ]
    for (const p of localWasmPaths) {
      if (fs.existsSync(p)) {
        try {
          const fileBuf = fs.readFileSync(p)
          buf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength)
          break
        } catch {
          // ignore error reading local wasm
        }
      }
    }
  }

  if (!buf) {
    throw new Error(
      "Berkas WASM DeepSeek ('src/server/bin/sha3_wasm_bg.wasm') tidak ditemukan di disk lokal."
    )
  }

  const wasmModule = await WebAssembly.instantiate(buf, {})
  const exp = wasmModule.instance.exports

  function writeStr(text) {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const ptr = exp.__wbindgen_export_0(data.length, 1)
    const mem = new Uint8Array(exp.memory.buffer)
    mem.set(data, ptr)
    return [ptr, data.length]
  }

  function solve(challenge, prefix, difficulty) {
    const retptr = exp.__wbindgen_add_to_stack_pointer(-16)
    try {
      const [cPtr, cLen] = writeStr(challenge)
      const [pPtr, pLen] = writeStr(prefix)
      exp.wasm_solve(retptr, cPtr, cLen, pPtr, pLen, Number(difficulty))

      const view = new DataView(exp.memory.buffer)
      const status = view.getInt32(retptr, true)
      const value = view.getFloat64(retptr + 8, true)
      if (status === 0) return null
      return Math.floor(value)
    } finally {
      exp.__wbindgen_add_to_stack_pointer(16)
    }
  }

  wasmInstanceCache = { solve }
  return wasmInstanceCache
}

/**
 * Utility HTTP POST JSON request
 */
function httpPostJson(path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj)
    const options = {
      hostname: BASE_HOST,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(postData),
        ...headers
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk.toString()))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json)
        } catch {
          resolve(data)
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

/**
 * Utility HTTP GET JSON request
 */
function httpGetJson(path, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_HOST,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        ...headers
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk.toString()))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json)
        } catch {
          resolve(data)
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

/**
 * Header standar untuk menyerupai peramban web asli
 */
function getBaseHeaders(token, userAgent = null) {
  return {
    authorization: `Bearer ${token}`,
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'user-agent':
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    origin: `https://${BASE_HOST}`,
    referer: `https://${BASE_HOST}/`,
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-app-version': '2.0.2',
    'x-client-version': '2.0.2',
    'x-client-platform': 'web',
    'x-client-locale': 'en_US',
    'x-client-bundle-id': 'com.deepseek.chat'
  }
}

/**
 * Ekstraksi envelope biz_data DeepSeek
 */
function unwrapBizData(resJson) {
  if (!resJson || resJson.code !== 0) {
    throw new Error(`DeepSeek API Error: ${resJson?.msg || JSON.stringify(resJson)}`)
  }
  const biz = resJson.data?.biz_data
  if (!biz) throw new Error(`Envelope biz_data tidak ditemukan: ${JSON.stringify(resJson)}`)
  return biz
}

/**
 * Utility HTTP POST multipart/form-data untuk upload berkas mentah.
 */
function httpPostMultipart(reqPath, headers, fields, fileField) {
  return new Promise((resolve, reject) => {
    const boundary = '----MarkAgentBoundary' + crypto.randomBytes(16).toString('hex')
    const CRLF = '\r\n'
    const chunks = []

    for (const [key, value] of Object.entries(fields || {})) {
      chunks.push(
        Buffer.from(
          `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
            `${value}${CRLF}`
        )
      )
    }

    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${fileField.fieldName}"; filename="${fileField.filename}"${CRLF}` +
          `Content-Type: ${fileField.mimeType}${CRLF}${CRLF}`
      )
    )
    chunks.push(fileField.buffer)
    chunks.push(Buffer.from(CRLF))
    chunks.push(Buffer.from(`--${boundary}--${CRLF}`))

    const body = Buffer.concat(chunks)

    const options = {
      hostname: BASE_HOST,
      port: 443,
      path: reqPath,
      method: 'POST',
      headers: {
        ...headers,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': body.length
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk.toString()))
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, json: JSON.parse(data) })
        } catch {
          resolve({ statusCode: res.statusCode, json: null, raw: data })
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Upload gambar mentah ke DeepSeek Web RPC.
 * Mendukung Buffer, Base64 data URL, atau path file lokal.
 */
export async function uploadImageFile(token, imagePathOrBuffer, filename = 'image.png') {
  let buffer
  if (Buffer.isBuffer(imagePathOrBuffer)) {
    buffer = imagePathOrBuffer
  } else if (typeof imagePathOrBuffer === 'string') {
    if (imagePathOrBuffer.startsWith('data:')) {
      const commaIdx = imagePathOrBuffer.indexOf(',')
      const headerPart = imagePathOrBuffer.slice(0, commaIdx)
      const base64Data = imagePathOrBuffer.slice(commaIdx + 1)
      buffer = Buffer.from(base64Data, 'base64')
      const matchMime = headerPart.match(/data:([^;]+)/)
      if (matchMime) {
        const ext = matchMime[1].split('/')[1] || 'png'
        filename = `upload_${Date.now()}.${ext}`
      }
    } else {
      buffer = fs.readFileSync(imagePathOrBuffer)
      filename = path.basename(imagePathOrBuffer)
    }
  } else {
    throw new Error(
      'Format berkas gambar tidak valid (harus Buffer, Base64 data URL, atau file path).'
    )
  }

  const ext = path.extname(filename).toLowerCase()
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  }
  const mimeType = mimeMap[ext] || 'image/png'
  const powHeader = await generatePowHeader(token, '/api/v0/file/upload_file')
  const headers = {
    ...getBaseHeaders(token),
    'x-ds-pow-response': powHeader
  }

  const { statusCode, json, raw } = await httpPostMultipart(
    '/api/v0/file/upload_file',
    headers,
    {},
    { fieldName: 'file', filename, mimeType, buffer }
  )

  if (statusCode !== 200 || !json || json.code !== 0) {
    throw new Error(
      `Upload gambar ke DeepSeek gagal (${statusCode}): ${JSON.stringify(json || raw)}`
    )
  }

  const biz = unwrapBizData(json)
  const fileId = biz.file_id || biz.id || biz.file?.id
  if (!fileId) {
    throw new Error(`Tidak menemukan file_id pada respon upload: ${JSON.stringify(biz)}`)
  }
  return { fileId, raw: biz }
}

/**
 * Fork file ke target task 'vision' jika diperlukan oleh DeepSeek.
 * Menggunakan fallback ke file_id awal bila endpoint fork gagal/tidak dibutuhkan.
 */
export async function forkFileToVision(token, fileId) {
  const headers = getBaseHeaders(token)
  try {
    const res = await httpPostJson('/api/v0/file/fork_file_task', headers, {
      file_id: fileId,
      target_type: 'vision'
    })
    if (res?.code === 0 && res.data?.biz_data) {
      const biz = res.data.biz_data
      return biz.file_id || biz.id || fileId
    }
    return fileId
  } catch (err) {
    console.warn('[DeepSeek-Web] forkFileToVision fallback ke fileId awal:', err?.message || err)
    return fileId
  }
}

/**
 * Polling status parsing/readiness file di DeepSeek Web via /api/v0/file/fetch_files.
 */
export async function waitForFileReady(
  token,
  fileId,
  { maxAttempts = 30, intervalMs = 1000, settleMs = 1200 } = {}
) {
  const headers = getBaseHeaders(token)
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await httpGetJson(
        `/api/v0/file/fetch_files?file_ids=${encodeURIComponent(fileId)}`,
        headers
      )
      const biz = res?.data?.biz_data
      let file = null
      if (Array.isArray(biz)) {
        file = biz.find((f) => f.id === fileId || f.file_id === fileId) || biz[0]
      } else if (Array.isArray(biz?.files)) {
        file = biz.files.find((f) => f.id === fileId || f.file_id === fileId) || biz.files[0]
      } else {
        file = biz
      }

      const status = String(file?.status || '').toUpperCase()
      if (['SUCCESS', 'READY', 'DONE', 'COMPLETED', 'FINISHED', 'OK'].includes(status)) {
        if (settleMs > 0) {
          await new Promise((r) => setTimeout(r, settleMs))
        }
        return file
      }

      if (['FAILED', 'ERROR', 'REJECTED', 'CONTENT_EMPTY'].includes(status)) {
        throw new Error(`Pemrosesan berkas DeepSeek gagal (status: ${status})`)
      }
    } catch (err) {
      if (err.message?.includes('Pemrosesan berkas DeepSeek gagal')) {
        throw err
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { id: fileId, status: 'ready_assumed' }
}

/**
 * Generate Header Proof-of-Work (x-ds-pow-response)
 */
async function generatePowHeader(token, targetPath = '/api/v0/chat/completion', wasmBuf = null) {
  const solver = await getWasmSolver(wasmBuf)
  const challengeRes = await httpPostJson(
    '/api/v0/chat/create_pow_challenge',
    getBaseHeaders(token),
    { target_path: targetPath }
  )

  const challenge = unwrapBizData(challengeRes).challenge
  const prefix = `${challenge.salt}_${challenge.expire_at}_`
  const answer = solver.solve(challenge.challenge, prefix, challenge.difficulty)

  if (answer === null) {
    throw new Error('Gagal menyelesaikan Proof-of-Work DeepSeek (Challenge kadaluarsa/gagal)')
  }

  const payload = {
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    salt: challenge.salt,
    answer: answer,
    signature: challenge.signature,
    target_path: challenge.target_path
  }

  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

/**
 * Membuat chat session ID baru
 */
export async function createChatSession(token) {
  const res = await httpPostJson('/api/v0/chat_session/create', getBaseHeaders(token), {})
  const biz = unwrapBizData(res)
  return biz.chat_session.id
}

/**
 * Eksekusi tunggal request ke DeepSeek Web RPC (langsung instan tanpa delay jika normal)
 */
async function _executeSingleDeepSeekCall(
  prompt,
  modelName = 'deepseek-chat',
  token = '',
  options = {}
) {
  // Auto-clear session cache jika token berubah
  ensureTokenSession(token)

  const isSmallTask = !!options.isSmallTask
  const targetCache = isSmallTask ? utilitySessionCache : activeSessionCache
  const markSessionId = options.sessionId || '1'
  const cacheKey = getSessionCacheKey(token, markSessionId, isSmallTask)

  let sessionId = targetCache.get(cacheKey)
  let sessionState = sessionId ? sessionStateMap.get(sessionId) : null

  const now = Date.now()
  const MAX_TURNS_PER_SESSION = 20
  const MAX_IDLE_MS = 2 * 60 * 60 * 1000 // 2 jam

  // Rotasi otomatis jika melebihi batas turn atau idle > 2 jam
  if (
    sessionId &&
    sessionState &&
    (sessionState.turnCount >= MAX_TURNS_PER_SESSION || now - sessionState.lastUsedAt > MAX_IDLE_MS)
  ) {
    console.log(
      `[DeepSeek-Web] Merotasi sesi ${isSmallTask ? '(utility)' : `(${markSessionId})`} (turnCount: ${sessionState.turnCount}). Membuat chat session baru...`
    )
    targetCache.delete(cacheKey)
    sessionStateMap.delete(sessionId)
    sessionId = null
    sessionState = null
  }

  // Buat session baru jika tidak ada
  if (!sessionId) {
    sessionId = await createChatSession(token)
    targetCache.set(cacheKey, sessionId)
    sessionState = { lastMessageId: null, turnCount: 0, createdAt: now, lastUsedAt: now }
    sessionStateMap.set(sessionId, sessionState)
  } else if (!sessionState) {
    sessionState = { lastMessageId: null, turnCount: 0, createdAt: now, lastUsedAt: now }
    sessionStateMap.set(sessionId, sessionState)
  }

  // Tentukan parentMessageId: prioritaskan options, jika undefined ambil dari state chaining
  let parentMessageId = null
  if (options.parentMessageId !== undefined) {
    parentMessageId = options.parentMessageId
  } else if (sessionState?.lastMessageId) {
    parentMessageId = sessionState.lastMessageId
  }

  const { onDelta = null, wasmBuffer = null, refFileIds = [] } = options

  // Jeda acak manusiawi (jitter delay 350-800ms) untuk menghindari deteksi burst
  const jitterMs = Math.floor(Math.random() * (800 - 350 + 1)) + 350
  await new Promise((resolve) => setTimeout(resolve, jitterMs))

  const reqModel = (modelName || 'deepseek-chat').toLowerCase()
  let selected = DEEPSEEK_WEB_MODELS[reqModel] || DEEPSEEK_WEB_MODELS['deepseek-chat']
  const powHeader = await generatePowHeader(token, '/api/v0/chat/completion', wasmBuffer)

  const bodyData = {
    chat_session_id: sessionId,
    parent_message_id: parentMessageId,
    prompt: prompt,
    ref_file_ids: Array.isArray(refFileIds) ? refFileIds : [],
    thinking_enabled: selected.thinking,
    search_enabled: selected.search,
    action: null,
    preempt: false
  }

  if (!parentMessageId) {
    bodyData.model_type = selected.modelType
  }

  const payloadStr = JSON.stringify(bodyData)
  const headers = {
    ...getBaseHeaders(token),
    accept: 'text/event-stream, */*',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payloadStr),
    'x-ds-pow-response': powHeader
  }

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: BASE_HOST,
      port: 443,
      path: '/api/v0/chat/completion',
      method: 'POST',
      headers: headers
    }

    const req = https.request(reqOptions, (res) => {
      const encoding = (res.headers['content-encoding'] || '').toLowerCase()
      console.log(
        `[DeepSeek-Web] Status: ${res.statusCode}, encoding: "${encoding}", type: "${res.headers['content-type']}"`
      )

      let stream = res
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip())
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress())
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate())
      }

      if (res.statusCode !== 200) {
        let errBody = ''
        stream.on('data', (d) => (errBody += d.toString()))
        stream.on('end', () => {
          reject(new Error(`DeepSeek Server menolak permintaan (${res.statusCode}): ${errBody}`))
        })
        return
      }

      let buffer = ''
      let fullContent = ''
      let reasoningContent = ''
      let activePath = null
      let lastReceivedPayload = ''
      let responseMessageId = null

      const processLine = (line) => {
        const trimmed = line.trim()
        if (!trimmed) return

        // Skip SSE event lines that are not "data"
        if (trimmed.startsWith('event:')) return

        let payload = trimmed
        if (trimmed.startsWith('data:')) {
          payload = trimmed.slice(5).trim()
        }
        if (!payload || payload === '[DONE]') return
        lastReceivedPayload = payload

        try {
          const obj = JSON.parse(payload)

          // Tangkap message_id respon assistant
          if (obj.v?.response?.message_id) {
            responseMessageId = obj.v.response.message_id
          }

          // Abaikan frame status seperti response/status: "FINISHED" atau "WIP"
          if (
            obj.p === 'response/status' ||
            obj.p?.includes('status') ||
            obj.v === 'FINISHED' ||
            obj.v === 'WIP'
          ) {
            return
          }

          // 0. Deteksi error resmi dari server DeepSeek
          if (obj.click_behavior !== undefined || obj.auto_resume !== undefined) {
            // Jika sudah ada content, ini bukan error - akhir stream normal
            if (fullContent) return
            // Content kosong + click_behavior = session expired
            targetCache.delete(token)
            targetCache.delete(cacheKey)
            if (sessionId) sessionStateMap.delete(sessionId)
            reject(
              new Error(
                'DeepSeek Web session expired atau tidak valid. Session di-clear, silakan coba lagi.'
              )
            )
            return
          }
          if (obj.code !== undefined && obj.code !== 0) {
            const errMsg = obj.msg || obj.message || JSON.stringify(obj)
            const isFrequent =
              errMsg.toLowerCase().includes('frequent') ||
              errMsg.toLowerCase().includes('too many') ||
              errMsg.toLowerCase().includes('terlalu sering')
            if (!isFrequent) {
              targetCache.delete(token)
              targetCache.delete(cacheKey)
              if (sessionId) sessionStateMap.delete(sessionId)
            }
            reject(new Error(`DeepSeek Server Error (${obj.code}): ${errMsg}`))
            return
          }
          if (obj.data?.biz_code !== undefined && obj.data.biz_code !== 0) {
            const muteUntil = obj.data.biz_data?.mute_until
              ? ` (sampai ${new Date(obj.data.biz_data.mute_until * 1000).toLocaleTimeString('id-ID')})`
              : ''
            const errMsg = obj.data.biz_msg || `Kode bisnis ${obj.data.biz_code}`
            const isFrequent =
              errMsg.toLowerCase().includes('frequent') ||
              errMsg.toLowerCase().includes('too many') ||
              errMsg.toLowerCase().includes('terlalu sering')
            if (!isFrequent) {
              targetCache.delete(token)
              targetCache.delete(cacheKey)
              if (sessionId) sessionStateMap.delete(sessionId)
            }
            reject(
              new Error(
                `Akun DeepSeek Web kamu sedang dibatasi sementara oleh DeepSeek: "${errMsg}"${muteUntil}. Tunggu beberapa saat atau ganti token akun baru.`
              )
            )
            return
          }
          if (obj.error || obj.error_msg) {
            const errMsg = obj.error?.message || obj.error_msg || JSON.stringify(obj)
            reject(new Error(`DeepSeek Server Error: ${errMsg}`))
            return
          }

          const v = obj.v

          // 1. Snapshot Response Frame
          if (v && typeof v === 'object') {
            if (v.response) {
              for (const frag of v.response.fragments || []) {
                if (frag.content) {
                  if (frag.type === 'THINKING') {
                    reasoningContent = frag.content
                    onDelta?.({ type: 'thinking', delta: frag.content, full: reasoningContent })
                  } else {
                    activePath = 'response/fragments/-1/content'
                    // FIX: Gabungkan fragment, jangan overwrite
                    if (fullContent && fullContent !== frag.content) {
                      fullContent += frag.content
                    } else {
                      fullContent = frag.content
                    }
                    onDelta?.({ type: 'content', delta: frag.content, full: fullContent })
                  }
                }
              }
              return
            }
            if (v.content && typeof v.content === 'string') {
              fullContent += v.content
              onDelta?.({ type: 'content', delta: v.content, full: fullContent })
              return
            }
            if (v.thinking_content && typeof v.thinking_content === 'string') {
              reasoningContent += v.thinking_content
              onDelta?.({ type: 'thinking', delta: v.thinking_content, full: reasoningContent })
              return
            }
          }

          // 2. Path-Setting Frame
          if (obj.p) {
            activePath = obj.p
            if (typeof v === 'string') {
              if (activePath.includes('thinking')) {
                reasoningContent += v
                onDelta?.({ type: 'thinking', delta: v, full: reasoningContent })
              } else {
                fullContent += v
                onDelta?.({ type: 'content', delta: v, full: fullContent })
              }
            }
            return
          }

          // 3. Continuous Append Frame
          if (typeof v === 'string') {
            if (activePath && activePath.includes('thinking')) {
              reasoningContent += v
              onDelta?.({ type: 'thinking', delta: v, full: reasoningContent })
            } else {
              fullContent += v
              onDelta?.({ type: 'content', delta: v, full: fullContent })
            }
          }
        } catch {
          // Abaikan chunk malformed
        }
      }

      stream.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          processLine(line)
        }
      })

      stream.on('end', () => {
        if (buffer && buffer.trim()) {
          processLine(buffer.trim())
        }

        // Sanitasi trailing status jika ada yang lolos
        if (fullContent) {
          fullContent = fullContent.replace(/\s*(?:FINISHED|FINISH|DONE)\b.*$/i, '').trim()
        }

        // Fallback: Jika content kosong tapi thinking terisi, gunakan thinking sebagai jawaban
        if (!fullContent && reasoningContent) {
          fullContent = reasoningContent
          reasoningContent = null
        }

        if (!fullContent) {
          console.warn(
            `[DeepSeek-Web] Empty response on end. Last payload:`,
            lastReceivedPayload,
            `Buffer:`,
            buffer
          )
          reject(
            new Error(
              `Gagal mengekstrak teks balasan dari streaming DeepSeek Web. Status: ${res.statusCode}, Tipe: ${res.headers['content-type']}, Respons server: ${lastReceivedPayload || buffer || 'tidak ada data streaming'}`
            )
          )
          return
        }

        // Simpan progress chaining sesi jika berhasil
        if (sessionId && sessionStateMap.has(sessionId)) {
          const state = sessionStateMap.get(sessionId)
          if (responseMessageId) {
            state.lastMessageId = responseMessageId
          }
          state.turnCount = (state.turnCount || 0) + 1
          state.lastUsedAt = Date.now()
        }

        resolve({
          text: fullContent,
          thinking: reasoningContent || null,
          sessionId: sessionId,
          messageId: responseMessageId || null
        })
      })
    })

    req.on('error', reject)
    req.write(payloadStr)
    req.end()
  })
}

/**
 * Fungsi Utama: Generate respons dari DeepSeek Web RPC dengan auto-retry hingga 50x dan jeda proteksi rate limit
 *
 * @param {string} prompt - Pertanyaan/pesan pengguna
 * @param {string} modelName - 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-search'
 * @param {string} token - DeepSeek Bearer token (dari localStorage userToken)
 * @param {object} options - Opsi tambahan: sessionId, parentMessageId, onDelta, onStatus, wasmBuffer, maxAttempts, retryDelayMs
 */
export async function generateDeepSeekResponse(
  prompt,
  modelName = 'deepseek-chat',
  token = '',
  options = {}
) {
  if (!token) {
    throw new Error(
      'DeepSeek User Token (Bearer) dibutuhkan. Silakan ambil dari localStorage.userToken.'
    )
  }

  const maxAttempts = options.maxAttempts ?? 50
  const retryDelayMs = options.retryDelayMs ?? 5000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await _executeSingleDeepSeekCall(prompt, modelName, token, options)
    } catch (err) {
      const errMsg = err?.message || ''
      const isRetryable =
        errMsg.toLowerCase().includes('session expired') ||
        errMsg.toLowerCase().includes('tidak valid') ||
        errMsg.toLowerCase().includes('invalid ref file id') ||
        errMsg.toLowerCase().includes('frequent') ||
        errMsg.toLowerCase().includes('too many') ||
        errMsg.toLowerCase().includes('terlalu sering') ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('dibatasi') ||
        errMsg.toLowerCase().includes('menolak permintaan') ||
        errMsg.toLowerCase().includes('tidak ada data streaming') ||
        errMsg.toLowerCase().includes('503') ||
        errMsg.toLowerCase().includes('502') ||
        errMsg.toLowerCase().includes('429')

      if (isRetryable && attempt < maxAttempts) {
        // Setiap 5 kali kegagalan berulang, reset session cache agar membuat session baru
        if (attempt % 5 === 0) {
          activeSessionCache.delete(token)
          utilitySessionCache.delete(token)
          const markSessionId = options.sessionId || '1'
          const key = getSessionCacheKey(token, markSessionId, !!options.isSmallTask)
          const targetCache = options.isSmallTask ? utilitySessionCache : activeSessionCache
          const sId = targetCache.get(key)
          if (sId) sessionStateMap.delete(sId)
          targetCache.delete(key)
        }

        console.warn(
          `[DeepSeek-Web] Kendala DeepSeek: "${errMsg}". Mencoba ulang (${attempt}/${maxAttempts}) dalam ${retryDelayMs / 1000}s...`
        )
        if (typeof options.onStatus === 'function') {
          options.onStatus(
            `DeepSeek sibuk (${errMsg.substring(0, 35)}...). Jeda ${retryDelayMs / 1000}s (Percobaan ${attempt}/${maxAttempts})...`
          )
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw err
    }
  }
}

/**
 * Fungsi tingkat tinggi Vision: upload gambar -> wait ready -> generate respons chat DeepSeek.
 *
 * @param {string} prompt - Pertanyaan tentang gambar
 * @param {string|Buffer} imagePathOrBuffer - Path file gambar atau Buffer
 * @param {string} token - DeepSeek Bearer token
 * @param {object} options - Opsi tambahan (filename, modelName, onDelta, onStatus, dll)
 */
export async function generateDeepSeekVisionResponse(
  prompt,
  imagePathOrBuffer,
  token,
  options = {}
) {
  if (!token) {
    throw new Error('DeepSeek User Token (Bearer) dibutuhkan.')
  }

  if (typeof options.onStatus === 'function') {
    options.onStatus('Mengupload gambar ke DeepSeek...')
  }
  const { fileId } = await uploadImageFile(token, imagePathOrBuffer, options.filename)

  if (typeof options.onStatus === 'function') {
    options.onStatus('Menunggu DeepSeek selesai memproses gambar...')
  }
  await waitForFileReady(token, fileId)

  const modelName = options.modelName || 'deepseek-chat'
  const existingRefs = Array.isArray(options.refFileIds) ? options.refFileIds : []

  return generateDeepSeekResponse(prompt, modelName, token, {
    ...options,
    refFileIds: [...new Set([...existingRefs, fileId])]
  })
}
