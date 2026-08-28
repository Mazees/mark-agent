import readline from 'readline'
import http from 'http'
import { WebSocket } from 'ws'
import { colors as c, drawBox } from './theme.js'
import { launchUI, closeUI } from '../server/launcher.js'

const SERVER_URL = process.env.MARK_SERVER_URL || 'http://localhost:3000'
const WS_URL = process.env.MARK_WS_URL || 'ws://localhost:3000/stream'

function getTimeString() {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function checkServerHealth() {
  return new Promise((resolve) => {
    http
      .get(`${SERVER_URL}/api/health`, (res) => {
        resolve(res.statusCode === 200)
      })
      .on('error', () => {
        resolve(false)
      })
  })
}

async function fetchConfig() {
  try {
    const res = await fetch(`${SERVER_URL}/api/config`)
    const data = await res.json()
    return data.config || {}
  } catch (_) {
    return {}
  }
}

export function printMonitorHeader(config = {}) {
  console.clear()
  const provider = config.aiProvider || 'lm-studio'
  const model = config.model || config.customModel || 'google/gemma-3-4b'
  const cwd = process.cwd()

  const lines = [
    ` ${c.bold}${c.green}● MARK${c.reset} ${c.white}Autonomous Companion${c.reset}  ${c.darkGray}[v5.0.0 Engine]${c.reset}`,
    ` ${c.darkGray}Workspace  :${c.reset} ${c.gray}${cwd}${c.reset}`,
    ` ${c.darkGray}Core Server:${c.reset} ${c.blue}http://localhost:3000${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Status:${c.reset} ${c.teal}Running${c.reset}`,
    ` ${c.darkGray}AI Engine  :${c.reset} ${c.cyan}${provider}${c.reset} ${c.darkGray}(${model})${c.reset}`,
    ` ${c.darkGray}WebUI Mode :${c.reset} ${c.green}Microsoft Edge App Mode (Active)${c.reset}`
  ]

  drawBox('', lines, 74, c.darkGray)
  console.log(
    ` ${c.darkGray}Shortcuts:${c.reset} ${c.green}[u]${c.reset} ${c.gray}Buka WebUI${c.reset}  ${c.darkGray}|${c.reset}  ${c.green}[j]${c.reset} ${c.gray}Inspect/Tutup JSON Fetch${c.reset}  ${c.darkGray}|${c.reset}  ${c.green}[c]${c.reset} ${c.gray}Clear Log${c.reset}  ${c.darkGray}|${c.reset}  ${c.green}[q]${c.reset} ${c.gray}Keluar${c.reset}\n`
  )
  console.log(` ${c.darkGray}── Live Activity Monitor ───────────────────────────────────────────────${c.reset}`)
}

export function logActivity(type, title, detail = '') {
  const time = getTimeString()
  let badge = `${c.darkGray}● Info   ${c.reset}`
  if (type === 'agent') badge = `${c.cyan}● Agent  ${c.reset}`
  else if (type === 'tool') badge = `${c.yellow}⚡ Tool   ${c.reset}`
  else if (type === 'result') badge = `${c.green}✓ Result ${c.reset}`
  else if (type === 'thought') badge = `${c.purple}● Thought${c.reset}`
  else if (type === 'fetch') badge = `${c.blue}📡 Fetch  ${c.reset}`
  else if (type === 'error') badge = `${c.red}● Error  ${c.reset}`

  const cleanDetail = detail ? ` ${c.darkGray}›${c.reset} ${c.gray}${String(detail).replace(/\n/g, ' ').slice(0, 110)}${c.reset}` : ''
  console.log(` ${c.darkGray}${time}${c.reset}  ${badge}  ${c.white}${title}${c.reset}${cleanDetail}`)
}

let lastFetchPayload = null
let isJsonInspectorOpen = false

export function toggleJsonInspector(currentConfig) {
  isJsonInspectorOpen = !isJsonInspectorOpen
  if (!isJsonInspectorOpen) {
    printMonitorHeader(currentConfig)
    logActivity('agent', 'JSON Inspector ditutup. Monitor kembali ke mode live.')
  } else {
    printJsonInspector(lastFetchPayload)
  }
}

export function printJsonInspector(payload) {
  if (!payload) {
    console.log(`\n ${c.yellow}●${c.reset} ${c.gray}Belum ada payload request JSON yang di-fetch. Menunggu request dari WebUI...${c.reset}\n`)
    return
  }

  const jsonStr = JSON.stringify(payload, null, 2)
  const lines = jsonStr.split('\n')

  console.log(`\n ${c.bold}${c.green}── [INSPECT] AI Request JSON Payload (${lines.length} lines) ── [Tekan 'j' untuk tutup/kembali] ──${c.reset}\n`)
  for (let i = 0; i < lines.length; i++) {
    console.log(` ${c.cyan}${lines[i]}${c.reset}`)
  }
  console.log(`\n ${c.bold}${c.green}────────────────────────────────────────────────────────────────────────────────────────${c.reset}\n`)
}

export async function runMonitor(portOverride) {
  let serverPort = portOverride || Number(process.env.PORT) || 3000
  let serverUrl = `http://localhost:${serverPort}`
  let wsUrl = `ws://localhost:${serverPort}/stream`

  let isAlive = await new Promise((resolve) => {
    http.get(`${serverUrl}/api/health`, (res) => resolve(res.statusCode === 200)).on('error', () => resolve(false))
  })

  if (!isAlive) {
    const serverModule = await import('../server/index.js')
    serverPort = serverModule.activePort || serverPort
    serverUrl = `http://localhost:${serverPort}`
    wsUrl = `ws://localhost:${serverPort}/stream`
    await new Promise((resolve) => setTimeout(resolve, 600))
  }

  const config = await (async () => {
    try {
      const res = await fetch(`${serverUrl}/api/config`)
      const data = await res.json()
      return data.config || {}
    } catch (_) {
      return {}
    }
  })()

  printMonitorHeader(config)

  logActivity('agent', `MARK Server aktif di port ${serverPort}`)
  logActivity('agent', 'Membuka antarmuka WebUI Microsoft Edge...')

  // Connect WebSocket live streaming
  try {
    const ws = new WebSocket(wsUrl)
    ws.on('open', () => {
      logActivity('agent', 'Engine siap menerima input dari WebUI')
    })
    ws.on('message', (data) => {
      try {
        const { event, payload } = JSON.parse(data.toString())
        if (event === 'ai:fetch') {
          lastFetchPayload = payload
          const info = `[${payload.provider}/${payload.model}] ${payload.messagesCount || 0} msgs${payload.hasTools ? `, ${payload.toolsCount || 0} tools` : ''}`
          logActivity('fetch', `AI Request (${payload.type || 'fetch'})`, `${info} (Tekan [j] utk inspect)`)
        } else if (event === 'agent:thought') {
          logActivity('thought', `Turn ${payload.turn}`, payload.thought)
        } else if (event === 'tool:call') {
          logActivity('tool', payload.tool, payload.query)
        } else if (event === 'tool:result') {
          logActivity('result', payload.tool, payload.observation)
        } else if (event === 'chat:receive') {
          logActivity('agent', 'Menerima pesan dari WebUI', payload.message)
        } else if (event === 'awareness:entry') {
          logActivity('agent', 'Active Window', `[${payload.app}] ${payload.title}`)
        } else if (event === 'browser:preview' && !payload.closed) {
          logActivity('tool', 'Browser Preview', `${payload.title || ''} (${payload.url || ''})`)
        }
      } catch (_) {}
    })
  } catch (_) {}

  // Raw Mode Keyboard Listener for quick actions
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  readline.emitKeypressEvents(process.stdin)
  process.stdin.resume()

  process.stdin.on('keypress', async (chunk, key) => {
    if (!key) return

    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log(`\n ${c.yellow}●${c.reset} ${c.gray}Mematikan MARK Core Engine. Sampai jumpa!${c.reset}\n`)
      closeUI()
      process.exit(0)
    } else if (key.name === 'u' || key.name === 'o') {
      logActivity('agent', 'Membuka kembali jendela WebUI...')
      await launchUI({ port: serverPort, mode: 'app' })
    } else if (key.name === 'j' || key.name === 'd') {
      const currentConfig = await (async () => {
        try {
          const res = await fetch(`${serverUrl}/api/config`)
          const data = await res.json()
          return data.config || {}
        } catch (_) {
          return {}
        }
      })()
      toggleJsonInspector(currentConfig)
    } else if (key.name === 'c') {
      const currentConfig = await (async () => {
        try {
          const res = await fetch(`${serverUrl}/api/config`)
          const data = await res.json()
          return data.config || {}
        } catch (_) {
          return {}
        }
      })()
      printMonitorHeader(currentConfig)
    }
  })
}

// Jalankan jika dipanggil mandiri
if (process.argv[1]?.endsWith('cli/monitor.js')) {
  runMonitor().catch((err) => console.error('[Monitor Fatal Error]:', err))
}
