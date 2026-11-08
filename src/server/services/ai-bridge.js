import { usesPersonalMood, withoutAssistantMood } from '../../shared/agent-mode.js'
import {
  cleanAndParse,
  abortAllFetches,
  activeAbortControllers,
  getAbortGeneration
} from './ai/ai-utils.js'
import { executeWebProvider } from './ai/web-provider.js'
import { executeOpenAIProvider } from './ai/openai-provider.js'
import { getActiveConfig, loadConfig } from '../config-manager.js'

let globalConfig = {}

export const setGlobalConfig = (config) => {
  globalConfig = config || {}
}

export const getGlobalConfig = () => globalConfig

export { abortAllFetches, activeAbortControllers, getAbortGeneration, cleanAndParse }

export async function fetchAI(messages, stream = false, options = {}) {
  let opts = {}

  if (messages && !Array.isArray(messages) && typeof messages === 'object') {
    opts = { ...messages }
  } else if (typeof stream === 'object' && stream !== null) {
    opts = { messages, ...stream }
  } else {
    opts = { messages, stream: Boolean(stream), ...options }
  }

  const active = getActiveConfig() || {}
  const disk = loadConfig() || {}
  const conf = { ...disk, ...active, ...globalConfig, ...(opts.config || {}) }
  opts.config = conf

  if (opts.purpose === 'approval') {
    const { executeApprovalCompletion } = await import('./ai/approval-completion.js')
    return executeApprovalCompletion(opts)
  }

  const personal = usesPersonalMood(opts)
  const onMeta = opts.onMeta
  if (!personal) {
    opts.messages = withoutAssistantMood(opts.messages)
    opts.onMood = null
    opts.onMeta = (meta) => {
      const { mood, ...rest } = meta || {}
      void mood
      onMeta?.(rest)
    }
  }
  const provider = conf.aiProvider || 'gemini-web'
  const result = provider === 'gemini-web' || provider === 'deepseek-web'
    ? await executeWebProvider(opts)
    : await executeOpenAIProvider(opts)
  if (!personal && result && typeof result === 'object') {
    delete result.mood
    if (result.meta) delete result.meta.mood
  }
  return result
}

export const fetchAIStream = (opts) => fetchAI(opts?.messages || opts, true, opts)
