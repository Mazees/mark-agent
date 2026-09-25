import readline from 'readline'
import fs from 'fs'

let appVersion = '5.0.0'
try {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
  if (pkg.version) appVersion = pkg.version
} catch (_) {}

/**
 * CLI Theme and Formatting Utilities for MARK
 * Claude Code & Antigravity aesthetic (Zero Emojis, Clean Box Drawing, Developer-grade Typography)
 */

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground
  green: '\x1b[38;2;31;184;84m', // #1fb854 (MARK Primary Green)
  emerald: '\x1b[38;2;16;185;129m',
  teal: '\x1b[38;2;45;212;191m',
  cyan: '\x1b[38;2;56;189;248m',
  blue: '\x1b[38;2;96;165;250m',
  purple: '\x1b[38;2;192;132;252m',
  yellow: '\x1b[38;2;251;191;36m',
  orange: '\x1b[38;2;251;146;60m',
  red: '\x1b[38;2;248;113;113m',
  gray: '\x1b[38;2;148;163;184m',
  darkGray: '\x1b[38;2;71;85;105m',
  white: '\x1b[38;2;241;245;249m',

  // Background
  bgDark: '\x1b[48;2;15;23;21m',
  bgCard: '\x1b[48;2;25;54;45m'
}

export function stripAnsi(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

export function truncateAnsi(str, maxWidth) {
  if (!str) return ''
  const plain = stripAnsi(str)
  if (plain.length <= maxWidth) return str
  if (maxWidth <= 3) return '.'.repeat(Math.max(1, maxWidth))

  const targetLen = maxWidth - 3
  let visible = 0
  let result = ''
  let inAnsi = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (char === '\x1b') {
      inAnsi = true
      result += char
      continue
    }
    if (inAnsi) {
      result += char
      if (/[a-zA-Z]/.test(char)) {
        inAnsi = false
      }
      continue
    }

    result += char
    visible++
    if (visible >= targetLen) {
      result += '...\x1b[0m'
      break
    }
  }
  return result
}

export function resolveWidth(customWidth = null, fallbackMax = 78, min = 40) {
  const cols = process.stdout.columns || 80
  const maxAllowed = Math.max(min, cols - 3)
  if (typeof customWidth === 'number' && customWidth > 0) {
    return Math.min(customWidth, maxAllowed)
  }
  return Math.min(fallbackMax, maxAllowed)
}

export function drawDivider(label = '', width = null, color = colors.darkGray) {
  const w = resolveWidth(width)
  if (!label) {
    return `${color}${'─'.repeat(Math.max(0, w))}${colors.reset}`
  }
  const clean = stripAnsi(label)
  const remain = Math.max(0, w - clean.length - 4)
  return `${color}── ${label} ${'─'.repeat(remain)}${colors.reset}`
}

export function drawBox(
  title = '',
  contentLines = [],
  width = null,
  borderColor = colors.darkGray
) {
  const c = colors
  const w = resolveWidth(width, 78)
  const cleanTitle = stripAnsi(title)

  let topBorder
  if (cleanTitle) {
    const dashCount = Math.max(0, w - cleanTitle.length - 5)
    topBorder = `${borderColor}╭─ ${c.bold}${c.green}${title}${c.reset}${borderColor} ${'─'.repeat(dashCount)}╮${c.reset}`
  } else {
    const dashCount = Math.max(0, w - 3)
    topBorder = `${borderColor}╭─${'─'.repeat(dashCount)}╮${c.reset}`
  }
  const bottomBorder = `${borderColor}╰${'─'.repeat(Math.max(0, w - 2))}╯${c.reset}`

  console.log(topBorder)
  const innerWidth = Math.max(10, w - 2)

  // Flatten lines in case content contains embedded newlines
  const flatLines = []
  for (const raw of contentLines) {
    const parts = String(raw ?? '').split(/\r?\n/)
    flatLines.push(...parts)
  }

  for (const line of flatLines) {
    const safeLine = truncateAnsi(line, innerWidth)
    const padLen = Math.max(0, innerWidth - stripAnsi(safeLine).length)
    console.log(
      `${borderColor}│${c.reset}${safeLine}${' '.repeat(padLen)}${borderColor}│${c.reset}`
    )
  }
  console.log(bottomBorder)
}

export function drawLeftRail(
  title = '',
  contentLines = [],
  width = null,
  borderColor = colors.darkGray
) {
  const c = colors
  const w = resolveWidth(width, 78)
  const cleanTitle = stripAnsi(title)

  let topBorder
  if (cleanTitle) {
    const dashCount = Math.max(0, w - cleanTitle.length - 4)
    topBorder = `${borderColor}┌─ ${c.bold}${c.green}${title}${c.reset}${borderColor} ${'─'.repeat(dashCount)}${c.reset}`
  } else {
    const dashCount = Math.max(0, w - 2)
    topBorder = `${borderColor}┌─${'─'.repeat(dashCount)}${c.reset}`
  }
  const bottomBorder = `${borderColor}└${'─'.repeat(Math.max(0, w - 1))}${c.reset}`

  console.log(topBorder)
  const innerWidth = Math.max(10, w - 2)

  const flatLines = []
  for (const raw of contentLines) {
    const parts = String(raw ?? '').split(/\r?\n/)
    flatLines.push(...parts)
  }

  for (const line of flatLines) {
    const safeLine = truncateAnsi(line, innerWidth)
    console.log(`${borderColor}│${c.reset}${safeLine}`)
  }
  console.log(bottomBorder)
}

export function printHeader(config = {}) {
  const c = colors
  console.clear()
  const provider = config.aiProvider || 'gemini-web'
  const model =
    provider === 'gemini-web'
      ? config.geminiWebModel || 'gemini-3.6-flash'
      : provider === 'custom'
        ? config.customModel || 'default-model'
        : config.model || 'local-model'
  const cwd = process.cwd()
  const termWidth = resolveWidth(null, 78)
  const maxCwd = Math.max(15, termWidth - 18)
  const displayCwd = cwd.length > maxCwd ? '...' + cwd.slice(-(maxCwd - 3)) : cwd

  const lines = [
    ` ${c.bold}${c.green}● MARK${c.reset} ${c.white}Autonomous Companion${c.reset}  ${c.darkGray}[v${appVersion}]${c.reset}`,
    ` ${c.darkGray}Workspace :${c.reset} ${c.gray}${displayCwd}${c.reset}`,
    ` ${c.darkGray}Provider  :${c.reset} ${c.cyan}${provider}${c.reset} ${c.darkGray}(${model})${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Port:${c.reset} ${c.teal}3000${c.reset}`,
    ` ${c.darkGray}WebUI     :${c.reset} ${c.blue}http://localhost:3000${c.reset} ${c.darkGray}[Edge App Mode Ready]${c.reset}`
  ]

  drawBox('', lines, termWidth, c.darkGray)

  const cols = process.stdout.columns || 80
  if (cols < 70) {
    console.log(
      ` ${c.darkGray}Cmds:${c.reset} ${c.green}/ui /web /provider /model /memory /status /clear /exit${c.reset}\n`
    )
  } else {
    console.log(
      ` ${c.darkGray}Commands:${c.reset} ${c.green}/ui${c.reset} ${c.darkGray}|${c.reset} ${c.green}/web${c.reset} ${c.darkGray}|${c.reset} ${c.green}/provider${c.reset} ${c.darkGray}|${c.reset} ${c.green}/model${c.reset} ${c.darkGray}|${c.reset} ${c.green}/memory${c.reset} ${c.darkGray}|${c.reset} ${c.green}/status${c.reset} ${c.darkGray}|${c.reset} ${c.green}/clear${c.reset} ${c.darkGray}|${c.reset} ${c.green}/exit${c.reset}\n`
    )
  }
}

export function printThought(thought, turn = 1) {
  const c = colors
  const lines = [` ${c.gray}${thought.trim()}${c.reset}`]
  drawBox(`Thought (Turn ${turn})`, lines, null, c.darkGray)
  console.log()
}

export function printToolCall(tool, query) {
  const c = colors
  const cols = process.stdout.columns || 80
  const maxQuery = Math.max(20, cols - 30)
  const safeQuery =
    query && String(query).length > maxQuery ? String(query).slice(0, maxQuery - 3) + '...' : query
  console.log(
    ` ${c.yellow}⚡ Action${c.reset}  › ${c.bold}${c.white}${tool}${c.reset} ${safeQuery ? `${c.darkGray}› ${c.gray}${safeQuery}${c.reset}` : ''}`
  )
}

export function printToolResult(tool, result) {
  const c = colors
  const cols = process.stdout.columns || 80
  const maxLen = Math.max(25, cols - 30)
  const raw = String(result ?? '')
    .trim()
    .replace(/\n/g, ' ')
  const preview = raw.length > maxLen ? raw.slice(0, maxLen - 3) + '...' : raw
  console.log(
    ` ${c.green}✓ Result${c.reset}  › ${c.darkGray}[${tool}]${c.reset} ${c.gray}${preview}${c.reset}\n`
  )
}

export function printAssistantAnswer(answer) {
  const c = colors
  console.log(`\n${c.bold}${c.green}Mark ›${c.reset}`)
  console.log(`${c.white}${answer.trim()}${c.reset}\n`)
}

/**
 * Interactive Arrow-Key Navigable Selector
 * Supports Up/Down arrow keys, j/k, Number keys 1-N, Enter to select, and Esc to cancel.
 */
export async function promptSelect({ title = 'Select Option', options = [], activeId = null }) {
  return new Promise((resolve) => {
    let selectedIndex = options.findIndex((o) => o.id === activeId)
    if (selectedIndex === -1) selectedIndex = 0

    const width = resolveWidth(null, 76)
    const innerWidth = Math.max(10, width - 2)
    let renderedLines = 0

    const render = (isFirst = false) => {
      if (!isFirst && renderedLines > 0) {
        process.stdout.write(`\x1b[${renderedLines}A\r`)
      }

      const cleanTitle = stripAnsi(title)
      const dashCount = Math.max(0, width - cleanTitle.length - 5)
      const topBorder = `${colors.darkGray}╭─ ${colors.bold}${colors.green}${title}${colors.reset}${colors.darkGray} ${'─'.repeat(dashCount)}╮${colors.reset}`
      const bottomBorder = `${colors.darkGray}╰${'─'.repeat(Math.max(0, width - 2))}╯${colors.reset}`
      const hint = ` ${colors.darkGray}Gunakan panah ↑/↓ atau [1-${options.length}] lalu Enter. Esc untuk batal.${colors.reset}`

      const lines = options.map((opt, i) => {
        const isSelected = i === selectedIndex
        const isCurrent = opt.id === activeId
        const bullet = isCurrent
          ? `${colors.green}●${colors.reset}`
          : `${colors.darkGray}○${colors.reset}`
        const pointer = isSelected ? `${colors.bold}${colors.green}›${colors.reset}` : ' '
        const titleText = isSelected
          ? `${colors.bold}${colors.green}${opt.title}${colors.reset}`
          : `${colors.white}${opt.title}${colors.reset}`
        const descText = `${colors.darkGray}${opt.description || ''}${colors.reset}`
        const num = `${colors.darkGray}[${i + 1}]${colors.reset}`
        const rawLine = ` ${pointer} ${bullet} ${num} ${titleText}  ${descText}`
        const safeLine = truncateAnsi(rawLine, innerWidth)
        const padLen = Math.max(0, innerWidth - stripAnsi(safeLine).length)
        return `${colors.darkGray}│${colors.reset}${safeLine}${' '.repeat(padLen)}${colors.darkGray}│${colors.reset}`
      })

      process.stdout.write(`\x1b[K${topBorder}\n`)
      for (const line of lines) {
        process.stdout.write(`\x1b[K${line}\n`)
      }
      process.stdout.write(`\x1b[K${bottomBorder}\n`)
      process.stdout.write(`\x1b[K${hint}\n`)

      renderedLines = lines.length + 3
    }

    process.stdout.write('\x1b[?25l')

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    readline.emitKeypressEvents(process.stdin)
    process.stdin.resume()

    render(true)

    const onKeypress = (chunk, key) => {
      if (!key) return

      if (key.name === 'up' || key.name === 'k') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length
        render()
      } else if (key.name === 'down' || key.name === 'j') {
        selectedIndex = (selectedIndex + 1) % options.length
        render()
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        resolve(options[selectedIndex].id)
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup()
        resolve(null)
      } else if (key.name >= '1' && key.name <= String(options.length)) {
        const numIdx = parseInt(key.name, 10) - 1
        if (numIdx >= 0 && numIdx < options.length) {
          selectedIndex = numIdx
          cleanup()
          resolve(options[numIdx].id)
        }
      }
    }

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdout.write('\x1b[?25h')
    }

    process.stdin.on('keypress', onKeypress)
  })
}
