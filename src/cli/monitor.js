import readline from 'readline'
import http from 'http'
import { WebSocket } from 'ws'
import { colors as c, drawLeftRail } from './theme.js'
import { launchUI, closeUI } from '../server/launcher.js'
import { checkForUpdate, getCurrentVersion } from '../server/services/updater.js'

const SERVER_URL = process.env.MARK_SERVER_URL || 'http://localhost:3000'
const WS_URL = process.env.MARK_WS_URL || 'ws://localhost:3000/stream'

let activeServerPort = 3000
let isUiActive = false
let currentConfig = {}
let lastFetchPayload = null
let isJsonInspectorOpen = false
let updateInfo = null
let isUpdateModalOpen = false

export function setUpdateInfo(info) {
  updateInfo = info
}

export function getUpdateInfo() {
  return updateInfo
}

function getTimeString() {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
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
    const json = await res.json()
    return json.data || json.config || {}
  } catch (_) {
    return {}
  }
}

export function printMonitorHeader(config = {}, uiActive = false) {
  const provider = config.aiProvider || 'gemini-web'
  const model =
    provider === 'gemini-web'
      ? config.geminiWebModel || 'gemini-3.6-flash'
      : provider === 'custom'
        ? config.customModel || 'default-model'
        : config.model || 'local-model'
  const cwd = process.cwd()

  const agentStatus = uiActive
    ? `${c.green}● Aktif${c.reset} ${c.darkGray}(Siap Digunakan)${c.reset}`
    : `${c.yellow}○ Standby${c.reset} ${c.darkGray}(Jendela Ditutup)${c.reset}`

  const lines = [
    ` ${c.bold}${c.green}● MARK${c.reset} ${c.white}Autonomous Companion${c.reset}  ${c.darkGray}[v${getCurrentVersion()}]${c.reset}`,
    ` ${c.darkGray}Workspace  :${c.reset} ${c.gray}${cwd}${c.reset}`,
    ` ${c.darkGray}Core Server:${c.reset} ${c.blue}http://localhost:${activeServerPort}${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Status:${c.reset} ${c.teal}Online${c.reset}`,
    ` ${c.darkGray}Status MARK:${c.reset} ${agentStatus}`,
    ` ${c.darkGray}AI Model   :${c.reset} ${c.cyan}${provider}${c.reset} ${c.darkGray}(${model})${c.reset}`
  ]

  if (updateInfo && updateInfo.hasUpdate) {
    lines.push('')
    lines.push(
      ` ${c.bold}${c.yellow}▲ UPDATE TERSEDIA:${c.reset} ${c.yellow}v${updateInfo.currentVersion} → v${updateInfo.latestVersion}${c.reset}  ${c.darkGray}(Tekan [p] untuk info)${c.reset}`
    )
    lines.push(
      ` ${c.darkGray}Perintah   :${c.reset} ${c.green}${updateInfo.instruction || 'npm i -g @mazees/mark'}${c.reset}`
    )
  }

  if (!uiActive) {
    lines.push('')
    lines.push(
      ` ${c.yellow}MARK sedang standby. Tekan ${c.green}[u]${c.yellow} untuk membuka MARK.${c.reset}`
    )
  }

  // Bersihkan layar & reset scrolling region sementara untuk render header
  process.stdout.write('\x1b[r\x1b[2J\x1b[1;1H')
  drawLeftRail('', lines, 74, uiActive ? c.darkGray : c.yellow)
  const updateShortcut = updateInfo?.hasUpdate
    ? `  ${c.darkGray}|${c.reset}  ${c.green}[p]${c.reset} ${c.yellow}Update Info${c.reset}`
    : ''
  console.log(
    ` ${c.darkGray}Shortcuts:${c.reset} ${c.green}[u]${c.reset} ${c.gray}Buka MARK${c.reset}${updateShortcut}  ${c.darkGray}|${c.reset}  ${c.green}[c]${c.reset} ${c.gray}Bersihkan Layar${c.reset}  ${c.darkGray}|${c.reset}  ${c.green}[q]${c.reset} ${c.gray}Keluar${c.reset}\n`
  )
  console.log(
    ` ${c.darkGray}── Live Activity ─────────────────────────────────────────────────────────────${c.reset}`
  )

  // Kunci baris 1 s/d headerHeight agar tidak tertimbun oleh scroll log
  const headerHeight = lines.length + 5
  const totalRows = process.stdout.rows || 30
  if (totalRows > headerHeight + 2) {
    process.stdout.write(`\x1b[${headerHeight + 1};${totalRows}r`)
    process.stdout.write(`\x1b[${headerHeight + 1};1H`)
  }
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

  const cleanDetail = detail
    ? ` ${c.darkGray}›${c.reset} ${c.gray}${String(detail).replace(/\n/g, ' ').slice(0, 110)}${c.reset}`
    : ''
  console.log(
    ` ${c.darkGray}${time}${c.reset}  ${badge}  ${c.white}${title}${c.reset}${cleanDetail}`
  )
}

export function toggleUpdateModal(config) {
  isUpdateModalOpen = !isUpdateModalOpen
  if (!isUpdateModalOpen) {
    printMonitorHeader(config, isUiActive)
    logActivity('agent', 'Info update ditutup. Monitor kembali ke mode live.')
  } else {
    process.stdout.write('\x1b[r')
    printUpdateModal(updateInfo)
  }
}

export function printUpdateModal(info) {
  const latest = info?.latestVersion || 'terbaru'
  const curr = info?.currentVersion || getCurrentVersion()
  const instruction = info?.instruction || 'npm install -g @mazees/mark@latest'

  console.log(
    `\n ${c.bold}${c.green}── [INFO UPDATE MARK] ───────────────────────────────────────────────────────${c.reset}\n`
  )
  console.log(
    ` Versi terbaru ${c.bold}${c.cyan}@mazees/mark${c.reset} (${c.green}v${latest}${c.reset}) telah dirilis di npm!`
  )
  console.log(` Versi yang terpasang saat ini: ${c.yellow}v${curr}${c.reset}\n`)
  console.log(
    ` ${c.white}Untuk memperbarui ke versi terbaru, jalankan perintah berikut di terminal:${c.reset}`
  )
  console.log(`\n   ${c.bold}${c.green}${instruction}${c.reset}\n`)
  console.log(
    ` ${c.darkGray}Petunjuk: Matikan MARK terlebih dahulu ([q]) sebelum menjalankan perintah update.${c.reset}`
  )
  console.log(
    `\n ${c.bold}${c.green}─────────────────────────────────────────────────────────────────────────────${c.reset}`
  )
  console.log(
    ` ${c.gray}Tekan ${c.green}[p]${c.gray} atau ${c.green}[Enter]${c.gray} untuk kembali ke dashboard live...${c.reset}\n`
  )
}

export function toggleJsonInspector(config) {
  isJsonInspectorOpen = !isJsonInspectorOpen
  if (!isJsonInspectorOpen) {
    printMonitorHeader(config, isUiActive)
    logActivity('agent', 'JSON Inspector ditutup. Monitor kembali ke mode live.')
  } else {
    process.stdout.write('\x1b[r')
    printJsonInspector(lastFetchPayload)
  }
}

export function printJsonInspector(payload) {
  console.log(
    `\n ${c.bold}${c.green}── [INFO] AI Request Inspector ── [Tekan 'j' untuk kembali] ──────────────────${c.reset}\n`
  )
  console.log(
    ` ${c.gray}Untuk performa maksimal dan bebas lag, payload raksasa kini diinspeksi via:${c.reset}`
  )
  console.log(` ${c.cyan}WebUI DevTools Console (F12) › window.__LAST_AI__${c.reset}\n`)
  if (payload) {
    console.log(` ${c.white}Metadata Permintaan Terakhir:${c.reset}`)
    console.log(
      ` ${c.darkGray}Provider      :${c.reset} ${c.teal}${payload.provider || '-'}${c.reset}`
    )
    console.log(
      ` ${c.darkGray}Model         :${c.reset} ${c.teal}${payload.model || '-'}${c.reset}`
    )
    console.log(
      ` ${c.darkGray}Messages Count:${c.reset} ${c.teal}${payload.messagesCount ?? '-'}${c.reset}`
    )
    console.log(
      ` ${c.darkGray}Has Tools     :${c.reset} ${c.teal}${payload.hasTools ? 'Ya' : 'Tidak'}${c.reset}`
    )
  } else {
    console.log(` ${c.yellow}● Belum ada riwayat aktivitas request AI.${c.reset}`)
  }
  console.log(
    `\n ${c.bold}${c.green}─────────────────────────────────────────────────────────────────────────────${c.reset}\n`
  )
}

export async function runMonitor(portOverride) {
  let serverPort = portOverride || Number(process.env.PORT) || 3000
  activeServerPort = serverPort
  let serverUrl = `http://localhost:${serverPort}`
  let wsUrl = `ws://localhost:${serverPort}/stream`

  let isAlive = await new Promise((resolve) => {
    http
      .get(`${serverUrl}/api/health`, (res) => resolve(res.statusCode === 200))
      .on('error', () => resolve(false))
  })

  if (!isAlive) {
    const serverModule = await import('../server/index.js')
    serverPort = serverModule.activePort || serverPort
    activeServerPort = serverPort
    serverUrl = `http://localhost:${serverPort}`
    wsUrl = `ws://localhost:${serverPort}/stream`
    await new Promise((resolve) => setTimeout(resolve, 600))
  }

  currentConfig = await (async () => {
    try {
      const res = await fetch(`${serverUrl}/api/config`)
      const data = await res.json()
      return data.config || {}
      const json = await res.json()
      return json.data || json.config || {}
    } catch (_) {
      return {}
    }
  })()

  printMonitorHeader(currentConfig, isUiActive)

  logActivity('agent', `MARK Server aktif di port ${serverPort}`)
  logActivity('agent', 'Membuka antarmuka MARK...')

  // Pengecekan update versi terbaru di latar belakang (non-blocking)
  checkForUpdate()
    .then((info) => {
      if (info && info.hasUpdate) {
        updateInfo = info
        if (!isJsonInspectorOpen && !isUpdateModalOpen) {
          printMonitorHeader(currentConfig, isUiActive)
          logActivity(
            'agent',
            'Update Tersedia',
            `v${info.currentVersion} → v${info.latestVersion} (Tekan [p] utk perintah update)`
          )
        }
      }
    })
    .catch(() => {})

  // Connect WebSocket live streaming
  try {
    const ws = new WebSocket(wsUrl)
    ws.on('open', () => {
      logActivity('agent', 'Core server siap menerima koneksi.')
    })
    ws.on('message', (data) => {
      try {
        const { event, payload } = JSON.parse(data.toString())
        if (event === 'ui:status') {
          const wasActive = isUiActive
          isUiActive = !!payload?.active
          if (wasActive !== isUiActive && !isJsonInspectorOpen) {
            printMonitorHeader(currentConfig, isUiActive)
            if (isUiActive) {
              logActivity('agent', 'MARK terhubung dan siap digunakan.')
            } else {
              logActivity('agent', 'MARK ditutup (mode standby). Tekan [u] untuk membuka kembali.')
            }
          }
        } else if (event === 'config:updated') {
          currentConfig = payload || {}
          if (!isJsonInspectorOpen) {
            printMonitorHeader(currentConfig, isUiActive)
            const providerStr = currentConfig.aiProvider || 'AI'
            const modelStr =
              providerStr === 'custom'
                ? currentConfig.customModel || 'custom'
                : providerStr === 'gemini-web'
                  ? currentConfig.geminiWebModel || 'gemini'
                  : currentConfig.model || ''
            logActivity('agent', 'Konfigurasi diperbarui', `${providerStr} (${modelStr})`)
          }
        } else if (event === 'ai:fetch') {
          lastFetchPayload = payload
          const info = `[${payload.provider}/${payload.model}] ${payload.messagesCount || 0} msgs${payload.hasTools ? `, ${payload.toolsCount || 0} tools` : ''}`
          logActivity('fetch', `AI Request (${payload.type || 'fetch'})`, info)
        } else if (event === 'agent:thought') {
          logActivity('thought', `Turn ${payload.turn}`, payload.thought)
        } else if (event === 'tool:call') {
          logActivity('tool', payload.tool, payload.query)
        } else if (event === 'tool:result') {
          logActivity('result', payload.tool, payload.observation)
        } else if (event === 'chat:receive') {
          logActivity('agent', 'Pesan diterima', payload.message)
        } else if (event === 'awareness:entry') {
          logActivity('agent', 'Active Window', `[${payload.app}] ${payload.title}`)
        } else if (event === 'browser:preview' && !payload.closed) {
          logActivity('tool', 'Browser Preview', `${payload.title || ''} (${payload.url || ''})`)
        }
      } catch (_) {}
    })
  } catch (_) {}

  // Restore scroll region saat resize terminal
  process.stdout.on('resize', () => {
    if (!isJsonInspectorOpen) {
      printMonitorHeader(currentConfig, isUiActive)
    }
  })

  // Pastikan terminal dikembalikan normal saat exit
  process.on('exit', () => {
    process.stdout.write('\x1b[r\x1b[?25h')
  })

  // Raw Mode Keyboard Listener for quick actions
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  readline.emitKeypressEvents(process.stdin)
  process.stdin.resume()

  process.stdin.on('keypress', async (chunk, key) => {
    if (!key) return

    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.stdout.write('\x1b[r\x1b[?25h')
      console.log(
        `\n ${c.yellow}●${c.reset} ${c.gray}Mematikan MARK Core Engine. Sampai jumpa!${c.reset}\n`
      )
      closeUI()
      process.exit(0)
    } else if (key.name === 'u' || key.name === 'o') {
      logActivity('agent', 'Membuka MARK...')
      await launchUI({ port: serverPort, mode: 'app' })
    } else if (key.name === 'p') {
      currentConfig = await fetchConfig()
      toggleUpdateModal(currentConfig)
    } else if (key.name === 'j' || key.name === 'd') {
      currentConfig = await fetchConfig()
      toggleJsonInspector(currentConfig)
    } else if (key.name === 'c') {
      currentConfig = await fetchConfig()
      printMonitorHeader(currentConfig, isUiActive)
      logActivity('agent', 'Layar dibersihkan.')
    } else if (isUpdateModalOpen && (key.name === 'return' || key.name === 'escape')) {
      toggleUpdateModal(currentConfig)
    }
  })
}

// Jalankan jika dipanggil mandiri
if (process.argv[1]?.endsWith('cli/monitor.js')) {
  runMonitor().catch((err) => console.error('[Monitor Fatal Error]:', err))
}
