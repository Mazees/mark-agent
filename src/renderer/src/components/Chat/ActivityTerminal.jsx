/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react'
import { webApi } from '../../api/web-bridge.js'
export default function ActivityTerminal({ sessionId, toolCallId }) {
  const [output, setOutput] = useState(''),
    [process, setProcess] = useState(null),
    [error, setError] = useState('')
  useEffect(() => {
    let disposed = false,
      id,
      sequence = 0,
      connecting = false,
      pending = []
    const show = (chunk) => {
      if (chunk.sequence <= sequence) return
      sequence = chunk.sequence
      setOutput((text) => (text + chunk.data).slice(-256000))
    }
    const connect = async () => {
      if (!id || connecting || disposed) return
      connecting = true
      try {
        const value = await webApi.terminalRequest(id, String(sessionId), 'subscribe', {
          afterSequence: sequence
        })
        if (disposed) return
        setProcess(value)
        for (const chunk of [...value.chunks, ...pending].sort((a, b) => a.sequence - b.sequence))
          show(chunk)
        pending = []
        setError('')
      } catch (e) {
        if (!disposed) setError(e.message)
      } finally {
        connecting = false
      }
    }
    const find = async () => {
      try {
        const values = await webApi.codingRequest('/terminals', sessionId)
        const value = values.find((t) => !t.interactive && t.toolCallId === toolCallId)
        if (disposed || !value) return
        const changed = id !== value.id
        id = value.id
        setProcess(value)
        if (changed) await connect()
      } catch (e) {
        if (!disposed) setError(e.message)
      }
    }
    const offOutput = webApi.onTerminal('output', (chunk) => {
      if (!disposed && chunk.terminalId === id) {
        if (connecting) pending.push(chunk)
        else if (chunk.sequence > sequence + 1) {
          pending.push(chunk)
          connect()
        } else show(chunk)
      }
    })
    const offExit = webApi.onTerminal('exit', (value) => {
      if (!disposed && value.terminalId === id) {
        setProcess(value)
        connect()
      }
    })
    const offUpdate = webApi.onCodingUpdate((value) => {
      if (String(value.sessionId) === String(sessionId)) find()
    })
    const offConnect = webApi.onBrowserReconnect(connect)
    find()
    return () => {
      disposed = true
      offOutput()
      offExit()
      offUpdate()
      offConnect()
      if (id) webApi.terminalRequest(id, String(sessionId), 'unsubscribe').catch(() => {})
    }
  }, [sessionId, toolCallId])
  if (!process && !error) return null
  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-[11px]">
      <p className="mb-1 text-white/45">
        {process?.status === 'running' || process?.status === 'starting'
          ? 'Proses berjalan'
          : 'Proses selesai'}
        {process?.exitCode != null ? ` · exit ${process.exitCode}` : ''}
      </p>
      {output && (
        <pre className="mark-terminal max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono leading-5 text-white/70">
          {output.replace(new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g'), '')}
        </pre>
      )}
      {error && (
        <p role="alert" className="text-error">
          Log proses tidak tersedia: {error}
        </p>
      )}
    </div>
  )
}
