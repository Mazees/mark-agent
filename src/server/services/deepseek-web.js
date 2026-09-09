/**
 * DeepSeek Web RPC Engine for MARK Node.js Core
 * Reverse-engineered chat.deepseek.com client with native WASM PoW Solver
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
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
let lastUsedToken = null

function ensureTokenSession(token) {
  // Jika token berubah, clear session cache lama
  if (lastUsedToken !== token) {
    if (lastUsedToken) {
      activeSessionCache.delete(lastUsedToken)
    }
    lastUsedToken = token
  }
}

export function clearDeepSeekSession(token = null) {
  if (token) {
    activeSessionCache.delete(token)
  } else {
    activeSessionCache.clear()
  }
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
        } catch (_) {}
      }
    }
  }

  if (!buf) {
    throw new Error("Berkas WASM DeepSeek ('src/server/bin/sha3_wasm_bg.wasm') tidak ditemukan di disk lokal.")
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
        } catch (e) {
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
 * Header standar untuk menyerupai peramban web asli
 */
function getBaseHeaders(token, userAgent = null) {
  return {
    authorization: `Bearer ${token}`,
    accept: '*/*',
    'user-agent':
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    origin: `https://${BASE_HOST}`,
    referer: `https://${BASE_HOST}/`,
    'x-app-version': '2.0.0',
    'x-client-version': '2.0.0',
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
  const res = await httpPostJson(
    '/api/v0/chat_session/create',
    getBaseHeaders(token),
    {}
  )
  const biz = unwrapBizData(res)
  return biz.chat_session.id
}

/**
 * Fungsi Utama: Generate respons dari DeepSeek Web RPC
 * 
 * @param {string} prompt - Pertanyaan/pesan pengguna
 * @param {string} modelName - 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-search'
 * @param {string} token - DeepSeek Bearer token (dari localStorage userToken)
 * @param {object} options - Opsi tambahan: sessionId, parentMessageId, onDelta, wasmBuffer
 */
export async function generateDeepSeekResponse(
  prompt,
  modelName = 'deepseek-chat',
  token = '',
  options = {}
) {
  if (!token) {
    throw new Error('DeepSeek User Token (Bearer) dibutuhkan. Silakan ambil dari localStorage.userToken.')
  }

  // Auto-clear session cache jika token berubah
  ensureTokenSession(token)

  const {
    parentMessageId = null,
    onDelta = null,
    wasmBuffer = null
  } = options

  // Buat session baru jika tidak ada
  let sessionId = options.sessionId || activeSessionCache.get(token)
  if (!sessionId) {
    sessionId = await createChatSession(token)
    activeSessionCache.set(token, sessionId)
  }

  const reqModel = (modelName || 'deepseek-chat').toLowerCase()
  let selected = DEEPSEEK_WEB_MODELS[reqModel] || DEEPSEEK_WEB_MODELS['deepseek-chat']
  const powHeader = await generatePowHeader(token, '/api/v0/chat/completion', wasmBuffer)

  const bodyData = {
    chat_session_id: sessionId,
    parent_message_id: parentMessageId,
    prompt: prompt,
    ref_file_ids: [],
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
      console.log(`[DeepSeek-Web] Status: ${res.statusCode}, encoding: "${encoding}", type: "${res.headers['content-type']}"`)

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

          // 0. Deteksi error resmi dari server DeepSeek
          if (obj.click_behavior !== undefined || obj.auto_resume !== undefined) {
            // Jika sudah ada content, ini bukan error - akhir stream normal
            if (fullContent) return
            // Content kosong + click_behavior = session expired
            activeSessionCache.delete(token)
            reject(new Error('DeepSeek Web session expired atau tidak valid. Session di-clear, silakan coba lagi.'))
            return
          }
          if (obj.code !== undefined && obj.code !== 0) {
            activeSessionCache.delete(token)
            const errMsg = obj.msg || obj.message || JSON.stringify(obj)
            reject(new Error(`DeepSeek Server Error (${obj.code}): ${errMsg}`))
            return
          }
          if (obj.data?.biz_code !== undefined && obj.data.biz_code !== 0) {
            const muteUntil = obj.data.biz_data?.mute_until
              ? ` (sampai ${new Date(obj.data.biz_data.mute_until * 1000).toLocaleTimeString('id-ID')})`
              : ''
            const errMsg = obj.data.biz_msg || `Kode bisnis ${obj.data.biz_code}`
            reject(new Error(`Akun DeepSeek Web kamu sedang dibatasi sementara oleh DeepSeek: "${errMsg}"${muteUntil}. Tunggu beberapa saat atau ganti token akun baru.`))
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
        } catch (err) {
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

        // Fallback: Jika content kosong tapi thinking terisi, gunakan thinking sebagai jawaban
        if (!fullContent && reasoningContent) {
          fullContent = reasoningContent
          reasoningContent = null
        }

        if (!fullContent) {
          console.warn(`[DeepSeek-Web] Empty response on end. Last payload:`, lastReceivedPayload, `Buffer:`, buffer)
          reject(
            new Error(
              `Gagal mengekstrak teks balasan dari streaming DeepSeek Web. Status: ${res.statusCode}, Tipe: ${res.headers['content-type']}, Respons server: ${lastReceivedPayload || buffer || 'tidak ada data streaming'}`
            )
          )
          return
        }
        resolve({
          text: fullContent,
          thinking: reasoningContent || null,
          sessionId: sessionId
        })
      })
    })

    req.on('error', reject)
    req.write(payloadStr)
    req.end()
  })
}
