import activeWin from 'active-win'
import { exec } from 'child_process'
import util from 'util'

const execPromise = util.promisify(exec)

const activityBuffer = []
const MAX_BUFFER_SIZE = 30
let trackerInterval = null

export function recordActivityEntry(winData) {
  if (!winData || !winData.title) return

  const appName = winData.owner?.name || winData.app || 'System'
  const title = winData.title.trim()

  if (activityBuffer.length > 0 && activityBuffer[0].title === title && activityBuffer[0].app === appName) {
    return
  }

  activityBuffer.unshift({
    app: appName,
    title: title,
    url: winData.url || null,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })

  if (activityBuffer.length > MAX_BUFFER_SIZE) {
    activityBuffer.pop()
  }
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
    const { stdout } = await execPromise(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`)
    return parseInt(stdout.trim(), 10) || 0
  } catch (_) {
    return 0
  }
}

export function startOsActivityTracking(intervalMs = 60000) {
  if (trackerInterval) clearInterval(trackerInterval)

  // Langsung panggil sekali saat start
  activeWin().then(win => { if (win) recordActivityEntry(win) }).catch(() => {})

  trackerInterval = setInterval(async () => {
    try {
      const windowInfo = await activeWin()
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
