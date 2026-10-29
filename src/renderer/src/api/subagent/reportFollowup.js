export function createReportFollowup({ request, respond, ready, onError = () => {} }) {
  let processing = false
  return {
    async drain(reports) {
      if (processing || !ready()) return
      processing = true
      try {
        for (const report of reports) {
          if (!ready()) break
          if (report.followupStatus !== 'pending' || report.status !== 'delivered') continue
          const owner = crypto.randomUUID()
          let claimed = null
          const endpoint = `/reports/${encodeURIComponent(report.id)}`
          try {
            claimed = await request(`${endpoint}/claim`, {
              owner,
              sessionId: report.parentSessionId
            })
            if (!claimed) continue
            if (!ready()) {
              await request(`${endpoint}/settle`, { owner, outcome: 'pending' })
              break
            }
            await respond(claimed)
            await request(`${endpoint}/settle`, { owner, outcome: 'handled' })
          } catch (error) {
            if (claimed)
              await request(`${endpoint}/settle`, { owner, outcome: 'failed' }).catch(() => {})
            onError(error)
          }
        }
      } finally {
        processing = false
      }
    }
  }
}
