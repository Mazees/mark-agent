import readline from 'readline'
import http from 'http'
import { WebSocket } from 'ws'
import {
  colors as c,
  printHeader,
  printThought,
  printToolCall,
  printToolResult,
  printAssistantAnswer,
  drawBox,
  promptSelect
} from './theme.js'

const SERVER_URL = process.env.MARK_SERVER_URL || 'http://localhost:3000'
const WS_URL = process.env.MARK_WS_URL || 'ws://localhost:3000/stream'

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
    const json = await res.json()
    return json.data || {}
  } catch (_) {
    return {}
  }
}

async function updateConfig(updates) {
  try {
    const res = await fetch(`${SERVER_URL}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    const json = await res.json()
    return json.data
  } catch (err) {
    console.error(` ${c.red}[Error]${c.reset} Gagal update konfigurasi: ${err.message}`)
    return null
  }
}

async function triggerLauncher(mode = 'app') {
  try {
    const res = await fetch(`${SERVER_URL}/api/launcher/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    })
    const data = await res.json()
    console.log(` ${c.green}●${c.reset} ${c.white}${data.message || 'WebUI berhasil dibuka.'}${c.reset}\n`)
  } catch (err) {
    console.error(` ${c.red}[Launcher Error]${c.reset} ${err.message}\n`)
  }
}

async function showMemoryList() {
  try {
    const res = await fetch(`${SERVER_URL}/api/memories`)
    const json = await res.json()
    const memories = json.data || []

    if (memories.length === 0) {
      console.log(` ${c.darkGray}Belum ada memori pengguna tersimpan di MMS.${c.reset}\n`)
      return
    }

    const lines = memories.slice(0, 10).map((m, idx) => {
      const type = `[${(m.type || 'info').toUpperCase()}]`
      return ` ${c.cyan}${String(idx + 1).padStart(2, ' ')}.${c.reset} ${c.teal}${type}${c.reset} ${c.white}${m.summary || m.memory || m.content}${c.reset}`
    })

    drawBox('MMS Stored Memories', lines, 74, c.darkGray)
    console.log()
  } catch (err) {
    console.error(` ${c.red}[Memory Error]${c.reset} ${err.message}\n`)
  }
}

async function showStatus() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`)
    const health = await res.json()
    const conf = await fetchConfig()
    const memUsage = process.memoryUsage()

    const lines = [
      ` ${c.darkGray}Core Status :${c.reset} ${c.green}ONLINE${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Version :${c.reset} ${c.white}${health.version || '5.0.0'}${c.reset}`,
      ` ${c.darkGray}Uptime      :${c.reset} ${c.white}${Math.floor(health.uptime || 0)}s${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Process :${c.reset} ${c.white}Node.js ${process.version}${c.reset}`,
      ` ${c.darkGray}Heap Usage  :${c.reset} ${c.white}${Math.round(memUsage.heapUsed / 1024 / 1024)} MB${c.reset} / ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      ` ${c.darkGray}AI Engine   :${c.reset} ${c.cyan}${conf.aiProvider || 'lm-studio'}${c.reset} ${c.darkGray}(${conf.model || 'default'})${c.reset}`,
      ` ${c.darkGray}Speech API  :${c.reset} ${c.green}Microsoft Edge Web Speech (Native 0 MB)${c.reset}`
    ]

    drawBox('System Diagnostics', lines, 74, c.darkGray)
    console.log()
  } catch (err) {
    console.error(` ${c.red}[Status Error]${c.reset} ${err.message}\n`)
  }
}

function showHelp() {
  const lines = [
    ` ${c.green}/ui${c.reset}               › Buka antarmuka WebUI dalam Edge App Mode (Jendela Desktop)`,
    ` ${c.green}/web${c.reset}              › Buka antarmuka WebUI di Browser Standar`,
    ` ${c.green}/provider <nama>${c.reset}   › Ubah provider AI (lm-studio, custom, gemini-web)`,
    ` ${c.green}/model <nama>${c.reset}      › Ubah model AI yang aktif (mis. /model google/gemma-3-4b)`,
    ` ${c.green}/memory${c.reset}           › Lihat memori pengguna dan preferensi yang tersimpan di MMS`,
    ` ${c.green}/status${c.reset}           › Cek kesehatan server, RAM usage, dan konektivitas`,
    ` ${c.green}/clear${c.reset}            › Bersihkan layar terminal dan gambar ulang header`,
    ` ${c.green}/exit${c.reset}             › Matikan MARK Core Engine dan tutup CLI`
  ]
  drawBox('Available Commands', lines, 74, c.darkGray)
  console.log()
}

export async function runCLI() {
  const isAlive = await checkServerHealth()
  if (!isAlive) {
    await import('../server/index.js')
    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  let config = await fetchConfig()
  printHeader(config)

  // Connect WebSocket for live streaming
  let ws = null
  try {
    ws = new WebSocket(WS_URL)
    ws.on('message', (data) => {
      try {
        const { event, payload } = JSON.parse(data.toString())
        if (event === 'agent:thought') {
          printThought(payload.thought, payload.turn)
        } else if (event === 'tool:call') {
          printToolCall(payload.tool, payload.query)
        } else if (event === 'tool:result') {
          printToolResult(payload.tool, payload.observation)
        }
      } catch (_) {}
    })
  } catch (_) {}

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.bold}${c.green}› ${c.reset}`
  })

  let activeMenu = null

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()

    // Tangani input saat menu interaktif aktif
    if (activeMenu === 'provider') {
      activeMenu = null
      const val = input.toLowerCase()
      let selected = null
      if (val === '1' || val === 'lm-studio' || val === 'lmstudio' || val === 'local') selected = 'lm-studio'
      else if (val === '2' || val === 'custom') selected = 'custom'
      else if (val === '3' || val === 'gemini-web' || val === 'gemini') selected = 'gemini-web'

      if (selected) {
        await updateConfig({ aiProvider: selected })
        console.log(`\n ${c.green}✓${c.reset} Provider berhasil diubah ke: ${c.bold}${c.cyan}${selected}${c.reset}\n`)
      } else if (input) {
        console.log(`\n ${c.yellow}i${c.reset} Pilihan dibatalkan atau tidak valid.\n`)
      } else {
        console.log()
      }
      rl.prompt()
      return
    }

    if (!input) {
      rl.prompt()
      return
    }

    if (input === '/exit') {
      console.log(`\n ${c.yellow}●${c.reset} ${c.gray}Menutup sesi CLI. Sampai jumpa!${c.reset}\n`)
      process.exit(0)
    }

    if (input === '/clear') {
      config = await fetchConfig()
      printHeader(config)
      rl.prompt()
      return
    }

    if (input === '/help') {
      showHelp()
      rl.prompt()
      return
    }

    if (input === '/ui') {
      await triggerLauncher('app')
      rl.prompt()
      return
    }

    if (input === '/web') {
      await triggerLauncher('browser')
      rl.prompt()
      return
    }

    if (input === '/provider') {
      rl.pause()
      const conf = await fetchConfig()
      const curProv = conf.aiProvider || 'lm-studio'

      const selected = await promptSelect({
        title: 'Select AI Provider',
        activeId: curProv,
        options: [
          { id: 'lm-studio', title: 'LM Studio', description: '(Local LLM - localhost:1234)' },
          { id: 'custom', title: 'Custom API', description: '(OpenAI-Compatible Endpoint)' },
          { id: 'gemini-web', title: 'Gemini Web', description: '(Native Gemini Web RPC Engine)' }
        ]
      })

      if (selected && selected !== curProv) {
        await updateConfig({ aiProvider: selected })
        console.log(`\n ${c.green}✓${c.reset} Provider berhasil diubah ke: ${c.bold}${c.cyan}${selected}${c.reset}\n`)
      } else if (selected) {
        console.log(`\n ${c.gray}Provider tetap: ${selected}${c.reset}\n`)
      } else {
        console.log(`\n ${c.yellow}i${c.reset} ${c.gray}Pemilihan dibatalkan.${c.reset}\n`)
      }

      rl.resume()
      rl.prompt()
      return
    }

    if (input.startsWith('/provider ')) {
      const raw = input.slice(10).trim().toLowerCase()
      let selected = null
      if (raw === '1' || raw === 'lm-studio' || raw === 'lmstudio' || raw === 'local') selected = 'lm-studio'
      else if (raw === '2' || raw === 'custom') selected = 'custom'
      else if (raw === '3' || raw === 'gemini-web' || raw === 'gemini') selected = 'gemini-web'

      if (selected) {
        await updateConfig({ aiProvider: selected })
        console.log(` ${c.green}✓${c.reset} Provider berhasil diubah ke: ${c.bold}${c.cyan}${selected}${c.reset}\n`)
      } else {
        console.log(` ${c.yellow}i${c.reset} Penggunaan: ${c.white}/provider <lm-studio | custom | gemini-web>${c.reset}\n`)
      }
      rl.prompt()
      return
    }

    if (input.startsWith('/model')) {
      const parts = input.split(' ')
      if (parts.length > 1 && parts[1].trim()) {
        const newModel = parts[1].trim()
        await updateConfig({ model: newModel, customModel: newModel })
        console.log(` ${c.green}✓${c.reset} Model berhasil diubah ke: ${c.cyan}${newModel}${c.reset}\n`)
      } else {
        console.log(` ${c.yellow}i${c.reset} Penggunaan: ${c.white}/model <nama-model>${c.reset}\n`)
      }
      rl.prompt()
      return
    }

    if (input === '/memory') {
      await showMemoryList()
      rl.prompt()
      return
    }

    if (input === '/status') {
      await showStatus()
      rl.prompt()
      return
    }

    // Chat Turn Execution
    process.stdout.write(` ${c.darkGray}● Berpikir...${c.reset}\r`)
    try {
      const response = await fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, sessionId: 'cli' })
      })
      process.stdout.write('\r\x1b[K')
      const data = await response.json()
      if (data.answer) {
        printAssistantAnswer(data.answer)
      } else if (data.error || !response.ok) {
        const errorMsg = data.error?.message || data.error || `HTTP error ${response.status}`
        console.log(`\n ${c.red}● Error:${c.reset} ${c.white}${errorMsg}${c.reset}`)
        if (errorMsg.includes('Cookie') || errorMsg.includes('Google menolak') || errorMsg.includes('Session')) {
          console.log(` ${c.darkGray}Tip: Provider saat ini adalah 'gemini-web'. Ketik ${c.green}/provider lm-studio${c.darkGray} untuk beralih ke Local LLM.${c.reset}\n`)
        } else {
          console.log()
        }
      } else {
        console.log(` ${c.gray}(Tidak ada respons)${c.reset}\n`)
      }
    } catch (err) {
      process.stdout.write('\r\x1b[K')
      console.log(`\n ${c.red}● Error:${c.reset} ${c.white}${err.message}${c.reset}\n`)
    }

    rl.prompt()
  })
}

// Jalankan jika dipanggil secara mandiri
if (process.argv[1]?.endsWith('cli/index.js')) {
  runCLI().catch((err) => console.error('[CLI Fatal Error]:', err))
}
