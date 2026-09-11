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
  const disk = !active.deepseekUserToken ? loadConfig() || {} : {}
  const conf = { ...disk, ...active, ...globalConfig, ...(opts.config || {}) }
  opts.config = conf

  const provider = conf.aiProvider || 'gemini-web'

  if (provider === 'gemini-web' || provider === 'deepseek-web') {
    return executeWebProvider(opts)
  }

  return executeOpenAIProvider(opts)
}

export const fetchAIStream = (opts) => fetchAI(opts?.messages || opts, true, opts)
