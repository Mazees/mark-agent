import { getAgentTaskContentHash, validateAgentTaskStepOutput } from './taskStore'

// Executor helper hanya menentukan hasil checkpoint; eksekusi tool tetap berada di ReAct loop utama.
export function buildDurableStepCheckpoint(step, output, maxRetries = 2) {
  const validation = validateAgentTaskStepOutput(step, output)
  const attempts = step?.attempts || 0
  const canRetry = !validation.isComplete && attempts < maxRetries + 1

  return {
    status: validation.isComplete ? 'completed' : canRetry ? 'needs_revision' : 'failed',
    outputSummary: String(output || '').slice(0, 1200),
    contentHash: getAgentTaskContentHash(output),
    artifactPath: step?.artifactPath || null,
    validation,
    error: validation.isComplete || canRetry ? null : 'Validasi step gagal setelah batas retry.',
    canRetry
  }
}
