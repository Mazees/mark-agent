import { Router } from 'express'
import { getActiveConfig } from '../config-manager.js'
import { wsHub } from '../ws-hub.js'
import { launchUI } from '../launcher.js'
import {
  GROUP_TOOLS_SCHEMA,
  GROUP_TOOL_GROUP_NAMES,
  GROUP_TOOLS_DEFINITION,
  group_tools_flat
} from '../tools/group-tools.js'

export const aiRouter = Router()

// 1. AI Fetch Direct Gateway
aiRouter.post('/ai/fetch', async (req, res) => {
  const { messages, config = {}, isSmallTask = false, jsonSchema = null } = req.body || {}
  try {
    const { fetchAI } = await import('../services/ai-bridge.js')
    const finalConfig = { ...getActiveConfig(), ...config }
    const provider = finalConfig.aiProvider || 'gemini-web'
    const resolvedModel =
      provider === 'gemini-web'
        ? finalConfig.geminiWebModel || 'gemini-3.6-flash'
        : provider === 'deepseek-web'
          ? finalConfig.deepseekWebModel || 'deepseek-chat'
          : provider === 'custom'
            ? finalConfig.customModel || 'default-model'
            : finalConfig.model || 'local-model'

    wsHub.broadcast('ai:fetch', {
      type: 'fetch',
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: false,
      payload: { messages, jsonSchema, isSmallTask }
    })

    const result = await fetchAI(messages, false, { config: finalConfig, isSmallTask, jsonSchema })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

// 2. AI Streaming Gateway (Native Tool Calling + SSE & WebSocket Tokens)
aiRouter.post('/ai/stream', async (req, res) => {
  const { messages, tools = null, config = {}, isSmallTask = false } = req.body || {}
  try {
    const { fetchAI } = await import('../services/ai-bridge.js')
    const finalConfig = { ...getActiveConfig(), ...config }
    const provider = finalConfig.aiProvider || 'gemini-web'
    const resolvedModel =
      provider === 'gemini-web'
        ? finalConfig.geminiWebModel || 'gemini-3.6-flash'
        : provider === 'deepseek-web'
          ? finalConfig.deepseekWebModel || 'deepseek-chat'
          : provider === 'custom'
            ? finalConfig.customModel || 'default-model'
            : finalConfig.model || 'local-model'

    wsHub.broadcast('ai:fetch', {
      type: 'stream',
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: Array.isArray(tools) && tools.length > 0,
      toolsCount: Array.isArray(tools) ? tools.length : 0,
      payload: { messages, tools, isSmallTask }
    })

    const result = await fetchAI(messages, true, {
      tools,
      config: finalConfig,
      isSmallTask,
      onToken: (token) => {
        wsHub.streamToken(token, 'answer')
      },
      onReasoning: (rToken) => {
        wsHub.streamToken(rToken, 'thought')
      },
      onMood: (mood) => {
        wsHub.broadcast('ai:mood', { mood })
      },
      onToolCall: (toolCalls) => {
        wsHub.broadcast('ai:tool_calls', { toolCalls })
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

aiRouter.post('/ai/abort', async (req, res) => {
  try {
    const { abortAllFetches } = await import('../services/ai-bridge.js')
    abortAllFetches()
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

// 3. Group Tools Schema & Registry API
aiRouter.get('/tools/groups', (_req, res) => {
  res.json({
    success: true,
    data: {
      schema: GROUP_TOOLS_SCHEMA,
      names: GROUP_TOOL_GROUP_NAMES,
      definition: GROUP_TOOLS_DEFINITION,
      flat: group_tools_flat
    }
  })
})

// 4. Native Tools Execution API
aiRouter.post('/tools/execute', async (req, res) => {
  const { tool, query, config } = req.body || {}
  try {
    const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) {
      return res.json({ success: false, error: `Tool '${tool}' tidak ditemukan` })
    }
    const finalConfig = config || getActiveConfig()
    const result = await nativeTool.handler(query, finalConfig)
    if (result && typeof result === 'object' && 'success' in result) {
      return res.json(result)
    }
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

aiRouter.post('/tools/needs-approval', async (req, res) => {
  const { tool, query } = req.body || {}
  try {
    const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) return res.json({ needsApproval: false })
    const needs =
      typeof nativeTool.needsApproval === 'function'
        ? nativeTool.needsApproval(query)
        : nativeTool.needsApproval
    res.json({
      needsApproval: Boolean(needs),
      message: needs && nativeTool.approvalMessage ? nativeTool.approvalMessage(query) : null
    })
  } catch {
    res.json({ needsApproval: false })
  }
})

// 4. Edge-TTS Speech Synthesis API
aiRouter.get('/tts/stream', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.query || {}
  try {
    const { streamTTS } = await import('../tools/media-tools.js')
    const audioStream = await streamTTS(text, voice, rate, pitch)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store')

    req.on('close', () => {
      if (!audioStream.destroyed) {
        audioStream.destroy()
      }
    })

    audioStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        res.end()
      }
    })

    audioStream.pipe(res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
})

aiRouter.post('/tts/stream', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.body || {}
  try {
    const { streamTTS } = await import('../tools/media-tools.js')
    const audioStream = await streamTTS(text, voice, rate, pitch)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store')

    req.on('close', () => {
      if (!audioStream.destroyed) {
        audioStream.destroy()
      }
    })

    audioStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        res.end()
      }
    })

    audioStream.pipe(res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
})

aiRouter.post('/tts', async (req, res) => {
  const { text, voice, rate = 0, pitch = 0 } = req.body || {}
  try {
    const { synthesizeTTS } = await import('../tools/media-tools.js')
    const result = await synthesizeTTS(text, voice, rate, pitch)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 5. Launcher API
aiRouter.post('/launcher/open', async (req, res) => {
  const { mode = 'app', port = 3000 } = req.body || {}
  try {
    await launchUI({ port: req.app.get('port') || port, mode })
    res.json({ success: true, message: `Launcher triggered for mode: ${mode}` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})
