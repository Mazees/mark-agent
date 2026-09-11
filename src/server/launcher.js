import { exec, spawnSync } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import open from 'open'

/**
 * Mencari path absolut executable Microsoft Edge di Windows
 */
function getEdgePath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return `"${p}"`
  }
  return 'msedge'
}

/**
 * Meluncurkan antarmuka WebUI dalam mode desktop window (Microsoft Edge App Mode).
 *
 * @param {object} options
 * @param {number} [options.port=3000] Port server
 * @param {boolean} [options.headless=false] Jika true, jangan buka browser
 * @param {string} [options.mode='app'] 'app' (Edge App Mode) | 'browser' (Default Browser)
 */
export async function launchUI(options = {}) {
  const { port = 3000, headless = false, mode = 'app' } = options

  if (headless || process.argv.includes('--headless') || process.argv.includes('--no-ui')) {
    return
  }

  const url = `http://localhost:${port}`
  const isWindows = os.platform() === 'win32'
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

  if (isWindows && mode === 'app') {
    const edgeExe = getEdgePath()
    const profileDir = path.join(
      os.homedir(),
      '.config',
      'mark-agent',
      isDev ? 'ui-profile-dev' : 'ui-profile'
    )
    const cmd = `start "" ${edgeExe} --app="${url}" --user-data-dir="${profileDir}" --no-first-run --no-default-browser-check`
    exec(cmd, (err) => {
      if (err) {
        open(url).catch(() => {})
      }
    })
  } else {
    try {
      await open(url)
    } catch (_) {}
  }
}

/**
 * Menutup jendela WebUI Microsoft Edge App Mode yang dibuka oleh Mark.
 */
export function closeUI() {
  if (os.platform() === 'win32') {
    // 1. Tutup instan via taskkill berdasarkan judul jendela Mark Agent (~15ms)
    try {
      spawnSync('taskkill.exe', ['/F', '/FI', 'WINDOWTITLE eq Mark Agent*', '/T'], {
        windowsHide: true,
        timeout: 1500
      })
    } catch (_) {}

    // 2. Tutup proses msedge yang menggunakan user-data-dir mark-agent
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
    const profileFolder = isDev ? 'ui-profile-dev' : 'ui-profile'
    try {
      const psScript = `Get-CimInstance Win32_Process -Filter "name = 'msedge.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine -like "*${profileFolder}*" -or $_.CommandLine -like "*mark-agent*") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
      const enc = Buffer.from(psScript, 'utf16le').toString('base64')
      spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], {
        timeout: 2000,
        windowsHide: true
      })
    } catch (_) {}
  }
}
