import { webApi } from './web-bridge.js'

export async function authorizeAgentTool(
  tool,
  args,
  config,
  { signal, requestApproval, targetSetChatData, onReview } = {}
) {
  onReview?.(true)
  let result
  try {
    result = await webApi.checkToolApproval(tool, args, config, signal)
  } finally {
    onReview?.(false, result)
  }
  signal?.throwIfAborted()
  if (result.denied) return result
  if (!result.needsApproval) return result
  if (!requestApproval)
    return {
      ...result,
      denied: true,
      reason: 'Antarmuka persetujuan pengguna tidak tersedia.',
      pause: true
    }
  const approved = await requestApproval(result.message, tool, args, {
    ...result,
    owner: { ...config, approvalRequestId: result.requestId },
    sessionId: config.codingSessionId || config.sessionId,
    signal,
    targetSetChatData,
    direct: config.approvalRunId?.startsWith('ui:')
  })
  signal?.throwIfAborted()
  return approved
    ? { ...result, denied: false, needsApproval: false }
    : {
        ...result,
        denied: true,
        source: 'user',
        pause: true,
        reason:
          Date.now() >= result.expiresAt
            ? 'Permintaan izin kedaluwarsa. Minta pemeriksaan baru sebelum melanjutkan.'
            : 'Tindakan ditolak atau dibatalkan. Hentikan tindakan terkait dan tunggu instruksi baru.'
      }
}
