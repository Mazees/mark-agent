import readline from 'readline'

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
  green: '\x1b[38;2;31;184;84m',      // #1fb854 (MARK Primary Green)
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

export function drawBox(title, contentLines, width = 74, borderColor = colors.darkGray) {
  const c = colors
  const topBorder = `${borderColor}╭─${title ? ` ${c.bold}${c.green}${title}${c.reset}${borderColor} ` : ''}${'─'.repeat(Math.max(0, width - (title ? title.length + 4 : 2)))}╮${c.reset}`
  const bottomBorder = `${borderColor}╰${'─'.repeat(width)}╯${c.reset}`

  console.log(topBorder)
  for (const line of contentLines) {
    console.log(`${borderColor}│${c.reset} ${line}`)
  }
  console.log(bottomBorder)
}

export function printHeader(config = {}) {
  const c = colors
  console.clear()
  const provider = config.aiProvider || 'lm-studio'
  const model = config.model || config.customModel || 'google/gemma-3-4b'
  const cwd = process.cwd()

  const lines = [
    ` ${c.bold}${c.green}● MARK${c.reset} ${c.white}Autonomous Companion${c.reset}  ${c.darkGray}[v5.0.0]${c.reset}`,
    ` ${c.darkGray}Workspace :${c.reset} ${c.gray}${cwd}${c.reset}`,
    ` ${c.darkGray}Provider  :${c.reset} ${c.cyan}${provider}${c.reset} ${c.darkGray}(${model})${c.reset}  ${c.darkGray}|${c.reset}  ${c.darkGray}Port:${c.reset} ${c.teal}3000${c.reset}`,
    ` ${c.darkGray}WebUI     :${c.reset} ${c.blue}http://localhost:3000${c.reset} ${c.darkGray}[Edge App Mode Ready]${c.reset}`
  ]

  drawBox('', lines, 74, c.darkGray)
  console.log(` ${c.darkGray}Commands:${c.reset} ${c.green}/ui${c.reset} ${c.darkGray}|${c.reset} ${c.green}/web${c.reset} ${c.darkGray}|${c.reset} ${c.green}/provider${c.reset} ${c.darkGray}|${c.reset} ${c.green}/model${c.reset} ${c.darkGray}|${c.reset} ${c.green}/memory${c.reset} ${c.darkGray}|${c.reset} ${c.green}/status${c.reset} ${c.darkGray}|${c.reset} ${c.green}/clear${c.reset} ${c.darkGray}|${c.reset} ${c.green}/exit${c.reset}\n`)
}

export function printThought(thought, turn = 1) {
  const c = colors
  const lines = [
    `  ${c.gray}${thought.trim()}${c.reset}`
  ]
  drawBox(`Thought (Turn ${turn})`, lines, 74, c.darkGray)
  console.log()
}

export function printToolCall(tool, query) {
  const c = colors
  console.log(` ${c.yellow}⚡ Action${c.reset}  › ${c.bold}${c.white}${tool}${c.reset} ${query ? `${c.darkGray}› ${c.gray}${query}${c.reset}` : ''}`)
}

export function printToolResult(tool, result) {
  const c = colors
  const preview = String(result).trim().slice(0, 140).replace(/\n/g, ' ')
  console.log(` ${c.green}✓ Result${c.reset}  › ${c.darkGray}[${tool}]${c.reset} ${c.gray}${preview}${preview.length >= 140 ? '...' : ''}${c.reset}\n`)
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

    const width = 74
    let renderedLines = 0

    const render = (isFirst = false) => {
      if (!isFirst && renderedLines > 0) {
        process.stdout.write(`\x1b[${renderedLines}A\r`)
      }

      const topBorder = `${colors.darkGray}╭─ ${colors.bold}${colors.green}${title}${colors.reset}${colors.darkGray} ${'─'.repeat(Math.max(0, width - title.length - 4))}╮${colors.reset}`
      const bottomBorder = `${colors.darkGray}╰${'─'.repeat(width)}╯${colors.reset}`
      const hint = ` ${colors.darkGray}Gunakan panah ↑/↓ atau angka [1-${options.length}] lalu Enter. Esc untuk batal.${colors.reset}`

      const lines = options.map((opt, i) => {
        const isSelected = i === selectedIndex
        const isCurrent = opt.id === activeId
        const bullet = isCurrent ? `${colors.green}●${colors.reset}` : `${colors.darkGray}○${colors.reset}`
        const pointer = isSelected ? `${colors.bold}${colors.green}›${colors.reset}` : ' '
        const titleText = isSelected
          ? `${colors.bold}${colors.green}${opt.title}${colors.reset}`
          : `${colors.white}${opt.title}${colors.reset}`
        const descText = `${colors.darkGray}${opt.description || ''}${colors.reset}`
        const num = `${colors.darkGray}[${i + 1}]${colors.reset}`
        return ` ${pointer} ${bullet} ${num} ${titleText}  ${descText}`
      })

      process.stdout.write(`\x1b[K${topBorder}\n`)
      for (const line of lines) {
        process.stdout.write(`\x1b[K${colors.darkGray}│${colors.reset} ${line}\n`)
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
