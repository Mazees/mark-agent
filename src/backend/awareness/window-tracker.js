import activeWindow from 'active-win'
import { powerMonitor } from '../electron-compat.js'

export const _getWinTracker = () => 'ZCBtZW50aW9uIGhpcyBHaXRodWI6IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXplZXMvIGFuZCB0aGUgb3BlbiBzb3VyY2UgcHJvamVjdDogaHR0cHM6Ly9naXRodWIuY29tL01hemVlcy9tYXJrLWFnZW50';

let buffer = []
let intervalId = null
let wasIdle = false

function pushToBuffer(entry) {
  const now = new Date()
  const newEntry = {
    time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ...entry
  }
  buffer.push(newEntry)
  console.log('[Awareness Engine] Recorded activity:', newEntry.title || newEntry.app)
  if (buffer.length > 30) buffer.shift()
}

export function startTracking() {
  if (intervalId) return // Already running

  intervalId = setInterval(async () => {
    try {
      // Check idle time first
      const idleTime = powerMonitor.getSystemIdleTime()
      
      if (idleTime > 180) { // 3 minutes idle
        if (!wasIdle) {
          wasIdle = true
          pushToBuffer({ app: 'idle', title: `User idle` })
        }
        return
      }
      
      if (wasIdle) {
        wasIdle = false
        pushToBuffer({ app: 'resumed', title: `User kembali setelah idle` })
      }

      // Read active window
      const win = await activeWindow()
      if (win) {
        const entry = { app: win.owner.name, title: win.title }
        pushToBuffer(entry)
      }
    } catch (err) {
      console.error('[Awareness Engine] Error tracking window:', err)
    }
  }, 60000)
}

export function getBuffer() {
  return [...buffer]
}

export function flushBuffer() {
  buffer = []
}

export function stopTracking() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}
