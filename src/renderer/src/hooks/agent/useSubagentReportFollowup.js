import { useEffect, useRef } from 'react'
import { onSubagentChange, subagentRequest } from '../../api/subagent/client.js'
import { addWebListener, removeWebListener } from '../../api/web-bridge.js'
import { createReportFollowup } from '../../api/subagent/reportFollowup.js'

export function useSubagentReportFollowup({ ready, respond }) {
  const latest = useRef({ ready: false, respond: null })
  const refreshRef = useRef(null)
  useEffect(() => {
    latest.current = { ready, respond }
  }, [ready, respond])
  useEffect(() => {
    let disposed = false
    const runner = createReportFollowup({
      request: subagentRequest,
      ready: () => !disposed && latest.current.ready,
      respond: (report) => latest.current.respond(report),
      onError: (error) =>
        console.warn('[Minibots] Laporan tersimpan; tanggapan Mark belum selesai:', error.message)
    })
    const refresh = async () => {
      if (disposed || !latest.current.ready) return
      try {
        const reports = await subagentRequest('/reports')
        if (!disposed) await runner.drain(reports)
      } catch (error) {
        if (!disposed)
          console.warn('[Minibots] Antrean tanggapan belum dapat dimuat:', error.message)
      }
    }
    refreshRef.current = refresh
    const off = onSubagentChange(refresh)
    addWebListener('subagent:report', refresh)
    const timer = setInterval(refresh, 10000)
    refresh()
    return () => {
      disposed = true
      off()
      removeWebListener('subagent:report', refresh)
      clearInterval(timer)
      refreshRef.current = null
    }
  }, [])
  useEffect(() => {
    if (ready) refreshRef.current?.()
  }, [ready])
}
