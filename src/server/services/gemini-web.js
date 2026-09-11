/**
 * Gemini Web RPC Engine for MARK Node.js Core
 */
import https from 'https'
import crypto from 'crypto'

export const GEMINI_WEB_MODELS = {
  'gemini-3.6-flash': {
    mode: 1,
    think: 4,
    name: 'gemini-3.6-flash',
    desc: 'Model utama serbaguna versi terbaru'
  },
  'gemini-3.5-flash': {
    mode: 1,
    think: 4,
    name: 'gemini-3.5-flash',
    desc: 'Model Flash seimbang dan stabil'
  },
  'gemini-3.5-flash-thinking': {
    mode: 2,
    think: 0,
    name: 'gemini-3.5-flash-thinking',
    desc: 'Mode penalaran mendalam untuk analisis rumit'
  },
  'gemini-3.5-flash-thinking-lite': {
    mode: 5,
    think: 0,
    name: 'gemini-3.5-flash-thinking-lite',
    desc: 'Mode penalaran cepat dengan kedalaman fleksibel'
  },
  'gemini-auto': {
    mode: 4,
    think: 4,
    name: 'gemini-auto',
    desc: 'Penyesuaian model otomatis oleh server'
  },
  'gemini-flash-lite': {
    mode: 6,
    think: 4,
    name: 'gemini-flash-lite',
    desc: 'Model super ringan dengan respon instan'
  }
}

const DEFAULT_BL = 'boq_assistant-bard-web-server_20260730.01_p1'

function httpPost(urlStr, headers, bodyData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk.toString()))
      res.on('end', () => resolve(data))
    })
    req.on('error', (err) => reject(err))
    req.write(bodyData)
    req.end()
  })
}

function findRc(arr) {
  if (!Array.isArray(arr)) return null
  if (arr[0] && typeof arr[0] === 'string' && arr[0].startsWith('rc_')) {
    return arr[1][0]
  }
  for (const item of arr) {
    const res = findRc(item)
    if (res) return res
  }
  return null
}

export async function generateGeminiResponse(
  prompt,
  modelName = 'gemini-3.6-flash',
  cookie = '',
  bl = DEFAULT_BL
) {
  const reqModel = (modelName || 'gemini-3.6-flash').toLowerCase()

  let selected = GEMINI_WEB_MODELS[reqModel]
  if (!selected) {
    if (reqModel.includes('thinking-lite')) selected = GEMINI_WEB_MODELS['gemini-3.5-flash-thinking-lite']
    else if (reqModel.includes('think')) selected = GEMINI_WEB_MODELS['gemini-3.5-flash-thinking']
    else if (reqModel.includes('auto')) selected = GEMINI_WEB_MODELS['gemini-auto']
    else if (reqModel.includes('lite') || reqModel.includes('fast')) selected = GEMINI_WEB_MODELS['gemini-flash-lite']
    else selected = GEMINI_WEB_MODELS['gemini-3.6-flash']
  }

  const modelId = selected.mode
  const thinkMode = selected.think

  const inner = new Array(80).fill(null)
  inner[0] = [prompt, 0, null, null, null, null, 0]
  inner[1] = ['en']
  inner[2] = ['', '', '', null, null, null, null, null, null, '']
  inner[6] = [0]
  inner[7] = 1
  inner[10] = 1
  inner[11] = 0
  inner[17] = [[thinkMode]]
  inner[18] = 0
  inner[27] = 1
  inner[30] = [4]
  inner[41] = [2]
  inner[53] = 0
  inner[59] = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36)
  inner[61] = []
  inner[68] = 1
  inner[79] = modelId

  const outer = [null, JSON.stringify(inner)]
  const bodyParams = new URLSearchParams()
  bodyParams.set('f.req', JSON.stringify(outer))

  const reqid = Math.floor(Date.now() / 1000) % 1000000
  const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${bl}&hl=id&_reqid=${reqid}&rt=c`

  const headers = {
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    accept: '*/*',
    'x-same-domain': '1',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    referer: 'https://gemini.google.com/'
  }

  if (cookie) {
    headers['cookie'] = cookie
  }

  const rawText = await httpPost(url, headers, bodyParams.toString())

  let finalAnswer = ''
  const lines = rawText.split('\n')
  for (const line of lines) {
    if (line.trim().startsWith('[["wrb.fr"')) {
      try {
        const parsed = JSON.parse(line.trim())
        const innerStr = parsed[0][2]
        if (innerStr) {
          const innerParsed = JSON.parse(innerStr)
          const text = findRc(innerParsed)
          if (text && text.length > finalAnswer.length) {
            finalAnswer = text
          }
        }
      } catch (e) {}
    }
  }

  if (!finalAnswer) {
    if (rawText.includes('BardErrorInfo')) {
      throw new Error('Google menolak request (Session / Cookie mungkin expired atau terblokir).')
    }
    throw new Error('Gagal mengekstrak jawaban dari Gemini Web. Balasan mentah: ' + rawText.substring(0, 200))
  }

  return finalAnswer
}
