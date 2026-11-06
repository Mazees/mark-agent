import https from 'node:https'
import crypto from 'node:crypto'
import { geminiAuth } from './gemini-auth.js'
import { activeAbortControllers } from './ai/ai-utils.js'
import {
  DEFAULT_GEMINI_WEB_MODEL,
  GEMINI_COMPACTION_MODEL,
  GEMINI_WEB_MODELS,
  geminiModelMismatchDetails,
  describeGeminiModelMismatch
} from '../../shared/gemini-models.js'
import { assertGeminiInput } from '../../shared/gemini-context.js'

export { GEMINI_WEB_MODELS }
const ORIGIN = 'https://gemini.google.com'
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024
const error = (code, message) => Object.assign(new Error(message), { code })

async function abortable(operation, signal) {
  signal.throwIfAborted()
  let abort
  try {
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
    })
    return await Promise.race([interrupted, Promise.resolve().then(operation)])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export function resolveGeminiModel(name = DEFAULT_GEMINI_WEB_MODEL) {
  const match = String(name || DEFAULT_GEMINI_WEB_MODEL)
    .trim()
    .toLowerCase()
    .match(/^([^@]+)(?:@think=([0-4]))?$/)
  const selected =
    match && Object.hasOwn(GEMINI_WEB_MODELS, match[1]) && GEMINI_WEB_MODELS[match[1]]
  if (!selected)
    throw error(
      'GEMINI_MODEL_UNKNOWN',
      'Model Gemini Web tidak dikenal. Pilih model yang tersedia di Pengaturan.'
    )
  return {
    ...selected,
    name: match[1],
    think: match[2] === undefined ? selected.think : Number(match[2])
  }
}

export function geminiHttpRequest(url, { method = 'GET', headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, signal, maxHeaderSize: 65536 }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES)
          return res.destroy(
            error('GEMINI_RESPONSE_LIMIT', 'Respons Gemini Web melebihi batas ukuran.')
          )
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('aborted', () =>
        reject(
          error(
            'GEMINI_RESPONSE_INCOMPLETE',
            'Koneksi Gemini Web terputus sebelum respons selesai.'
          )
        )
      )
      res.on('end', () => {
        if (!res.complete)
          return reject(error('GEMINI_RESPONSE_INCOMPLETE', 'Respons Gemini Web belum lengkap.'))
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
      })
    })
    req.on('error', (cause) =>
      reject(
        signal?.aborted
          ? signal.reason
          : error(
              cause.code || 'GEMINI_NETWORK',
              'Tidak dapat menghubungi Gemini Web. Periksa koneksi internet.'
            )
      )
    )
    req.end(body)
  })
}

export function parseGeminiFrames(raw) {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  if (buffer.length > MAX_RESPONSE_BYTES)
    throw error('GEMINI_RESPONSE_LIMIT', 'Respons Gemini Web melebihi batas ukuran.')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw error('GEMINI_PROTOCOL', 'Encoding respons Gemini Web tidak valid.')
  }
  let offset = text.startsWith(")]}'") ? 4 : 0
  const frames = []
  const parse = (json) => {
    let value
    try {
      value = JSON.parse(json)
    } catch {
      throw error('GEMINI_PROTOCOL', 'Format respons Gemini Web berubah atau terpotong.')
    }
    if (!Array.isArray(value)) throw error('GEMINI_PROTOCOL', 'Frame Gemini Web tidak valid.')
    frames.push(...(typeof value[0] === 'string' ? [value] : value))
  }
  while (offset < text.length) {
    while (offset < text.length && /\s/.test(text[offset])) offset++
    if (offset >= text.length) break
    const newline = text.indexOf('\n', offset)
    const lineEnd = newline < 0 ? text.length : newline
    const line = text.slice(offset, lineEnd).trim()
    if (/^\d+$/.test(line)) {
      const length = Number(line),
        start = lineEnd
      // StreamGenerate counts UTF-16 code units, including the surrounding newlines.
      // UTF-8 byte offsets corrupt frames containing non-ASCII response text.
      if (
        !Number.isSafeInteger(length) ||
        length <= 0 ||
        length > MAX_RESPONSE_BYTES ||
        start + length > text.length
      )
        throw error('GEMINI_RESPONSE_INCOMPLETE', 'Frame Gemini Web terpotong sebelum selesai.')
      parse(text.slice(start, start + length))
      offset = start + length
    } else {
      parse(text.slice(offset, lineEnd))
      offset = lineEnd + 1
    }
  }
  return frames
}

function reportedModel(payload) {
  return typeof payload?.[42] === 'string' ? payload[42].trim() : ''
}

export function parseGeminiResponse(raw, selected) {
  let answer = '',
    reasoning = '',
    actualModel = ''
  for (const frame of parseGeminiFrames(raw)) {
    if (!Array.isArray(frame)) continue
    if (frame[0] === 'er') throw error('GEMINI_UPSTREAM', 'Google menolak request Gemini Web.')
    if (frame[0] === 'wrb.fr' && frame[2] === null && frame[5] != null)
      throw error('GEMINI_UPSTREAM', 'Google mengakhiri request Gemini Web dengan kesalahan.')
    if (frame[0] !== 'wrb.fr' || typeof frame[2] !== 'string') continue
    let inner
    try {
      inner = JSON.parse(frame[2])
    } catch {
      throw error('GEMINI_PROTOCOL', 'Isi frame Gemini Web tidak valid.')
    }
    const pending = [inner]
    while (pending.length) {
      const value = pending.pop()
      if (typeof value === 'string' && /^type\.googleapis\.com\/[\w.]*BardErrorInfo$/.test(value))
        throw error(
          'GEMINI_UPSTREAM',
          'Google menolak request. Periksa sesi akun, model, atau batas penggunaan Gemini.'
        )
      if (Array.isArray(value)) pending.push(...value)
    }
    if (inner?.[31] === true || inner?.[31] === 1)
      throw error(
        'GEMINI_UPSTREAM',
        'Gemini Web mengembalikan kegagalan layanan, bukan jawaban model.'
      )
    actualModel = reportedModel(inner) || actualModel
    const candidates = inner?.[4]
    if (!Array.isArray(candidates)) continue
    const candidate = candidates.find(
      (c) => Array.isArray(c) && typeof c[0] === 'string' && c[0].startsWith('rc_')
    )
    if (!candidate) continue
    const text = Array.isArray(candidate[1])
      ? candidate[1].filter((s) => typeof s === 'string').join('\n')
      : ''
    if (text.trim()) answer = text
    const thought = candidate[37]?.[0]?.[0]
    if (typeof thought === 'string' && thought.length > reasoning.length) reasoning = thought
  }
  if (!answer.trim())
    throw error(
      'GEMINI_EMPTY',
      'Gemini Web tidak menghasilkan jawaban. Tidak ada tool yang dijalankan dari respons ini.'
    )
  const normalizedModel = actualModel.replace(/^Gemini\s+/i, '').toLowerCase()
  const matchesModel =
    selected.expected === 'Argon'
      ? /^(?:4 )?argon$/.test(normalizedModel)
      : normalizedModel === selected.expected?.toLowerCase()
  if (selected.expected && !matchesModel) {
    const modelMismatch = geminiModelMismatchDetails({
      requestedModel: selected.name,
      actualModel
    })
    throw Object.assign(
      error('GEMINI_MODEL_MISMATCH', describeGeminiModelMismatch(modelMismatch)),
      { modelMismatch }
    )
  }
  return {
    text: answer.trim(),
    reasoning: reasoning || null,
    actualModel: actualModel || null,
    finishReason: 'stop'
  }
}

function updateCookies(current, headers = {}) {
  const cookies = new Map(
    current
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const at = p.indexOf('=')
        return [p.slice(0, at), p.slice(at + 1)]
      })
  )
  for (const item of headers['set-cookie'] || []) {
    const pair = item.split(';')[0],
      at = pair.indexOf('=')
    if (at > 0) cookies.set(pair.slice(0, at), pair.slice(at + 1))
  }
  return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
}

function headersFor(auth, path) {
  const headers = {
    accept: '*/*',
    origin: ORIGIN,
    referer: ORIGIN + path + '/app',
    'x-same-domain': '1',
    'x-goog-authuser': auth.authUser,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  }
  if (auth.cookie) {
    headers.cookie = auth.cookie
    const pairs = new Map(
      auth.cookie.split(';').map((p) => {
        const at = p.indexOf('=')
        return [p.slice(0, at).trim(), p.slice(at + 1)]
      })
    )
    const sapisid = pairs.get('SAPISID') || pairs.get('__Secure-3PAPISID')
    if (sapisid) {
      const time = Math.floor(Date.now() / 1000)
      const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${ORIGIN}`).digest('hex')
      headers.authorization = `SAPISIDHASH ${time}_${hash}`
    }
  }
  return headers
}

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) return
  const code =
    response.status === 429
      ? 'GEMINI_RATE_LIMIT'
      : [401, 403].includes(response.status)
        ? 'GEMINI_AUTH'
        : 'GEMINI_HTTP'
  throw Object.assign(
    error(
      code,
      `Gemini Web mengembalikan HTTP ${response.status}. ${code === 'GEMINI_AUTH' ? 'Perbarui sesi akun Google.' : code === 'GEMINI_RATE_LIMIT' ? 'Batas penggunaan tercapai.' : 'Request dihentikan tanpa mengganti model.'}`
    ),
    { retryable: [408, 500, 502, 503, 504].includes(response.status) }
  )
}

export function createGeminiWebClient({
  request = geminiHttpRequest,
  authentication = () => geminiAuth.getAuth(),
  onAuthRejected = () => geminiAuth.expire()
} = {}) {
  const bootstrapCache = new Map()
  return async function generateGeminiResult(prompt, modelName, options = {}) {
    const selected = resolveGeminiModel(modelName)
    assertGeminiInput(prompt)
    const controller = new AbortController()
    controller.markScope = options.scope || 'lead'
    controller.provider = 'gemini-web'
    const abort = () => controller.abort(options.signal.reason)
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    activeAbortControllers.add(controller)
    const timeout = options.timeoutMs ?? 180000
    const timer =
      timeout > 0
        ? setTimeout(
            () =>
              controller.abort(
                error('GEMINI_TIMEOUT', 'Gemini Web belum menyelesaikan request dalam batas waktu.')
              ),
            timeout
          )
        : null
    let key, auth
    try {
      controller.signal.throwIfAborted()
      auth = await abortable(authentication, controller.signal)
      controller.signal.throwIfAborted()
      if (selected.requiresLogin && !auth.cookie)
        throw error(
          'GEMINI_AUTH_REQUIRED',
          `${selected.label} memerlukan akun Google dengan akses model tersebut. Klik Hubungkan akun Google di Pengaturan Gemini Web.`
        )
      key = crypto.createHash('sha256').update(JSON.stringify(auth)).digest('hex')
      const prefix = auth.authUser === '0' ? '' : '/u/' + auth.authUser
      let session = bootstrapCache.get(key)
      if (!session || session.expires < Date.now()) {
        const response = await request(ORIGIN + prefix + '/app', {
          headers: headersFor(auth, prefix),
          signal: controller.signal
        })
        checkStatus(response)
        const html = response.body.toString('utf8')
        const extract = (name) => {
          const match = html.match(new RegExp('"' + name + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'))
          return match ? JSON.parse(match[1]) : ''
        }
        session = {
          ...auth,
          cookie: updateCookies(auth.cookie, response.headers),
          bl: extract('cfb2h'),
          xsrf: extract('SNlM0e'),
          expires: Date.now() + 300000
        }
        if (!session.bl || (auth.cookie && !session.xsrf))
          throw error(
            'GEMINI_BOOTSTRAP',
            'Halaman Gemini tidak menyediakan metadata sesi yang diperlukan. Periksa login atau akses ke Gemini Web.'
          )
        if (bootstrapCache.size >= 16) bootstrapCache.delete(bootstrapCache.keys().next().value)
        bootstrapCache.set(key, session)
      }
      options.onStatus?.('Menunggu respons Gemini Web...')
      const requestId = crypto.randomUUID(),
        modelRequestId = crypto.randomUUID(),
        extended = selected.extended ? 2 : 1
      const inner = new Array(102).fill(null)
      inner[0] = [prompt, 0, null, null, null, null, 0]
      inner[1] = ['id']
      // Mark sends its full active context; no upstream conversation is continued.
      inner[2] = ['', '', '', null, null, null, null, null, null, '']
      Object.assign(inner, {
        6: [0],
        7: 1,
        10: 1,
        11: 0,
        17: [[selected.think]],
        18: 0,
        27: 1,
        30: [4],
        41: [1],
        45: 1,
        53: 0,
        59: requestId,
        61: [],
        68: 1,
        79: selected.mode,
        80: extended,
        91: 0,
        96: extended === 2 ? 1 : 0
      })
      const params = new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(inner)]) })
      if (session.xsrf) params.set('at', session.xsrf)
      const query = new URLSearchParams({
        bl: session.bl,
        hl: 'id',
        _reqid: String(crypto.randomInt(100000, 999999)),
        rt: 'c'
      })
      const headers = {
        ...headersFor(session, prefix),
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-goog-ext-525001261-jspb': JSON.stringify([
          1,
          null,
          null,
          null,
          selected.header,
          null,
          null,
          0,
          [4, 5, 6, 8],
          null,
          null,
          1,
          null,
          null,
          selected.mode,
          extended,
          modelRequestId
        ]),
        'x-goog-ext-525005358-jspb': JSON.stringify([requestId, 1]),
        'x-goog-ext-73010989-jspb': '[0]',
        'x-goog-ext-73010990-jspb': '[0,0,0]'
      }
      const response = await request(
        ORIGIN +
          prefix +
          '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?' +
          query,
        { method: 'POST', headers, body: params.toString(), signal: controller.signal }
      )
      checkStatus(response)
      controller.signal.throwIfAborted()
      session.cookie = updateCookies(session.cookie, response.headers)
      return parseGeminiResponse(response.body, selected)
    } catch (cause) {
      bootstrapCache.delete(key)
      if (cause.code === 'GEMINI_AUTH' && auth?.cookie)
        await abortable(onAuthRejected, controller.signal)
      throw controller.signal.aborted ? controller.signal.reason : cause
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      activeAbortControllers.delete(controller)
    }
  }
}

export const generateGeminiResult = createGeminiWebClient()
export function createGeminiCompactionClient({ request = geminiHttpRequest } = {}) {
  const generate = createGeminiWebClient({
    request,
    authentication: async () => ({ cookie: '', authUser: '0' }),
    onAuthRejected: async () => {}
  })
  return (prompt, options = {}) =>
    generate(prompt, GEMINI_COMPACTION_MODEL, { ...options, timeoutMs: 0 })
}
export const generateGeminiCompactionResult = createGeminiCompactionClient()
export async function generateGeminiResponse(...args) {
  return (await generateGeminiResult(...args)).text
}
