import activeWin from 'active-win'
import { exec } from 'child_process'
import util from 'util'
import os from 'os'
import { wsHub } from '../ws-hub.js'
import { isDaemonAlive, startDaemon, sendCommand } from './pc-agent.js'
import { getActiveConfig } from '../config-manager.js'

const execPromise = util.promisify(exec)

const activityBuffer = []
const MAX_BUFFER_SIZE = 30
let trackerInterval = null

let currentActiveApp = null
let currentActiveTitle = null
let currentAppStartTime = Date.now()

let lastCpuSample = null
let cachedCpuPercent = 0
let cachedBattery = { hasBattery: false, percent: 100, isCharging: true }
let lastBatteryFetch = 0

function sampleCpuPercent() {
  const cpus = os.cpus()
  if (!cpus || cpus.length === 0) return 0
  let user = 0
  let nice = 0
  let sys = 0
  let idle = 0
  let irq = 0
  for (const cpu of cpus) {
    user += cpu.times.user
    nice += cpu.times.nice
    sys += cpu.times.sys
    idle += cpu.times.idle
    irq += cpu.times.irq
  }
  const currentSample = { idle, total: user + nice + sys + idle + irq }
  if (lastCpuSample) {
    const idleDelta = currentSample.idle - lastCpuSample.idle
    const totalDelta = currentSample.total - lastCpuSample.total
    if (totalDelta > 0) {
      cachedCpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)))
    }
  }
  lastCpuSample = currentSample
  return cachedCpuPercent
}

async function getBatteryTelemetry() {
  const now = Date.now()
  if (now - lastBatteryFetch < 60000 && lastBatteryFetch > 0) {
    return cachedBattery
  }
  lastBatteryFetch = now
  if (process.platform !== 'win32') return cachedBattery

  try {
    const { stdout } = await execPromise(
      'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Battery | Select-Object -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"'
    )
    const text = stdout ? stdout.trim() : ''
    if (text && text.startsWith('{')) {
      const parsed = JSON.parse(text)
      const percent = Number(parsed.EstimatedChargeRemaining ?? 100)
      const isCharging = [2, 6, 7, 8, 3].includes(parsed.BatteryStatus)
      cachedBattery = {
        hasBattery: true,
        percent,
        isCharging,
        status: parsed.BatteryStatus
      }
    } else if (text && text.startsWith('[')) {
      const arr = JSON.parse(text)
      const parsed = arr[0] || {}
      cachedBattery = {
        hasBattery: true,
        percent: Number(parsed.EstimatedChargeRemaining ?? 100),
        isCharging: [2, 6, 7, 8, 3].includes(parsed.BatteryStatus),
        status: parsed.BatteryStatus
      }
    }
  } catch {
    cachedBattery = { hasBattery: false, percent: 100, isCharging: true }
  }
  return cachedBattery
}

export function recordActivityEntry(winData) {
  if (!winData || !winData.title) return

  const appName = winData.owner?.name || winData.app || 'System'
  const title = winData.title.trim()

  if (currentActiveApp !== appName || currentActiveTitle !== title) {
    currentActiveApp = appName
    currentActiveTitle = title
    currentAppStartTime = Date.now()
  }

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
  // 1. Coba persistent Win32 PC-Daemon tercepat jika aktif (<1ms, tanpa spawn proses)
  if (process.platform === 'win32' && isDaemonAlive()) {
    try {
      const raw = await sendCommand({ cmd: 'get-active-window' })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed && parsed.title && parsed.title.trim()) {
        return {
          title: parsed.title.trim(),
          owner: { name: parsed.process || 'Windows App' },
          app: parsed.process || 'Windows App',
          url: null
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Coba activeWin native binding sebagai fallback (macOS / Linux / jika tersedia)
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
  } catch {
    // ignore
  }

  // 3. Jika di Windows dan daemon belum aktif, jalankan daemon di background
  if (process.platform === 'win32' && !isDaemonAlive()) {
    startDaemon().catch(() => {})
  }

  return null
}

export async function getSystemIdleSeconds() {
  if (process.platform !== 'win32') return 0

  // 1. Prioritaskan Win32 PC-Daemon instan (<0.1ms tanpa spawn PowerShell atau csc.exe)
  if (isDaemonAlive()) {
    try {
      const raw = await sendCommand({ cmd: 'get-idle' })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed && typeof parsed.idleSeconds === 'number') {
        return parsed.idleSeconds
      }
    } catch {
      // fallback jika daemon sibuk
    }
  }

  // 2. Fallback jika daemon belum siap (jalankan daemon untuk panggilan berikutnya)
  startDaemon().catch(() => {})

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
  } catch {
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
    } catch {
      // ignore
    }
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

export async function getSystemTelemetry() {
  const idleSeconds = await getSystemIdleSeconds()
  const battery = await getBatteryTelemetry()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100)
  const cpuPercent = sampleCpuPercent()
  const uptimeSeconds = os.uptime()
  const uptimeHours = Math.round((uptimeSeconds / 3600) * 10) / 10
  const isFreshBoot = uptimeSeconds < 1800
  const activeDurationMinutes = Math.max(0, Math.floor((Date.now() - currentAppStartTime) / 60000))

  return {
    idleSeconds,
    isUserAFK: idleSeconds >= 900,
    activeApp: currentActiveApp || 'System',
    activeTitle: currentActiveTitle || '',
    activeAppDurationMinutes: activeDurationMinutes,
    battery,
    hardware: {
      ramPercent,
      cpuPercent,
      uptimeHours,
      isFreshBoot
    }
  }
}
