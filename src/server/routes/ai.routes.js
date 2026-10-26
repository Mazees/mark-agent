import { Router } from 'express'
import { getActiveConfig } from '../config-manager.js'
import { wsHub } from '../ws-hub.js'
import { getStreamDiagnostics } from '../services/ai/stream-diagnostics.js'
import { launchUI } from '../launcher.js'
import { buildPluginToolGroups } from '../../shared/plugin-schema.js'
import { isComputerUseSessionOpen } from '../../shared/computer-use.js'
import { computerUseSessionStatus } from '../tools/pc-agent.js'
import {
  requestComputerUsePermission,
  decideComputerUsePermission,
  isLocalComputerUseOrigin
} from '../tools/computer-use-permissions.js'
import {
  GROUP_TOOLS_SCHEMA,
  GROUP_TOOL_GROUP_NAMES,
  GROUP_TOOLS_DEFINITION,
  group_tools_flat
} from '../tools/group-tools.js'

export const aiRouter = Router()

aiRouter.get('/ai/diagnostics', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ data: getStreamDiagnostics() })
})

// 1. AI Fetch Direct Gateway
aiRouter.post('/ai/fetch', async (req, res) => {
  const {
    messages,
    config = {},
    isSmallTask = false,
    jsonSchema = null,
    sessionId = null
  } = req.body || {}
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
      sessionId,
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: false
    })

    const clientAbortController = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) {
        clientAbortController.abort()
      }
    })

    const result = await fetchAI(messages, false, {
      config: finalConfig,
      isSmallTask,
      jsonSchema,
      sessionId,
      signal: clientAbortController.signal
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

// 2. AI Streaming Gateway (Native Tool Calling + SSE & WebSocket Tokens)
aiRouter.post('/ai/stream', async (req, res) => {
  const {
    messages,
    tools = null,
    config = {},
    isSmallTask = false,
    sessionId = null,
    requestId = null
  } = req.body || {}
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
      sessionId,
      provider,
      model: resolvedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      hasTools: Array.isArray(tools) && tools.length > 0,
      toolsCount: Array.isArray(tools) ? tools.length : 0
    })

    const clientAbortController = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) {
        clientAbortController.abort()
      }
    })

    const result = await fetchAI(messages, true, {
      tools,
      config: finalConfig,
      isSmallTask,
      sessionId,
      signal: clientAbortController.signal,
      requestId,
      onToken: (token) => {
        wsHub.streamToken(token, 'answer', sessionId, requestId)
      },
      onReasoning: (rToken) => {
        wsHub.streamToken(rToken, 'thought', sessionId, requestId)
      },
      onMood: (mood) => {
        wsHub.broadcast('ai:mood', { mood, sessionId, requestId })
      },
      onMeta: (meta) => {
        wsHub.broadcast('ai:mark_meta', { ...meta, sessionId, requestId })
        if (meta?.mood) {
          wsHub.broadcast('ai:mood', { mood: meta.mood, sessionId, requestId })
        }
      },
      onToolCall: (toolCalls) => {
        wsHub.broadcast('ai:tool_calls', { toolCalls, sessionId, requestId })
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: { message: err.message, code: err.code || 'AI_ERROR' } })
  }
})

aiRouter.post('/ai/abort', async (req, res) => {
  try {
    const { abortLeadFetches } = await import('../services/ai/ai-utils.js')
    abortLeadFetches()
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

aiRouter.post('/ai/reset-session', async (req, res) => {
  try {
    const { clearDeepSeekSession } = await import('../services/deepseek-web.js')
    clearDeepSeekSession()
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

// 3. Group Tools Schema & Registry API
aiRouter.get('/tools/groups', async (_req, res) => {
  let plugins = []
  try {
    const pluginLoader = await import('../../main/plugins/plugin-loader.js')
    plugins = pluginLoader.getLoadedPlugins()
    if (plugins.length === 0) {
      plugins = await pluginLoader.loadAllPlugins()
    }
  } catch (err) {
    console.warn('[Tools Groups] Gagal memuat daftar plugin:', err?.message || err)
  }

  const pluginGroups = plugins
    .filter((plugin) => plugin.isEnabled !== false && plugin.name)
    .map((plugin) => ({
      name: plugin.name,
      displayName: plugin.displayName || plugin.name,
      description: plugin.description || '',
      actionCount: Array.isArray(plugin.actions) ? plugin.actions.length : 0
    }))

  const pluginSchema = buildPluginToolGroups(
    plugins,
    Object.keys(group_tools_flat),
    GROUP_TOOL_GROUP_NAMES
  )
  const pluginDefinitions = Object.fromEntries(
    Object.entries(pluginSchema).map(([name, group]) => [
      name,
      {
        description: group.description,
        tools: Object.fromEntries(
          group.tools.map((tool) => [tool.function.name, tool.function.description])
        )
      }
    ])
  )

  res.json({
    success: true,
    data: {
      schema: { ...GROUP_TOOLS_SCHEMA, ...pluginSchema },
      names: [...GROUP_TOOL_GROUP_NAMES, ...Object.keys(pluginSchema)],
      plugins: pluginGroups,
      definition: { ...GROUP_TOOLS_DEFINITION, ...pluginDefinitions },
      flat: Object.assign(
        {},
        group_tools_flat,
        ...Object.values(pluginDefinitions).map((group) => group.tools)
      )
    }
  })
})

// 4. Native Tools Execution API
aiRouter.post('/tools/execute', async (req, res) => {
  const { tool, query, config } = req.body || {}
  const controller = new AbortController()
  res.once('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  try {
    if (typeof tool === 'string' && tool.startsWith('plugin-')) {
      const { executePluginAction } = await import('../../main/plugins/plugin-loader.js')
      const result = await executePluginAction(tool, query)
      return res.json(result)
    }
    const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) {
      const { executePluginAction } = await import('../../main/plugins/plugin-loader.js')
      return res.json(await executePluginAction(tool, query))
    }
    const finalConfig = { ...(config || getActiveConfig()), signal: controller.signal }
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
  const { tool, query, config = {} } = req.body || {}
  try {
    const { NATIVE_TOOLS } = await import('../../main/node-tools.js')
    const nativeTool = NATIVE_TOOLS[tool]
    if (!nativeTool) return res.json({ needsApproval: false })
    if (isComputerUseSessionOpen(tool, query)) {
      const owner = {
        sessionId: String(config.sessionId || 'default'),
        runId: config.computerUseRunId || config.sessionId
      }
      const current = computerUseSessionStatus()
      if (
        current.status === 'active' &&
        current.sessionId === owner.sessionId &&
        current.runId === String(owner.runId || owner.sessionId)
      )
        return res.json({ needsApproval: false })
      return res.json({
        needsApproval: true,
        requiresFreshApproval: true,
        permissionRequestId: requestComputerUsePermission(owner),
        message: nativeTool.approvalMessage(query)
      })
    }
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

aiRouter.post('/computer-use/permission', (req, res) => {
  try {
    if (
      !isLocalComputerUseOrigin(
        req.get('origin'),
        req.socket.localPort,
        process.argv.includes('--dev')
      )
    )
      return res
        .status(403)
        .json({
          success: false,
          error: 'Persetujuan sesi harus diberikan melalui antarmuka Mark lokal.'
        })
    const { requestId, sessionId, runId, approved } = req.body || {}
    const token = decideComputerUsePermission(
      requestId,
      { sessionId: String(sessionId || 'default'), runId },
      approved
    )
    res.json({ success: true, token })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 4. Edge-TTS Speech Synthesis API
aiRouter.get('/tts/stream', async (req, res) => {
  const { text, voice, rate = 10, pitch = 55 } = req.query || {}
  try {
    const { streamTTS } = await import('../tools/media-tools.js')
    const audioStream = await streamTTS(text, voice, rate, pitch)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')

    const handleClientAbort = () => {
      if (!audioStream.destroyed) {
        try {
          audioStream.unpipe(res)
          audioStream.destroy()
        } catch (_) {}
      }
    }

    req.once('close', handleClientAbort)
    res.once('close', handleClientAbort)

    res.on('error', (err) => {
      handleClientAbort()
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      console.warn('[TTS Stream GET] Response error:', err?.message || err)
    })

    if (res.socket) {
      res.socket.on('error', (err) => {
        handleClientAbort()
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      })
    }

    audioStream.on('error', (err) => {
      handleClientAbort()
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        try {
          res.end()
        } catch (_) {}
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
    res.setHeader('Access-Control-Allow-Origin', '*')

    const handleClientAbort = () => {
      if (!audioStream.destroyed) {
        try {
          audioStream.unpipe(res)
          audioStream.destroy()
        } catch (_) {}
      }
    }

    req.once('close', handleClientAbort)
    res.once('close', handleClientAbort)

    res.on('error', (err) => {
      handleClientAbort()
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      console.warn('[TTS Stream POST] Response error:', err?.message || err)
    })

    if (res.socket) {
      res.socket.on('error', (err) => {
        handleClientAbort()
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      })
    }

    audioStream.on('error', (err) => {
      handleClientAbort()
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        try {
          res.end()
        } catch (_) {}
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
