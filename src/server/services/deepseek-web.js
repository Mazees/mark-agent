/**
 * DeepSeek Web RPC Engine for MARK Node.js Core
 * Reverse-engineered chat.deepseek.com client with native WASM PoW Solver
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
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
  },
  'deepseek-v4': {
    modelType: 'default',
    thinking: false,
    search: false,
    name: 'deepseek-v4',
    desc: 'DeepSeek-V4 (Next-Gen Web Model)'
  },
  'deepseek-reasoner': {
    modelType: 'expert',
    thinking: true,
    search: false,
    name: 'deepseek-reasoner',
    desc: 'DeepSeek-R1 mode penalaran mendalam (DeepThink)'
  },
  'deepseek-search': {
    modelType: 'default',
    thinking: false,
    search: true,
    name: 'deepseek-search',
    desc: 'DeepSeek-V3 dengan pencarian web real-time'
  },
  'deepseek-reasoner-search': {
    modelType: 'expert',
    thinking: true,
    search: true,
    name: 'deepseek-reasoner-search',
    desc: 'DeepSeek-R1 penalaran mendalam + pencarian web'
  }
}

const BASE_HOST = 'chat.deepseek.com'
const WASM_FALLBACK_URL =
  'https://raw.githubusercontent.com/sums001/Deepseek-API/main/deepseek/sha3_wasm_bg.wasm'

let wasmInstanceCache = null

/**
 * Inisialisasi WebAssembly PoW Solver bawaan DeepSeek
 */
async function getWasmSolver(wasmBuffer = null) {
  if (wasmInstanceCache) return wasmInstanceCache

  let buf = wasmBuffer
  if (!buf) {
    const localWasmPaths = [
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
    const res = await fetch(WASM_FALLBACK_URL)
    if (!res.ok) throw new Error(`Gagal mengunduh SHA3 WASM: ${res.statusText}`)
    buf = await res.arrayBuffer()
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

  const {
    sessionId: inputSessionId = null,
    parentMessageId = null,
    onDelta = null,
    wasmBuffer = null
  } = options

  const reqModel = (modelName || 'deepseek-chat').toLowerCase()
  let selected = DEEPSEEK_WEB_MODELS[reqModel]
  if (!selected) {
    if (reqModel.includes('reason') || reqModel.includes('r1')) {
      selected = DEEPSEEK_WEB_MODELS['deepseek-reasoner']
    } else {
      selected = DEEPSEEK_WEB_MODELS['deepseek-chat']
    }
  }

  const sessionId = inputSessionId || (await createChatSession(token))
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
      if (res.statusCode !== 200) {
        let errBody = ''
        res.on('data', (d) => (errBody += d.toString()))
        res.on('end', () => {
          reject(new Error(`DeepSeek Server menolak permintaan (${res.statusCode}): ${errBody}`))
        })
        return
      }

      let buffer = ''
      let fullContent = ''
      let reasoningContent = ''
      let activePath = null

      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue

          try {
            const obj = JSON.parse(payload)
            const v = obj.v

            // 1. Snapshot Response Frame
            if (v && typeof v === 'object' && v.response) {
              for (const frag of v.response.fragments || []) {
                if (frag.type === 'RESPONSE' && frag.content) {
                  activePath = 'response/fragments/-1/content'
                  if (!fullContent) {
                    fullContent += frag.content
                    onDelta?.({ type: 'content', delta: frag.content, full: fullContent })
                  }
                }
              }
              continue
            }

            // 2. Path-Setting Frame
            if (obj.p) {
              activePath = obj.p
              if (obj.o === 'APPEND' && typeof v === 'string') {
                if (activePath.endsWith('content')) {
                  fullContent += v
                  onDelta?.({ type: 'content', delta: v, full: fullContent })
                } else if (activePath.endsWith('thinking_content')) {
                  reasoningContent += v
                  onDelta?.({ type: 'thinking', delta: v, full: reasoningContent })
                }
              }
              continue
            }

            // 3. Continuous Append Frame
            if (typeof v === 'string' && activePath) {
              if (activePath.endsWith('content')) {
                fullContent += v
                onDelta?.({ type: 'content', delta: v, full: fullContent })
              } else if (activePath.endsWith('thinking_content')) {
                reasoningContent += v
                onDelta?.({ type: 'thinking', delta: v, full: reasoningContent })
              }
            }
          } catch (err) {
            // Abaikan chunk malformed
          }
        }
      })

      res.on('end', () => {
        if (!fullContent) {
          reject(new Error('Gagal mengekstrak teks balasan dari streaming DeepSeek Web.'))
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
