import { WebSocketServer, WebSocket } from 'ws'

/**
 * WebSocket Hub untuk MARK Core.
 * Mengelola koneksi real-time antara Node.js Core Backend, WebUI Client, dan CLI Streamer.
 */
class WebSocketHub {
  constructor() {
    this.wss = null
    this.clients = new Set()
    this.eventHandlers = new Map()
  }

  /**
   * Inisialisasi WebSocket Server pada HTTP Server yang ada
   * @param {import('http').Server} server
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/stream' })

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)

      // Kirim event sambutan ready
      this.send(ws, 'core:ready', {
        version: '5.0.0',
        timestamp: Date.now()
      })

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString())
          const { event, id, payload } = parsed

          if (event) {
            this.handleIncomingEvent(ws, event, payload, id)
          }
        } catch (_) {}
      })

      ws.on('close', () => {
        this.clients.delete(ws)
      })

      ws.on('error', () => {
        this.clients.delete(ws)
      })
    })
  }

  /**
   * Daftarkan handler event masuk dari client
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event).push(handler)
  }

  /**
   * Handle event yang dikirim dari WebUI / CLI
   */
  async handleIncomingEvent(ws, event, payload, id) {
    const handlers = this.eventHandlers.get(event)
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        try {
          const result = await handler(payload, ws)
          if (id) {
            this.send(ws, `${event}:response`, { id, success: true, data: result })
          }
        } catch (err) {
          if (id) {
            this.send(ws, `${event}:response`, { id, success: false, error: err.message })
          }
        }
      }
    } else {
      if (id) {
        this.send(ws, `${event}:response`, { id, success: false, error: `No handler for event ${event}` })
      }
    }
  }

  /**
   * Kirim pesan ke client tertentu
   * @param {WebSocket} ws
   * @param {string} event
   * @param {any} payload
   */
  send(ws, event, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, payload }))
    }
  }

  /**
   * Broadcast event ke SEMUA client yang terhubung (WebUI, CLI, dll)
   * @param {string} event
   * @param {any} payload
   */
  broadcast(event, payload) {
    const message = JSON.stringify({ event, payload })
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }

  /**
   * Streaming token AI langsung ke semua client
   * @param {string} token
   * @param {string} [type='answer'] 'thought' | 'answer'
   */
  streamToken(token, type = 'answer') {
    this.broadcast('ai:token', { token, type, timestamp: Date.now() })
  }

  /**
   * Emit status tool execution
   * @param {string} toolName
   * @param {string} status 'start' | 'running' | 'done' | 'error'
   * @param {any} [data=null]
   */
  emitToolStatus(toolName, status, data = null) {
    this.broadcast('tool:status', { tool: toolName, status, data, timestamp: Date.now() })
  }
}

export const wsHub = new WebSocketHub()
