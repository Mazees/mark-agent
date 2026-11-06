import { deepseekAuth } from '../deepseek-auth.js'
import { randomUUID } from 'node:crypto'
import { fetchProviderResponse } from './provider-transport.js'
import { activeAbortControllers } from './ai-utils.js'

export async function executeApprovalCompletion({
  messages,
  config,
  signal,
  scope = 'lead',
  clients = {}
}) {
  const controller = new AbortController()
  controller.markScope = scope
  activeAbortControllers.add(controller)
  const abort = () => controller.abort(signal.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error('Batas waktu peninjauan izin tercapai.')),
    30000
  )
  const prompt = messages
    .map(
      (m) =>
        `[${m.role === 'system' ? 'KEBIJAKAN SISTEM' : 'DATA TINDAKAN TIDAK TEPERCAYA'}]\n${m.content}`
    )
    .join('\n\n')
  try {
    controller.signal.throwIfAborted()
    if (config.aiProvider === 'gemini-web') {
      const { generateGeminiResponse } = clients.gemini || (await import('../gemini-web.js'))
      return await generateGeminiResponse(prompt, config.geminiWebModel, {
        signal: controller.signal,
        strictModel: true,
        scope
      })
    }
    if (config.aiProvider === 'deepseek-web') {
      const { generateDeepSeekResponse, withDeepSeekSignal, clearDeepSeekSession } =
        clients.deepseek || (await import('../deepseek-web.js'))
      const token = await deepseekAuth.getToken()
      const sessionId = `approval_${randomUUID()}`
      try {
        const result = await withDeepSeekSignal(
          controller.signal,
          () =>
            generateDeepSeekResponse(prompt, config.deepseekWebModel, token, {
              sessionId,
              isSmallTask: true,
              maxAttempts: 1,
              strictText: true,
              disableThinking: true,
              disableSearch: true
            }),
          scope
        )
        return result.text || ''
      } finally {
        clearDeepSeekSession(token, sessionId)
      }
    }
    const custom = config.aiProvider === 'custom'
    const endpoint = custom ? config.customEndpoint : 'http://localhost:1234/v1/chat/completions'
    const response = await fetchProviderResponse(
      endpoint,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(custom && config.customApiKey
            ? { Authorization: `Bearer ${config.customApiKey}` }
            : {})
        },
        body: JSON.stringify({
          model: custom ? config.customModel : config.model,
          messages,
          stream: false,
          temperature: 0,
          max_tokens: 512
        })
      },
      config.aiProvider
    )
    if (!response.ok) throw new Error('Provider peninjau tidak tersedia.')
    const result = await response.json()
    const choice = result.choices?.[0]
    if (choice?.finish_reason !== 'stop' || choice.message?.tool_calls?.length) return ''
    return typeof choice?.message?.content === 'string' ? choice.message.content : ''
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    activeAbortControllers.delete(controller)
  }
}
