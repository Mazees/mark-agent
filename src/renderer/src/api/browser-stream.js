// Decode one frame at a time; replacing a loading image src can starve presentation.
export function createBrowserFrameRenderer(canvas, { onFrame, onAck, onError }) {
  const context = canvas.getContext('2d', { alpha: false })
  let pending = null
  let image = null
  let animation = null
  let lastSequence = 0
  let disposed = false
  const pump = () => {
    if (disposed || image || !pending) return
    const frame = pending
    pending = null
    const decoder = new Image()
    image = decoder
    decoder.decoding = 'async'
    const finish = () => {
      image = null
      onAck(frame.sequence)
      pump()
    }
    decoder.onerror = () => {
      if (disposed || image !== decoder) return
      onError(new Error('Frame browser belum dapat ditampilkan.'))
      finish()
    }
    decoder.onload = () => {
      if (disposed || image !== decoder) return
      animation = requestAnimationFrame(() => {
        animation = null
        try {
          if (canvas.width !== decoder.naturalWidth) canvas.width = decoder.naturalWidth
          if (canvas.height !== decoder.naturalHeight) canvas.height = decoder.naturalHeight
          context.drawImage(decoder, 0, 0)
          onFrame(frame)
        } catch (error) {
          onError(error)
        } finally {
          finish()
        }
      })
    }
    decoder.src = `data:image/jpeg;base64,${frame.data}`
  }
  const reset = () => {
    pending = null
    lastSequence = 0
    if (animation !== null) cancelAnimationFrame(animation)
    animation = null
    if (image) {
      image.onload = null
      image.onerror = null
      image.src = ''
      image = null
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
  }
  return {
    push(frame) {
      if (disposed || frame.sequence <= lastSequence) return
      lastSequence = frame.sequence
      pending = frame
      pump()
    },
    reset,
    dispose() {
      disposed = true
      reset()
    }
  }
}

export function createBrowserInputQueue(send, onResult, onError) {
  const queue = []
  let active = false
  let disposed = false
  let waiters = []
  const pump = async () => {
    if (active || disposed) return
    active = true
    try {
      while (queue.length && !disposed) {
        const { event, queuedAt } = queue.shift()
        if (Date.now() - queuedAt > 3000 && !['up', 'keyUp'].includes(event.kind)) continue
        try {
          const result = await send(event)
          if (!disposed) onResult(result)
        } catch (error) {
          queue.length = 0
          if (!disposed) onError(error)
        }
      }
    } finally {
      active = false
      for (const resolve of waiters) resolve()
      waiters = []
    }
  }
  return {
    push(event) {
      if (disposed) return
      const previous = queue.at(-1)
      const sameViewport =
        previous?.event.viewportWidth === event.viewportWidth &&
        previous?.event.viewportHeight === event.viewportHeight
      if (previous?.event.kind === event.kind && sameViewport) {
        if (event.kind === 'move') {
          previous.event = event
          previous.queuedAt = Date.now()
          return
        }
        if (event.kind === 'wheel') {
          const deltaX = previous.event.deltaX + event.deltaX
          const deltaY = previous.event.deltaY + event.deltaY
          if (Math.abs(deltaX) <= 2000 && Math.abs(deltaY) <= 2000) {
            previous.event = { ...event, deltaX, deltaY }
            previous.queuedAt = Date.now()
            return
          }
        }
      }
      queue.push({ event, queuedAt: Date.now() })
      queueMicrotask(pump)
    },
    flush() {
      if (!active && !queue.length) return Promise.resolve()
      return new Promise((resolve) => waiters.push(resolve))
    },
    dispose() {
      disposed = true
      queue.length = 0
      for (const resolve of waiters) resolve()
      waiters = []
    }
  }
}
