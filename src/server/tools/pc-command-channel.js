import { randomUUID } from 'node:crypto'

// A timed-out native action may still have changed the desktop. Never replay it.
export class PcCommandChannel {
  constructor(write, onUncertain, timeoutMs = 30000) {
    this.write = write
    this.onUncertain = onUncertain
    this.timeoutMs = timeoutMs
    this.pending = []
    this.active = null
    this.closed = false
  }

  enqueue(command, signal) {
    if (this.closed || signal?.aborted)
      return Promise.resolve(
        JSON.stringify({
          status: 'error',
          executionStatus: 'cancelled',
          message: 'Computer Use dihentikan.'
        })
      )
    return new Promise((resolve) => {
      const item = { command: { ...command, requestId: randomUUID() }, resolve, signal }
      item.abort = () => {
        if (this.active === item)
          this.fail('Computer Use dibatalkan; hasil aksi perlu diperiksa.', 'unknown')
        else {
          this.pending = this.pending.filter((entry) => entry !== item)
          this.finish(item, {
            status: 'error',
            executionStatus: 'cancelled',
            message: 'Aksi dibatalkan sebelum dijalankan.'
          })
        }
      }
      signal?.addEventListener('abort', item.abort, { once: true })
      this.pending.push(item)
      this.next()
    })
  }

  finish(item, result) {
    clearTimeout(item.timer)
    item.signal?.removeEventListener('abort', item.abort)
    item.resolve(typeof result === 'string' ? result : JSON.stringify(result))
  }

  next() {
    if (this.closed || this.active || !this.pending.length) return
    const item = (this.active = this.pending.shift())
    item.timer = setTimeout(
      () => this.fail('Daemon tidak merespons; hasil aksi belum diketahui.', 'unknown'),
      this.timeoutMs
    )
    try {
      this.write(item.command)
    } catch {
      this.fail('Koneksi daemon terputus; hasil aksi belum diketahui.', 'unknown')
    }
  }

  receive(requestId, response) {
    if (!this.active || requestId !== this.active.command.requestId) return false
    const item = this.active
    this.active = null
    this.finish(item, response)
    this.next()
    return true
  }

  close(message = 'Daemon dihentikan.', executionStatus = 'unknown') {
    this.closed = true
    if (this.active) this.finish(this.active, { status: 'error', executionStatus, message })
    this.active = null
    for (const item of this.pending.splice(0))
      this.finish(item, { status: 'error', executionStatus: 'cancelled', message })
  }

  fail(message, executionStatus) {
    this.close(message, executionStatus)
    this.onUncertain?.()
  }
}
