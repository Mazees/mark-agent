import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { wsHub } from '../ws-hub.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let hudState = 'CLOSED' // 'CLOSED' | 'RUNNING' | 'ANALYZING'
let hudProcess = null
let inactivityTimer = null
let activePort = 3000
const INACTIVITY_TIMEOUT_MS = 15000

function getEdgePath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return 'msedge.exe'
}

function getHudProfileDir() {
  const dir = path.join(os.homedir(), '.config', 'mark-agent', 'hud-profile')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function cleanHudLocks(profileDir) {
  try {
    const lockFiles = [
      path.join(profileDir, 'SingletonLock'),
      path.join(profileDir, 'SingletonSocket'),
      path.join(profileDir, 'SingletonCookie')
    ]
    for (const lf of lockFiles) {
      if (fs.existsSync(lf)) {
        fs.unlinkSync(lf)
      }
    }
  } catch (_) {}
}

export function setServerPort(port) {
  if (port) activePort = port
}

export function isHudActive() {
  return hudState !== 'CLOSED' && hudProcess !== null && !hudProcess.killed
}

export function startHud(options = {}) {
  const port = options.port || activePort
  activePort = port

  clearInactivityTimer()

  if (hudState === 'CLOSED' || !hudProcess || hudProcess.killed) {
    hudState = 'RUNNING'
    launchHudWindow(port)
  }

  broadcastHudUpdate({
    status: 'running',
    sessionName: options.sessionName || 'Mark Utama',
    detail: options.detail || 'Computer Use diaktifkan'
  })
}

function launchHudWindow(port) {
  if (os.platform() !== 'win32') return
  if (process.argv.includes('--no-ui') || process.argv.includes('--headless')) return

  const edgeExe = getEdgePath()
  const profileDir = getHudProfileDir()
  cleanHudLocks(profileDir)

  // Gunakan file URL sebagai basis agar dapat dimuat instan tanpa dependensi HTTP
  const htmlPath = path.resolve(__dirname, '../../renderer/public/overlay-hud.html')
  const targetUrl = 'file:///' + htmlPath.replace(/\\/g, '/') + `?port=${port}`

  const args = [
    `--app=${targetUrl}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=540,110',
    '--window-position=500,8',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync'
  ]

  try {
    hudProcess = spawn(edgeExe, args, {
      detached: true,
      stdio: 'ignore'
    })

    hudProcess.unref()

    hudProcess.on('close', () => {
      hudProcess = null
      hudState = 'CLOSED'
    })

    hudProcess.on('error', (err) => {
      console.warn('[Overlay HUD] Error spawning Edge:', err.message)
      hudProcess = null
      hudState = 'CLOSED'
    })

    pinHudTopMost()
  } catch (err) {
    console.warn('[Overlay HUD] Gagal spawn overlay:', err.message)
  }
}

function pinHudTopMost() {
  const pinPsScript = `
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class HudPinner {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_NOACTIVATE = 0x0010;

    public static bool Pin() {
        bool found = false;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                if (title.Contains("MARK Computer Use HUD")) {
                    SetWindowPos(hWnd, HWND_TOPMOST, 500, 8, 540, 110, SWP_SHOWWINDOW | SWP_NOACTIVATE);
                    found = true;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
'@

for ($i = 0; $i -lt 15; $i++) {
    if ([HudPinner]::Pin()) { break }
    Start-Sleep -Milliseconds 250
}
`
  try {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', pinPsScript], {
      windowsHide: true,
      stdio: 'ignore'
    })
    ps.unref()
  } catch (_) {}
}

export function updateHudAction(data = {}) {
  clearInactivityTimer()

  if (hudState === 'CLOSED' || !hudProcess || hudProcess.killed) {
    startHud({ sessionName: data.sessionName, detail: data.detail })
  } else {
    hudState = data.status === 'thinking' ? 'ANALYZING' : 'RUNNING'
  }

  broadcastHudUpdate(data)
}

export function setHudStatus(status, detail) {
  clearInactivityTimer()
  hudState = status === 'thinking' ? 'ANALYZING' : 'RUNNING'
  broadcastHudUpdate({ status, detail })
}

export function stopHud(force = false) {
  if (force) {
    clearInactivityTimer()
    closeHudNow()
  } else {
    clearInactivityTimer()
    inactivityTimer = setTimeout(() => {
      closeHudNow()
    }, INACTIVITY_TIMEOUT_MS)
  }
}

function clearInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer)
    inactivityTimer = null
  }
}

function closeHudNow() {
  hudState = 'CLOSED'
  broadcastHudUpdate({ status: 'closed', detail: 'Selesai' })

  if (hudProcess && !hudProcess.killed) {
    try {
      hudProcess.kill()
    } catch (_) {}
    hudProcess = null
  }

  if (os.platform() === 'win32') {
    try {
      const psScript = `Get-CimInstance Win32_Process -Filter "name = 'msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*hud-profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
      const enc = Buffer.from(psScript, 'utf16le').toString('base64')
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], {
        windowsHide: true,
        stdio: 'ignore'
      })
      ps.unref()
    } catch (_) {}
  }
}

function broadcastHudUpdate(payload = {}) {
  try {
    if (wsHub && typeof wsHub.broadcast === 'function') {
      wsHub.broadcast('computer:hud_update', payload)
    }
  } catch (err) {
    console.warn('[Overlay HUD] Gagal broadcast WebSocket:', err.message)
  }
}

