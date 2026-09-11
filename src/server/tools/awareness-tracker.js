import activeWin from 'active-win'
import { exec } from 'child_process'
import util from 'util'
import { wsHub } from '../ws-hub.js'
import { isDaemonAlive, startDaemon, sendCommand } from './pc-agent.js'
import { getActiveConfig } from '../config-manager.js'

const execPromise = util.promisify(exec)

const activityBuffer = []
const MAX_BUFFER_SIZE = 30
let trackerInterval = null

export function recordActivityEntry(winData) {
  if (!winData || !winData.title) return

  const appName = winData.owner?.name || winData.app || 'System'
  const title = winData.title.trim()

  if (
    activityBuffer.length > 0 &&
    activityBuffer[0].title === title &&
    activityBuffer[0].app === appName
  ) {
    return
  }

  const timeStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  activityBuffer.unshift({
    app: appName,
    title: title,
    url: winData.url || null,
    timestamp: timeStr,
    time: timeStr
  })

  wsHub.broadcast('awareness:entry', { app: appName, title, time: timeStr })

  if (activityBuffer.length > MAX_BUFFER_SIZE) {
    activityBuffer.pop()
  }
}

async function getActiveWindowFallback() {
  // 1. Coba activeWin native binding
  try {
    const win = await activeWin()
    if (win && win.title && win.title.trim()) {
      return {
        title: win.title.trim(),
        owner: { name: win.owner?.name || win.app || 'System' },
        app: win.owner?.name || win.app || 'System',
        url: win.url || null
      }
    }
  } catch (_) {}

  // 2. Coba persistent Win32 PC-Daemon jika aktif
  try {
    if (isDaemonAlive()) {
      const raw = await sendCommand({ cmd: 'read-focus' })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed && parsed.window && parsed.window.trim()) {
        return {
          title: parsed.window.trim(),
          owner: { name: parsed.process || 'Windows App' },
          app: parsed.process || 'Windows App'
        }
      }
    } else if (process.platform === 'win32') {
      startDaemon().catch(() => {})
    }
  } catch (_) {}

  return null
}

export async function getSystemIdleSeconds() {
  if (process.platform !== 'win32') return 0
  try {
    const psScript = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
      [StructLayout(LayoutKind.Sequential)]
      public struct LASTINPUTINFO {
          public uint cbSize;
          public uint dwTime;
      }
'@
      $type = Add-Type -MemberDefinition $signature -Name Win32GetLastInput -Namespace Win32API -PassThru
      $info = New-Object Win32API.Win32GetLastInput+LASTINPUTINFO
      $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
      if ($type::GetLastInputInfo([ref]$info)) {
          $idleMs = [Environment]::TickCount - $info.dwTime
          [Math]::Round($idleMs / 1000)
      } else {
          0
      }
    `
    const { stdout } = await execPromise(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`
    )
    return parseInt(stdout.trim(), 10) || 0
  } catch (_) {
    return 0
  }
}

export function startOsActivityTracking(intervalMs = 10000) {
  if (trackerInterval) clearInterval(trackerInterval)

  // Langsung panggil sekali saat start jika awareness aktif
  const cfg = getActiveConfig() || {}
  if (cfg.awarenessEnabled !== false) {
    if (process.platform === 'win32' && !isDaemonAlive()) {
      startDaemon().catch(() => {})
    }
    getActiveWindowFallback().then((win) => {
      if (win) recordActivityEntry(win)
    })
  }

  trackerInterval = setInterval(async () => {
    try {
      const currentCfg = getActiveConfig() || {}
      if (currentCfg.awarenessEnabled === false) return

      const windowInfo = await getActiveWindowFallback()
      if (windowInfo) {
        recordActivityEntry(windowInfo)
      }
    } catch (_) {}
  }, intervalMs)
}

export function stopOsActivityTracking() {
  if (trackerInterval) {
    clearInterval(trackerInterval)
    trackerInterval = null
  }
}

export function getActivityBuffer() {
  return [...activityBuffer]
}

export function clearActivityBuffer() {
  activityBuffer.length = 0
}
