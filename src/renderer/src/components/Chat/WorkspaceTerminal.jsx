/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { webApi } from '../../api/web-bridge.js'
import '@xterm/xterm/css/xterm.css'
const TERMINAL_FONT = 'Consolas, "Courier New", monospace'
const statusText = {
  passed: 'Lolos',
  failed: 'Gagal',
  not_checked: 'Belum diperiksa',
  running: 'Berjalan',
  completed: 'Selesai',
  stopped: 'Dihentikan',
  waiting: 'Menunggu bantuan',
  interrupted: 'Terputus',
  starting: 'Memulai',
  not_applicable: 'Tidak berlaku'
}
export default function WorkspaceTerminal({ terminal, sessionId }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false,
      term,
      observer,
      subscriptions = [],
      sequence = 0,
      connecting = true,
      writable = false,
      pending = []
    const show = (chunk) => {
      if (chunk.sequence > sequence) {
        if (!connecting && chunk.sequence > sequence + 1) {
          pending.push(chunk)
          void connect()
          return
        }
        term.write(chunk.data)
        sequence = chunk.sequence
      }
    }
    const connect = async () => {
      connecting = true
      try {
        const state = await webApi.terminalRequest(terminal.id, sessionId, 'subscribe', {
          afterSequence: sequence
        })
        if (disposed) return
        writable = state.status === 'running'
        term.options.disableStdin = !writable
        if (state.truncated) term.writeln('\r\n[Bagian log lama sudah keluar dari buffer.]\r\n')
        for (const chunk of state.chunks) show(chunk)
        for (const chunk of pending.sort((a, b) => a.sequence - b.sequence)) show(chunk)
        pending = []
        connecting = false
        setError('')
      } catch (e) {
        if (!disposed) setError(e.message)
      }
    }
    ;(async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit')
      ])
      if (disposed) return
      term = new Terminal({
        fontSize: 12,
        fontFamily: TERMINAL_FONT,
        scrollback: 3000,
        theme: { background: '#100d0d', foreground: '#d4d4d4' }
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(container.current)
      const send = (action, values) =>
        webApi.terminalRequest(terminal.id, sessionId, action, values).catch((e) => {
          if (!disposed) setError(e.message)
        })
      subscriptions.push(
        webApi.onTerminal('output', (chunk) => {
          if (chunk.terminalId === terminal.id) {
            if (connecting) pending.push(chunk)
            else show(chunk)
          }
        })
      )
      subscriptions.push(
        webApi.onTerminal('exit', (event) => {
          if (event.terminalId === terminal.id) {
            writable = false
            term.options.disableStdin = true
            void connect()
            term.writeln(
              `\r\n[${statusText[event.status] || event.status}; exit ${event.exitCode ?? '-'}]\r\n`
            )
          }
        })
      )
      subscriptions.push(
        webApi.onTerminal('state', (event) => {
          if (event.terminalId === terminal.id) {
            writable = event.status === 'running'
            term.options.disableStdin = !writable
            setError('')
          }
        })
      )
      subscriptions.push(webApi.onBrowserReconnect(connect))
      const input = term.onData((data) => send('input', { data }))
      subscriptions.push(() => input.dispose())
      observer = new ResizeObserver(() => {
        if (container.current?.clientWidth) {
          fit.fit()
          if (writable) send('resize', { cols: term.cols, rows: term.rows })
        }
      })
      await connect()
      if (disposed) return
      fit.fit()
      if (writable) send('resize', { cols: term.cols, rows: term.rows })
      observer.observe(container.current)
    })().catch((e) => {
      if (!disposed) setError(e.message)
    })
    return () => {
      disposed = true
      for (const off of subscriptions) off()
      observer?.disconnect()
      term?.dispose()
      webApi.terminalRequest(terminal.id, sessionId, 'unsubscribe').catch(() => {})
    }
  }, [terminal.id, sessionId])
  return (
    <div className="flex flex-col min-h-0 h-full">
      {error && (
        <p role="alert" className="p-3 text-xs text-error">
          {error}
        </p>
      )}
      <div
        ref={container}
        className="mark-terminal flex-1 min-h-0 p-2"
        style={{ '--mark-terminal-font': TERMINAL_FONT }}
        aria-label="Terminal interaktif"
      />
    </div>
  )
}
