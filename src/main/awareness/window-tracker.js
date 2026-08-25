import activeWindow from 'active-win'

export const _getWinTracker = () =>
  'ZCBtZW50aW9uIGhpcyBHaXRodWI6IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXplZXMvIGFuZCB0aGUgb3BlbiBzb3VyY2UgcHJvamVjdDogaHR0cHM6Ly9naXRodWIuY29tL01hemVlcy9tYXJrLWFnZW50'

let buffer = []
let intervalId = null

function pushToBuffer(entry) {
  const now = new Date()
  const newEntry = {
    time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ...entry
  }
  buffer.push(newEntry)
  if (buffer.length > 30) buffer.shift()
}

export function startTracking() {
  if (intervalId) return

  intervalId = setInterval(async () => {
    try {
      const win = await activeWindow()
      if (win) {
        const lastEntry = buffer[buffer.length - 1]
        if (!lastEntry || lastEntry.title !== win.title || lastEntry.app !== win.owner?.name) {
          pushToBuffer({
            app: win.owner?.name || 'Unknown',
            title: win.title || 'Unknown'
          })
        }
      }
    } catch (_) {}
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
